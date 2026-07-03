/**
 * Dispara o evento global "creditsChanged" — o CreditsChip (header, sempre visível) e outros
 * componentes que mostram saldo escutam esse evento e recarregam (/billing/status).
 *
 * PROBLEMA que resolve: o saldo do topo não atualizava quando o usuário consumia créditos
 * (relatório, resumo, plano de ação, chat) — cada componente tinha seu próprio state buscado
 * no mount, sem saber que outro havia gastado. Chamadas de "não consumiu" eram falsas: consumiu,
 * só o chip não sabia.
 *
 * Chamar após QUALQUER operação que gasta créditos (sucesso do POST).
 */
export const bumpCredits = (): void => {
  try {
    window.dispatchEvent(new Event('creditsChanged'));
  } catch {
    /* sem window (SSR) — ignora */
  }
};
