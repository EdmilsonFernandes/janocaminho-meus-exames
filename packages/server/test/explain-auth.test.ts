import { describe, it, expect, beforeEach } from 'vitest';
import { api, createUser, createDoctor, resetDb } from './helpers';

const authH = (t: string) => ({ Authorization: `Bearer ${t}` });

/** Regressão do bug "token inválido no '?' do portal do médico": POST /items/explain é
 *  dicionário educativo GLOBAL e agora aceita token de PACIENTE **ou** de MÉDICO
 *  (auth leve dual — mesmo princípio do requirePhotoToken). O assert de auth é
 *  status !== 401: sem LLM configurado a explicação pode dar 502, mas NUNCA 401. */
describe('POST /items/explain — auth dual (paciente OU médico)', () => {
  beforeEach(resetDb);

  it('token de MÉDICO passa (bug: antes 401 "token inválido" no portal)', async () => {
    const { token } = await createDoctor({ email: `doc-${Date.now().toString(36)}@exemplo.com`, crm: `${(Date.now() % 100000)}-SP` });
    const r = await api().post('/api/items/explain').set(authH(token)).send({ name: 'Hemoglobina' });
    expect(r.status).not.toBe(401);
    expect([200, 502]).toContain(r.status);
  });

  it('token de PACIENTE continua funcionando (nada quebrou)', async () => {
    const u = await createUser();
    const r = await api().post('/api/items/explain').set(authH(u.token)).send({ name: 'Hemoglobina' });
    expect(r.status).not.toBe(401);
  });

  it('sem token → 401; token lixo → 401', async () => {
    const noTok = await api().post('/api/items/explain').send({ name: 'Hemoglobina' });
    expect(noTok.status).toBe(401);
    const garbage = await api().post('/api/items/explain').set(authH('x/y/z-nao-e-jwt')).send({ name: 'Hemoglobina' });
    expect(garbage.status).toBe(401);
  });

  it('name ausente → 400 (depois de passar no auth)', async () => {
    const u = await createUser();
    const r = await api().post('/api/items/explain').set(authH(u.token)).send({});
    expect(r.status).toBe(400);
  });
});
