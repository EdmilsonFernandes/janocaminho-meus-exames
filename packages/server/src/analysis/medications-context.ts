/**
 * F2 (fase 1) — bloco MEDICAÇÕES ATIVAS do contextText do chat.
 * A IA enxerga os remédios ativos do paciente com as datas de início: sintoma novo +
 * efeito CONHECIDO + começo DEPOIS da data de início → conecta remédio↔sintoma na
 * resposta (a diretriz de COMO usar vive no system do streamChat — analysis/chat.ts).
 * Sem schema novo, sem persistência: só montagem de contexto.
 */

export interface MedicationContextEntry {
  name: string;
  startedAt: Date | null;
}

/** Linha única no estilo dos outros blocos do contexto (ex.: "- ATIVIDADE FÍSICA…").
 *  Lista vazia → '' (paciente sem remédios não carrega bloco nem gasta token). */
export function medicationsContextBlock(meds: MedicationContextEntry[]): string {
  if (!meds.length) return '';
  // Mais recente primeiro: p/ "sintoma novo ↔ remédio recém-começado" o suspeito mais
  // provável aparece primeiro na linha.
  const ordered = [...meds].sort(
    (a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0),
  );
  const list = ordered
    .map((m) => (m.startedAt ? `${m.name} (desde ${m.startedAt.toLocaleDateString('pt-BR')})` : m.name))
    .join(', ');
  return (
    `- MEDICAÇÕES ATIVAS (datas de início quando conhecidas — use quando a pergunta envolver ` +
    `sintomas, remédios ou tratamento; NUNCA invente nomes ou datas): ${list}\n`
  );
}

/**
 * Retrato dos exames para a leitura de IA da tela de Remédios.
 * Regra: vale o resultado MAIS RECENTE de cada exame. Um valor que já voltou à faixa não
 * pode chegar à IA como "alterado" (antes a consulta trazia só linhas alteradas, então um
 * TSH alto antigo vencia o TSH normal do exame novo, e o exame novo nem aparecia).
 */
export interface MedExamRow {
  name: string;
  nameCanonical: string | null;
  valueText: string | null;
  unit: string | null;
  isAbnormal: boolean;
  date: Date | null;
}

export interface MedExamSnapshot {
  lastExamDate: Date | null;
  /** Fora da faixa no resultado mais recente daquele exame. */
  altered: string[];
  /** Na faixa no resultado mais recente (os que já estiveram alterados vêm primeiro). */
  inRange: string[];
}

const fmtDay = (d: Date | null) => (d ? d.toLocaleDateString('pt-BR') : 'sem data');

export function medExamSnapshot(rows: MedExamRow[], limits = { altered: 12, inRange: 20 }): MedExamSnapshot {
  const time = (r: MedExamRow) => r.date?.getTime() ?? 0; // sem data = mais antigo, nunca vence
  const latest = new Map<string, MedExamRow>();
  const everAbnormal = new Set<string>();
  let last: Date | null = null;
  for (const r of rows) {
    const key = (r.nameCanonical || r.name).trim().toUpperCase();
    if (!key) continue;
    if (r.isAbnormal) everAbnormal.add(key);
    if (r.date && (!last || r.date.getTime() > last.getTime())) last = r.date;
    const cur = latest.get(key);
    if (!cur || time(r) > time(cur)) latest.set(key, r);
  }
  const line = (r: MedExamRow) => `${r.name}=${r.valueText ?? '?'}${r.unit ? ` ${r.unit}` : ''} (${fmtDay(r.date)})`;
  const recentFirst = (a: [string, MedExamRow], b: [string, MedExamRow]) => time(b[1]) - time(a[1]);
  const entries = [...latest.entries()];
  const altered = entries.filter(([, r]) => r.isAbnormal).sort(recentFirst).slice(0, limits.altered).map(([, r]) => line(r));
  const inRange = entries
    .filter(([, r]) => !r.isAbnormal)
    .sort((a, b) => Number(everAbnormal.has(b[0])) - Number(everAbnormal.has(a[0])) || recentFirst(a, b))
    .slice(0, limits.inRange)
    .map(([k, r]) => (everAbnormal.has(k) ? `${line(r)} [já esteve alterado, voltou à faixa]` : line(r)));
  return { lastExamDate: last, altered, inRange };
}

/** Linhas do prompt (sempre com a data, para a IA saber o que é recente). */
export function medExamPromptLines(s: MedExamSnapshot): string[] {
  return [
    `ÚLTIMO EXAME DO PACIENTE: ${s.lastExamDate ? fmtDay(s.lastExamDate) : 'nenhum exame enviado'}.`,
    `FORA DA FAIXA HOJE (resultado mais recente de cada exame, valor + data): ${s.altered.join('; ') || 'nenhum'}.`,
    `NA FAIXA NO RESULTADO MAIS RECENTE (NÃO trate como alterado): ${s.inRange.join('; ') || 'nenhum'}.`,
    'Considere só o resultado mais recente de cada exame e cite a data dele. Nunca apresente um valor antigo como se fosse o atual.',
  ];
}
