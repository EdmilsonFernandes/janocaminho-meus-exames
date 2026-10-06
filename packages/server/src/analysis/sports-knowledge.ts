/**
 * sports-knowledge.ts — Knowledge esportivo com citação (E3.2, Saúde Esportiva).
 *
 * Knowledge base: `packages/server/knowledge/sports/*.md` — espelha o mecanismo do
 * guidelines.ts (mesmo formato topic/markers/updated + "## Pontos-chave" com [FONTE ANO]),
 * com DUAS diferenças deliberadas:
 *  1. GATE DURO: `sportsKnowledgeContext(canonicals, enabled)` só lê o diretório quando
 *     `enabled=true` (caller passa sportsModeEnabled() E paciente com SportsProfile ativo).
 *     Modo off → { block: null } SEM tocar no filesystem — prompt byte-idêntico ao atual.
 *  2. TOKENS: card entra POR ANALITO (markers do cabeçalho vs nameCanonical dos exames do
 *     paciente + texto da pergunta) — NUNCA wholesale (relatório §9: relay GLM trunca
 *     contexto grande). Cards ≤ ~6 bullets por arquivo (regra de edição do diretório).
 *
 * Degradação: sem diretório, card malformado, sem match → block null, nada quebra.
 * Conteúdo dos cards é DRAFT até revisão médica (banner no topo de cada .md) — nada disso
 * é visível em produção sem a flag sportsMode.
 */
import fs from 'fs';
import path from 'path';
import { normalizeKey } from '../utils/normalize';

export interface SportsCard {
  topic: string;
  /** markers normalizados (normalizeKey) do cabeçalho do .md */
  markers: string[];
  /** bullets da seção "## Pontos-chave" (com [FONTE ANO] embutido) */
  bullets: string[];
}

const KB_CANDIDATES = [
  path.resolve(__dirname, '../../knowledge/sports'),
  path.resolve(__dirname, '../../../knowledge/sports'),
  path.resolve(process.cwd(), 'knowledge/sports'),
  path.resolve(process.cwd(), 'packages/server/knowledge/sports'),
];

const isProd = process.env.NODE_ENV === 'production';
let cache: SportsCard[] | null = null;

function parseCard(txt: string): SportsCard | null {
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
  return bullets.length ? { topic, markers, bullets } : null;
}

function loadAll(): SportsCard[] {
  if (isProd && cache) return cache;
  const dir = KB_CANDIDATES.find((c) => fs.existsSync(c));
  if (!dir) return [];
  const out: SportsCard[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    try {
      const card = parseCard(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (card) out.push(card);
    } catch { /* card ruim não derruba o resto */ }
  }
  if (isProd) cache = out;
  return out;
}

/** Mesmo match do guidelines.ts: marker no set de nameCanonical OU em texto livre com
 *  borda de não-alfanumérico (markers <3 alfanuméricos ficam só no match por canonical). */
function markerInText(marker: string, normalizedText: string): boolean {
  if (marker.replace(/[^A-Z0-9]/g, '').length < 3) return false;
  const re = new RegExp(`(^|[^A-Z0-9])${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Z0-9]|$)`);
  return re.test(normalizedText);
}

/** Seleciona cards cujos markers casam com os analitos da conversa/exame e/ou o texto. */
export function matchSportsKnowledge(canonicals: Iterable<string | null | undefined>, text?: string): SportsCard[] {
  const canonSet = new Set<string>();
  for (const c of canonicals) if (c) canonSet.add(normalizeKey(c));
  const normText = text ? normalizeKey(text) : '';
  return loadAll().filter((g) =>
    g.markers.some((m) => canonSet.has(m) || (!!normText && markerInText(m, normText))),
  );
}

/** Bloco p/ o prompt. `null` = nada a injetar. Header distinto do guidelines (o modelo
 *  precisa saber que é CONTEXTO ESPORTIVO com regras próprias: TRT=prescrito, sem faixa
 *  segura de AAS, sem dose/ciclo/TPC). */
export function sportsKnowledgeBlock(cards: SportsCard[]): string | null {
  if (!cards.length) return null;
  const secs = cards
    .map((g) => `### ${g.topic}\n${g.bullets.map((b) => `- ${b}`).join('\n')}`)
    .join('\n\n');
  return (
    `\nCONHECIMENTO DE CONTEXTO ESPORTIVO (educativo):\n${secs}\n\n` +
    `Ao referenciar estes pontos, CITE a fonte no formato [FONTE ANO] logo após a afirmação. ` +
    `Diretrizes de TRT citadas referem-se a USO PRESCRITO (graduação fraca/condicional) — diga isso ` +
    `ao usá-las. NÃO existe faixa segura de esteroides anabolizantes: NUNCA cite uma. NUNCA sugira ` +
    `dose, ciclo, TPC ou combinação de substâncias. Uso/treino declarado CONTEXTUALIZA, nunca torna ` +
    `resultado normal/seguro. Continue SEMPRE educativo, sem diagnóstico.`
  );
}

/** Conveniência: match + block com o gate duro (enabled=false → nem lê o diretório). */
export function sportsKnowledgeContext(
  canonicals: Iterable<string | null | undefined>,
  enabled: boolean,
  text?: string,
): { block: string | null; topics: string[] } {
  if (!enabled) return { block: null, topics: [] };
  const cards = matchSportsKnowledge(canonicals, text);
  return { block: sportsKnowledgeBlock(cards), topics: cards.map((c) => c.topic) };
}
