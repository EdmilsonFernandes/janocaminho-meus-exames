import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// OTP persistido em ARQUIVO (volume /app/data/agent, sobrevive a restart/deploy).
// Antes era em memória (Map) → todo deploy matava o código do usuário que acabou de pedir.
const AGENT_DIR = process.env.AGENT_DIR || './data/agent';
const OTP_FILE = path.join(AGENT_DIR, 'otp-store.json');

type Entry = { code: string; expires: number; tries: number };
let store = new Map<string, Entry>();

function load() {
  try {
    const raw = fs.readFileSync(OTP_FILE, 'utf8');
    store = new Map(Object.entries(JSON.parse(raw)));
  } catch {
    store = new Map();
  }
}
function save() {
  try {
    fs.mkdirSync(AGENT_DIR, { recursive: true });
    fs.writeFileSync(OTP_FILE, JSON.stringify(Object.fromEntries(store)));
  } catch (e) {
    console.error('[otp] persist falhou:', (e as Error).message);
  }
}
load();

/** Gera um código de 6 dígitos, guarda e devolve (10 min de validade). */
export function issueOtp(email: string): string {
  const code = String(crypto.randomInt(100000, 1000000));
  store.set(email, { code, expires: Date.now() + 10 * 60_000, tries: 0 });
  save();
  return code;
}

/** Valida o código; remove após sucesso ou 5 tentativas. */
export function verifyOtp(email: string, code: string): boolean {
  const entry = store.get(email);
  if (!entry) return false;
  if (Date.now() > entry.expires) { store.delete(email); save(); return false; }
  entry.tries += 1;
  if (entry.code === code.trim()) { store.delete(email); save(); return true; }
  if (entry.tries >= 5) { store.delete(email); }
  save();
  return false;
}

// THROTTLE por destinatário (anti-spam/DoS de e-mail): máx 3 pedidos / 10min por e-mail.
// authLimiter (por IP) não basta contra botnet/CGNAT — mil IPs podem bombardear 1 alvo e
// bloquear o remetente Zoho. Em memória (efêmero; reset no restart é ok p/ throttle).
const OTP_THROTTLE = new Map<string, number[]>();
const OTP_THROTTLE_WINDOW = 10 * 60_000;
const OTP_THROTTLE_MAX = 3;
/** true se pode emitir p/ este e-mail agora (registra a tentativa); false se excedeu (429). */
export function canIssueOtp(email: string): boolean {
  const now = Date.now();
  const arr = (OTP_THROTTLE.get(email) ?? []).filter((t) => now - t < OTP_THROTTLE_WINDOW);
  if (arr.length >= OTP_THROTTLE_MAX) { OTP_THROTTLE.set(email, arr); return false; }
  arr.push(now);
  OTP_THROTTLE.set(email, arr);
  return true;
}
