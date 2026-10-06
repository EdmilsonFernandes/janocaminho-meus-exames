// E5 — Portal médico esportivo: escopo opcional 'sports' + leitura do contexto.
// E5.1: 'sports' é um escopo PAGO opcional (settings shares.sports) — sem ele, NADA esportivo
// é servido ao médico (gate no endpoint sports-context, espelhando o gate de abas do portal).
import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createDoctor } from './helpers';
import { prisma } from '../src/prisma';
import { getSettings } from '../src/utils/settings';

describe('E5.1 — escopo opcional sports (custo parametrizado)', () => {
  beforeEach(async () => { await resetDb(); });

  it('default do settings inclui shares.sports = 3 (editável no admin, sem deploy)', () => {
    expect((getSettings().shares as Record<string, number>).sports).toBe(3);
  });

  it('criar share com escopo sports cobra a parte esportiva (3) junto com exams (5)', async () => {
    const doc = await createDoctorLite();
    const a = await createUser({ credits: 100 });
    const c = await api().post('/api/doctor-shares').set(authHeader(a.token))
      .send({ doctorName: 'Dra. Ana', doctorCrm: doc.crm, doctorUf: 'SP', scopes: ['exams', 'sports'] });
    expect(c.status).toBe(201);
    expect(c.body.chargedCredits).toBe(8); // exams 5 + sports 3
    expect(c.body.share.scopes).toContain('sports');

    // sem o escopo esportivo o custo volta ao valor de antes (regressão de preço)
    const b = await createUser({ credits: 100 });
    const c2 = await api().post('/api/doctor-shares').set(authHeader(b.token))
      .send({ doctorName: 'Dra. Ana', doctorCrm: doc.crm, doctorUf: 'SP', scopes: ['exams'] });
    expect(c2.status).toBe(201);
    expect(c2.body.chargedCredits).toBe(5);

    const after = await prisma.user.findUnique({ where: { id: a.user.id }, select: { credits: true } });
    expect(after?.credits).toBe(92);
  });

  it('sem créditos p/ a parte esportiva → 402 e share NÃO é criado', async () => {
    const doc = await createDoctorLite();
    const u = await createUser({ credits: 5 }); // dá p/ exams mas não exams+sports
    const r = await api().post('/api/doctor-shares').set(authHeader(u.token))
      .send({ doctorName: 'Dra. Ana', doctorCrm: doc.crm, doctorUf: 'SP', scopes: ['exams', 'sports'] });
    expect(r.status).toBe(402);
    expect(await prisma.doctorShare.count()).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: u.user.id }, select: { credits: true } }).then((x) => x?.credits)).toBe(5);
  });
});

/** Médico pending-invite criado DIRETO no banco (o POST /doctor-shares resolve por CRM). */
async function createDoctorLite(): Promise<{ id: string; crm: string }> {
  const d = await prisma.doctor.create({
    data: { name: 'Dra. Ana Esportiva', crm: '51511-SP', crmUf: 'SP', email: 'sp-lite@t.com', passwordHash: 'x' },
  });
  return { id: d.id, crm: '51511' };
}

describe('E5.2 — GET /:doctorId/sports-context (share com scope sports obrigatório)', () => {
  beforeEach(async () => { await resetDb(); });

  it('sem auth → 401; token de paciente → 401', async () => {
    const doctor = await createDoctor({ crm: '51511-SP', email: 'sp-a@t.com' });
    const { token } = await createUser();
    const url = `/api/doctor/${doctor.doctor.id}/sports-context?patientId=x`;
    expect((await api().get(url)).status).toBe(401);
    expect((await api().get(url).set(authHeader(token))).status).toBe(401);
  });

  it('share SEM scope sports → 403 (gate: nada esportivo vaza); revogado → 403; outro token → 403', async () => {
    const { patient } = await createUser();
    const a = await createDoctor({ crm: '51511-SP', email: 'sp-b@t.com' });
    const b = await createDoctor({ crm: '51512-SP', email: 'sp-c@t.com' });
    const base = `/api/doctor/${a.doctor.id}/sports-context?patientId=${patient.id}`;
    await prisma.doctorShare.create({ data: { patientId: patient.id, doctorId: a.doctor.id, scopes: ['exams', 'summary'], active: true } });
    expect((await api().get(base).set(authHeader(a.token))).status).toBe(403);

    await prisma.doctorShare.updateMany({ where: { doctorId: a.doctor.id }, data: { scopes: ['sports'] } });
    expect((await api().get(base).set(authHeader(b.token))).status).toBe(403); // token ≠ médico da URL
    await prisma.doctorShare.updateMany({ where: { doctorId: a.doctor.id }, data: { active: false } });
    expect((await api().get(base).set(authHeader(a.token))).status).toBe(403);
  });

  it('COM scope sports: devolve perfil declarado + substâncias (Medication c/ prefixo) + coleta', async () => {
    const { patient } = await createUser();
    const doctor = await createDoctor({ crm: '51511-SP', email: 'sp-d@t.com' });
    await prisma.doctorShare.create({ data: { patientId: patient.id, doctorId: doctor.doctor.id, scopes: ['exams', 'sports'], active: true } });
    await prisma.sportsProfile.create({
      data: {
        patientId: patient.id, modality: 'musculação', trainingFreq: '5x/semana', goals: 'hipertrofia',
        supplements: ['Creatina', 'Whey'], collectionContext: { treinoAte24h: true, horario: '07:30', jejum: 'sim' },
        declaredSubstances: ['Testosterona (enantato) — TRT prescrito'],
      },
    });
    await prisma.medication.create({
      data: { patientId: patient.id, name: 'Hormônio — Testosterona (TRT)', dosage: 'conforme prescrição', notes: 'uso médico' },
    });
    // remédio comum (sem prefixo esportivo) NÃO entra no contexto esportivo
    await prisma.medication.create({ data: { patientId: patient.id, name: 'Metformina' } });

    const r = await api().get(`/api/doctor/${doctor.doctor.id}/sports-context?patientId=${patient.id}`).set(authHeader(doctor.token));
    expect(r.status).toBe(200);
    expect(r.body.disabledByPatient).toBe(false);
    expect(r.body.profile.modality).toBe('musculação');
    expect(r.body.profile.collectionContext).toMatchObject({ jejum: 'sim' });
    expect(r.body.medications).toHaveLength(1);
    expect(r.body.medications[0].name).toContain('Hormônio');
  });

  it('perfil inexistente → profile null (aba mostra empty state); modo desligado → disabledByPatient', async () => {
    const { patient } = await createUser();
    const doctor = await createDoctor({ crm: '51511-SP', email: 'sp-e@t.com' });
    const base = `/api/doctor/${doctor.doctor.id}/sports-context?patientId=${patient.id}`;
    await prisma.doctorShare.create({ data: { patientId: patient.id, doctorId: doctor.doctor.id, scopes: ['sports'], active: true } });

    const empty = await api().get(base).set(authHeader(doctor.token));
    expect(empty.status).toBe(200);
    expect(empty.body.profile).toBeNull();

    await prisma.sportsProfile.create({ data: { patientId: patient.id, active: false, modality: 'corrida' } });
    const off = await api().get(base).set(authHeader(doctor.token));
    expect(off.status).toBe(200);
    expect(off.body.disabledByPatient).toBe(true);
    expect(off.body.profile).toBeNull();
  });
});
