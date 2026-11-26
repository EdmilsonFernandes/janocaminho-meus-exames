import { buildCurrentHealthSummary } from './health-state';

/**
 * Cache LRU do health-summary — módulo próprio p/ permitir INVALIDAÇÃO por quem muda os
 * dados (delete de exame, extração concluída, edição de item). Antes o Map vivia dentro de
 * patient.routes.ts e ninguém de fora conseguia invalidar: usuário DELETAVA um exame e o
 * painel continuava até 5 min com o dado morto (bug reportado 2026-08-16).
 */
const hsCache = new Map<string, { data: any; ts: number }>();
const HS_TTL = 5 * 60_000;

export async function getCachedHealthSummary(patientId: string): Promise<any> {
  const cached = hsCache.get(patientId);
  if (cached && Date.now() - cached.ts < HS_TTL) return cached.data;
  const data = await buildCurrentHealthSummary(patientId);
  hsCache.set(patientId, { data, ts: Date.now() });
  return data;
}

/** Invalida o summary cacheado de 1 paciente — chame em TODA mutação de exames/itens dele.
 *  Invalida junto o PANORAMA (abaixo): os dois leem os mesmos exames/peso/pressão. */
export function invalidateHealthSummary(patientId: string): void {
  hsCache.delete(patientId);
  invalidatePanorama(patientId);
}

// ── Panorama (GET /patients/:id/panorama) ──────────────────────────────────────
// Mesmo TTL e o MESMO gatilho de invalidação do health-summary: quem já chama
// invalidateHealthSummary (fim da extração, delete de exame, edição de item, peso/pressão
// novos) limpa os dois — o relatório não mostra dado morto por até 5 min depois de um exame
// mudar. Guarda o CORPO já serializado: a 2ª chamada devolve exatamente os mesmos bytes.
// Chave = patientId (um paciente tem um único dono; a rota confere a posse ANTES de ler aqui).
// Resposta com alguma área `unavailable` NÃO entra no cache: falha transiente não vira
// "indisponível por 5 min" — o pedido seguinte tenta de novo.
// Teto de entradas: passa de PANORAMA_MAX_ENTRIES → o mais antigo sai (Map guarda a ordem).
const panoramaCache = new Map<string, { body: string; ts: number }>();
const PANORAMA_MAX_ENTRIES = 300;
/** Builds em curso por paciente: 2 pedidos simultâneos a frio não calculam 2×. */
const panoramaInFlight = new Map<string, Promise<string>>();
/** Versão por paciente: um build que começa ANTES de uma invalidação não repõe o cache com
 *  dado velho ao terminar (só entra no cache se a versão não mudou enquanto calculava). */
const panoramaVersion = new Map<string, number>();

/** `build` devolve o corpo e se ele pode ser guardado. Devolve sempre o corpo calculado/hit. */
export async function getCachedPanorama(patientId: string, build: () => Promise<{ body: string; cacheable: boolean }>): Promise<string> {
  const hit = panoramaCache.get(patientId);
  if (hit && Date.now() - hit.ts < HS_TTL) {
    panoramaCache.delete(patientId); // volta pro fim = usado recentemente
    panoramaCache.set(patientId, hit);
    return hit.body;
  }
  const pending = panoramaInFlight.get(patientId);
  if (pending) return pending;
  const version = panoramaVersion.get(patientId) ?? 0;
  const p = (async () => {
    const { body, cacheable } = await build(); // falha não entra no cache
    if (cacheable && (panoramaVersion.get(patientId) ?? 0) === version) {
      panoramaCache.delete(patientId);
      panoramaCache.set(patientId, { body, ts: Date.now() });
      while (panoramaCache.size > PANORAMA_MAX_ENTRIES) {
        const oldest = panoramaCache.keys().next().value;
        if (oldest === undefined) break;
        panoramaCache.delete(oldest);
      }
    }
    return body;
  })().finally(() => { panoramaInFlight.delete(patientId); });
  panoramaInFlight.set(patientId, p);
  return p;
}

export function invalidatePanorama(patientId: string): void {
  panoramaCache.delete(patientId);
  panoramaVersion.set(patientId, (panoramaVersion.get(patientId) ?? 0) + 1);
  panoramaInFlight.delete(patientId); // o próximo pedido calcula de novo, não engata num build velho
}
