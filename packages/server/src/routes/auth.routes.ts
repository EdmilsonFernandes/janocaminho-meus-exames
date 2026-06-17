import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma';
import {
  signToken, verifyToken, verifyResetToken, hashPassword, comparePassword,
} from '../auth/jwt';
import { issueOtp, verifyOtp } from '../auth/otp';
import { requireAuth, AuthedRequest, firstPatientId } from '../middleware/auth';
import { sendEmail } from '../utils/mailer';
import { otpEmail, resetEmail } from '../utils/emailTemplate';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { deleteExamFile, patientSlug } from '../utils/storage';

const router = Router();

async function issueSession(userId: string) {
  const token = signToken({ userId });
  const patientId = await firstPatientId(userId);
  return { token, patientId };
}

/** Avisa o admin (dev) de cada novo cadastro — cópia pra edmls2008@gmail.com (ou ADMIN_EMAIL). */
async function notifyNewUser(name: string, email: string) {
  const admin = process.env.ADMIN_EMAIL || 'edmls2008@gmail.com';
  try {
    await sendEmail({
      to: admin,
      subject: `Novo cadastro no Meus Exames: ${name}`,
      html: `<div style="font-family:Segoe UI,Arial,sans-serif;color:#15233b"><h3 style="color:#178f89">Novo usuário 🎉</h3><p><b>Nome:</b> ${name}</p><p><b>E-mail:</b> ${email}</p><p style="color:#888;font-size:12px;margin-top:16px">Notificação automática — toda conta criada chega aqui.</p></div>`,
    });
  } catch (e: any) { console.error('[notifyNewUser] falhou:', e?.message); }
}

// LOGIN (react-admin envia {username, password})
router.post('/login', async (req, res, next) => {
  try {
    const { username, email, password } = req.body ?? {};
    const mail = String(email ?? username ?? '').toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: mail } });
    if (!user || !(await comparePassword(String(password ?? ''), user.passwordHash))) {
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }
    const { token, patientId } = await issueSession(user.id);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      patientId,
    });
  } catch (e) { next(e); }
});

// REGISTRO (auto-atendimento — Play Store)
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body ?? {};
    const mail = String(email ?? '').toLowerCase().trim();
    const pwd = String(password ?? '');
    if (!name || !mail || pwd.length < 6) {
      res.status(400).json({ error: 'Informe nome, e-mail e senha (mín. 6 caracteres).' });
      return;
    }
    const existing = await prisma.user.findUnique({ where: { email: mail } });
    if (existing) { res.status(409).json({ error: 'Já existe conta com este e-mail.' }); return; }
    const passwordHash = await hashPassword(pwd);
    const user = await prisma.user.create({ data: { email: mail, name: String(name), passwordHash, credits: 100 } });
    await prisma.patient.create({ data: { ownerId: user.id, fullName: String(name), relationship: 'Titular' } });
    notifyNewUser(String(name), mail);
    const { token, patientId } = await issueSession(user.id);
    res.status(201).json({
      token, patientId,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (e) { next(e); }
});

// ESQUECI A SENHA — envia link de reset por e-mail (dev: loga no console)
router.post('/forgot', async (req, res, next) => {
  try {
    const { email } = req.body ?? {};
    const mail = String(email ?? '').toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: mail } });
    // não revela se o e-mail existe (segurança)
    if (user) {
      const { signResetToken } = require('../auth/jwt');
      const token = signResetToken(user.id);
      const base = (process.env.WEB_BASE_PATH ?? '').replace(/\/$/, '');
      // Token na QUERY REAL (email clients rastreiam normal) + rota no HASH (HashRouter).
      // Antes vinha "#/recuperar-senha?token=" (token no fragmento) — alguns clientes não clicavam.
      const link = `${process.env.WEB_ORIGIN || 'http://localhost:5173'}${base}/?token=${token}#/recuperar-senha`;
      try {
        await sendEmail({
          to: user.email,
          subject: 'Redefinição de senha — Meus Exames',
          html: resetEmail(user.name, link),
        });
      } catch (e: any) {
        console.error('[forgot] falha SMTP:', e?.message);
      }
    }
    res.json({ ok: true, message: 'Se o e-mail existir, enviamos o link de redefinição.' });
  } catch (e) { next(e); }
});

