import { prisma } from '../prisma';

/**
 * Score de saúde (0-100) do exame laboratorial mais recente do usuário (0-100),
 * considerando apenas itens com faixa de referência. Mesmo cálculo puro que está
 * inline em patient.routes.ts (/health-score e /family-overview) — extraído pra
 * reuso nas conquistas (badge "Saudável"). Educativo, não substitui consulta.
 *
 * Retorna null quando não há exame ou nenhum item com referência.
 */
export async function latestHealthScore(
  userId: string,
): Promise<{ score: number | null; total: number; abnormal: number } | null> {
  const latest = await prisma.exam.findFirst({
    where: { patient: { ownerId: userId }, status: 'EXTRACTED' },
    orderBy: { performedAt: 'desc' },
    select: { id: true },
  });
  if (!latest) return null;
  const exam = await prisma.exam.findUnique({ where: { id: latest.id }, include: { items: true } });
  const withRef = (exam?.items ?? []).filter((i) => i.refLow != null || i.refHigh != null);
  if (!withRef.length) return { score: null, total: 0, abnormal: 0 };
  const abnormal = withRef.filter((i) => i.isAbnormal).length;
  const score = Math.round((100 * (withRef.length - abnormal)) / withRef.length);
  return { score, total: withRef.length, abnormal };
}
