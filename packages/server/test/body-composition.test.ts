import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, createUser, resetDb } from './helpers';
import { prisma } from '../src/prisma';
import { parseInBodyQr, bodyFatReference, extractIBData } from '../src/bodycomp/inbody-qr';
import { DEMO_SCENARIOS, buildDemoScenario, type DemoScenarioKey } from '../src/bodycomp/demo-scenarios';

// Amostra 100% SINTÉTICA no layout conferido do InBody 270 (pessoa e valores fictícios):
// 175,0 cm · M · 15/01/2026 09:30:00 · peso 76,0 · gordura 16,0 · MLG 60,0 · SMM 34,0 · IMC 24,8 · PGC 21,1.
const MAIN = '17500350M20260115093000011800980120040003380414016000780156044003660448060007600553074915470340105804322024802110510688-0319-0319';
const NEXT = '0000166600900080009020760511552532000000';
const QR = `https://qrcode.inbody.com/?IBData=270-00A000000000FULANO!!!!11999990000!!!${MAIN}!${NEXT}PASS001!!!!0185`;

describe('Leitor do QR InBody', () => {
  it('lê os campos conferidos e as faixas do aparelho', () => {
    const p = parseInBodyQr(QR);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const r = p.reading;
    expect(r.deviceModel).toBe('270');
    expect(r.needsReview).toBe(false);
    expect(r.heightCm).toBe(175);
    expect(r.sex).toBe('M');
    expect(r.measuredAt.toISOString()).toBe('2026-01-15T12:30:00.000Z');
    expect(r.weightKg).toBe(76);
    expect(r.fatMassKg).toBe(16);
    expect(r.bodyFatPct).toBe(21.1);
    expect(r.fatFreeMassKg).toBe(60);
    expect(r.skeletalMuscleKg).toBe(34);
    expect(r.bodyWaterL).toBe(44);
    expect(r.proteinKg).toBe(11.8);
    expect(r.mineralKg).toBe(4);
    expect(r.bmi).toBe(24.8);
    expect(r.bmrKcal).toBe(1666);
    expect(r.waistHipRatio).toBe(0.9);
    expect(r.ranges.weightKg).toEqual([55.3, 74.9]);
    expect(r.ranges.fatMassKg).toEqual([7.8, 15.6]);
  });

  it('PRIVACIDADE: o bruto guardado não carrega ID nem telefone', () => {
    const p = parseInBodyQr(QR);
    if (!p.ok) throw new Error('deveria ler');
    expect(p.reading.raw).not.toContain('FULANO');
    expect(p.reading.raw).not.toContain('11999990000');
    expect(p.reading.raw.startsWith('17500350M')).toBe(true);
  });

  it('aceita "!" codificado como %21 (senão todos os offsets deslocam)', () => {
    const encoded = QR.replace(/!/g, '%21');
    const p = parseInBodyQr(encoded);
    expect(p.ok).toBe(true);
    expect(extractIBData(encoded)).toContain('!');
  });

  it('recusa quando os valores não fecham entre si (nunca grava leitura suspeita)', () => {
    // peso adulterado de 76,0 para 66,0: MLG e IMC deixam de fechar
    const broken = QR.replace('060007600553', '060006600553');
    const p = parseInBodyQr(broken);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.code).toBe('INCONSISTENT');
  });

  it('modelo não conferido entra como "precisa de revisão"', () => {
    const p = parseInBodyQr(QR.replace('IBData=270-', 'IBData=570-'));
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.reading.needsReview).toBe(true);
  });

  it('recusa texto que não é de InBody', () => {
    expect(parseInBodyQr('https://exemplo.com/?x=1').ok).toBe(false);
    expect(parseInBodyQr('').ok).toBe(false);
  });

  it('faixa de % de gordura por sexo e idade; sem dado → sem faixa', () => {
    expect(bodyFatReference('male', 46)).toMatchObject({ low: 11, high: 21.9 });
    expect(bodyFatReference('female', 30)).toMatchObject({ low: 21, high: 32.9 });
    expect(bodyFatReference('male', 15)).toBeNull();
    expect(bodyFatReference(null, 40)).toBeNull();
  });
});