// REDEFINIR SENHA — com token
router.post('/reset', async (req, res, next) => {
  try {
    const { token, password } = req.body ?? {};
    const pwd = String(password ?? '');
    if (!token || pwd.length < 6) {
      res.status(400).json({ error: 'Token inválido ou senha muito curta (mín. 6).' });
      return;
    }
    const { userId } = verifyResetToken(String(token));
    const passwordHash = await hashPassword(pwd);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Token inválido ou expirado.' });
  }
});

// OTP — pedir código por e-mail (login sem senha)
router.post('/otp/request', async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').toLowerCase().trim();
    if (!email) { res.status(400).json({ error: 'Informe o e-mail.' }); return; }
    const code = issueOtp(email);
    const masked = email.replace(/^(.{1,2}).*(@)/, '$1***$2');
    try {
      const r = await sendEmail({
        to: email,
        subject: 'Seu código de acesso — Meus Exames',
        html: otpEmail(email.split('@')[0], code),
      });
      if (!r.sent) console.warn('[otp] e-mail NÃO enviado (sem SMTP / dev) p/', masked);
      else console.log('[otp] código enviado p/', masked);
    } catch (e: any) {
      // Falha de transporte (auth/config/conexão/rejeição síncrona) — feedback real, não "mentira".
      console.error('[otp] falha SMTP p/', masked, ':', e?.message);
      res.status(502).json({ error: 'Não conseguimos enviar o e-mail agora. Verifique o endereço e tente novamente.' });
      return;
    }
    res.json({ ok: true, message: 'Se o e-mail for válido, enviamos o código.' });
  } catch (e) { next(e); }
});

// OTP — verificar código (cria a conta se for 1º acesso)
router.post('/otp/verify', async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').toLowerCase().trim();
    const code = String(req.body?.code ?? '');
    if (!verifyOtp(email, code)) { res.status(401).json({ error: 'Código inválido ou expirado.' }); return; }
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const name = email.split('@')[0];
      user = await prisma.user.create({ data: { email, name, passwordHash: await hashPassword(crypto.randomUUID()), credits: 100 } });
      await prisma.patient.create({ data: { ownerId: user.id, fullName: name, relationship: 'Titular' } });
      notifyNewUser(name, email);
    }
    const { token, patientId } = await issueSession(user.id);
    res.json({ token, patientId, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (e) { next(e); }
});

// ME
router.get('/me', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, email: true, name: true, role: true, planExpiresAt: true, credits: true },
    });
    const patientId = user ? await firstPatientId(user.id) : null;
    res.json({ user, patientId });
  } catch (e) { next(e); }
});

// TROCAR SENHA (usuário logado informa a atual)
router.post('/change-password', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    const pwd = String(newPassword ?? '');
    if (!currentPassword || pwd.length < 6) {
      res.status(400).json({ error: 'Informe a senha atual e a nova (mín. 6 caracteres).' });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user || !(await comparePassword(String(currentPassword), user.passwordHash))) {
      res.status(401).json({ error: 'Senha atual incorreta.' });
      return;
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(pwd) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// EXCLUIR CONTA + TODOS OS DADOS (LGPD) — exigência p/ Play Store
router.delete('/account', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const patients = await prisma.patient.findMany({ where: { ownerId: userId }, select: { id: true, fullName: true } });
    const pids = patients.map((p) => p.id);
    // 1) análises órfãs (chat/consolidado sem exame) por paciente
    if (pids.length) await prisma.aiAnalysis.deleteMany({ where: { patientId: { in: pids } } });
    // 2) arquivos dos exames (PDFs/imagens no disco/S3)
    const exams = await prisma.exam.findMany({ where: { patientId: { in: pids } }, select: { filePath: true } });
    for (const e of exams) { try { await deleteExamFile(e.filePath); } catch { /* */ } }
    // 3) fotos dos pacientes (disco)
    try {
      const pdir = path.resolve(config.photosDir);
      if (fs.existsSync(pdir)) {
        for (const id of pids) {
          for (const f of fs.readdirSync(pdir).filter((x) => x.startsWith(`patient-${id}.`))) {
            try { fs.unlinkSync(path.join(pdir, f)); } catch { /* */ }
          }
        }
      }
    } catch { /* */ }
    // 4) memória do agente (.md por paciente)
    for (const p of patients) {
      try { fs.rmSync(path.join(path.resolve(config.agentDir), patientSlug(p.fullName ?? 'paciente', p.id)), { recursive: true, force: true }); } catch { /* */ }
    }
    // 5) usuário (cascata: Patient→Exam→Itens/Análises, Subscription, DeviceToken, lembretes, medições, vacinas, despesas)
    await prisma.user.delete({ where: { id: userId } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
