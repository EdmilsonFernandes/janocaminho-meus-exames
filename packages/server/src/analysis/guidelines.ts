/**
 * guidelines.ts — Diretrizes clínicas com citação (Feature C).
 *
 * Knowledge base: `packages/server/knowledge/guidelines/*.md` — um card por tema, bullets
 * curtos com [FONTE ANO]. Loader (este arquivo) faz 3 coisas:
 *  1. Carrega os cards (cache em prod, relê em dev — mesmo padrão de knowledge.ts);
 *  2. `guidelinesContext()` casa os MARCADORES do card contra os `nameCanonical` dos itens
 *     de exame da conversa (mesma chave do normalize.ts) + texto livre da pergunta, e monta
 *     o bloco de system-prompt ("Baseie-se nestas diretrizes; cite [FONTE ANO]; SEMPRE
 *     educativo, sem diagnóstico" — guardrail LGPD/ANVISA intacto);
 *  3. `extractSources()` faz o parse DETERMINÍSTICO (pós-processamento, zero confiança no
 *     LLM) das citações `[FONTE ANO]` que aparecerem na RESPOSTA — vira `sources` no
 *     payload p/ a UI renderizar o rodapé "📚 Fontes".
 *
 * Kill-switch: AppSetting `guidelines.enabled` (0/1) — admin desliga sem deploy.
 * Degradação: qualquer falha (sem arquivo, sem match, disabled) → bloco null / sources [],
 * nada quebra.
 */
import fs from 'fs';
import path from 'path';
import { normalizeKey } from '../utils/normalize';

export interface GuidelineSource { label: string; topic: string }
interface Guideline {
  topic: string;
  /** markers normalizados (normalizeKey) do cabeçalho do .md */
  markers: string[];
  /** bullets da seção "## Pontos-chave" (já com [FONTE ANO] embutido) */
  bullets: string[];
  /** texto cru (p/ mapear sociedade → tema no extractSources) */
  raw: string;
}

// Candidatos de diretório (dev tsx / dist compilado / cwd) — espelha knowledge.ts.
const KB_CANDIDATES = [
  path.resolve(__dirname, '../../knowledge/guidelines'),
  path.resolve(__dirname, '../../../knowledge/guidelines'),
  path.resolve(process.cwd(), 'knowledge/guidelines'),
  path.resolve(process.cwd(), 'packages/server/knowledge/guidelines'),
];

const isProd = process.env.NODE_ENV === 'production';
let cache: Guideline[] | null = null;

