/** Compara versões "semver-like" (ex.: "1.3.8" vs "1.4.0").
 *  Retorna -1 se a < b, 0 se iguais, 1 se a > b.
 *  Tolerante a sufixos ("1.3.8-beta" → 1.3.8). */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => (v || '')
    .split('.')
    .map((n) => parseInt(n.replace(/\D/g, ''), 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/** O app do usuário (current) está abaixo da versão mínima exigida (min)? */
export function isUpdateRequired(current: string, min: string): boolean {
  return compareVersions(current, min) < 0;
}
