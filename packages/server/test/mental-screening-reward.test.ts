// Recompensa do rastreamento de saúde mental (05/10): +grants.mentalScreening na 1ª resposta
// de cada instrumento, UMA VEZ NA VIDA por tipo (regra do dono: responder de novo NÃO paga).
// Guarda no ledger: kind='screening' + refId=type.
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { resetDb, createUser, api, authHeader, getUserCredits } from './helpers';

const phq = (v: number) => Array.from({ length: 9 }, () => v);
const gad = (v: number) => Array.from({ length: 7 }, () => v);

describe('POST /api/patients/:id/mental-screenings (recompensa)', () => {
  beforeEach(resetDb);

  it('premia a 1ª resposta de cada instrumento; repetir NÃO paga de novo', async () => {
    const u = await createUser({ credits: 100 });

    // PHQ-9 pela 1ª vez → premia
    const r1 = await api().post(`/api/patients/${u.patient.id}/mental-screenings`).set(authHeader(u.token))
      .send({ type: 'phq9', answers: phq(0) });
    expect(r1.status).toBe(201);
    expect(r1.body.reward).toEqual({ credits: 3 });
    expect(await getUserCredits(u.user.id)).toBe(103);

    // PHQ-9 de novo → registra o rastreio, mas NÃO premia (uma vez na vida)
    const r2 = await api().post(`/api/patients/${u.patient.id}/mental-screenings`).set(authHeader(u.token))
      .send({ type: 'phq9', answers: phq(1) });
    expect(r2.status).toBe(201);
    expect(r2.body.reward).toBeNull();
    expect(await getUserCredits(u.user.id)).toBe(103);

    // GAD-7 é OUTRO instrumento → premia independente
    const r3 = await api().post(`/api/patients/${u.patient.id}/mental-screenings`).set(authHeader(u.token))
      .send({ type: 'gad7', answers: gad(0) });
    expect(r3.status).toBe(201);
    expect(r3.body.reward).toEqual({ credits: 3 });
    expect(await getUserCredits(u.user.id)).toBe(106);

    // Ledger: exatamente 2 premiações (uma por instrumento), kind screening + refId do tipo.
    const txs = await prisma.creditTransaction.findMany({ where: { userId: u.user.id, kind: 'screening' }, orderBy: { createdAt: 'asc' } });
    expect(txs).toHaveLength(2);
    expect(txs.map((t) => t.refId).sort()).toEqual(['gad7', 'phq9']);
    expect(txs.every((t) => t.delta === 3)).toBe(true);
  });

  it('premiação antiga (mesmo de meses atrás) TAMBÉM bloqueia — uma vez na vida', async () => {
    const u = await createUser({ credits: 0 });
    // simula premiação de 90 dias atrás (backfill manual no ledger)
    await prisma.creditTransaction.create({
      data: { userId: u.user.id, delta: 3, kind: 'screening', refId: 'phq9', label: 'Rastreamento de humor (PHQ-9)', createdAt: new Date(Date.now() - 90 * 86400_000) },
    });
    const r = await api().post(`/api/patients/${u.patient.id}/mental-screenings`).set(authHeader(u.token))
      .send({ type: 'phq9', answers: phq(0) });
    expect(r.status).toBe(201);
    expect(r.body.reward).toBeNull();
    expect(await getUserCredits(u.user.id)).toBe(0);
  });
});
