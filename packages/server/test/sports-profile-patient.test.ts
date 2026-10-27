// GET /sports/profile POR PACIENTE (?patientId=). Regressão do bug 27/10/26: o GET lia
// sempre o TITULAR, então a lente esportiva dele aparecia no painel de qualquer
// dependente (inclusive criança). Isolamento entre usuários continua 403.
import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createPatient } from './helpers';
import { loadSettings, saveSettings } from '../src/utils/settings';

describe('sports: GET /sports/profile por paciente selecionado', () => {
  beforeEach(async () => {
    await resetDb();
    await loadSettings();
    await saveSettings('sportsMode', { enabled: 1 });
  });

  it('dependente sem perfil NÃO herda a lente ativa do titular', async () => {
    const { user, token, patient } = await createUser();
    const filho = await createPatient(user.id, { relationship: 'Filho' });
    await api().put('/api/sports/profile').set(authHeader(token)).send({ modality: 'Musculação', active: true });

    const tit = await api().get(`/api/sports/profile?patientId=${patient.id}`).set(authHeader(token));
    expect(tit.status).toBe(200);
    expect(tit.body.profile.active).toBe(true);

    const dep = await api().get(`/api/sports/profile?patientId=${filho.id}`).set(authHeader(token));
    expect(dep.status).toBe(200);
    expect(dep.body.profile).toBeNull(); // antes: devolvia o perfil ATIVO do titular
  });

  it('dependente com perfil próprio lê o DELE', async () => {
    const { user, token } = await createUser();
    const filha = await createPatient(user.id, { relationship: 'Filha' });
    await api().put('/api/sports/profile').set(authHeader(token)).send({ modality: 'Musculação', active: true });
    await api().put('/api/sports/profile').set(authHeader(token)).send({ patientId: filha.id, modality: 'Natação', active: false });

    const r = await api().get(`/api/sports/profile?patientId=${filha.id}`).set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.profile.patientId).toBe(filha.id);
    expect(r.body.profile.modality).toBe('Natação');
    expect(r.body.profile.active).toBe(false);
  });

  it('sem patientId continua devolvendo o titular (compat de APK antigo)', async () => {
    const { token, patient } = await createUser();
    await api().put('/api/sports/profile').set(authHeader(token)).send({ modality: 'Corrida' });
    const r = await api().get('/api/sports/profile').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.profile.patientId).toBe(patient.id);
  });

  it('paciente de outro usuário → 403 e nada vaza', async () => {
    const a = await createUser();
    const b = await createUser();
    await api().put('/api/sports/profile').set(authHeader(a.token)).send({ modality: 'Crossfit', active: true });

    const r = await api().get(`/api/sports/profile?patientId=${a.patient.id}`).set(authHeader(b.token));
    expect(r.status).toBe(403);
    expect(r.body.profile).toBeUndefined();
  });

  it('id inexistente → 403 (não revela se existe)', async () => {
    const { token } = await createUser();
    const r = await api().get('/api/sports/profile?patientId=nao-existe').set(authHeader(token));
    expect(r.status).toBe(403);
  });
});
