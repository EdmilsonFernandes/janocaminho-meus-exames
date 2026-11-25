/**
 * Aviso que NÃO pôde abrir como modal (outra rota, vaga da sessão já usada, app em segundo
 * plano) ou que foi fechado sem resposta. Em vez de sumir ("falsa calma"), vira uma faixa
 * não bloqueante no topo da Home (NotificationBanner) até a pessoa ver ou reconhecer.
 * Só memória de sessão: o "já visto" de verdade continua sendo o do NotificationPopup
 * (lida no servidor / `meDismissedNotif`), que decide de novo no próximo boot.
 */
import { useSyncExternalStore } from 'react';

export interface PendingAlert {
  id: string;
  title: string;
  body: string;
  /** Notificação do tipo "alert" (valor de exame pede atenção) — faixa em tom de aviso. */
  urgent: boolean;
}

let current: PendingAlert | null = null;
const listeners = new Set<() => void>();

export function setPendingAlert(next: PendingAlert | null): void {
  if (current === next) return;
  current = next;
  for (const l of Array.from(listeners)) l();
}

export function getPendingAlert(): PendingAlert | null {
  return current;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export function usePendingAlert(): PendingAlert | null {
  return useSyncExternalStore(subscribe, getPendingAlert, () => null);
}
