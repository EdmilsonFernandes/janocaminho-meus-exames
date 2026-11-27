/**
 * Busca antecipada do exame (27/11/26).
 *
 * Medido no Android (emulador, lista → detalhe): ~0,8 s com a lista parada e mais ~1 s de tela
 * vazia com um círculo girando antes de aparecer qualquer valor. A busca do exame só começava
 * DEPOIS de a tela nova montar. Agora ela começa no toque (`pointerdown`), em paralelo com a
 * troca de tela, e a tela de detalhe usa o que já chegou.
 *
 * Também guarda o último exame aberto de cada id (só os que não mudam sozinhos: lido ou falhou),
 * para o "voltar e abrir de novo" mostrar os valores na hora enquanto confere se algo mudou.
 */
import { API_URL, token } from '../config';

const FRESH_MS = 15_000;
const KEEP = 20;

type Entry = { at: number; data: Promise<unknown | null> };
const inflight = new Map<string, Entry>();
const known = new Map<string, unknown>();

/** Estados em que o exame não muda sozinho — só esses valem como "já visto". */
const SETTLED = new Set(['EXTRACTED', 'FAILED', 'REJECTED']);

/** Começa a buscar o exame agora (idempotente por 15 s). Nunca lança. */
export function prefetchExam(id: string | null | undefined, fetcher: typeof fetch = fetch): void {
  if (!id) return;
  const cur = inflight.get(id);
  if (cur && Date.now() - cur.at < FRESH_MS) return;
  const data = fetcher(`${API_URL}/exams/${id}`, { headers: { Authorization: `Bearer ${token()}` } })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  inflight.set(id, { at: Date.now(), data });
}

/** O resultado da busca antecipada, se ainda estiver fresco (e a retira: vale uma vez). */
export function takePrefetched(id: string): Promise<unknown | null> | null {
  const cur = inflight.get(id);
  inflight.delete(id);
  if (!cur || Date.now() - cur.at >= FRESH_MS) return null;
  return cur.data;
}

/** Guarda a última versão vista de um exame (só os que não estão em processamento). */
export function rememberExam(id: string, exam: { status?: string } | null | undefined): void {
  if (!exam || !SETTLED.has(String(exam.status))) { known.delete(id); return; }
  known.delete(id);
  known.set(id, exam);
  while (known.size > KEEP) known.delete(known.keys().next().value as string);
}

/** A última versão vista do exame, para desenhar na hora enquanto a tela confere com o servidor. */
export function lastKnownExam<T = any>(id: string | null | undefined): T | null {
  return id ? ((known.get(id) as T | undefined) ?? null) : null;
}

/** Só para testes. */
export function __resetExamPrefetch(): void {
  inflight.clear();
  known.clear();
}
