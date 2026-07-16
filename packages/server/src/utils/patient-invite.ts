// Funil de aquisição via médico: consumo de convite (ativa o share médico↔paciente).
// Usado no register/login do paciente quando vem de um /convite/:token.
import { prisma } from '../prisma';

export const INVITE_SCOPES_DEFAULT = ['exams', 'evolution', 'alerts', 'summary'];

/**
 * Consome um PatientInvite: ativa (ou reativa) o DoctorShare com os scopes pré-autorizados
 * e marca o convite como aceito (single-use). Idempotente p/ o paciente (re-login não recria).
 * Retorna true se consumiu/ativou, false se token inválido/expirado/já usado.
 */
export async function consumePatientInvite(token: string, userId: string, patientId: string): Promise<boolean> {
  const inv = await prisma.patientInvite.findUnique({ where: { token } });
  if (!inv || inv.status !== 'pending' || (inv.expiresAt && inv.expiresAt < new Date())) return false;
  const doc = await prisma.doctor.findUnique({ where: { id: inv.doctorId }, select: { defaultQuestionLimit: true } });
  const scopes = inv.scopes.length ? inv.scopes : INVITE_SCOPES_DEFAULT;
  await prisma.$transaction([
    prisma.doctorShare.upsert({
      where: { patientId_doctorId: { patientId, doctorId: inv.doctorId } },
      update: { active: true, scopes },
      create: { patientId, doctorId: inv.doctorId, scopes, active: true, openQuestionLimit: doc?.defaultQuestionLimit ?? 5 },
    }),
    prisma.patientInvite.update({ where: { id: inv.id }, data: { status: 'accepted', acceptedAt: new Date(), acceptedUserId: userId } }),
  ]);
  return true;
}
