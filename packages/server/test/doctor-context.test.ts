import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { api, createUser, createDoctor, resetDb } from './helpers';

const authH = (t: string) => ({ Authorization: `Bearer ${t}` });
// CRM numérico único: o cadastro valida/canoniza "numero-UF" (só dígitos — revisão final do KYC, I7); o sufixo de um id
// base36 trazia letras e virava CRM inválido.
let crmSeq = 46000;
const nextCrm = () => `${crmSeq++}-SP`;

// Brief v2 (24/10): GET /doctor/patients/:id/context — medicações ATIVAS + alergias
// pro brief do médico. Mesmo guard do /vitals (share scope 'exams').
describe('Doctor: contexto clínico (GET /context)', () => {
  beforeEach(async () => { await resetDb(); });

  async function setup(share = true) {
    const { patient } = await createUser();
    const n = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const { doctor, token } = await createDoctor({ email: `doc-${n}@exemplo.com`, crm: nextCrm() });
    if (share) {
      await prisma.doctorShare.create({ data: { doctorId: doctor.id, patientId: patient.id, scopes: ['exams', 'alerts'], active: true } });
    }
    return { patientId: patient.id, token };
  }

  it('retorna medicações ATIVAS (ignora inativa) + alergias do paciente', async () => {
    const { patientId, token } = await setup();
    await prisma.patient.update({ where: { id: patientId }, data: { allergies: 'Penicilina; AAS' } });
    await prisma.medication.create({ data: { patientId, name: 'Levotiroxina', dosage: '50 mcg', frequency: '1× dia', active: true } });
    await prisma.medication.create({ data: { patientId, name: 'Varfarina', active: false } }); // suspensa — não aparece

    const r = await api().get(`/api/doctor/patients/${patientId}/context`).set(authH(token));
    expect(r.status).toBe(200);
    expect(r.body.medications).toHaveLength(1);
    expect(r.body.medications[0]).toMatchObject({ name: 'Levotiroxina', dosage: '50 mcg', frequency: '1× dia' });
    expect(r.body.allergies).toBe('Penicilina; AAS');
    expect(r.body.clinicalProfile === null || typeof r.body.clinicalProfile === 'string').toBe(true);
  });

  it('sem alergias/meds registradas → null/vazio (não é "sem alergias", é não-informado)', async () => {
    const { patientId, token } = await setup();
    const r = await api().get(`/api/doctor/patients/${patientId}/context`).set(authH(token));
    expect(r.status).toBe(200);
    expect(r.body.allergies).toBeNull();
    expect(r.body.medications).toEqual([]);
  });

  it('sem share ativo → 403', async () => {
    const { patientId, token } = await setup(false);
    const r = await api().get(`/api/doctor/patients/${patientId}/context`).set(authH(token));
    expect(r.status).toBe(403);
  });

  it('share sem scope exams → 403', async () => {
    const { patient } = await createUser();
    const n = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const { doctor, token } = await createDoctor({ email: `doc-${n}@exemplo.com`, crm: nextCrm() });
    await prisma.doctorShare.create({ data: { doctorId: doctor.id, patientId: patient.id, scopes: ['summary'], active: true } });
    const r = await api().get(`/api/doctor/patients/${patient.id}/context`).set(authH(token));
    expect(r.status).toBe(403);
  });
});

// Uso relatado (blueprint AAS P0.4): substâncias declaradas no brief — autorrelatado,
// SEMPRE verified:false. Dado sensível (LGPD art.11): nunca logar/exportar.
describe('Doctor context: uso relatado (AAS P0.4)', () => {
  beforeEach(async () => { await resetDb(); });

  async function setup() {
    const { patient } = await createUser();
    const n = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const { doctor, token } = await createDoctor({ email: `doc-${n}@exemplo.com`, crm: nextCrm() });
    await prisma.doctorShare.create({ data: { doctorId: doctor.id, patientId: patient.id, scopes: ['exams'], active: true } });
    return { patientId: patient.id, token };
  }

  it('substância declarada [Hormônio] vira reportedUsage com janelas de uso + verified:false', async () => {
    const { patientId, token } = await setup();
    await prisma.medication.create({ data: {
      patientId,
      name: '[Hormônio] Testosterona (enantato)', dosage: 'relatado',
      startedAt: new Date('2026-06-01T00:00:00Z'), endedAt: new Date('2026-09-15T00:00:00Z'),
      endStatus: 'interrompi', prescriberName: 'Dr. Silva', active: true,
    } });
    await prisma.sportsProfile.create({ data: { patientId, collectionContext: 'coleta 48h após treino, jejum', active: true } as never });

    const r = await api().get(`/api/doctor/patients/${patientId}/context`).set(authH(token));
    expect(r.status).toBe(200);
    const ru = r.body.reportedUsage;
    expect(ru).toBeTruthy();
    expect(ru.verified).toBe(false);
    expect(ru.substances).toHaveLength(1);
    expect(ru.substances[0].name).toBe('Testosterona (enantato)'); // sem o prefixo [Classe]
    expect(ru.substances[0].declaredClass).toBe('Hormônio');
    expect(ru.substances[0].endStatus).toBe('interrompi');
    expect(ru.substances[0].prescriber).toBe('Dr. Silva');
    expect(ru.collectionContext).toBe('coleta 48h após treino, jejum');
  });

  it('medicamento COMUM (sem prefixo [Classe]) NÃO vira uso relatado — declaração explícita só', async () => {
    const { patientId, token } = await setup();
    await prisma.medication.create({ data: { patientId, name: 'Losartana', active: true } });
    const r = await api().get(`/api/doctor/patients/${patientId}/context`).set(authH(token));
    expect(r.status).toBe(200);
    expect(r.body.reportedUsage).toBeUndefined();
    expect(r.body.medications).toHaveLength(1);
  });

  it('sem substâncias E sem collectionContext → sem a chave (brief limpo)', async () => {
    const { patientId, token } = await setup();
    const r = await api().get(`/api/doctor/patients/${patientId}/context`).set(authH(token));
    expect(r.status).toBe(200);
    expect(r.body.reportedUsage).toBeUndefined();
  });
});
