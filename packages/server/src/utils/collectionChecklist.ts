// CHECKLIST DE COLETA (T2, 28/10/26) — regras de estado compartilhadas entre rotas,
// pipeline de extração e job de reminders. Drift-safe: tabela nova (migration aditiva
// 20261028b) — deploy parcial sem a tabela degrada pra no-op em vez de derrubar fluxo.
import { prisma } from '../prisma';

/** Erro de coluna/tabela ausente (deploy parcial antes da migration aplicar). */
function isMissingRelationError(e: unknown): boolean {
  return /relation "collection_checklist_items" does not exist|column .* does not exist|does not exist in the current database/i.test(String((e as Error)?.message ?? ''));
}

/**
 * Marca ✓ os itens PENDENTES do checklist cujo analyteCanonical casa com algum
 * nameCanonical do exame recém-extraído. Batch: 1 updateMany cobre todos os matches.
 * Janela dueAt >= now-90d: item velho demais (checklist abandonado há meses) não é
 * ressuscitado por exame novo — o histórico dele é 'expired'.
 * Best-effort: falha NUNCA derruba a extração (chamador já protege, aqui também).
 */
export async function markCollectedFromExtractedExam(patientId: string, examId: string): Promise<number> {
  try {
    const items = await prisma.examItem.findMany({
      where: { examId },
      select: { nameCanonical: true },
      distinct: ['nameCanonical'],
    });
    const canonicals = Array.from(new Set(items.map((i) => i.nameCanonical).filter(Boolean)));
    if (!canonicals.length) return 0;
    const res = await prisma.collectionChecklistItem.updateMany({
      where: {
        patientId,
        status: 'pending',
        analyteCanonical: { in: canonicals },
        dueAt: { gte: new Date(Date.now() - 90 * 86400_000) },
      },
      data: { status: 'collected', collectedAt: new Date(), collectedExamId: examId },
    });
    return res.count;
  } catch (e) {
    if (isMissingRelationError(e)) return 0;
    throw e;
  }
}

/**
 * Vence itens pendentes cujo prazo passou (dueAt < now → status 'expired'). Sem push —
 * expiração é estado de histórico, não evento. Chamado no tick do job de reminders e
 * (lazy) nos GETs do checklist — assim o teste e a UI veem o estado sem depender do job.
 */
export async function expireStaleChecklistItems(now: number = Date.now()): Promise<number> {
  try {
    const res = await prisma.collectionChecklistItem.updateMany({
      where: { status: 'pending', dueAt: { lt: new Date(now) } },
      data: { status: 'expired' },
    });
    return res.count;
  } catch (e) {
    if (isMissingRelationError(e)) return 0;
    throw e;
  }
}
