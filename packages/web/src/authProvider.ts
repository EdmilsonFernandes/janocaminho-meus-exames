import { API_URL } from './config';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export const authProvider = {
  async login({ username, password }: { username: string; password: string }) {
    const r = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!r.ok) throw new Error('Credenciais inválidas');
    const { token, patientId, user } = await r.json();
    localStorage.setItem('token', token);
    // Zera perfil de outra conta (evita vazar paciente de sessão anterior) e fixa o do usuário logado
    localStorage.removeItem('selPatientId');
    if (patientId) { localStorage.setItem('patientId', patientId); localStorage.setItem('selPatientId', patientId); }
    localStorage.setItem('user', JSON.stringify(user));
    window.dispatchEvent(new Event('selPatientChanged'));
  },

  async logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('patientId');
    localStorage.removeItem('selPatientId');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('selPatientChanged'));
  },

  async checkAuth() {
    // Sem token: redireciona pro login. Mensagem vazia = não mostra notificação técnica assustadora.
    if (!localStorage.getItem('token')) throw new Error('');
  },

  async checkError(error: any) {
    const status = error?.status ?? error?.message?.status;
    if (status === 401 || status === 403) {
      localStorage.removeItem('token');
      // Sessão expirada: mensagem amigável em PT (não o cru "session-expired").
      throw new Error('Sua sessão expirou. Faça login novamente.');
    }
  },

  async getIdentity() {
    const raw = localStorage.getItem('user');
    if (!raw) throw new Error('no-identity');
    const user: User = JSON.parse(raw);
    return { id: user.id, fullName: user.name };
  },

  async getPermissions() {
    return null;
  },
};
