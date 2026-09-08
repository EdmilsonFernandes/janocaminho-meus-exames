/**
 * emailInbox — leitura da caixa de EXAMES POR E-MAIL (R2 da pesquisa de ativação:
 * o PDF do laboratório chega no e-mail do usuário, não no celular — o gap de posse).
 *
 * Como funciona: o usuário encaminha o e-mail do laboratório pra caixa da plataforma
 * (contato@janocaminho.com.br) com o CÓDIGO PESSOAL no assunto ("EX-AB2C"). O job
 * jobs/emailIngest polla a caixa (IMAP, uid incremental), casa o código → conta →
 * injeta o PDF no MESMO pipeline de extração do upload normal.
 *
 * SEGURANÇA:
 * - Só mensagens com código válido+ativo+single-use são processadas; o resto da caixa
 *   (e-mails humanos de contato/suporte) é IGNORADO e deixado intacto.
 * - Só anexos application/pdf ≤ 8 MB; validação de magic bytes igual ao upload HTTP.
 * - Ligação: IMAP_ENABLED=true + credenciais (default = SMTP_USER/SMTP_PASS do Zoho,
 *   mesma conta; IMAP_HOST default imap.zoho.com).
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export const EMAIL_INBOX_MAX_PDF_BYTES = 8 * 1024 * 1024;
/** Código pessoal no assunto: "EX-" + 4 chars base32 (sem ambíguos 0/1/I/O). */
export const EXAM_CODE_RE = /\bEX-([A-Z2-7]{4})\b/;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ234567'; // base32 sem ambíguos — casa com EXAM_CODE_RE

export interface InboundMessage {
  uid: number;
  subject: string;
  from: string;
  pdfs: { filename: string; buffer: Buffer }[];
}

/** Endereço PÚBLICO da caixa de exames (o que o app mostra pro usuário encaminhar). */
export const EXAM_INBOX_ADDRESS = process.env.EXAM_INBOX_ADDRESS || 'contato@janocaminho.com.br';

/**
 * Config IMAP (null = ingestão desligada). EXIGE IMAP_USER/IMAP_PASS dedicados —
 * NÃO herda do SMTP: o SMTP_USER do .env pode ser de OUTRA conta (ex.: chamanoespeto),
 * e polir a caixa errada perderia exames silenciosamente. Ligar: IMAP_ENABLED=true
 * + IMAP/IMAP Access habilitado no Zoho da conta do EXAM_INBOX_ADDRESS.
 * IMAP_FOLDER: pasta dedicada (ex.: 'drexame' + alias/redirect do Zoho) — o robô
 * lê SÓ ela; o INBOX humano fica intocado.
 */
export function inboxConfig(): { host: string; port: number; user: string; pass: string; folder: string } | null {
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;
  const host = process.env.IMAP_HOST || 'imappro.zoho.com';
  const folder = process.env.IMAP_FOLDER || 'INBOX';
  if (process.env.IMAP_ENABLED !== 'true' || !user || !pass) return null;
  return { host, port: 993, user, pass, folder };
}

export function genExamCode(): string {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return `EX-${c}`;
}

/** Extrai o código do assunto (null se não houver — mensagem NÃO é pra gente processar). */
export function examCodeFromSubject(subject: string): string | null {
  const m = EXAM_CODE_RE.exec(subject || '');
  return m ? `EX-${m[1]}` : null;
}

/**
 * Baixa mensagens com uid > lastUid (retorna assunto + PDFs válidos). Atualiza o cursor
 * mesmo pra mensagens sem código (não re-lê; e-mail fica na caixa, intocado).
 */
export async function fetchNewMessages(lastUid: number, max = 10): Promise<{ messages: InboundMessage[]; lastUid: number }> {
  const cfg = inboxConfig();
  if (!cfg) return { messages: [], lastUid };
  const client = new ImapFlow({ host: cfg.host, port: cfg.port, secure: true, auth: { user: cfg.user, pass: cfg.pass }, logger: false });
  await client.connect();
  try {
    const lock = await client.getMailboxLock(cfg.folder);
    const messages: InboundMessage[] = [];
    try {
      // 1ª LEITURA (cursor 0): pular o histórico inteiro — começar da próxima mensagem.
      // Sem isto, o 1º tick baixa TODA a caixa (travou em prod com 140 e-mails: fetch
      // gigante silencioso). O cursor salvo já era a borda; aqui formalizamos o salto.
      const firstRunSkip = client.mailbox && typeof client.mailbox === 'object' ? (client.mailbox as { uidNext?: number }).uidNext : undefined;
      if (lastUid === 0 && firstRunSkip) {
        return { messages: [], lastUid: Math.max(0, firstRunSkip - 1) };
      }
      // range `n:*` no IMAP devolve sempre ≥1 (a última) mesmo sem novas — o guard uid resolve.
      for await (const msg of client.fetch({ uid: `${lastUid + 1}:*` }, { uid: true, source: true }, { uid: true })) {
        if (msg.uid <= lastUid || !msg.source) continue;
        if (messages.length >= max) break; // PARA o stream — não baixa o resto da caixa
        const parsed = await simpleParser(msg.source);
        const pdfs = (parsed.attachments ?? [])
          .filter((a: { contentType?: string; content?: Buffer | Uint8Array }) =>
            (a.contentType || '').toLowerCase() === 'application/pdf'
            && !!a.content && a.content.length > 0 && a.content.length <= EMAIL_INBOX_MAX_PDF_BYTES)
          .map((a: { filename?: string; content?: Buffer | Uint8Array }) => ({ filename: a.filename || 'exame.pdf', buffer: Buffer.from(a.content as Buffer) }));
        messages.push({
          uid: msg.uid,
          subject: parsed.subject ?? '',
          from: parsed.from?.text ?? '',
          pdfs,
        });
      }
    } finally {
      lock.release();
    }
    const newLast = messages.length ? Math.max(...messages.map((m) => m.uid)) : lastUid;
    return { messages, lastUid: newLast };
  } finally {
    await client.logout().catch(() => client.close());
  }
}
