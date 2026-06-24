import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma';
import {
  signToken, signResetToken, verifyToken, verifyResetToken, hashPassword, comparePassword,
} from '../auth/jwt';
import { issueOtp, verifyOtp } from '../auth/otp';
import { requireAuth, AuthedRequest, firstPatientId } from '../middleware/auth';
import { sendEmail } from '../utils/mailer';
import { otpEmail, resetEmail } from '../utils/emailTemplate';
import { getSettings } from '../utils/settings';
import { evaluateMfaOnLogin, verifyChallenge, getStatus as mfaStatus, startSetup as mfaStart, confirmSetup as mfaConfirm, disableMfa as mfaDisable } from '../utils/mfa';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { deleteExamFile, patientSlug } from '../utils/storage';
import { validate, schemas } from '../middleware/validate';

const router = Router();

// Domínios de e-mail temporário/descartável — usados pra farm de créditos (criar várias
// contas só pra abocanhar o bônus de boas-vindas). Lista curta dos mais comuns.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org',
  'yopmail.com', 'trashmail.com', 'throwawaymail.com', 'fakeinbox.com', 'dispostable.com',
  'sharklasers.com', 'getnada.com', 'maildrop.cc', 'mintemail.com', 'mohmal.com', 'tempmailo.com',
  'emailondeck.com', 'spambog.com', 'mailnesia.com', 'discard.email', 'mailcatch.com',
  'tempinbox.com', 'mytemp.email', 'mailnull.com', 'spam4.me', 'fakeemail.com', 'tempr.email',
  'tmpmail.org', 'tmpmail.net', '1secmail.com', '1secmail.org', 'esiix.com', 'wwjmp.com',
  'xojxe.com', 'yoggm.com', 'guerrillamail.info', 'grr.la',
]);
const isDisposable = (email: string): boolean => {
  const d = email.split('@')[1]?.toLowerCase().trim();
  return !!(d && (DISPOSABLE_DOMAINS.has(d) || /\.(tmp|temp|edu\.tmp)$/.test(d)));
};

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
router.post('/login', validate(schemas.login), async (req, res, next) => {
  try {
    const { username, email, password } = req.body ?? {};
    const mail = String(email ?? username ?? '').toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: mail } });
    if (!user || !(await comparePassword(String(password ?? ''), user.passwordHash))) {
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }
    if (!user.emailVerified) { res.status(403).json({ error: 'Verifique seu e-mail para ativar a conta.', needsVerification: true }); return; }
    // MFA: se ativado, cria desafio (senha OK mas precisa do código TOTP pra entrar)
    const mfa = await evaluateMfaOnLogin('USER', user.id, { userId: user.id }, user.email);
    if (mfa) { res.json(mfa); return; }
    const { token, patientId } = await issueSession(user.id);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, planExpiresAt: user.planExpiresAt, credits: user.credits },
      patientId,
    });
  } catch (e) { next(e); }
});

// MFA — verifica o código do desafio (2ª etapa do login; pública — tem o challengeToken)
router.post('/mfa/verify', async (req, res) => {
  try {
    const result = await verifyChallenge(String(req.body?.challengeToken ?? ''), String(req.body?.code ?? ''));
    const { token, patientId } = await issueSession(result.sessionPayload.userId);
    const u = await prisma.user.findUnique({ where: { id: result.sessionPayload.userId }, select: { id: true, email: true, name: true, role: true, planExpiresAt: true, credits: true } });
    res.json({ token, user: u, patientId });
  } catch (e: any) { res.status(e.status || 500).json({ error: e.message || 'Erro no MFA' }); }
});

// MFA — status (autenticado)
router.get('/mfa/status', requireAuth, async (req: AuthedRequest, res) => {
  res.json(await mfaStatus('USER', req.userId!));
});

// MFA — setup start (autenticado): gera secret + QR
router.post('/mfa/setup/start', requireAuth, async (req: AuthedRequest, res) => {
  try { res.json(await mfaStart('USER', req.userId!)); } catch (e: any) { res.status(e.status || 500).json({ error: e.message || 'Erro' }); }
});

