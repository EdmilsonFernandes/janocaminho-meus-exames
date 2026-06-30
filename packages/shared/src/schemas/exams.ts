// Contrato de API — FONTE DE VERDADE compartilhada entre server e web.
// Schemas Zod + tipos derivados (z.infer). Drift entre server e web passa a ser
// detectado em tempo de compilação (ambos consomem os mesmos tipos daqui).
//
// Consumo:
//  - web  : importa schemas (valor) + tipos — vite bundleia o Zod.
//  - server: usa `import type` (CommonJS não importa valores do shared em runtime;
//            o shared é TS cru, sem build step). Validação de resposta em runtime
//            no server fica num nível futuro (exige build step no shared).

import { z } from 'zod';

// ── Enums de domínio ──
export const ExamKindSchema = z.enum(['LAB_PANEL', 'IMAGING', 'OTHER']);
export const ExamStatusSchema = z.enum(['UPLOADED', 'EXTRACTING', 'EXTRACTED', 'FAILED']);
export const ItemFlagSchema = z.enum(['NORMAL', 'HIGH', 'LOW', 'ABNORMAL', 'CRITICAL', 'UNKNOWN']);

export type ExamKind = z.infer<typeof ExamKindSchema>;
export type ExamStatus = z.infer<typeof ExamStatusSchema>;
export type ItemFlag = z.infer<typeof ItemFlagSchema>;

// ── DTOs ──
export const ExamSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: ExamKindSchema,
  status: ExamStatusSchema,
  performedAt: z.string().nullable(),
  sourceLab: z.string().nullable(),
  pageCount: z.number(),
  reviewRequired: z.boolean(),
  extractionError: z.string().nullable(),
});
export type ExamSummary = z.infer<typeof ExamSummarySchema>;

export const TimeSeriesPointSchema = z.object({
  examId: z.string(),
  performedAt: z.string().nullable(),
  title: z.string(),
  valueNumeric: z.number(),
  unit: z.string().nullable(),
  flag: ItemFlagSchema,
});
export type TimeSeriesPoint = z.infer<typeof TimeSeriesPointSchema>;
