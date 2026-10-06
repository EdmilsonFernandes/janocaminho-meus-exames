// E1.3 — API do perfil esportivo (GET/PUT /sports/profile). Flag OFF mantém GET
// respondendo mas BLOQUEIA PUT (kill-switch); isolamento entre usuários (403).
import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createPatient } from './helpers';
import { prisma } from '../src/prisma';
import { loadSettings, saveSettings } from '../src/utils/settings';

describe('sports: perfil esportivo (E1.3)', () => {
  beforeEach(async () => {
    await resetDb();
    await loadSettings(); // cache volta aos defaults (sportsMode OFF)
  });

  it('sem auth → 401 nas duas rotas', async () => {
    expect((await api().get('/api/sports/profile')).status).toBe(401);
    expect((await api().put('/api/sports/profile').send({})).status).toBe(401);
  });

  it('flag OFF (default): GET responde (profile null), PUT bloqueado 403', async () => {
    const { token } = await createUser();
    const g = await api().get('/api/sports/profile').set(authHeader(token));
    expect(g.status).toBe(200);
    expect(g.body.profile).toBeNull();
    expect(g.body.enabled).toBe(false);

    const p = await api().put('/api/sports/profile').set(authHeader(token)).send({ modality: 'musculação' });
    expect(p.status).toBe(403);
    expect(p.body.error).toBe('sports_mode_disabled');
    // nada foi criado
    expect(await prisma.sportsProfile.count()).toBe(0);
  });

  it('flag ON: PUT cria (inicializa vazio) e GET lê de volta', async () => {
    await saveSettings('sportsMode', { enabled: 1 });
    const { user, token } = await createUser();

    // toggle ON no front → PUT inicializando vazio
    const c = await api().put('/api/sports/profile').set(authHeader(token)).send({});
    expect(c.status).toBe(200);
    expect(c.body.profile.modality).toBeNull();

    // preenche o perfil declarado
    const u = await api().put('/api/sports/profile').set(authHeader(token)).send({
      modality: 'Musculação',
      trainingFreq: '5x/semana',
      goals: 'Ganho de força com acompanhamento médico',
      supplements: ['Creatina', 'Whey'],
      collectionContext: { trainedWithin24h: true, fasting: true },
    });
    expect(u.status).toBe(200);
    expect(u.body.profile.modality).toBe('Musculação');
    expect(u.body.profile.supplements).toEqual(['Creatina', 'Whey']);

    const g = await api().get('/api/sports/profile').set(authHeader(token));
    expect(g.status).toBe(200);
    expect(g.body.enabled).toBe(true);
    expect(g.body.profile.modality).toBe('Musculação');
    expect(g.body.profile.patientId).toBeTruthy();
    // aplicado no TITULAR do user
    const titular = await prisma.patient.findFirst({ where: { ownerId: user.id, relationship: 'Titular' }, select: { id: true } });
    expect(g.body.profile.patientId).toBe(titular?.id);

    // PUT parcial preserva o que não veio (merge, não replace)
    const m = await api().put('/api/sports/profile').set(authHeader(token)).send({ modality: 'Corrida' });
    expect(m.status).toBe(200);
    expect(m.body.profile.modality).toBe('Corrida');
    expect(m.body.profile.goals).toBe('Ganho de força com acompanhamento médico');
  });

  it('validação: campos longos → 400; array Jsonb > 20 itens → 400', async () => {
    await saveSettings('sportsMode', { enabled: 1 });
    const { token } = await createUser();
    const long = 'a'.repeat(61);
    expect((await api().put('/api/sports/profile').set(authHeader(token)).send({ modality: long })).status).toBe(400);
    expect((await api().put('/api/sports/profile').set(authHeader(token)).send({ goals: 'g'.repeat(301) })).status).toBe(400);
    const many = Array.from({ length: 21 }, (_, i) => `s${i}`);
    expect((await api().put('/api/sports/profile').set(authHeader(token)).send({ supplements: many })).status).toBe(400);
    expect(await prisma.sportsProfile.count()).toBe(0); // nada criado
  });

  it('isolamento: paciente de outro usuário → 403; cada user só lê o seu', async () => {
    await saveSettings('sportsMode', { enabled: 1 });
    const a = await createUser();
    const b = await createUser();

    // B tenta escrever no paciente TITULAR de A
    const steal = await api().put('/api/sports/profile').set(authHeader(b.token)).send({ patientId: a.patient.id, modality: 'hack' });
    expect(steal.status).toBe(403);
    expect(await prisma.sportsProfile.count({ where: { patientId: a.patient.id } })).toBe(0);

    // A declara; B continua vendo profile null (nunca o de A)
    await api().put('/api/sports/profile').set(authHeader(a.token)).send({ modality: 'Crossfit' });
    const gb = await api().get('/api/sports/profile').set(authHeader(b.token));
    expect(gb.status).toBe(200);
    expect(gb.body.profile).toBeNull();
  });

  it('dependente PRÓPRIO é aceito via patientId (padrão das rotas de exames)', async () => {
    await saveSettings('sportsMode', { enabled: 1 });
    const { user, token } = await createUser();
    const dep = await createPatient(user.id, { relationship: 'Filha' });
    const r = await api().put('/api/sports/profile').set(authHeader(token)).send({ patientId: dep.id, modality: 'Natação' });
    expect(r.status).toBe(200);
    expect(r.body.profile.patientId).toBe(dep.id);
  });

  it('public/config expõe o kill-switch (padrão referral)', async () => {
    const off = await api().get('/api/public/config');
    expect(off.status).toBe(200);
    expect(off.body.sportsMode.enabled).toBe(0);
    await saveSettings('sportsMode', { enabled: 1 });
    const on = await api().get('/api/public/config');
    expect(on.body.sportsMode.enabled).toBe(1);
  });
});
