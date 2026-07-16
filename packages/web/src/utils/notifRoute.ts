// Deep-link de notificação -> tela certa. Retorna null p/ PURAMENTE informativas
// (quem chama deve abrir um popup com o texto maior, em vez de navegar pra lugar nenhum).
//
// Regras (alinhadas ao pedido): resposta de médico -> Perguntas; sobre exame -> Exame/Exames;
// alerta/tendência -> telas correspondentes; link explícito -> segue; senão -> null (popup).
export function notifRoute(n: any): string | null {
  if (!n) return null;
  const d = n.data || {};
  if (d.examId) return `/exams/${d.examId}/show`;
  if (n.type === 'doctor_question' || d.type === 'doctor_question') return '/perguntas';
  if (d.ticketId) return `/suporte/${d.ticketId}`;
  if (d.link) return String(d.link);
  if (n.type === 'alert') return '/alterados';
  if (n.type === 'trend') return '/tendencias';
  if (n.type === 'reminder') return '/lembretes';
  if (n.type === 'plan_expiry') return '/planos';
  if (n.type === 'achievement') return '/conquistas';
  return null;
}
