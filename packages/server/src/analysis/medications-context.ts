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
