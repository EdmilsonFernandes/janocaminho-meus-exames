import { prisma } from '../prisma';

// Documentos gerados por IA que DEVEM persistir (plano de ação, SOAP) — pra não regenerar/cobrar
// a cada abertura. Salvos como AiAnalysis (type SUMMARY, examId null) com o "kind" no userMessage
// (discriminador). O consolidado usa userMessage null — por isso as queries do consolidado filtram
// userMessage: null (ver analysis.routes.ts), pra não pegar estes kinds.
export const DOC_KIND = {
  ACTION_PLAN_PATIENT: 'kind:action_plan:patient',
  ACTION_PLAN_DOCTOR: 'kind:action_plan:doctor',
  SOAP: 'kind:soap',
} as const;

/** UPSERT de um documento gerado (1 por paciente + kind — atualiza o existente, não acumula). */
export async function saveAnalysisDoc(opts: { patientId: string; kind: string; contentMd: string; structured?: any; modelUsed?: string | null; tokenUsage?: any }): Promise<any> {
  const existing = await prisma.aiAnalysis.findFirst({ where: { patientId: opts.patientId, type: 'SUMMARY', examId: null, userMessage: opts.kind }, orderBy: { createdAt: 'desc' } });
  const data = { contentMd: opts.contentMd, structured: opts.structured ?? undefined, modelUsed: opts.modelUsed ?? null, tokenUsage: opts.tokenUsage ?? undefined, createdAt: new Date() };
  if (existing) return prisma.aiAnalysis.update({ where: { id: existing.id }, data });
  return prisma.aiAnalysis.create({ data: { patientId: opts.patientId, examId: null, type: 'SUMMARY', userMessage: opts.kind, ...data } });
}

/** Último documento salvo do kind (grátis — não regenera, não cobra). null se não há. */
export async function getLatestAnalysisDoc(patientId: string, kind: string): Promise<any | null> {
  return prisma.aiAnalysis.findFirst({ where: { patientId, type: 'SUMMARY', examId: null, userMessage: kind }, orderBy: { createdAt: 'desc' } });
}
