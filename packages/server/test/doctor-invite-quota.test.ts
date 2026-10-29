// Revisão final do KYC, 2ª rodada (Important #4): os convites virais ao médico (POST /api/doctor-shares/invite-link) são GRÁTIS e
// ilimitados por paciente, e o cadastro por eles devolve um JWT de médico sem prova de e-mail: um paciente que minta 100 links
// monta 100 contas de médico em um minuto (cota do consultaCRM, sessões UaiID cobradas). Agora: no máximo 20 por 24 h por usuário
// (429 INVITE_LIMIT). O limiter por IP do cadastro por convite está em kyc-abuse-limits.test.ts.
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { api, authHeader, resetDb, createUser } from './helpers';

const HOUR = 3_600_000;
const mint = (token: string) => api().post('/api/doctor-shares/invite-link').set(authHeader(token)).send({});

/** Convite no formato gravado pelo endpoint (AppSetting `doc_invite:*`), com idade e dono escolhidos. */
const seed = (ownerId: string, patientId: string, tag: string, ageH: number, extra: Record<string, unknown> = {}) => {
  const when = new Date(Date.now() - ageH * HOUR);
  return prisma.appSetting.create({
    data: {
      key: `doc_invite:${tag}`,
      value: { token: tag, patientId, ownerId, status: 'pending', createdAt: when.toISOString(), expiresAt: new Date(Date.now() + 29 * 24 * HOUR).toISOString(), scopes: ['exams'], examIds: [], ...extra },
      updatedAt: when, // o pré-filtro indexável (updatedAt) também vê a idade real
    },
  });
};

describe('POST /api/doctor-shares/invite-link — cota de 20 convites por 24 h (B2-4b)', () => {
  beforeEach(async () => { await resetDb(); });

  it('os 20 primeiros → 201; o 21º → 429 INVITE_LIMIT e nenhum convite novo é gravado', async () => {
    const { user, token } = await createUser();
    for (let i = 0; i < 20; i++) expect((await mint(token)).status, `convite ${i + 1}`).toBe(201);
    const r = await mint(token);
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('INVITE_LIMIT');
    expect(typeof r.body.error).toBe('string');
    expect(await prisma.appSetting.count({ where: { key: { startsWith: 'doc_invite:' }, value: { path: ['ownerId'], equals: user.id } } })).toBe(20);
  });

  it('a cota é POR USUÁRIO e só olha as últimas 24 h: convites de outro usuário e convites antigos não contam', async () => {
    const a = await createUser();
    const b = await createUser();
    for (let i = 0; i < 20; i++) await seed(b.user.id, b.patient.id, `outro-${i}`, 1); // 20 de OUTRO usuário
    for (let i = 0; i < 20; i++) await seed(a.user.id, a.patient.id, `velho-${i}`, 25); // 20 do mesmo usuário, mas de 25 h atrás
    expect((await mint(a.token)).status).toBe(201);
    // e um convite "velho" cujo updatedAt é recente (foi aceito/revogado agora) continua sendo velho pelo createdAt gravado
    for (let i = 0; i < 20; i++) await prisma.appSetting.update({ where: { key: `doc_invite:velho-${i}` }, data: { value: { status: 'accepted', patientId: a.patient.id, ownerId: a.user.id, createdAt: new Date(Date.now() - 25 * HOUR).toISOString() } } });
    expect((await mint(a.token)).status).toBe(201);
    expect((await mint(b.token)).status).toBe(429); // o outro usuário, sim, está no teto
  });

  it('aceitar ou revogar um convite NÃO devolve a cota do dia', async () => {
    const { user, token, patient } = await createUser();
    for (let i = 0; i < 19; i++) await seed(user.id, patient.id, `rev-${i}`, 2);
    const ultimo = await mint(token); // 20º do dia
    expect(ultimo.status).toBe(201);
    expect((await api().delete(`/api/doctor-shares/invite-link/${ultimo.body.token}`).set(authHeader(token))).status).toBe(200); // revoga
    await prisma.appSetting.update({ where: { key: 'doc_invite:rev-0' }, data: { value: { status: 'accepted', patientId: patient.id, ownerId: user.id, createdAt: new Date(Date.now() - 2 * HOUR).toISOString() } } });
    const r = await mint(token);
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('INVITE_LIMIT');
  });
});
