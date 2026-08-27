import { Router } from 'express';
import { createHash } from 'crypto';
import { prisma } from '../prisma';
import { sendEmail } from '../utils/mailer';
import { leadWelcomeEmail, webUrl } from '../utils/emailTemplate';

/**
 * Captura de lead da landing (popup de e-mail) — topo de funil, sem cadastro.
 *
 * Linha de custo/segurança (deliberada):
 *  - Honeypot `website`: bots que preenchem campo escondido recebem o MESMO 201
 *    (sem enumerar, sem confirmar) e NADA é gravado.
 *  - Idempotente: e-mail × source tem unique — repetido devolve 201 sem re-enviar
 *    boas-vindas (usuário não leva spam por clique duplo/retry).
 *  - IP nunca cru no banco: só sha256 (mesmo padrão do decifre_events).
 *  - Rate-limit: já coberto pelo generalLimiter global de /api/.
 *  - LGPD: finalidade única declarada no opt-in do popup; opt-out no rodapé do
 *    e-mail de boas-vindas; nenhum dado de saúde trafega aqui.
 */

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

router.post('/', async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const source = String(req.body?.source ?? 'popup_landing').slice(0, 40);
    const honeypot = String(req.body?.website ?? '').trim();

    // Honeypot preenchido = bot. Mesma resposta de sucesso, zero efeito.
    if (honeypot) { res.status(201).json({ ok: true }); return; }
    if (!EMAIL_RE.test(email) || email.length > 160) {
      res.status(400).json({ error: 'E-mail inválido.' });
      return;
    }

    const ipHash = req.ip ? createHash('sha256').update(req.ip).digest('hex').slice(0, 32) : null;
    const existing = await prisma.landingLead.findUnique({ where: { email_source: { email, source } }, select: { id: true } });
    if (existing) { res.status(201).json({ ok: true }); return; }

    await prisma.landingLead.create({ data: { email, source, ipHash } });

    // Boas-vindas com o valor existente. Deep-link direto pro decodificador
    // (?ir=decifre rola até a seção "Cole seu exame"), template com credencial
    // (qualquer lab · educativo/privado · BR) — não link genérico pro topo.
    // Best-effort: falha de SMTP não 500a a captura — o lead já está salvo.
    const decifreUrl = webUrl('/#/landing?ir=decifre');
    await sendEmail({
      to: email,
      subject: 'Decifre seu exame de graça — Dr. Exame',
      html: leadWelcomeEmail({ decifreUrl, signupUrl: webUrl('/#/registrar') }),
      text: `Decifre seu exame de graça (cole o texto do laudo): ${decifreUrl} — ou crie sua conta grátis (1º resumo grátis, sem cartão): ${webUrl('/#/registrar')}. Responda "remover" para sair da lista (LGPD).`,
    }).catch(() => {});

    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
