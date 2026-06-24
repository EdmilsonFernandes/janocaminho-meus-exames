import { config } from '../config';
import { sendEmail } from './mailer';
import { nudgeEmail } from './emailTemplate';
import { makeUnsubToken } from './unsubscribeToken';

/**
 * Dispara um nudge de saúde por E-MAIL (canal de fallback — só pra quem NÃO tem push).
 * Link CTA aponta pro exame (ou pro app) e o rodapé leva ao unsubscribe de 1 clique.
 * Erro aqui é logado, nunca propagado (e-mail é best-effort; o push/in-app já foram).
 */
export async function sendNudgeEmail(opts: {
  to: string;
  userId: string;
  firstName: string;
  title: string;
  body: string;
  examId?: string;
}): Promise<void> {
  const appUrl = `${config.webOrigin}${config.webBasePath}`; // ex.: https://janocaminho.com.br/minhasaude
  const ctaUrl = opts.examId ? `${appUrl}/exams/${opts.examId}/show` : `${appUrl}/`;
  const unsubUrl = `${appUrl}/api/notifications/unsubscribe?token=${makeUnsubToken(opts.userId)}`;
  const html = nudgeEmail({
    name: opts.firstName,
    title: opts.title,
    body: opts.body,
    ctaUrl,
    ctaLabel: opts.examId ? 'Ver meu exame' : 'Abrir o app',
    unsubUrl,
  });
  try {
    await sendEmail({ to: opts.to, subject: opts.title, html });
  } catch (e: any) {
    console.error('[nudges] falha ao enviar e-mail p/', opts.to, ':', e?.message);
  }
}
