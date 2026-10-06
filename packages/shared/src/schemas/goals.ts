// DTOs de META CLÍNICA (E2 — política das 4 camadas, RELATORIO §4).
// Fontes (rotas do server):
//  - ClinicalGoalView : GET /sports/clinical-goals (PACIENTE LÊ) → { goals: ClinicalGoalView[] }
//    Paciente LÊ, nunca escreve: criação/expiração são exclusivas do portal do médico
//    (POST /doctor/:doctorId/clinical-goals — auth médica + share ativo).
//  - ClinicalGoalDoctor : GET /doctor/:doctorId/clinical-goals (portal médico; shape
//    superset com vigência/histórico — não tipado aqui, resposta do Prisma).

import { z } from 'zod';

export const ClinicalGoalViewSchema = z.object({
  id: z.string(),
  patientId: z.string(),
  analyte: z.string(),
  unit: z.string().nullable(),
  targetLow: z.number().nullable(),
  targetHigh: z.number().nullable(),
  /** Autoria VISÍVEL ao paciente: "Dr. Nome (CRM 12345-SP)". */
  setBy: z.string(),
  justification: z.string(),
  source: z.string().nullable(),
  validFrom: z.string(),
});
export type ClinicalGoalView = z.infer<typeof ClinicalGoalViewSchema>;

/** Sugestão de meta gerada a partir do knowledge (E2.6) — exibida SÓ no portal do médico.
 *  `requiresReview` é sempre true: a IA sugere, o médico decide (nunca cria sozinha). */
export const ClinicalGoalSuggestionSchema = z.object({
  analyte: z.string(),
  unit: z.string().nullable(),
  targetLow: z.number().nullable(),
  targetHigh: z.number().nullable(),
  source: z.string(),
  reason: z.string(),
  requiresReview: z.literal(true),
});
export type ClinicalGoalSuggestion = z.infer<typeof ClinicalGoalSuggestionSchema>;
