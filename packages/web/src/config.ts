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

/** URL pública estável da foto do paciente (sempre via rota /api/patients/:id/photo). */
export const photoUrlFor = (patientId: string): string =>
  `${API_URL.replace('/api', '')}/api/patients/${patientId}/photo?t=${Date.now()}`;
