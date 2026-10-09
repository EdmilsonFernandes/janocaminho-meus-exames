import { prisma } from '../prisma';

/** Registra uso de feature de IA em `ai_usage_logs` — é daqui que o painel admin
 *  "Usabilidade" (relatório completo / chat / resumo de exame) lê quem usou o quê.
 *  Best-effort: falha no log NUNCA quebra a rota de IA que o usuário está usando. */
export async function logAiUsage(p: {
  userId: string;
  feature: 'SUMMARY' | 'CONSOLIDATED' | 'CHAT' | 'EXTRACTION';
  model?: string | null;
  analysisId?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  success?: boolean;
  errorCode?: string | null;
}): Promise<void> {
  try {
    await prisma.aiUsageLog.create({
      data: {
        userId: p.userId,
        feature: p.feature,
        model: p.model ?? 'unknown',
        analysisId: p.analysisId ?? undefined,
        promptTokens: p.promptTokens ?? 0,
        completionTokens: p.completionTokens ?? 0,
        latencyMs: p.latencyMs ?? 0,
        success: p.success ?? true,
        errorCode: p.errorCode ?? undefined,
      },
    });
  } catch (e: any) {
    console.error('[aiUsage] falha ao gravar log de uso:', p.feature, (e as Error)?.message);
  }
}
