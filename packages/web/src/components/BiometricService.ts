/* Biometria (face/digital) via @capgo/capacitor-native-biometric (nativo Android).
 * No web: não disponível (esconde o botão).
 * Padrão: após login por senha, oferece ativar biometria no aparelho.
 * Próximo login: botão "Entrar com biometria" → prompt de face/digital → auto-login. */
import { Capacitor } from '@capacitor/core';

const ENROLL_TOKEN = 'bio_token';
const ENROLL_ROLE = 'bio_role'; // 'patient' | 'doctor'

export const BiometricService = {
  isSupported: (): boolean => {
    try { return Capacitor.isNativePlatform(); } catch { return false; }
  },

  hasEnrollment: (): boolean => !!localStorage.getItem(ENROLL_TOKEN),

  getEnrolledRole: (): 'patient' | 'doctor' | null => {
    const r = localStorage.getItem(ENROLL_ROLE);
    return r === 'doctor' ? 'doctor' : r === 'patient' ? 'patient' : null;
  },

  enroll: (token: string, isDoctor: boolean) => {
    localStorage.setItem(ENROLL_TOKEN, token);
    localStorage.setItem(ENROLL_ROLE, isDoctor ? 'doctor' : 'patient');
  },

  forget: () => {
    localStorage.removeItem(ENROLL_TOKEN);
    localStorage.removeItem(ENROLL_ROLE);
  },

  /** Mostra o prompt de biometria (face/digital). No sucesso, devolve o token guardado. */
  loginWithBiometric: async (): Promise<{ token: string; isDoctor: boolean } | null> => {
    if (!Capacitor.isNativePlatform()) return null;
    try {
      const mod: any = await import('@capgo/capacitor-native-biometric');
      const bio = mod.NativeBiometric || mod.default;
      await bio.authenticate({ reason: 'Confirme sua identidade para entrar no Meus Exames', title: 'Meus Exames' });
      const token = localStorage.getItem(ENROLL_TOKEN);
      const role = localStorage.getItem(ENROLL_ROLE);
      if (token) return { token, isDoctor: role === 'doctor' };
      return null;
    } catch { return null; }
  },
};
