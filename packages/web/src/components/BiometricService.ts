/* Biometria nativa (face/digital) via bridge customizado window.DxBiometrics.
 * Padrão EdEspeto: BiometricPrompt + EncryptedSharedPreferences (Keystore) + event dispatch.
 * No web: não disponível (esconde o botão). */
import { Capacitor } from '@capacitor/core';

const BIO_EVENT = 'dx:biometric-result';

// Acesso ao bridge nativo (injetado pelo MainActivity.java no WebView)
const bio = (): any => {
  try { return (typeof window !== 'undefined') ? (window as any).DxBiometrics : undefined; }
  catch { return undefined; }
};

export const BiometricService = {
  isSupported: (): boolean => {
    try { return Capacitor.isNativePlatform() && !!bio()?.isBiometricAvailable?.(); }
    catch { return false; }
  },

  hasEnrollment: (): boolean => {
    const b = bio();
    return !!(b?.hasToken?.('patient') || b?.hasToken?.('doctor'));
  },

  getEnrolledRole: (): 'patient' | 'doctor' | null => {
    const b = bio();
    if (!b) return null;
    if (b.hasToken?.('doctor')) return 'doctor';
    if (b.hasToken?.('patient')) return 'patient';
    return null;
  },

  enroll: (token: string, isDoctor: boolean) => {
    const role = isDoctor ? 'doctor' : 'patient';
    bio()?.saveToken?.(role, token);
    // limpa keys antigas do localStorage (migração do quick-login)
    try { localStorage.removeItem('bio_token'); localStorage.removeItem('bio_role'); } catch {}
  },

  forget: () => {
    const b = bio();
    b?.clearToken?.('patient');
    b?.clearToken?.('doctor');
  },

  /** Mostra o prompt nativo de biometria (face/digital). No sucesso, devolve o token do Keystore. */
  loginWithBiometric: async (): Promise<{ token: string; isDoctor: boolean } | null> => {
    const b = bio();
    if (!b || !b.isBiometricAvailable?.()) return null;
    const role = BiometricService.getEnrolledRole();
    if (!role) return null;

    return new Promise((resolve) => {
      const requestId = Math.random().toString(36).slice(2);
      const handler = (e: any) => {
        const d = e.detail;
        if (!d || d.requestId !== requestId) return;
        window.removeEventListener(BIO_EVENT, handler);
        if (d.success) {
          const token = b.getToken?.(role);
          resolve(token ? { token, isDoctor: role === 'doctor' } : null);
        } else { resolve(null); }
      };
      window.addEventListener(BIO_EVENT, handler);
      b.authenticate?.(requestId, 'Meus Exames', 'Confirme sua identidade para entrar');
    });
  },

  /** Só pede a biometria pra CONFIRMAR identidade (porta de segurança do app) — não devolve token.
   * Usado pelo BiometricGate na abertura/retorno do app. */
  verify: (title = 'Meus Exames', subtitle = 'Confirme sua identidade para continuar'): Promise<boolean> => {
    const b = bio();
    if (!b || !b.isBiometricAvailable?.()) return Promise.resolve(false);
    return new Promise((resolve) => {
      const requestId = Math.random().toString(36).slice(2);
      const handler = (e: any) => {
        const d = e.detail;
        if (!d || d.requestId !== requestId) return;
        window.removeEventListener(BIO_EVENT, handler);
        resolve(!!d.success);
      };
      window.addEventListener(BIO_EVENT, handler);
      b.authenticate?.(requestId, title, subtitle);
    });
  },
};
