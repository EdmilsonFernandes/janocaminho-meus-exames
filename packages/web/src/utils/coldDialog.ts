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
