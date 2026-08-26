import { Router } from 'express';
import { createHash } from 'crypto';
import { prisma } from '../prisma';
import { sendEmail } from '../utils/mailer';

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

    // Boas-vindas com o valor existente (link do decoder + 1º exame grátis). Best-effort:
    // falha de SMTP não deve 500ar a captura — o lead já está salvo.
    await sendEmail({
      to: email,
      subject: '🩺 Seu link pra decifrar seu exame de graça',
      html: `<p>Olá!</p><p>Obrigado por deixar seu e-mail. Aqui está o que prometemos:</p><p><b>1.</b> Decifre seu exame <b>de graça</b> — cole o texto do laudo e receba os valores organizados na hora: <a href="https://drexame.janocaminho.com.br/#/landing">abrir o Dr. Exame</a>.</p><p><b>2.</b> Se quiser ir além: crie sua conta grátis e envie o PDF/foto do exame — a IA explica em português simples, monta sua leitura de risco e um plano de ação pra levar ao médico. Sem cartão.</p><p>— Dr. Exame</p><p style="color:#888;font-size:12px">Você recebe este e-mail porque pediu o link no site. Não quer mais? Responda "remover" que excluimos seu e-mail na hora (LGPD).</p>`,
      text: 'Decifre seu exame de graça: https://drexame.janocaminho.com.br/#/landing — conta grátis sem cartão. Responda "remover" para sair da lista (LGPD).',
    }).catch(() => {});

    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
