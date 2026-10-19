import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

/**
 * Abre o link da teleconsulta (Google Meet, Teams, WhatsApp, etc.).
 *
 * - No mobile (Capacitor nativo - Android/iOS):
 *   Usa o In-App Browser do Capacitor (`Browser.open`) com toolbarColor `#0f5f5a`.
 *   Dessa forma, a chamada roda em uma Custom Tab protegida com botão "X" de fechar,
 *   sem jogar o usuário para fora do aplicativo e sem perder a sessão ou causar reload ao voltar.
 *
 * - No desktop (navegador web comum):
 *   Abre em janela popup dedicada dimensionada (1100x750) centralizada,
 *   sem poluição de abas ou barras externas, simulando uma experiência de sala de atendimento.
 */
export async function openTelemedicinaRoom(url: string) {
  if (!url) return;

  if (Capacitor.isNativePlatform()) {
    try {
      await Browser.open({
        url,
        windowName: '_blank',
        presentationStyle: 'popover',
        toolbarColor: '#0f5f5a',
      });
      return;
    } catch (err) {
      console.warn('[telemedicina] Falha ao abrir via Capacitor Browser, usando fallback', err);
    }
  }

  // Desktop web / PWA fallback
  try {
    const width = 1100;
    const height = 750;
    const left = Math.max(0, Math.round((window.screen.width - width) / 2));
    const top = Math.max(0, Math.round((window.screen.height - height) / 2));
    const win = window.open(
      url,
      'teleconsulta_dr_exame',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,status=no,toolbar=no,resizable=yes`
    );
    if (!win) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
