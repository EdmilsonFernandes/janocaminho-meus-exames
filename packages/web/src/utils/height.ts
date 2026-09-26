/**
 * Altura — fonte única de parse/exibição (bug do dono 26/09: o stepper do cadastro
 * STRIPAVA vírgula/ponto na digitação — "1.72" virava "172" na cara do usuário, e
 * "1.7" corrompia pra 17cm no banco; 7 registros do prod nasceram disso: alturas 1, 2 e 63).
 *
 * Contrato: aceita "172" (cm), "1.72"/"1,72" (m) → sempre devolve cm inteiro.
 * <3 entende como metros; 100–250 é a faixa humana válida em cm.
 */

/** "1,72" | "1.72" | "172" → 172. Nulo se inválido/fora da faixa humana.
 *  Metros exigem a casa decimal ("1" ou "2" sozinhos = ambíguo: eram exatamente os
 *  valores corrompidos do prod — ninguém tem 1,00m; quem digitou queria 1,72). */
export const parseHeightCm = (s: string | null | undefined): number | null => {
  const raw = String(s ?? '').trim();
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 3 && !/[.,]/.test(raw)) return null; // "1"/"2" sem decimal = lixo de unidade
  const cm = Math.round(n < 3 ? n * 100 : n);
  return cm >= 100 && cm <= 250 ? cm : null;
};

/** Máscara de INPUT: só dígitos + 1 separador (, ou .), máx 5 chars ("1.72"/"172"). */
export const maskHeightInput = (s: string): string => {
  let v = s.replace(/[^\d.,]/g, '');
  const i = v.search(/[.,]/);
  if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/[.,]/g, ''); // só 1º separador fica
  return v.slice(0, 5);
};

/** Exibe cm como o usuário pensa: 172 → "1,72 m". */
export const fmtHeight = (cm: number | null | undefined): string =>
  cm == null ? '' : `${(cm / 100).toFixed(2).replace('.', ',')} m (${cm} cm)`;
