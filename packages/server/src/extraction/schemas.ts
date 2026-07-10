import { z } from 'zod';

// ===== Painel laboratorial (tabelas de analitos) =====
export const ReferenceSchema = z.object({
  appliesTo: z.string(), // "Homens" | "Mulheres" | "Crianças" | "Acima de 70 anos" | "Adultos"
  lowText: z.string().nullable().optional(),
  highText: z.string().nullable().optional(),
  lowNumeric: z.number().nullable().optional(),
  highNumeric: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
});

export const ExtractionItemSchema = z.object({
  name: z.string(), // "HEMOGLOBINA" (como aparece)
  valueText: z.string().nullable().optional(), // "17,1 g/dL"
  valueNumeric: z.number().nullable().optional(), // 17.1
  unit: z.string().nullable().optional(), // "g/dL"
  references: z.array(ReferenceSchema).default([]),
  page: z.number().int(), // CITAÇÃO — página-fonte (1-indexed)
});

export const PanelSchema = z.object({
  name: z.string().nullable().optional(),
  material: z.string().nullable().optional(),
  items: z.array(ExtractionItemSchema),
});

export const LabExtractionSchema = z.object({
  patientName: z.string().nullable().optional(),
  patientCpf: z.string().nullable().optional(),
  examTitle: z.string().nullable().optional(),
  performedAt: z.string().nullable().optional(), // ISO date (coleta)
  sourceLab: z.string().nullable().optional(),
  requestingDoctor: z.string().nullable().optional(),
  panels: z.array(PanelSchema).default([]),
});

export type LabExtraction = z.infer<typeof LabExtractionSchema>;
export type ExtractionItem = z.infer<typeof ExtractionItemSchema>;
export type Panel = z.infer<typeof PanelSchema>;

// ===== Exame de imagem (laudo narrativo) =====
export const ImagingExtractionSchema = z.object({
  patientName: z.string().nullable().optional(),
  patientCpf: z.string().nullable().optional(),
  examTitle: z.string().nullable().optional(),
  performedAt: z.string().nullable().optional(),
  sourceLab: z.string().nullable().optional(),
  findings: z.array(z.object({ text: z.string(), page: z.number().int().optional() })).default([]),
  impression: z.string().nullable().optional(),
  technique: z.string().nullable().optional(),
});

export type ImagingExtraction = z.infer<typeof ImagingExtractionSchema>;

// ===== Resumo de saúde (não-diagnóstico) =====
// Estrutura inspirada no formato que o paciente quer ver: comparativo anterior x atual,
// pontos de atenção contextualizados, coisas boas e uma leitura final direta.
export const HealthSummarySchema = z.object({
  resumoGeral: z.string(),
  comparativo: z
    .array(
      z.object({
        name: z.string(),
        anterior: z.string().nullable().optional(),
        atual: z.string().nullable().optional(),
        leitura: z.string().nullable().optional(),
        entenda: z.string().nullable().optional(),
      }),
    )
    .default([]),
  pontosAtencao: z
    .array(
      z.object({
        titulo: z.string(),
        detalhe: z.string(),
      }),
    )
    .default([]),
  coisasBoas: z.array(z.string()).default([]),
  leituraFinal: z.string(),
  perguntasParaOMedico: z.array(z.string()).default([]),
  // FEATURES PREMIUM
  interacoesMedicamentos: z.array(z.object({
    medicamento: z.string(),
    analito: z.string(),
    observacao: z.string(),
  })).default([]),
  sugestoesNutricao: z.array(z.string()).default([]),
  comparacaoFamiliar: z.string().nullable().optional(),
  metasSaude: z.array(z.object({
    analito: z.string(),
    meta: z.string(),
    prazo: z.string().nullable().optional(),
  })).default([]),
  disclaimer: z.string().default(''),
});

export type HealthSummary = z.infer<typeof HealthSummarySchema>;
