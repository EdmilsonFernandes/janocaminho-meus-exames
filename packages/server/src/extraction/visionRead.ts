// LEITURA DUPLA DE FOTO DIFÍCIL (26/11/26).
//
// Caso real: hemograma fotografado de lado, 833×1326 px, passado por filtro de "scanner". O
// tesseract leu 0 palavras e o exame foi recusado — mas a olho dava para ler. Um modelo de visão
// (Gemini) lê quase tudo; o problema é que ele ERRA UM NÚMERO SEM AVISAR (medido: PCT saiu 2.82
// num modelo e 0.32 no outro, nenhum dos dois marcou dúvida).
//
// Por isso a regra aqui é: a foto é lida DUAS vezes, por dois modelos diferentes, e só entra no
// exame o resultado que saiu IGUAL nas duas. O que divergiu sai da transcrição e vai para a lista
// "não deu para ler com certeza". Uma leitura sozinha nunca vira exame.
//
// Só é chamado quando o leitor normal (tesseract) falhou — ver pipeline.ts.
import { resolveProviderConfig } from '../llm/ai-config';
import { splitKeys } from '../llm/anthropic';
import { modelTiers } from '../llm/gemini';

/** Menos resultados iguais nas duas leituras do que isto → não vira exame (pede outra foto). */
export const VISION_MIN_AGREED = 3;
const TIMEOUT_MS = 75_000;
/** O Gemini devolve 503 ("sobrecarregado") com frequência — medido 26/11: o modelo principal
 *  recusou 9 vezes seguidas em 28 s, em todas as chaves. Por isso há leitores de reserva (outra
 *  geração do mesmo fornecedor): o que importa é ter DUAS leituras de modelos DIFERENTES. */
export const VISION_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
/** Passadas pela lista de leitores até juntar duas leituras; entre passadas, espera curta. */
export const VISION_ROUNDS = 2;
const RETRY_WAIT_MS = Number(process.env.VISION_RETRY_WAIT_MS ?? 5000);

export const VISION_PROMPT = [
  'Esta imagem deveria ser um resultado de exame de laboratório fotografado.',
  'Primeira linha da resposta, obrigatória: "TIPO: exame" ou "TIPO: nao_exame".',
  'Use nao_exame para foto de pessoa, chapa/filme de imagem sem texto de laudo, receita, pedido de exame ou qualquer coisa que não traga resultados.',
  'Se for exame, transcreva o texto legível exatamente como está impresso (o papel pode estar girado).',
  'Cada resultado vai em UMA linha, neste formato exato: NOME | RESULTADO | UNIDADE | REFERÊNCIA',
  'Cabeçalho (laboratório, nome do paciente, data, médico) vai em linhas normais, sem "|".',
  'REGRA: nunca adivinhe. Número ou letra que não esteja claramente legível vira [?].',
  'Não interprete, não resuma, não comente.',
].join('\n');

