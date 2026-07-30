import { API_URL } from '../config';

/**
 * Registro de laboratórios — lê do BANCO (GET /api/labs, admin gerencia + logo). Cache em memória
 * (1 fetch/sessão). Fallback hardcoded só se a API falhar ou antes de carregar.
 *
 * Resolve o "nome feio": casa o sourceLab cru (unidade/posto, ex.: "SJC - Bacabal") com a MARCA
 * (ex.: "Sabin"). Se a marca tem logo (admin subiu), LabBadge mostra o logo; senão círculo c/ inicial + cor.
 */

export interface LabBrand {
  id?: string;          // id no banco (pra URL do logo)
  key: string;          // slug/chave
  name: string;
  color: string;
  aliases: string[];
  hasLogo?: boolean;
}

// Fallback (usado se /api/labs falhar). Cores aproximadas das marcas.
const FALLBACK: LabBrand[] = [
  { key: 'sabin', name: 'Sabin', color: '#F26522', aliases: ['sabin', 'sjc', 'posto sabin'] },
  { key: 'dasa', name: 'Dasa', color: '#7E1F86', aliases: ['dasa'] },
  { key: 'fleury', name: 'Fleury', color: '#E30613', aliases: ['fleury'] },
  { key: 'hermato', name: 'Hermato', color: '#00A859', aliases: ['hermato'] },
  { key: 'cedimagem', name: 'CedImageagem', color: '#005EB8', aliases: ['cedimagem', 'cedi'] },
  { key: 'lavoisier', name: 'Lavoisier', color: '#0067B1', aliases: ['lavoisier'] },
  { key: 'delboni', name: 'Delboni', color: '#0094D9', aliases: ['delboni'] },
  { key: 'labsdor', name: 'Labs D’Or', color: '#00A0AF', aliases: ['labs d or', 'rede d or'] },
];

const norm = (s: string | null | undefined): string =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

let _dbLabs: LabBrand[] | null = null;
let _fetching: Promise<LabBrand[]> | null = null;

/** Busca labs do banco (cache sessão). Devolve a lista (DB ou fallback). */
export function fetchLabs(): Promise<LabBrand[]> {
  if (_dbLabs) return Promise.resolve(_dbLabs);
  if (!_fetching) {
    _fetching = fetch(`${API_URL}/labs`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => {
        const labs = (d?.labs ?? []).map((l: any) => ({
          id: l.id, key: l.slug, name: l.name, color: l.color || '#178f89',
          aliases: Array.isArray(l.aliases) ? l.aliases : [], hasLogo: !!l.hasLogo,
        }));
        // DB vazio (ex.: dev sem seed) → usa fallback hardcoded p/ não ficar sem marca nenhuma.
        _dbLabs = labs.length ? labs : FALLBACK;
        return _dbLabs!;
      })
      .catch(() => { _dbLabs = FALLBACK; return FALLBACK; });
  }
  return _fetching;
}

/** Labs disponíveis síncrono (DB se carregou, senão fallback). */
export function getLabsSync(): LabBrand[] { return _dbLabs ?? FALLBACK; }

/** Casa sourceLab cru com a MARCA (procura name/aliases). Usa labs do banco (ou fallback). */
export function matchLab(raw: string | null | undefined): LabBrand | null {
  if (!raw) return null;
  const n = norm(raw);
  if (!n) return null;
  for (const lab of getLabsSync()) {
    const aliases = [lab.name, lab.key, ...lab.aliases].map(norm).filter(Boolean);
    if (aliases.some((a) => n === a || n.includes(a))) return lab;
  }
  return null;
}

/** Cor de marca (casada) ou cor estável (hash) pra desconhecido. */
const FALLBACK_PALETTE = ['#178f89', '#6366f1', '#ea580c', '#0e7490', '#be185d', '#4d7c0f', '#7c3aed', '#b45309'];
export function labColor(raw: string | null | undefined): string {
  const m = matchLab(raw);
  if (m) return m.color;
  const n = norm(raw) || '?';
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
}

export function labInitial(name: string): string {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

/** Limpa unidade/cidade do sourceLab (remove a marca casada) pra mostrar como secundário. */
export function labUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const brand = matchLab(raw);
  if (!brand) return null;
  let u = raw;
  for (const a of [brand.name, brand.key, ...brand.aliases]) u = u.replace(new RegExp(a.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'ig'), ' ');
  u = u.replace(/[-–|]/g, ' ').replace(/\s+/g, ' ').replace(/^[,;\s]+|[,;\s]+$/g, '').trim();
  return u && u !== raw ? u : null;
}
