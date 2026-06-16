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

const router = Router();

async function issueSession(userId: string) {
  const token = signToken({ userId });
  const patientId = await firstPatientId(userId);
  return { token, patientId };
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
    const trialEnd = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 dias premium de cortesia
    const user = await prisma.user.create({ data: { email: mail, name: String(name), passwordHash, planExpiresAt: trialEnd, credits: 500 } });
    await prisma.patient.create({ data: { ownerId: user.id, fullName: String(name), relationship: 'Titular' } });
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
      const link = `${process.env.WEB_ORIGIN || 'http://localhost:5173'}${base}/recuperar-senha?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: 'Redefinição de senha — Meus Exames',
        html: resetEmail(user.name, link),
      }).catch((e) => console.error('[forgot] e-mail falhou:', e?.message));
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
    await sendEmail({
      to: email,
      subject: 'Seu código de acesso — Meus Exames',
      html: otpEmail(email.split('@')[0], code),
    }).catch((e) => console.error('[otp] e-mail falhou:', e?.message));
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
      const trialEnd = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      user = await prisma.user.create({ data: { email, name, passwordHash: await hashPassword(crypto.randomUUID()), planExpiresAt: trialEnd, credits: 500 } });
      await prisma.patient.create({ data: { ownerId: user.id, fullName: name, relationship: 'Titular' } });
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

export default router;
