/**
 * Status do membro no Centro de Cuidados da Família.
 *
 * Falsa calma (bug 27/10/26): `abnormalCount === 0` também vale para quem NUNCA enviou
 * exame — o card dizia "✓ Todos os marcadores na meta" para perfis "Aguardando exames".
 * Sem exame não existe "na meta": é "sem exame".
 */
export type FamilyMemberStatus = 'sem-exame' | 'na-meta' | 'atencao';

export const familyMemberStatus = (p: {
  abnormalCount: number;
  score: number | null;
  examTitle: string | null;
  performedAt: string | null;
}): FamilyMemberStatus => {
  if (p.abnormalCount > 0) return 'atencao';
  const hasExam = p.score != null || !!p.examTitle || !!p.performedAt;
  return hasExam ? 'na-meta' : 'sem-exame';
};
