/**
 * Exames cujo CPF do documento diverge do CPF do perfil (`rawExtraction.identityMatch.cpfMatch
 * === false` — gate anti-farm/usurpação). NÃO entram em AGREGADOS do paciente (contagens,
 * alterados, evolução, timeseries): valores de terceiro nunca contam como "sua saúde"
 * (auditoria premium 2026-08: exame mismatched alimentava hero/timeline/contagens).
 * O exame SEGUE listado — o dono precisa ver o aviso de CPF divergente e poder excluí-lo.
 *
 * ⚠️ FILTRO EM CÓDIGO, não em query Prisma: JSON path filter (`rawExtraction.path.equals`)
 * dentro de `NOT` cai na lógica trivalente do SQL — `NOT(NULL) = NULL` exclui TODA linha cujo
 * rawExtraction é null ou não tem o caminho (quebrou 6 testes do items.test.ts). Em JS a
 * semântica é explícita: só exclui quando o caminho EXISTE e é false.
 */
export const isCpfMismatch = (rawExtraction: unknown): boolean => {
  const id = (rawExtraction as any)?.identityMatch;
  return id?.method === 'cpf' && id?.cpfMatch === false;
};

// ─────────────────────────────────────────────────────────────────────────────
// Título de exame GENÉRICO → sintetizado a partir dos painéis (auditoria premium,
// item 18): "EXAMES LABORATORIAIS" ×5 no histórico do médico não deixava escanear.
// Síntese é SÓ DE DISPLAY (não reescreve o DB, não re-extrai, não gasta crédito):
// lista/hero/timeline/detalhe mostram "Hormônios + Hemograma" em vez do nome bruto.
// ─────────────────────────────────────────────────────────────────────────────

/** Títulos que não dizem nada ao leitor (vem do laudo/cabeçalho do PDF do lab). */
const GENERIC_TITLE_RX = /^(exames?\s+laboratoriais?|laboratorial(es)?|exames?|exame\s+de\s+sangue|resultados?\s+laboratoriais?|sem\s+t[íi]tulo|an[áa]lises?|exame\s+cl[íi]nico)$/i;

/** Title Case preservando siglas curtas (CHCM/TSH/LDH) — mesmo critério do front.
 *  Quebra por _ E espaço ("TSH_TOTAL" → "TSH Total"). */
const prettyPanel = (p: string): string =>
  p.trim().split(/[_\s]+/).map((tok) => (tok.length <= 5 && /^[A-Z0-9]+$/.test(tok) && !/^(TOTAL|LIVRE|BASAL|GERAL|COMPLETO|PARCIAL|PLASM[ÁA]TIC[AO])$/.test(tok) ? tok : tok.toLowerCase().replace(/(^|\s)\w/g, (m) => m.toUpperCase()))).join(' ');

/** Se o título é genérico e há painéis, devolve "Painel1 + Painel2 (+ Painel3)".
 *  Caso contrário devolve o título original intacto (nunca piora). */
export function synthesizeExamTitle(rawTitle: string | null | undefined, panels: (string | null | undefined)[]): string {
  const title = (rawTitle || '').trim();
  if (!GENERIC_TITLE_RX.test(title)) return title;
  const unique = [...new Set(panels.map((p) => (p || '').trim()).filter((p) => p && !/^(outros?|geral|diversos)$/i.test(p)))].slice(0, 3).map(prettyPanel);
  if (unique.length === 0) return title; // sem painel conhecido: mantém o original
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} + ${unique[1]}`;
  return `${unique.slice(0, -1).join(', ')} + ${unique[unique.length - 1]}`;
}
