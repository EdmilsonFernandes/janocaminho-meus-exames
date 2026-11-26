/**
 * Aviso do exame lido pela "leitura dupla" de foto difícil (servidor: extraction/visionRead.ts).
 * A foto foi lida duas vezes e só entrou o que saiu igual nas duas; o que divergiu ficou de fora
 * e é listado aqui para a pessoa conferir no papel. Função pura (testada). null = sem aviso.
 */
export interface PhotoRead { by?: string; unsure?: string[]; refDropped?: string[] }

const join = (n: string[]) => (n.length <= 1 ? n[0] ?? '' : `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`);
const clean = (l?: string[]) => Array.from(new Set((l ?? []).map((s) => String(s).trim()).filter(Boolean)));

export function photoReadNotice(pr: PhotoRead | null | undefined): { title: string; lines: string[] } | null {
  if (!pr || pr.by !== 'vision') return null;
  const unsure = clean(pr.unsure);
  const noRef = clean(pr.refDropped);
  const lines = ['A foto estava difícil de ler. Confira os valores abaixo com o papel antes de usar.'];
  if (unsure.length) {
    const shown = unsure.slice(0, 8);
    const rest = unsure.length - shown.length;
    lines.push(`Não deu para ler com certeza e ${unsure.length === 1 ? 'ficou' : 'ficaram'} de fora: ${join(shown)}${rest > 0 ? ` e mais ${rest}` : ''}.`);
  }
  if (noRef.length) lines.push(`Sem faixa de referência (não deu para ler): ${join(noRef.slice(0, 8))}.`);
  lines.push('Uma foto mais nítida, ou o PDF do laboratório, traz o exame completo.');
  return { title: 'Lido de uma foto difícil', lines };
}
