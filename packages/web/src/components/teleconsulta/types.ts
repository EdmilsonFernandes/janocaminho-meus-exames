// Tipos compartilhados da área de teleconsulta (F3) — contrato do doc
// docs/research/2026-10-20-f3-arquitetura.md (§1 schema, §3 rotas).
// 'declined' (UX doc) é aceito junto de 'denied' (schema) por segurança.

export type TeleconsultaRole = 'patient' | 'doctor';

export type ExamRequestStatus = 'pending' | 'authorized' | 'denied' | 'declined' | 'scheduled';

/** Ações que o PACIENTE pode tomar sobre um pedido pendente (PATCH /api/exam-requests/:id). */
export type ExamRequestAction = 'authorize' | 'deny' | 'schedule';

export interface ExamRequest {
  id: string;
  title: string;
  note?: string | null;
  existingExamId?: string | null;
  status: ExamRequestStatus;
  createdAt: string;
  respondedAt?: string | null;
  /** Presente quando agendado (Reminder criado) — alguns shapes trazem dueDate. */
  scheduledFor?: string | null;
  dueDate?: string | null;
  reminderId?: string | null;
}

/** §14.1 — Revisão registrada no histórico do resumo (ConsultSummary.revisions). */
export interface ConsultSummaryRevision {
  md: string;
  at: string;
  by?: string | null;
  kind: 'generate' | 'draft' | 'approve';
}

/** §14.1 — Resumo pós-consulta revisado pelo médico. O PACIENTE recebe apenas a
 *  versão aprovada (sem draftMd/revisions — o rascunho nunca vaza). */
export interface ConsultSummaryInfo {
  status: 'draft' | 'approved';
  draftMd?: string | null;
  summaryMd?: string | null;
  generatedAt?: string | null;
  approvedAt?: string | null;
  approvedBy?: { name?: string | null } | null;
  version: number;
  revisions?: ConsultSummaryRevision[] | null;
}

/** GET /api/teleconsulta/:id/summary (§3d). */
export interface TeleconsultaSummary {
  /** §14.1: resumo aprovado pelo médico (paciente) / draft+approved+versões (médico). */
  consultSummary?: ConsultSummaryInfo | null;
  /** F3: paciente autorizou gravação p/ transcrição (mesmo shape do Summary local da página). */
  recordConsentAt?: string | null;
  /** F4 pós-consulta: data-hora (ISO) de encerramento — null/ausente = consulta ativa.
   *  Com endedAt, a teleconsulta vira área READ-ONLY (nunca reentra na sala). */
  endedAt?: string | null;
  transcript: { at: string | null } | null;
  /** Bug 26/10: gravação ainda no disco = STT pendente → UI mostra "processando"
   *  animado + poll (antes pendurava "ainda não disponível" pra sempre). */
  recordingAt?: string | null;
  examRequests: ExamRequest[];
  feedback: { rating: number; note?: string | null; role?: string | null; audioQuality?: string | null } | null;
  durationHint: string | null;
  /** Duração real (22/10): 1º join → endedAt (ou 1º→último join quando aberta). */
  durationSec?: number | null;
}

/** Exame já extraído do paciente — opção do compositor de pedidos (§2a). */
export interface DoctorExamOption {
  id: string;
  title: string;
  performedAt?: string | null;
}
