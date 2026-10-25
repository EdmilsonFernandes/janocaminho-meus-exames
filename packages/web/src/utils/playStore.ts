import { Capacitor } from '@capacitor/core';

export const PLAY_STORE_PACKAGE = 'com.janocaminho.drexame';
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.janocaminho.drexame&hl=pt_BR';

/** Verifica se está rodando em um navegador Android (não no app nativo Capacitor) */
export const isAndroidBrowser = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return false;
  return /android/i.test(navigator.userAgent);
};

/** Verifica se está rodando em navegador mobile (Android ou iOS) fora do app nativo */
export const isMobileBrowser = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
};

/** Verifica se o PWA está instalado e rodando em modo standalone */
export const isInstalledPwa = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as unknown as { standalone?: boolean }).standalone)
  );
};

/**
 * Gera a URL com o protocolo Android Intent.
 * - Se o app Dr. Exame já estiver instalado: o Android abre o app nativo direto.
 * - Se o app NÃO estiver instalado: o Android abre a página oficial na Google Play Store.
 */
export const getAndroidIntentUrl = (path: string = ''): string => {
  const cleanPath = path ? path.replace(/^#\/?/, '').replace(/^\//, '') : '';
  const fallbackUrl = encodeURIComponent(PLAY_STORE_URL);
  // Intent format aceito nativamente pelo Chrome e navegadores no Android
  return `intent://drexame.janocaminho.com.br/#/${cleanPath}#Intent;scheme=https;package=${PLAY_STORE_PACKAGE};S.browser_fallback_url=${fallbackUrl};end;`;
};

/**
 * Dispara a abertura do aplicativo nativo ou o redirecionamento para a Google Play Store.
 */
export const openAppOrPlayStore = (path: string = ''): void => {
  if (typeof window === 'undefined') return;

  if (isAndroidBrowser()) {
    const intentUrl = getAndroidIntentUrl(path);
    window.location.href = intentUrl;
  } else {
    // Para outros dispositivos, abre a Google Play Store oficial
    window.open(PLAY_STORE_URL, '_blank', 'noopener,noreferrer');
  }
};
