import { prisma } from '../prisma';
import { getSettings } from './settings';

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
    // Custo em R$ por chamada: tokens × preço/1M (settings.aiPricing, editável no admin;
    // default = tabela GLM-4.6 da Z.ai convertida p/ BRL). Antes ficava 0.00 em 100% dos logs
    // e o admin não sabia a margem real de cada feature.
    const pricing = (getSettings() as any)?.aiPricing ?? {};
    const inPer1M = Number(pricing.inputPer1MBrl) > 0 ? Number(pricing.inputPer1MBrl) : 3.3;
    const outPer1M = Number(pricing.outputPer1MBrl) > 0 ? Number(pricing.outputPer1MBrl) : 12;
    const costBrl = ((p.promptTokens ?? 0) * inPer1M + (p.completionTokens ?? 0) * outPer1M) / 1_000_000;
    await prisma.aiUsageLog.create({
      data: {
        costBrl,
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
