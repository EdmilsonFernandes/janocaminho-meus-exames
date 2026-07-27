import { Capacitor } from '@capacitor/core';

// No APK (origin capacitor://localhost) uma URL relativa não alcança o backend →
// usa a absoluta do prod. Na web/PWA cai no VITE_API_URL (idêntico a antes).
const NATIVE_API_URL = import.meta.env.VITE_NATIVE_API_URL || 'https://janocaminho.com.br/minhasaude/api';
export const API_URL = Capacitor.isNativePlatform() ? NATIVE_API_URL : (import.meta.env.VITE_API_URL || 'http://localhost:4001/api');

/** Link de telemedicina (preenchido via VITE_TELEMEDICINE_URL). Vazio → botão fica oculto. */
export const TELEMEDICINE_URL = import.meta.env.VITE_TELEMEDICINE_URL || '';

export const token = () => localStorage.getItem('token');

/** Token pra anexar em URLs de IMAGEM (?t=) — aceita paciente ('token') OU médico
 *  ('doctorToken'). O portal do médico guarda o token em 'doctorToken'; sem isto, o avatar
 *  do paciente não carregava pra o médico (photoUrlFor lia só 'token' → vazio → 401 na rota). */
const photoAuthToken = (): string | null => localStorage.getItem('token') || localStorage.getItem('doctorToken');

/** Headers padrão com token + paciente selecionado (garante escopo no servidor). */
export function apiHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  const t = token();
  if (t) h['Authorization'] = `Bearer ${t}`;
  const pid = localStorage.getItem('selPatientId') || localStorage.getItem('patientId');
  if (pid) h['X-Patient-Id'] = pid;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

/** URL da foto do paciente. `version` busta o cache (ETag); `?t=` leva o token (a rota exige
 *  auth agora — fecha o buraco da foto pública por CUID / LGPD facial). */
export const photoUrlFor = (patientId: string, version?: number | string): string => {
  const base = `${API_URL.replace('/api', '')}/api/patients/${patientId}/photo`;
  const t = photoAuthToken();
  const q = new URLSearchParams();
  if (t) q.set('t', t);
  if (version != null && version !== '') q.set('v', String(version));
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
};

/** URL da foto do MÉDICO (mesmo padrão do photoUrlFor: ?t= token pra auth no server). */
export const doctorPhotoUrl = (doctorId: string, version?: number | string): string => {
  const base = `${API_URL.replace('/api', '')}/api/doctor/photo/${doctorId}`;
  const t = photoAuthToken();
  const q = new URLSearchParams();
  if (t) q.set('t', t);
  if (version != null && version !== '') q.set('v', String(version));
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
};
