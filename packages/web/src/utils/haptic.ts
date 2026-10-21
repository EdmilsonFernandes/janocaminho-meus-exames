/** Haptics (vibração tátil) — navigator.vibrate funciona em Android / Chrome (APK e Android web);
 *  no iOS Safari e desktop é no-op (não quebra, só não vibra). Sem plugin Capacitor → zero dependência.
 *  Use em toques principais (bottom nav, salvar, enviar, toggle) pra dar o "feel de app nativo". */
export function haptic(pattern: number | number[] = 12): void {
  try {
    const n = navigator as any;
    if (typeof n !== 'undefined' && typeof n.vibrate === 'function') n.vibrate(pattern);
  } catch { /* no-op — ambiente sem suporte */ }
}

/** Toque leve (navegação, taps comuns). */
export const hapticLight = (): void => haptic(10);
/** Toque médio (abrir menu, toggle, aviso). */
export const hapticMedium = (): void => haptic(20);
/** Navegação (trocar tab/screen) — 5ms, quase subliminar. */
export const hapticNav = (): void => haptic(5);
/** Sucesso (salvou/enviou/enviar confirmado) — tique único de 10ms. */
export const hapticSuccess = (): void => haptic(10);
/** Erro (falha de API/submit) — triplo 50/50/50, inconfundível. */
export const hapticError = (): void => haptic([50, 50, 50]);