export interface VisionRow { name: string; result: string; unit: string; ref: string }
export interface ParsedRead { isExam: boolean; header: string[]; rows: VisionRow[] }
export interface Reconciled {
  /** Texto que segue para a extração: cabeçalho + só os resultados iguais nas duas leituras. */
  text: string;
  agreed: number;
  /** Nomes dos exames cujo resultado divergiu ou só apareceu em uma leitura. */
  unsure: string[];
  /** Nomes cujo resultado bateu mas a faixa de referência não — a faixa foi retirada. */
  refDropped: string[];
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9#%]+/g, '');
/** Número/valor comparável: vírgula = ponto, sem espaços. "13,6" e "13.6" são o mesmo resultado. */
const normValue = (s: string) => s.replace(/\s+/g, '').replace(/,/g, '.').toLowerCase();
const isHeaderRow = (name: string, result: string) => /^(nome|modulos?|exame|analito|parametro|teste)$/.test(norm(name)) || /^(resultado|result)$/.test(norm(result));

/** Resposta do modelo → cabeçalho + linhas de resultado. Função pura (testada). */
export function parseVisionText(raw: string): ParsedRead {
  const lines = String(raw ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const tipo = lines.find((l) => /^TIPO\s*:/i.test(l)) ?? '';
  const isExam = /TIPO\s*:\s*exame/i.test(tipo);
  const header: string[] = [];
  const rows: VisionRow[] = [];
  for (const l of lines) {
    if (/^TIPO\s*:/i.test(l) || /^[-=_\s|]+$/.test(l)) continue;
    if (!l.includes('|')) { header.push(l); continue; }
    const c = l.split('|').map((x) => x.trim());
    const [name = '', result = '', unit = '', ref = ''] = c;
    if (!name || !result || isHeaderRow(name, result)) continue;
    rows.push({ name, result, unit, ref });
  }
  return { isExam, header, rows };
}

/**
 * Compara as duas leituras. Função pura (testada).
 * - resultado igual nas duas → fica;
 * - diferente, com [?], ou só em uma → sai e entra em `unsure`;
 * - faixa de referência diferente → o resultado fica SEM faixa (sem faixa o app não acusa
 *   "fora da faixa" por engano).
 */
export function reconcileReads(a: ParsedRead, b: ParsedRead): Reconciled {
  const byName = new Map<string, VisionRow>();
  for (const r of b.rows) if (!byName.has(norm(r.name))) byName.set(norm(r.name), r);
  const seen = new Set<string>();
  const kept: string[] = [];
  const unsure: string[] = [];
  const refDropped: string[] = [];
  for (const r of a.rows) {
    const k = norm(r.name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const o = byName.get(k);
    const doubtful = /\[\?\]/.test(r.result) || !o || /\[\?\]/.test(o.result) || normValue(r.result) !== normValue(o.result);
    if (doubtful) { unsure.push(r.name); continue; }
    const sameUnit = !/\[\?\]/.test(r.unit) && normValue(r.unit) === normValue(o!.unit);
    const sameRef = !!r.ref && !/\[\?\]/.test(r.ref) && normValue(r.ref) === normValue(o!.ref);
    if (r.ref && !sameRef) refDropped.push(r.name);
    kept.push(`${r.name} | ${r.result} | ${sameUnit ? r.unit : ''} | ${sameRef ? r.ref : ''}`);
  }
  for (const r of b.rows) { // o que só a 2ª leitura viu também é dúvida
    const k = norm(r.name);
    if (k && !seen.has(k)) { seen.add(k); unsure.push(r.name); }
  }
  // Cabeçalho: só as linhas que as duas leituras trouxeram iguais (nome, data, laboratório).
  const headB = new Set(b.header.map(norm));
  // VALOR SOLTO, sem nome de exame ("2.8 mg/L"): não segue. Caso real 26/11: a extração recebeu
  // essa linha e batizou o valor de "Proteína C Reativa" por conta própria. Sem nome legível, é dúvida.
  const bareValue = (l: string) => /^[<>≤≥]?\s*\d[\d.,]*\s*[^\s\d]{0,12}(\/\S{1,8})?$/.test(l.trim());
  const header: string[] = [];
  for (const l of a.header) {
    if (/\[\?\]/.test(l) || !headB.has(norm(l))) continue;
    if (bareValue(l)) { unsure.push(`um resultado sem nome legível (${l.trim()})`); continue; }
    header.push(l);
  }
  const text = [...header, '', 'NOME | RESULTADO | UNIDADE | REFERÊNCIA', ...kept].join('\n');
  return { text, agreed: kept.length, unsure, refDropped };
}

/** Uma transcrição por um modelo. null = indisponível (sem chave, cota, erro, tempo esgotado). */
async function transcribe(buffer: Buffer, mime: string, model: string, keys: string[]): Promise<string | null> {
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: buffer.toString('base64') } }, { text: VISION_PROMPT }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 6144 },
  });
  for (const key of keys) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body, signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!r.ok) { console.warn(`[vision] ${model}: HTTP ${r.status}`); continue; }
      const j: any = await r.json();
      const text = (j?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join('');
      if (j?.candidates?.[0]?.finishReason === 'MAX_TOKENS') { console.warn(`[vision] ${model}: resposta cortada`); return null; }
      if (text.trim()) {
        console.log(`[vision] ${model}: ${text.length} chars, ${j?.usageMetadata?.totalTokenCount ?? '?'} tokens`);
        return text;
      }
    } catch (e) { console.warn(`[vision] ${model}: ${(e as Error).message}`); }
  }
  return null;
}

export type VisionOutcome =
  | { kind: 'exam'; text: string; unsure: string[]; refDropped: string[]; agreed: number; models: string[] }
  | { kind: 'not_exam' }
  | { kind: 'unavailable'; why: string };

/** Lê a foto com dois modelos DIFERENTES e devolve só o que as duas leituras confirmam. */
export async function visionReadPhoto(buffer: Buffer, mime: string): Promise<VisionOutcome> {
  const cfg = resolveProviderConfig('gemini');
  const keys = splitKeys(cfg.apiKey ?? '');
  if (!keys.length) return { kind: 'unavailable', why: 'sem chave Gemini' };
  const readers = Array.from(new Set([...modelTiers(cfg.model ?? ''), ...VISION_FALLBACK_MODELS].filter(Boolean)));
  const reads: { model: string; text: string }[] = [];
  for (let round = 0; round < VISION_ROUNDS && reads.length < 2; round++) {
    if (round > 0) await new Promise((res) => setTimeout(res, RETRY_WAIT_MS));
    const pending = readers.filter((m) => !reads.some((r) => r.model === m));
    // os dois primeiros em paralelo (caminho normal: ~20 s); reservas só se faltar leitura
    const first = await Promise.all(pending.slice(0, 2 - reads.length).map(async (m) => ({ model: m, text: await transcribe(buffer, mime, m, keys) })));
    for (const r of first) if (r.text) reads.push({ model: r.model, text: r.text });
    for (const m of pending.slice(2 - (reads.length - first.filter((r) => r.text).length))) {
      if (reads.length >= 2) break;
      const text = await transcribe(buffer, mime, m, keys);
      if (text) reads.push({ model: m, text });
    }
  }
  if (reads.length < 2) return { kind: 'unavailable', why: 'só uma leitura disponível' };
  const a = parseVisionText(reads[0].text);
  const b = parseVisionText(reads[1].text);
  if (!a.isExam && !b.isExam) return { kind: 'not_exam' };
  if (!a.isExam || !b.isExam) return { kind: 'unavailable', why: 'as leituras discordam se é um exame' };
  const rec = reconcileReads(a, b);
  if (rec.agreed < VISION_MIN_AGREED) return { kind: 'unavailable', why: `só ${rec.agreed} resultado(s) iguais nas duas leituras` };
  return { kind: 'exam', text: rec.text, unsure: rec.unsure, refDropped: rec.refDropped, agreed: rec.agreed, models: reads.map((r) => r.model) };
}
