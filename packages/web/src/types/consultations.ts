// Tipos da área "Meus médicos / Minhas consultas / Encontrar especialistas" (28/10/26).
// Espelham o contrato das rotas /api/my-doctors, /api/my-consultations e /api/specialists.

export type ShareState = 'active' | 'expired' | 'revoked';
export type ConsultationStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export interface MyDoctorItem {
  id: string | null; // null = share órfão legado (sem vínculo)
  patientId: string;
  source: string;
  sourceInfo?: unknown;
  patientNotes: string | null;
  createdAt: string;
  linked: boolean;
  doctor: {
    id: string; name: string; crm: string; crmUf?: string | null; specialty?: string | null;
    photoUrl?: string | null; phone?: string | null; clinicName?: string | null;
    clinicCity?: string | null; bio?: string | null; consultPriceCents?: number | null;
    blocked?: boolean; claimed?: boolean;
  };
  share: null | {
    id: string; scopes: string[]; examIds: string[]; convenio: string | null;
    expiresAt: string | null; revokedAt: string | null; state: ShareState;
  };
  consultationCount: number;
  insurances: { operator: string; plan?: string | null; verificationStatus: string }[];
}

export interface PatientConsultationItem {
  id: string;
  patientId: string;
  doctorId: string | null;
  doctorName: string;
  specialty: string | null;
  scheduledAt: string;
  timezone: string;
  mode: 'presencial' | 'teleconsulta' | string;
  placeName: string | null;
  address: string | null;
  linkUrl: string | null;
  paymentType: 'particular' | 'convenio' | string;
  insuranceOperator: string | null;
  insurancePlan: string | null;
  priceCents: number | null;
  reason: string | null;
  privateNotes: string | null;
  status: ConsultationStatus | string;
  examIds: string[];
  reminderId: string | null;
  createdAt: string;
  doctor?: { id: string; name: string; crm: string; specialty?: string | null; photoUrl?: string | null } | null;
}

export interface SpecialistItem {
  id: string;
  name: string;
  crm: string;
  crmUf?: string | null;
  specialty?: string | null;
  photoUrl?: string | null;
  phone?: string | null;
  clinicName?: string | null;
  clinicCity?: string | null;
  bio?: string | null;
  consultPriceCents?: number | null;
  claimed: boolean;
  provenance: { source: string; label: string; updatedAt: string };
  insurances: { operator: string; plan?: string | null; verificationStatus: string; verificationLabel: string; verifiedAt?: string | null }[];
}

export const CONSULTATION_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Agendada', color: '#0f766e', bg: 'rgba(32,178,170,0.12)' },
  completed: { label: 'Realizada', color: '#065f46', bg: 'rgba(16,185,129,0.12)' },
  cancelled: { label: 'Cancelada', color: '#9a3412', bg: 'rgba(249,115,22,0.12)' },
  no_show: { label: 'Não compareci', color: '#7c2d12', bg: 'rgba(234,88,12,0.10)' },
};
