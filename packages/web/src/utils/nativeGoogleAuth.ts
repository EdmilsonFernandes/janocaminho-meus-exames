import { Capacitor } from '@capacitor/core';

/**
 * Login Google NATIVO (apenas no app Capacitor / AAB).
 *
 * Por que existe: o botão `<GoogleLogin>` do `@react-oauth/google` (web) usa o Google Identity
 * Services, que valida `window.location.origin`. No APK a origem do WebView é `https://localhost`,
 * que não é autorizada no Google Cloud Console → `renderButton` vira no-op e o botão some.
 * O plugin nativo `@capgo/capacitor-social-login` usa o seletor de conta do Android (sem origem),
 * devolvendo um idToken JWT idêntico ao do fluxo web — enviado ao mesmo `/auth/google`.
 *
 * Dynamic-import gated por `isNativePlatform()`: o plugin NÃO entra no bundle do browser
 * (padrão de `DoctorPortal.tsx`). `initialize()` é idempotente via flag `inited`.
 */

let inited = false;
const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

/** Devolve o idToken do Google (JWT) ou null em falta/erro. Só roda em plataforma nativa. */
export async function nativeGoogleLogin(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    if (!inited) {
      await SocialLogin.initialize({ google: { webClientId: WEB_CLIENT_ID } });
      inited = true;
    }
    const res = await SocialLogin.login({ provider: 'google', options: {} });
    const result = res?.result;
    // O union é discriminado por responseType; idToken só existe no modo 'online' (default).
    if (result && result.responseType === 'online') {
      const tok = result.idToken;
      return tok && typeof tok === 'string' ? tok : null;
    }
    return null;
  } catch (e) {
    console.warn('nativeGoogleLogin falhou', e);
    return null;
  }
}