describe('API /body-composition', () => {
  beforeEach(resetDb);

  it('dryRun confere sem gravar; depois grava; releitura não duplica', async () => {
    const u = await createUser();
    const dry = await api().post('/api/body-composition/inbody-qr').set(authHeader(u.token)).send({ payload: QR, dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.preview.weightKg).toBe(76);
    expect(await prisma.bodyComposition.count()).toBe(0);

    const first = await api().post('/api/body-composition/inbody-qr').set(authHeader(u.token)).send({ payload: QR });
    expect(first.status).toBe(201);
    expect(first.body.item.source).toBe('INBODY_QR');
    expect(first.body.item.rawPayload).toBeUndefined(); // bruto nunca volta ao cliente

    const again = await api().post('/api/body-composition/inbody-qr').set(authHeader(u.token)).send({ payload: QR });
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(await prisma.bodyComposition.count()).toBe(1);

    const stored = await prisma.bodyComposition.findFirstOrThrow();
    expect(stored.rawPayload).not.toContain('FULANO');
  });

  it('QR inconsistente responde 422 e não grava', async () => {
    const u = await createUser();
    const r = await api().post('/api/body-composition/inbody-qr').set(authHeader(u.token)).send({ payload: QR.replace('060007600553', '060006600553') });
    expect(r.status).toBe(422);
    expect(await prisma.bodyComposition.count()).toBe(0);
  });

  it('registro manual deriva massa de gordura e valida faixas', async () => {
    const u = await createUser();
    const ok = await api().post('/api/body-composition').set(authHeader(u.token))
      .send({ weightKg: '80,0', bodyFatPct: 25, measuredAt: '2026-11-10', deviceBrand: 'Tanita' });
    expect(ok.status).toBe(201);
    expect(ok.body.item.fatMassKg).toBe(20);
    expect(ok.body.item.fatFreeMassKg).toBe(60);
    expect(ok.body.item.source).toBe('MANUAL');

    const bad = await api().post('/api/body-composition').set(authHeader(u.token)).send({ weightKg: 80, bodyFatPct: 140 });
    expect(bad.status).toBe(400);
    const empty = await api().post('/api/body-composition').set(authHeader(u.token)).send({ weightKg: 80 });
    expect(empty.status).toBe(400);
  });

  it('lista só do próprio usuário e apaga só o que é dele', async () => {
    const a = await createUser();
    const b = await createUser();
    const created = await api().post('/api/body-composition').set(authHeader(a.token)).send({ weightKg: 70, bodyFatPct: 20 });
    const id = created.body.item.id;

    const listB = await api().get('/api/body-composition').set(authHeader(b.token));
    expect(listB.body.items).toHaveLength(0);
    const delB = await api().delete(`/api/body-composition/${id}`).set(authHeader(b.token));
    expect(delB.status).toBe(404);

    const listA = await api().get('/api/body-composition').set(authHeader(a.token));
    expect(listA.body.items).toHaveLength(1);
    const delA = await api().delete(`/api/body-composition/${id}`).set(authHeader(a.token));
    expect(delA.status).toBe(204);
  });

  it('exige autenticação', async () => {
    expect((await api().get('/api/body-composition')).status).toBe(401);
  });
});

// Massa de dados sintética (a mesma do seed de demonstração e dos testes da tela):
// garante que cenários com cara de vida real passam pela API sem perder nem distorcer nada.
describe('Massa de dados sintética — cenários de vida real', () => {
  beforeEach(resetDb);
  const NOW = new Date('2026-11-12T15:00:00Z');
  const KEYS = Object.keys(DEMO_SCENARIOS) as DemoScenarioKey[];

  it.each(KEYS)('cenário "%s": valores fecham entre si e as datas são crescentes', (key) => {
    const rows = buildDemoScenario(key, NOW);
    expect(rows.length).toBeGreaterThan(0);
    expect(buildDemoScenario(key, NOW)).toEqual(rows); // determinístico
    rows.forEach((r, i) => {
      if (i > 0) expect(r.measuredAt.getTime()).toBeGreaterThan(rows[i - 1].measuredAt.getTime());
      expect(r.measuredAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(r.weightKg).toBeGreaterThan(20);
      if (r.fatMassKg != null && r.fatFreeMassKg != null) expect(Math.abs(r.weightKg - r.fatMassKg - r.fatFreeMassKg)).toBeLessThanOrEqual(0.11);
      if (r.fatMassKg != null && r.bodyFatPct != null) expect(Math.abs((r.fatMassKg / r.weightKg) * 100 - r.bodyFatPct)).toBeLessThanOrEqual(0.2);
      if (r.skeletalMuscleKg != null && r.fatFreeMassKg != null) expect(r.skeletalMuscleKg).toBeLessThan(r.fatFreeMassKg);
      if (r.bmi != null && r.heightCm != null) expect(Math.abs(r.bmi - r.weightKg / (r.heightCm / 100) ** 2)).toBeLessThanOrEqual(0.06);
      for (const [lo, hi] of Object.values(r.ranges ?? {})) expect(hi).toBeGreaterThan(lo);
    });
  });

  it.each(KEYS)('cenário "%s": a lista devolve tudo, da mais recente para a mais antiga', async (key) => {
    const u = await createUser({});
    const patient = await prisma.patient.findFirstOrThrow({ where: { ownerId: u.user.id } });
    const rows = buildDemoScenario(key, NOW);
    await prisma.bodyComposition.createMany({ data: rows.map((r) => ({ ...r, ranges: r.ranges ?? undefined, patientId: patient.id })) });
    const res = await api().get('/api/body-composition').set(authHeader(u.token));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(rows.length);
    const times = res.body.items.map((i: any) => new Date(i.measuredAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    const newest = rows[rows.length - 1];
    expect(res.body.items[0].weightKg).toBe(newest.weightKg);
    expect(res.body.items[0].deviceBrand).toBe(newest.deviceBrand);
    expect(res.body.items[0].needsReview).toBe(newest.needsReview);
    expect(res.body.items[0].ranges ?? null).toEqual(newest.ranges);
    expect(res.body.items[0]).not.toHaveProperty('rawPayload');
  });

  it('histórico muito longo é limitado às 200 avaliações mais recentes', async () => {
    const u = await createUser({});
    const patient = await prisma.patient.findFirstOrThrow({ where: { ownerId: u.user.id } });
    const base = buildDemoScenario('unica', NOW)[0];
    const data = Array.from({ length: 230 }, (_, i) => ({ ...base, ranges: base.ranges ?? undefined, patientId: patient.id, measuredAt: new Date(NOW.getTime() - i * 86_400_000) }));
    await prisma.bodyComposition.createMany({ data });
    const res = await api().get('/api/body-composition').set(authHeader(u.token));
    expect(res.body.items).toHaveLength(200);
    expect(new Date(res.body.items[0].measuredAt).getTime()).toBe(NOW.getTime());
  });
});
