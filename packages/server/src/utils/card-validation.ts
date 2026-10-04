// Validação SERVER-SIDE de dados de cartão (fluxo inline Asaas — POST /billing/pay-card).
// Puro, zero I/O — unit-testável. O front valida também, mas o server NUNCA confia no
// client (regra do projeto: validar em ambos). Nada aqui loga dados — quem chama decide.
import { isValidCpf } from './cpf';

export interface CardInput {
  number: string;      // com ou sem máscara — normaliza internamente
  holderName: string;  // nome impresso no cartão
  expiryMonth: string; // "MM" (1-12)
  expiryYear: string;  // "AA" ou "AAAA"
  ccv: string;         // 3-4 dígitos
}

export interface HolderInput {
  name: string;        // nome completo do titular (cpfCnpj do Asaas)
  cpf: string;
  email?: string;
  phone?: string;
  postalCode?: string; // "00000-000" ou "00000000"
  addressNumber?: string;
}

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** Luhn (mod 10). Aceita string com espaços/pontos — normaliza antes. */
export function isValidCardNumber(raw: string): boolean {
  const n = digits(raw);
  if (!/^\d{13,19}$/.test(n)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Últimos 4 dígitos (única parte de PAN que pode aparecer em LOG/registro). */
export const cardLast4 = (raw: string): string => digits(raw).slice(-4);

/** Validade no futuro: mês 1-12; ano "AA" (>=hoje) ou "AAAA". vencimento = fim do mês. */
export function isExpiryFuture(month: string, year: string): boolean {
  const m = Number(digits(month));
  let y = Number(digits(year));
  if (!Number.isInteger(m) || m < 1 || m > 12) return false;
  if (!Number.isInteger(y)) return false;
  if (y < 100) y += 2000; // "30" → 2030
  if (y < 2000 || y > 2100) return false;
  const now = new Date();
  const endOfMonth = new Date(y, m, 1); // dia 1 do mês SEGUINTE = vencido
  return endOfMonth > now;
}

/** CVV: 3-4 dígitos (Amex emite 4 — aceita os dois, o Asaas recusa o errado). */
export const isValidCvv = (raw: string): boolean => /^\d{3,4}$/.test(digits(raw));

/** Valida cartão + titular. Retorna lista de erros PT-BR (vazia = ok). */
export function validateCardCharge(card: Partial<CardInput>, holder: Partial<HolderInput>, required: { address: boolean }): string[] {
  const errs: string[] = [];
  if (!isValidCardNumber(card.number ?? '')) errs.push('Número de cartão inválido.');
  if (!String(card.holderName ?? '').trim() || String(card.holderName).trim().length < 3) errs.push('Nome impresso no cartão é obrigatório.');
  if (!isExpiryFuture(card.expiryMonth ?? '', card.expiryYear ?? '')) errs.push('Validade do cartão inválida ou vencida.');
  if (!isValidCvv(card.ccv ?? '')) errs.push('CVV inválido (3 ou 4 dígitos).');
  if (!String(holder.name ?? '').trim() || String(holder.name).trim().length < 3) errs.push('Nome do titular é obrigatório.');
  if (!isValidCpf(holder.cpf ?? '')) errs.push('CPF do titular inválido.');
  if (required.address) {
    if (!/^\d{8}$/.test(digits(holder.postalCode ?? ''))) errs.push('CEP inválido.');
    if (!String(holder.addressNumber ?? '').trim()) errs.push('Número do endereço é obrigatório.');
  }
  return errs;
}

export { digits as onlyDigits };
