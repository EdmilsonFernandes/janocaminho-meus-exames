/**
 * Registro de laboratórios (redes brasileiras) — mapeia o sourceLab cru extraído do PDF
 * (que vem como unidade/posto, ex.: "SJC - Bacabal") pra a MARCA/rede (ex.: "Sabin") com cor.
 *
 * Resolve o bug do "nome feio": a extração pega a unidade; aqui a gente casa pelo apelido
 * e mostra a marca + cor de identidade (estilo app de saúde — Sabin, Dasa, Fleury...).
 *
 * Cores são aproximações das identidades de marca (refináveis). Sem logo: usamos um círculo
 * colorido com a inicial da marca (LabBadge). Futuro: logos oficiais por asset.
 */

export interface LabBrand {
  key: string;
  name: string;
  color: string; // cor de marca (aproximada)
  aliases: string[]; // variações/códigos de unidade que aparecem no PDF (lowercase, sem acento)
}

const norm = (s: string | null | undefined): string =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export const LAB_BRANDS: LabBrand[] = [
  { key: 'sabin', name: 'Sabin', color: '#F26522', aliases: ['sabin', 'sjc', 'posto sabin', 'sabin saude'] },
  { key: 'dasa', name: 'Dasa', color: '#7E1F86', aliases: ['dasa', 'diagnosticos da america'] },
  { key: 'fleury', name: 'Fleury', color: '#E30613', aliases: ['fleury', 'a + medicina diagnostica', 'a mais'] },
  { key: 'hermato', name: 'Hermato', color: '#00A859', aliases: ['hermato'] },
  { key: 'cedimagem', name: 'CedImageagem', color: '#005EB8', aliases: ['cedimagem', 'cedi imagem', 'cedi'] },
  { key: 'lavoisier', name: 'Lavoisier', color: '#0067B1', aliases: ['lavoisier'] },
  { key: 'labsdor', name: 'Labs D’Or', color: '#00A0AF', aliases: ['labs d or', 'rede d or', 'd or', 'dx'] },
  { key: 'defato', name: 'Delboni', color: '#0094D9', aliases: ['delboni', 'delboni auriemo'] },
  { key: 'crypto', name: 'Cripta', color: '#6C2D8C', aliases: ['cripta'] },
  { key: 'imageimagem', name: 'Imagem', color: '#E1118B', aliases: ['imagem diagnóstica', 'imagem diagnostica'] },
  { key: 'srl', name: 'SRL', color: '#2E7D32', aliases: ['srl'] },
  { key: 'prevclin', name: 'PrevClin', color: '#0E7C86', aliases: ['prevclin', 'prev clin'] },
];

/** Marcas "irmãs" sob uma mesma rede (unifica ex.: Delboni/Cripta → Dasa no futuro). Por ora só registro. */

const FALLBACK_PALETTE = ['#178f89', '#6366f1', '#ea580c', '#0e7490', '#be185d', '#4d7c0f', '#7c3aed', '#b45309'];

/** Casa um sourceLab cru (unidade/posto) com a MARCA. Devolve a marca ou null (desconhecido). */
export function matchLab(raw: string | null | undefined): LabBrand | null {
  if (!raw) return null;
  const n = norm(raw);
  if (!n) return null;
  // 1) alias exata/contida (ex.: "sjc - bacabal" contém "sjc")
  for (const lab of LAB_BRANDS) {
    if (lab.aliases.some((a) => n === a || n.includes(` ${a} `) || n.startsWith(`${a} `) || n.endsWith(` ${a}`) || n === a.replace(/ /g, '') || n.includes(a))) {
      return lab;
    }
  }
  // 2) nome da marca aparece no texto
  for (const lab of LAB_BRANDS) {
    if (n.includes(norm(lab.name)) || n.includes(lab.key)) return lab;
  }
  return null;
}

/** Cor estável pra laboratório desconhecido (hash do nome → paleta). */
export function labColor(raw: string | null | undefined): string {
  const m = matchLab(raw);
  if (m) return m.color;
  const n = norm(raw) || '?';
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
}

/** Inicial curta pra o círculo de marca (1-2 letras). */
export function labInitial(name: string): string {
  const p = (name || '?').trim().split(/\s+/);
  return (p[0]?.[0] ?? '?').toUpperCase();
}

/** Limpa o "unidade/cidade" pra exibir como secundário, removendo a marca se casada. */
export function labUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const brand = matchLab(raw);
  let u = raw;
  if (brand) {
    // remove a marca/apelidos do texto pra sobrar a unidade
    const toStrip = [brand.name, ...brand.aliases];
    for (const a of toStrip) u = u.replace(new RegExp(a.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'ig'), ' ');
    u = u.replace(/[-–|]/g, ' ').replace(/\s+/g, ' ').replace(/^[,;\s]+|[,;\s]+$/g, '').trim();
  }
  return u && u !== raw ? u : null;
}
