export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4001/api';

export const token = () => localStorage.getItem('token');

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

/** URL pública da foto do paciente. `version` busta o cache (ETag) só quando a foto muda. */
export const photoUrlFor = (patientId: string, version?: number | string): string => {
  const base = `${API_URL.replace('/api', '')}/api/patients/${patientId}/photo`;
  return version ? `${base}?v=${version}` : base;
};
