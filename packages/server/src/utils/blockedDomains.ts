import { prisma } from '../prisma';

/**
 * Lista de domínios de e-mail temporário/descartável — bloqueados no cadastro/OTP pra
 * evitar farm de contas (criar vários e-mails só pra roubar o bônus de créditos).
 *
 * Armazenada no banco (appSetting key='blockedEmailDomains', JSON array) e cacheada em
 * memória. Configurável via admin (add/remove) e sincronizável com uma lista pública
 * mantida pela comunidade — assim cresce sozinha conforme surgem novos domínios.
 */

const SETTING_KEY = 'blockedEmailDomains';

// Seed inicial (usado só na 1ª vez, se o banco tá vazio). Depois o banco manda.
const SEED = [
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org',
  'yopmail.com', 'trashmail.com', 'throwawaymail.com', 'fakeinbox.com', 'dispostable.com',
  'sharklasers.com', 'getnada.com', 'maildrop.cc', 'mintemail.com', 'mohmal.com', 'tempmailo.com',
  'emailondeck.com', 'spambog.com', 'mailnesia.com', 'discard.email', 'mailcatch.com',
  'tempinbox.com', 'mytemp.email', 'mailnull.com', 'spam4.me', 'fakeemail.com', 'tempr.email',
  'tmpmail.org', 'tmpmail.net', '1secmail.com', '1secmail.org', 'esiix.com', 'wwjmp.com',
  'xojxe.com', 'yoggm.com', 'guerrillamail.info', 'grr.la',
];

// Lista pública (comunitária) atualizada com frequência — o sync faz merge dela.
const PUBLIC_LIST_URL = 'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf';

let cache: Set<string> = new Set(SEED);

const normalize = (d: string) => d.toLowerCase().trim().replace(/^@/, '');

/** True se o domínio do e-mail está na lista de bloqueados. */
export function isBlockedDomain(email: string): boolean {
  const d = email.split('@')[1]?.toLowerCase().trim();
  return !!(d && cache.has(d));
}

/** Lista atual (ordenada). */
export function listBlockedDomains(): string[] {
  return Array.from(cache).sort();
}

async function persist() {
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: Array.from(cache) },
    create: { key: SETTING_KEY, value: Array.from(cache) },
  });
}

/** Lê do banco. Se vazio, semeia com SEED. Chamar no boot. */
export async function loadBlockedDomains(): Promise<void> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
    if (row && Array.isArray(row.value) && (row.value as string[]).length) {
      cache = new Set((row.value as string[]).map((d) => String(d).toLowerCase().trim()).filter(Boolean));
    } else {
      cache = new Set(SEED);
      await persist();
    }
  } catch (e) {
    console.warn('[blockedDomains] load falhou (usando seed):', (e as Error).message);
  }
}

/** Adiciona um domínio (manual). */
export async function addBlockedDomain(domain: string): Promise<void> {
  const d = normalize(domain);
  if (!d || !d.includes('.')) return;
  cache.add(d);
  await persist();
}

/** Remove um domínio (libera). */
export async function removeBlockedDomain(domain: string): Promise<void> {
  cache.delete(normalize(domain));
  await persist();
}

/** Sincroniza com a lista pública (merge — só adiciona, nunca apaga os manuais). */
export async function syncBlockedDomains(): Promise<{ added: number; total: number }> {
  const res = await fetch(PUBLIC_LIST_URL, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Lista pública respondeu ${res.status}`);
  const text = await res.text();
  const before = cache.size;
  for (const line of text.split('\n')) {
    const d = line.trim().toLowerCase();
    if (d && !d.startsWith('#') && d.includes('.')) cache.add(d);
  }
  await persist();
  return { added: cache.size - before, total: cache.size };
}
