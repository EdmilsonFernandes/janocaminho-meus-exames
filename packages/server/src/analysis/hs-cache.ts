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

/** Invalida o summary cacheado de 1 paciente — chame em TODA mutação de exames/itens dele. */
export function invalidateHealthSummary(patientId: string): void {
  hsCache.delete(patientId);
}
