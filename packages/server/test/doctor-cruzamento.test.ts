import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createDoctor } from './helpers';
import { prisma } from '../src/prisma';

const docH = (t: string) => ({ Authorization: `Bearer ${t}` });

// CRUZAMENTO: paciente compartilha por CRM+UF → médico cadastra (agora valida e-mail) → loga → enxerga o paciente.
// Garante que a chave CRM "numero-UF" é coerente entre share e register (claim do Doctor pendente).
describe('Cruzamento CRM: share → cadastro do médico → vê o paciente', () => {
  beforeEach(async () => { await resetDb(); });

  it('paciente compartilha (CRM+UF); médico cadastra com CRM+UF e HERDA o compartilhamento', async () => {
    // 1) paciente compartilha → Doctor criado pending-invite com crm "116739-SP"
    const { user, token } = await createUser({ email: 'pac@t.com' });
    const patient = await prisma.patient.findFirst({ where: { ownerId: user.id } });
    const share = await api().post('/api/doctor-shares').set(authHeader(token)).send({
      doctorName: 'Dr Compartilhado', doctorCrm: '116739', doctorUf: 'SP', doctorSpecialty: 'Cardiologista', scopes: ['exams'], patientId: patient!.id,
    });
    expect(share.status).toBe(201);
    expect(share.body.doctor.crm).toBe('116739-SP');
    const sharedDoctorId = share.body.doctor.id;

    // 2) médico cadastra (register → valida e-mail → ativa → loga via createDoctor) → CLAIM do mesmo Doctor
    const { doctor, token: docToken } = await createDoctor({ name: 'Dr Compartilhado Real', crm: '116739', crmUf: 'SP', email: 'doc@t.com' });
    expect(doctor.id).toBe(sharedDoctorId); // MESMO doctor (claim) — não um novo
    expect(doctor.crm).toBe('116739-SP');

    // 3) médico vê o paciente que compartilhou (compartilhamento linkado ao doctor claimado)
    const patients = await api().get('/api/doctor/patients').set(docH(docToken));
    expect(patients.status).toBe(200);
    expect(patients.body.items.length).toBe(1);
    expect(patients.body.items[0].patient.id).toBe(patient!.id);
  });

  it('médico cadastra com CRM no formato "99988-RJ" (sem UF separada) também claima o Doctor do share', async () => {
    const { user, token } = await createUser({ email: 'pac2@t.com' });
    const patient = await prisma.patient.findFirst({ where: { ownerId: user.id } });
    const share = await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorName: 'Dr X', doctorCrm: '99988', doctorUf: 'RJ', scopes: ['exams'], patientId: patient!.id });
    expect(share.body.doctor.crm).toBe('99988-RJ');

    // médico digita o CRM já com UF ("99988-RJ"), sem campo UF → normalizeCrmKey mantém "99988-RJ"
    const { doctor } = await createDoctor({ name: 'Dr X Real', crm: '99988-RJ', email: 'doc2@t.com' });
    expect(doctor.id).toBe(share.body.doctor.id); // claim, mesmo id
    expect(doctor.crm).toBe('99988-RJ');
  });

  it('CRM diferente (outra UF) NÃO claima — cria Doctor novo (não cruza por engano)', async () => {
    const { user, token } = await createUser({ email: 'pac3@t.com' });
    const patient = await prisma.patient.findFirst({ where: { ownerId: user.id } });
    await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorName: 'Dr SP', doctorCrm: '4321', doctorUf: 'SP', scopes: ['exams'], patientId: patient!.id });

    // médico com o mesmo número mas outra UF → chaves diferentes → novo Doctor, sem herdar
    const { doctor, token: docToken } = await createDoctor({ name: 'Dr RJ', crm: '4321', crmUf: 'RJ', email: 'doc4@t.com' });
    expect(doctor.crm).toBe('4321-RJ'); // ≠ "4321-SP"
    const patients = await api().get('/api/doctor/patients').set(docH(docToken));
    expect(patients.body.items.length).toBe(0); // não herdou o compartilhamento do SP
  });
});
