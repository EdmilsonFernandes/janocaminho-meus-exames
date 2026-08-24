/**
 * Normalização de medicamento → chave comparável de preço.
 *
 * O usuário cadastra "Marevan" / "Losartana 50mg" / texto da receita; o preço só é
 * comparável quando sabemos: princípio ativo + dose + forma + TAMANHO DA EMBALAGEM
 * ("Losartana Potássica 50mg — 30 comprimidos"). O SISTEMA enriquece (dicionário +
 * parse de texto); o usuário só é consultado contextualmente pela embalagem (packQty).
 */
import { normDrug } from '../utils/interactions';

export interface DosageInfo { value: number; unit: string }

/** Extrai dose+unidade de texto livre: "5mg", "50 mcg", "0,25 mg", "5 mL" → {5,'MG'}. */
export function parseDosage(text?: string | null): DosageInfo | null {
  if (!text) return null;
  const t = normDrug(text);
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(MCG|MG|G|ML|UI|UI\/ML)?/);
  if (!m) return null;
  const value = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = (m[2] || '').toUpperCase();
  return { value, unit };
}

/** Princípio ativo: usa o canônico do dicionário/aliases quando existe (Marevan→VARFARINA),
 *  senão o nome em si ("LOSARTANA POTASSICA" se vier "Losartana potássica 50mg"). */
export function parseActiveIngredient(name: string): string | null {
  const n = normDrug(name);
  if (!n) return null;
  const stripped = n
    .replace(/\b\d+([.,]\d+)?\s*(MCG|MG|G|ML|UI)\b.*$/g, '')
    .replace(/\b(CX|CAIXA|COMPRIMIDO[S]?|CAP[S]?|CP|CÁPSULA[S]?)\b.*$/g, '')
    // Dose ÓRFÃ (número sem unidade): "OZEMPIC 0,25 E" → "OZEMPIC". Sem isto
    // "0,25" vira TOKEN no matcher e casa "6x0,25mm" no nome de uma SERINGA.
    .replace(/\s+\d+([.,]\d+)?(?=\s|$)/g, '')
    .replace(/\s+(E|DE|DO|DA|COM)\s*$/, '')
    .trim();
  return (stripped || n).split(' ').slice(0, 4).join(' ') || null;
}

/** Forma farmacêutica a partir do texto ("30 comprimidos" → CP). */
export function parseForm(text?: string | null): string | null {
  if (!text) return null;
  const t = normDrug(text);
  if (/COMPRIMIDO|\bCP\b/.test(t)) return 'CP';
  if (/CAPSULA|CAP\b/.test(t)) return 'CAP';
  if (/ML\b|SOLUCAO|GOTAS/.test(t)) return 'ML';
  if (/DRAGEA/.test(t)) return 'DR';
  return null;
}

/** Quantidade da embalagem a partir de texto ("cx 30", "30 comprimidos" → 30). */
export function parsePackQty(text?: string | null): number | null {
  if (!text) return null;
  const t = normDrug(text);
  const m = t.match(/(\d{1,4})\s*(COMPRIMIDO|CP|CAPSULA|CAP|CX|CAIXA|DRAGEA|ML)?/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n > 0 && n <= 2000 ? n : null;
}

export interface NormalizedMedication {
  medicationKey: string | null; // null = dados insuficientes p/ comparar
  activeIngredient: string;
  dosageValue?: number;
  dosageUnit?: string;
  form?: string;
  packQty?: number;
}

/** Chave global de produto — idêntica pra "Marevan 5mg cx 30" e "Varfarina 5mg 30 comprimidos". */
export function buildNormalizedMedication(med: { name: string; dosage?: string | null; notes?: string | null; packQty?: number | null }): NormalizedMedication {
  const activeIngredient = parseActiveIngredient(med.name) ?? normDrug(med.name);
  // dose no campo próprio OU embutida no nome ("Losartana 50mg" com dosage vazio — ||, não ??)
  const dosage = parseDosage(med.dosage || med.name);
  const haystack = `${med.name} ${med.dosage ?? ''} ${med.notes ?? ''}`;
  const form = parseForm(haystack) ?? 'CP';
  // packQty explícito (coluna, perguntado contextualmente) > inferido do texto.
  // (sem \b no fim: "COMPRIMIDO" precisa casar o plural "COMPRIMIDOS")
  const packQty = med.packQty ?? parsePackQty((haystack.match(/(CX|CAIXA)\s*\d+|\d+\s*(COMPRIMIDO|CAPSULA|CP|CAP)/i)?.[0]) ?? null);
  const medicationKey = activeIngredient && dosage
    ? `${activeIngredient}|${dosage.value}${dosage.unit || 'MG'}|${form}|${packQty ?? '?'}`
    : null;
  return {
    medicationKey,
    activeIngredient,
    dosageValue: dosage?.value,
    dosageUnit: dosage?.unit,
    form,
    packQty: packQty ?? undefined,
  };
}

/** O pack é necessário p/ comparação honesta (50mg cx30 ≠ cx60). Chave SEM pack é
 *  "insufficient_data" — o card pergunta contextualmente qual embalagem o usuário compra. */
export const isKeyComplete = (key: string | null): boolean => !!key && !key.endsWith('|?');
