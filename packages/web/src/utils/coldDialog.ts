/**
 * Máx 1 diálogo de cold-load por sessão (P1, bateria design 2026-09-05):
 * WhatsNew + GoalQuiz + NotificationPopup abriam EMPILHADOS no primeiro load
 * (até 3 modais competindo no primeiro segundo do app). Primeiro que reclama
 * abre; os outros esperam a próxima sessão — cada um já persiste o próprio
 * dismiss (localStorage), então nada se perde, só não empilha.
 * sessionStorage = escopo por aba/sessão (aba nova = nova sessão).
 */
export function claimColdDialog(slot: string): boolean {
  try {
    if (sessionStorage.getItem('coldDialogWinner')) return false;
    sessionStorage.setItem('coldDialogWinner', slot);
    return true;
  } catch {
    return true; // storage bloqueado (privado etc.): deixa abrir — não travar feature
  }
}

/**
 * Slot de ENGAJAMENTO por sessão (02/11/26): patrocinador e pesquisa de opinião nunca
 * aparecem na MESMA sessão (padrão inicial do dono). Quem reclama primeiro leva; o outro
 * espera a próxima sessão — ambos persistem a própria frequência no servidor, então nada
 * se perde. Independente do claimColdDialog (que serializa os modais de boot).
 */
export function claimEngagementSlot(kind: 'sponsor' | 'survey'): boolean {
  try {
    const cur = sessionStorage.getItem('engagementSlot');
    if (cur && cur !== kind) return false;
    sessionStorage.setItem('engagementSlot', kind);
    return true;
  } catch {
    return true;
  }
}
