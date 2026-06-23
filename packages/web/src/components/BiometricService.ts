/* "Biometria" / quick-login: guarda o token após login, e na próxima vez
 * o usuário entra sem senha (o aparelho já tem trava de tela/digital/face do SO).
 * Sem plugin nativo (compatível com Capacitor 7 — não quebra o Docker build). */
import { Capacitor } from '@capacitor/core';

const ENROLL_TOKEN = 'bio_token';
const ENROLL_ROLE = 'bio_role'; // 'patient' | 'doctor'

export const BiometricService = {
  // No nativo mostra o botão; no web esconde (web usa senha/OTP).
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

  /** Recupera o token guardado (login sem senha). No aparelho com trava de tela,
   *  o SO já protege o acesso — o token fica disponível só depois do desbloqueio. */
  loginWithBiometric: async (): Promise<{ token: string; isDoctor: boolean } | null> => {
    const token = localStorage.getItem(ENROLL_TOKEN);
    const role = localStorage.getItem(ENROLL_ROLE);
    if (token) return { token, isDoctor: role === 'doctor' };
    return null;
  },
};
