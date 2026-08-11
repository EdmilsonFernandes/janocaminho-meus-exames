// DEDUP por (data + título normalizado): exame reenviado (arquivo diferente, mesmo
// conteúdo) ou painel duplicado não vira 2 linhas no relatório — keep o mais recente.
// Antes o take:5 listava ~4 entradas repetidas do mesmo dia quando o paciente
// re-enviava o exame. Compartilhado entre o relatório do paciente (analysis.routes)
// e o relatório que o médico lê no portal (doctor.routes) — mesmo critério nos dois.

export type SourceExam = {
  id: string;
  title: string;
  performedAt: Date | null;
  sourceLab: string | null;
  kind: string;
};

export function dedupSourceExams(exams: SourceExam[]): SourceExam[] {
  const norm = (s: string) =>
    (s ?? '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^A-Z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const seen = new Set<string>();
  const out: SourceExam[] = [];
  for (const e of exams) {
    const day = e.performedAt ? new Date(e.performedAt).toISOString().slice(0, 10) : 's/d';
    const key = `${day}|${norm(e.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
