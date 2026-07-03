// DTOs de análise/itens — shapes de RESPOSTA de endpoints do server.
// Fontes (rotas do server):
//  - AbnormalItem      : GET /items/abnormal          → { items: AbnormalItem[] }
//  - EvolutionItem     : GET /items/evolution         → { items: EvolutionItem[] }
//  - TimeSeriesByName  : GET /items/timeseries        → TimeSeriesByName
//  - SourceExam        : GET /analyses/consolidated/latest → { sourceExams: SourceExam[] }
//
// Nota: `flag`/`kind` como string (não enum) — o Prisma armazena como string e o
// server retorna assim; casar exatamente com o runtime. Endurecer p/ ItemFlag/ExamKind
// num nível futuro quando o server validar a resposta.

import { z } from 'zod';

export const AbnormalItemSchema = z.object({
  id: z.string(),
  examId: z.string(),
  examTitle: z.string(),
  performedAt: z.string().nullable(),
  requestingDoctor: z.string().nullable(),
  name: z.string(),
  nameCanonical: z.string(),
  valueText: z.string(),
  valueNumeric: z.number().nullable(),
  unit: z.string().nullable(),
  flag: z.string().nullable(),
  refText: z.string().nullable(),
  refLow: z.number().nullable(),
  refHigh: z.number().nullable(),
});
export type AbnormalItem = z.infer<typeof AbnormalItemSchema>;

const EvoPointSchema = z.object({
  value: z.number(),
  date: z.string().nullable(),
  flag: z.string(),
  examId: z.string(),
  examTitle: z.string(),
});

export const EvolutionItemSchema = z.object({
  nameCanonical: z.string(),
  unit: z.string().nullable(),
  refLow: z.number().nullable(),
  refHigh: z.number().nullable(),
  firstValue: z.number(),
  lastValue: z.number(),
  firstDate: z.string().nullable(),
  lastDate: z.string().nullable(),
  pctChange: z.number(),
  direction: z.enum(['up', 'down', 'stable']),
  predictMonths: z.number().nullable(),
  inRange: z.boolean(),
  abnormal: z.boolean(),
  count: z.number(),
  points: z.array(EvoPointSchema),
});
export type EvolutionItem = z.infer<typeof EvolutionItemSchema>;

const TSPointSchema = z.object({
  performedAt: z.string().nullable(),
  valueNumeric: z.number(),
  flag: z.string(),
  title: z.string(),
});

export const TimeSeriesByNameSchema = z.object({
  nameCanonical: z.string(),
  unit: z.string().nullable(),
  refLow: z.number().nullable(),
  refHigh: z.number().nullable(),
  points: z.array(TSPointSchema),
});
export type TimeSeriesByName = z.infer<typeof TimeSeriesByNameSchema>;

export const SourceExamSchema = z.object({
  id: z.string(),
  title: z.string(),
  performedAt: z.string().nullable(),
  sourceLab: z.string().nullable(),
  kind: z.string(),
});
export type SourceExam = z.infer<typeof SourceExamSchema>;
