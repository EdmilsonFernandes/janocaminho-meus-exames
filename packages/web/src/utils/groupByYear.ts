/** Agrupa itens por ano (da data), do mais recente pro mais antigo. Itens sem data vão num grupo "Sem data" no fim. */
export function groupByYear<T>(items: T[], dateKey: (t: T) => string | null | undefined): { year: number | null; label: string; items: T[] }[] {
  const map = new Map<number, T[]>();
  const noDate: T[] = [];
  for (const it of items) {
    const d = dateKey(it);
    if (!d) { noDate.push(it); continue; }
    const y = new Date(d).getFullYear();
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(it);
  }
  const groups: { year: number | null; label: string; items: T[] }[] = [...map.entries()]
    .map(([year, its]) => ({ year, label: String(year), items: its }))
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  if (noDate.length) groups.push({ year: null, label: 'Sem data', items: noDate });
  return groups;
}
