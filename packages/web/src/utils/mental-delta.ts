/**
 * mental-delta — lógica PURA dos deltas e da janela de reavaliação do rastreamento
 * de saúde mental (G1-G3). Sem React/fetch — testável direto.
 *
 * TOM (ético): o delta é FATO, nunca julgamento — "↓4 desde setembro", nunca
 * "melhorou/piorou" (a IA não diagnostica e o chip também não opina).
 */

export type DeltaDir = 'down' | 'up' | 'flat';
export type DeltaTone = 'good' | 'warn' | 'neutral';

/** Direção e tom da mudança entre dois scores do MESMO instrumento.
 *  - caiu          → dir 'down', tone 'good' (verde — scores menores são melhores)
 *  - subiu >= 3    → dir 'up',   tone 'warn'  (âmbar — merece olho)
 *  - subiu < 3/igual → tone 'neutral' (sem drama) */
export const deltaEntre = (anterior: number, atual: number): { dir: DeltaDir; abs: number; tone: DeltaTone } => {
  const diff = atual - anterior;
  if (diff < 0) return { dir: 'down', abs: Math.abs(diff), tone: 'good' };
  if (diff === 0) return { dir: 'flat', abs: 0, tone: 'neutral' };
  return { dir: 'up', abs: diff, tone: diff >= 3 ? 'warn' : 'neutral' };
};

/** Mês do registro de referência em pt-BR minúsculo ("setembro") — para o
 *  "desde <mês>" do chip. ISO sem timezone (ex.: '2026-09-14T10:00:00') é
 *  interpretado como hora local → resultado idêntico em qualquer TZ do runner. */
export const mesDe = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { month: 'long' }).toLowerCase();
};

/** Texto do chip de delta — só o fato: "↓4 desde setembro". Nunca julgativo. */
export const deltaLabel = (delta: { dir: DeltaDir; abs: number }, desdeIso: string): string => {
  const seta = delta.dir === 'down' ? '↓' : delta.dir === 'up' ? '↑' : '±';
  return `${seta}${delta.abs} desde ${mesDe(desdeIso)}`;
};

/** Janela de reavaliação: rastreamentos valem por 2 semanas → createdAt + 14d
 *  em DD/MM (campos LOCAIS, formatados à mão — imune a quirks de TZ do
 *  toLocaleDateString entre ambientes). */
export const proximaJanela = (iso: string): string => {
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return '';
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 14);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
};