// MFA — setup confirm (autenticado): valida 1º código → ativa
router.post('/mfa/setup/confirm', requireAuth, async (req: AuthedRequest, res) => {
  try { res.json(await mfaConfirm('USER', req.userId!, String(req.body?.code ?? ''))); } catch (e: any) { res.status(e.status || 500).json({ error: e.message || 'Erro' }); }
});

// MFA — disable (autenticado)
router.post('/mfa/disable', requireAuth, async (req: AuthedRequest, res) => {
  try { res.json(await mfaDisable('USER', req.userId!, String(req.body?.code ?? ''))); } catch (e: any) { res.status(e.status || 500).json({ error: e.message || 'Erro' }); }
});

// REGISTRO (auto-atendimento — Play Store)
router.post('/register', validate(schemas.register), async (req, res, next) => {
  try {
    const { name, email, password, referral } = req.body ?? {};
    const mail = String(email ?? '').toLowerCase().trim();
    const pwd = String(password ?? '');
    if (!name || !mail || pwd.length < 6) {
      res.status(400).json({ error: 'Informe nome, e-mail e senha (mín. 6 caracteres).' });
      return;
    }
    if (isDisposable(mail)) { res.status(400).json({ error: 'Não aceitamos e-mails temporários. Use um e-mail válido (Gmail, Outlook, etc.).' }); return; }
    const existing = await prisma.user.findUnique({ where: { email: mail } });
    if (existing) { res.status(409).json({ error: 'Já existe conta com este e-mail.' }); return; }

    // === REFERRAL: valida código de indicação (se veio) ===
    const REFERRAL_BONUS = 30; // créditos pra cada lado (configurável depois via settings)
    let referrer: any = null;
    const refCode = String(referral ?? '').trim().toUpperCase();
    if (refCode) {
      referrer = await prisma.user.findFirst({ where: { referralCode: refCode, emailVerified: true } });
      if (!referrer) { res.status(400).json({ error: 'Código de indicação inválido.' }); return; }
    }

    // Gera código de indicação único pro novo usuário (PRIMEIRO-NOME + 4 chars)
    const firstName = String(name).split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10) || 'USER';
    let referralCode = '';
    for (let i = 0; i < 10; i++) {
      const candidate = `${firstName}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const clash = await prisma.user.findFirst({ where: { referralCode: candidate } });
      if (!clash) { referralCode = candidate; break; }
    }

    const passwordHash = await hashPassword(pwd);
    // Bônus de boas-vindas (freeSignup) NÃO é mais dado aqui — só após verificar o e-mail
    // (verify-email). Conta recém-criada fica com 0 créditos (e não consegue logar sem verificar).
    // Evita farm: pra pegar o bônus precisa acessar a caixa de entrada de cada e-mail.
    const user = await prisma.user.create({
      data: { email: mail, name: String(name), passwordHash, credits: 0, referralCode, referredBy: referrer?.referralCode ?? null },
    });
    await prisma.patient.create({ data: { ownerId: user.id, fullName: String(name), relationship: 'Titular' } });

    notifyNewUser(String(name), mail);
    const code = issueOtp(mail);
    // Fire-and-forget: NÃO espera o SMTP concluir. Antes o `await` travava a resposta HTTP
    // até o Zoho responder (lento/instável) → o app dava "failed to fetch" mesmo a conta
    // tendo sido criada (aí o usuário tentava de novo e pegava 409 "já existe").
    sendEmail({ to: mail, subject: 'Ative sua conta — Meus Exames', html: otpEmail(String(name), code) })
      .catch((e: any) => console.error('[register] falha SMTP verificação:', e?.message));
    res.status(201).json({ needsVerification: true, email: mail, referralBonus: !!referrer });
  } catch (e) { next(e); }
});

// VERIFICAR E-MAIL (ativa conta após cadastro) — código por e-mail
router.post('/verify-email', async (req, res, next) => {
  try {
    const mail = String(req.body?.email ?? '').toLowerCase().trim();
    const code = String(req.body?.code ?? '');
    const user = await prisma.user.findUnique({ where: { email: mail } });
    if (!user) { res.status(404).json({ error: 'Conta não encontrada. Cadastre-se novamente.' }); return; }
    if (!verifyOtp(mail, code)) { res.status(401).json({ error: 'Código inválido ou expirado.' }); return; }

    // REFERRAL BONUS — só aqui (depois de verificar e-mail). Bônus pra AMBOS.
    // LIMITE: máx 10 indicações por mês (anti-abuso).
    const REFERRAL_BONUS = 30;
    const REFERRAL_MONTHLY_LIMIT = 10;
    const signupCredits = getSettings().grants.freeSignup;
    let bonusCredits = signupCredits; // bônus de boas-vindas — liberado só aqui (após verificar e-mail)
    if (user.referredBy) {
      const referrer = await prisma.user.findFirst({ where: { referralCode: user.referredBy } });
      if (referrer) {
        // Conta quantas indicações ativou este mês
        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const monthReferrals = await prisma.subscription.count({
          where: { userId: referrer.id, status: 'APPROVED', periodDays: 0, createdAt: { gte: monthStart } },
        });
        if (monthReferrals < REFERRAL_MONTHLY_LIMIT) {
          // Bônus pro INDICADOR + registra no extrato (Subscription periodDays=0 = pacote avulso)
          await prisma.$transaction([
            prisma.user.update({ where: { id: referrer.id }, data: { credits: { increment: REFERRAL_BONUS } } }),
            prisma.subscription.create({ data: { userId: referrer.id, amount: REFERRAL_BONUS, periodDays: 0, status: 'APPROVED', mpPreferenceId: `referral_${user.id}` } }),
          ]);
          try { await prisma.notification.create({ data: { userId: referrer.id, type: 'referral', title: '🎉 Você indicou e ganhou!', body: `${user.name} ativou a conta com seu código. +${REFERRAL_BONUS} créditos pra você!` } }); } catch {}
          console.log(`[referral] ${referrer.email} +${REFERRAL_BONUS} (${monthReferrals + 1}/${REFERRAL_MONTHLY_LIMIT} este mês)`);
          bonusCredits = signupCredits + REFERRAL_BONUS;
        } else {
          console.log(`[referral] ${referrer.email} atingiu limite mensal (${REFERRAL_MONTHLY_LIMIT})`);
        }
      }
    }

    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true, credits: { increment: bonusCredits } } });
    const freshUser = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, name: true, role: true, planExpiresAt: true, credits: true, referralCode: true, referredBy: true } });
    const { token, patientId } = await issueSession(user.id);
    res.json({ token, patientId, user: freshUser });
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
      user = await prisma.user.create({ data: { email, name, passwordHash: await hashPassword(crypto.randomUUID()), credits: getSettings().grants.freeSignup } });
      await prisma.patient.create({ data: { ownerId: user.id, fullName: name, relationship: 'Titular' } });
      notifyNewUser(name, email);
    }
    if (!user.emailVerified) { await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }); }
    const { token, patientId } = await issueSession(user.id);
    res.json({ token, patientId, user: { id: user.id, email: user.email, name: user.name, role: user.role, planExpiresAt: user.planExpiresAt, credits: user.credits } });
  } catch (e) { next(e); }
});

// ME
router.get('/me', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, email: true, name: true, role: true, planExpiresAt: true, credits: true, referralCode: true, referredBy: true },
    });
    const patientId = user ? await firstPatientId(user.id) : null;
    // Backfill: usuários antigos sem referralCode → gera um (pra ReferralCard aparecer)
    if (user && !user.referralCode) {
      const fn = String(user.name).split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10) || 'USER';
      for (let i = 0; i < 10; i++) {
        const candidate = `${fn}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const clash = await prisma.user.findFirst({ where: { referralCode: candidate } });
        if (!clash) { await prisma.user.update({ where: { id: user.id }, data: { referralCode: candidate } }); user.referralCode = candidate; break; }
      }
    }
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

// ESTATÍSTICAS DE INDICAÇÃO — quantos amigos indicou, créditos ganhos
router.get('/referrals/stats', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { referralCode: true } });
    if (!user?.referralCode) { res.json({ code: '', count: 0, creditsEarned: 0 }); return; }
    const referred = await prisma.user.findMany({
      where: { referredBy: user.referralCode },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const REFERRAL_BONUS = 30;
    res.json({ code: user.referralCode, count: referred.length, creditsEarned: referred.length * REFERRAL_BONUS, friends: referred.map((r) => ({ name: r.name.split(' ')[0], date: r.createdAt })) });
  } catch (e) { next(e); }
});

export default router;
