// §6 (28/10/26 — "Meus médicos / Minhas consultas"): estado EFETIVO de um DoctorShare
// considerando expiração. Usado nas LISTAS (paciente vê ativo/expirado/revogado).
// Os GATES de acesso do portal (doctor.routes, doctor-question, consult-summary,
// share-notify) embutem a cláusula direto no Prisma `where`:
//   active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
// (colisão de nomes com DoctorQuestion.expiresAt é inexistente — cada rota consulta
// seu model; a cláusula só foi adicionada em queries de doctorShare).
export type ShareState = 'active' | 'expired' | 'revoked';

export function shareState(
  share: { active: boolean; expiresAt: Date | null },
  now: Date = new Date(),
): ShareState {
  if (!share.active) return 'revoked';
  if (share.expiresAt && share.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}
