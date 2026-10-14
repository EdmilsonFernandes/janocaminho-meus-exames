/**
 * Dispara o evento global "creditsChanged" — o useCredits (hooks/useCredits.ts, fonte única
 * do saldo: chip do header, drawer, carteira) escuta e revalida /billing/status NA HORA.
 * Ouvintes legados que ainda fazem fetch próprio (Wallet) continuam funcionando pelo evento.
 *
 * PROBLEMA que resolve: o saldo do topo não atualizava quando o usuário consumia créditos
 * (relatório, resumo, plano de ação, chat) — cada componente tinha seu próprio state buscado
 * no mount, sem saber que outro havia gastado. Chamadas de "não consumiu" eram falsas: consumiu,
 * só o chip não sabia.
 *
 * Chamar após QUALQUER operação que mexa em créditos (gasto OU ganho — ex.: compra aprovada).
 */
import { invalidateCredits } from '../hooks/useCredits';

export const bumpCredits = (): void => {
  invalidateCredits(); // cache compartilhado do useCredits refetch imediato (sem esperar TTL 30s)
  try {
    window.dispatchEvent(new Event('creditsChanged'));
  } catch {
    /* sem window (SSR) — ignora */
  }
};

/**
 * Créditos INSUFICIENTES (402 de qualquer feature de IA): dispara o dialog global
 * InsufficientCreditsDialog (montado no AppBar) com a sugestão do pack MAIS BARATO —
 * antes era só um toast estático e o usuário se perdia até achar a tela de planos.
 */
export const CREDITS_INSUFFICIENT_EVENT = 'creditsInsufficient';

export function notifyInsufficientCredits(detail: { cost?: number; message?: string } = {}): void {
  try {
    window.dispatchEvent(new CustomEvent(CREDITS_INSUFFICIENT_EVENT, { detail }));
  } catch { /* sem window — ignora */ }
}
