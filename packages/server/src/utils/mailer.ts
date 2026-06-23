import nodemailer from 'nodemailer';

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let _transport: nodemailer.Transporter | null = null;

/** Cria (e cacheia) o transporte SMTP a partir das variáveis SMTP_*. */
function getTransport(): nodemailer.Transporter | null {
  if (_transport) return _transport;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null; // sem config -> modo dev (loga)
  _transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
  return _transport;
}

/** Versão texto simples (spam filters penalizam e-mail só-HTML). Usada quando o caller não passa `text`. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Envia e-mail transacional via SMTP (ex.: Zoho). Sem SMTP_* configurado (dev),
 * apenas loga o conteúdo (incl. links de reset) no console — fluxo testável.
 */
export async function sendEmail(mail: OutboundEmail): Promise<{ sent: boolean; devPreview?: string }> {
  const from = process.env.EMAIL_FROM || 'Meus Exames <no-reply@meus-exames.app>';
  const transport = getTransport();
  const text = mail.text || htmlToText(mail.html);

  if (!transport) {
    const devPreview = `[DEV — e-mail NÃO enviado]\nPara: ${mail.to}\nAssunto: ${mail.subject}\n------------------------------\n${text}\n------------------------------`;
    console.log('\n' + devPreview + '\n');
    return { sent: false, devPreview };
  }

  await transport.sendMail({
    from,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text,
  });
  return { sent: true };
}
