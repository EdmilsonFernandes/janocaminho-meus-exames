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

/** GET /api/teleconsulta/:id/summary (§3d). */
export interface TeleconsultaSummary {
  /** F4 pós-consulta: data-hora (ISO) de encerramento — null/ausente = consulta ativa.
   *  Com endedAt, a teleconsulta vira área READ-ONLY (nunca reentra na sala). */
  endedAt?: string | null;
  transcript: { at: string | null } | null;
  examRequests: ExamRequest[];
  feedback: { rating: number; note?: string | null; role?: string | null } | null;
  durationHint: string | null;
}

/** Exame já extraído do paciente — opção do compositor de pedidos (§2a). */
export interface DoctorExamOption {
  id: string;
  title: string;
  performedAt?: string | null;
}