function parseCard(txt: string): Guideline | null {
  const topic = txt.match(/^topic:\s*(.+)$/m)?.[1]?.trim();
  const markersLine = txt.match(/^markers:\s*(.+)$/m)?.[1] ?? '';
  if (!topic || !markersLine) return null;
  const markers = markersLine.split(',').map((m) => normalizeKey(m)).filter(Boolean);
  const sec = txt.match(/^##\s+Pontos-chave\s*$/m);
  if (!sec || sec.index == null) return null;
  const bullets = txt
    .slice(sec.index + sec[0].length)
    .split('\n')
    .reduce<string[]>((acc, line) => {
      const t = line.trim();
      if (t.startsWith('#')) return acc; // próxima seção — para
      if (t.startsWith('- ')) acc.push(t.slice(2).trim());
      return acc;
    }, [])
    .filter(Boolean);
  return { topic, markers, bullets, raw: txt };
}

function loadAll(): Guideline[] {
  if (isProd && cache) return cache;
  const dir = KB_CANDIDATES.find((c) => fs.existsSync(c));
  if (!dir) return [];
  const out: Guideline[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    try {
      const card = parseCard(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (card && card.bullets.length) out.push(card);
    } catch { /* card ruim não derruba o resto */ }
  }
  if (isProd) cache = out;
  return out;
}

/** Marker aparece no texto normalizado com borda de não-alfanumérico (padrão do FUZZY do
 *  normalize.ts). Markers curtos (<3 alfanuméricos, ex.: "PA") ficam só no match por
 *  nameCanonical — substring em texto livre casaria em tudo. */
function markerInText(marker: string, normalizedText: string): boolean {
  if (marker.replace(/[^A-Z0-9]/g, '').length < 3) return false;
  const re = new RegExp(`(^|[^A-Z0-9])${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Z0-9]|$)`);
  return re.test(normalizedText);
}

/** Seleciona os cards cujos markers casam com os analitos da conversa/exame
 *  (`nameCanonical` do item, mesma chave do normalize.ts) e/ou o texto da pergunta. */
export function matchGuidelines(canonicals: Iterable<string | null | undefined>, text?: string): Guideline[] {
  const canonSet = new Set<string>();
  for (const c of canonicals) if (c) canonSet.add(normalizeKey(c));
  const normText = text ? normalizeKey(text) : '';
  return loadAll().filter((g) =>
    g.markers.some((m) => canonSet.has(m) || (!!normText && markerInText(m, normText))),
  );
}

/** Bloco p/ o system/user prompt. `null` = nada a injetar (sem match, disabled, sem KB). */
export function guidelinesBlock(cards: Guideline[]): string | null {
  if (!cards.length) return null;
  const secs = cards
    .map((g) => `### ${g.topic}\n${g.bullets.map((b) => `- ${b}`).join('\n')}`)
    .join('\n\n');
  return (
    `\nDIRETRIZES DE SOCIEDADES MÉDICAS (contexto educativo):\n${secs}\n\n` +
    `Ao referenciar estes pontos, CITE a fonte no formato [FONTE ANO] logo após a afirmação ` +
    `(ex.: "alvo de HbA1c <7% para a maioria dos adultos [SBD 2025]"). Use SOMENTE as diretrizes ` +
    `acima para os temas cobertos — não invente números de outras fontes. Continue SEMPRE ` +
    `educativo, sem diagnóstico: comparar com faixa de referência e orientar o médico.`
  );
}

/** Conveniência: match + block numa chamada (checando o kill-switch do admin). */
export function guidelinesContext(
  canonicals: Iterable<string | null | undefined>,
  text?: string,
  enabled = true,
): { block: string | null; topics: string[] } {
  if (!enabled) return { block: null, topics: [] };
  const cards = matchGuidelines(canonicals, text);
  return { block: guidelinesBlock(cards), topics: cards.map((c) => c.topic) };
}

// ──────────────────────────── extractSources (parser puro) ────────────────────────────

/** Citação `[FONTE ANO]`: 2-5 palavras curtas + ano 19xx/20xx. Casa [SBC 2024], [SBD 2025],
 *  [ADA 2025], [ESC 2021], [SBEM 2024], [SBH 2024]... e ignora colchetes de template
 *  ("[não informada no contexto]") e markdown de link. */
const SOURCE_RX = /\[([A-Za-z][A-Za-zÀ-ÿ&./-]{1,5}(?:\s+[A-Za-zÀ-ÿ&./-]{1,8}){0,3})\s+((?:19|20)\d{2})\]/g;

/** Sociedade (sem ano) → tema: o card que cita aquela sociedade nos próprios bullets.
 *  Determinístico — não confia em nada que o LLM diga além do texto que ELE escreveu. */
function topicForSociety(society: string, cards: Guideline[], topics: string[]): string {
  const active = cards.filter((c) => topics.includes(c.topic));
  const hit = active.find((c) => c.raw.includes(society));
  return hit?.topic ?? topics[0] ?? 'geral';
}

/** Extrai as fontes citadas numa RESPOSTA da IA (dedup, preservando ordem de aparição). */
export function extractSources(text: string, topics: string[] = []): GuidelineSource[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: GuidelineSource[] = [];
  const cards = loadAll();
  for (const m of text.matchAll(SOURCE_RX)) {
    const label = `${m[1].trim()} ${m[2]}`;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, topic: topicForSociety(m[1].trim(), cards, topics) });
  }
  return out;
}
