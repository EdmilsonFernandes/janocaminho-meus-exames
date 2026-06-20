import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, authHeader, createUser } from './helpers';
import { prisma } from '../src/prisma';

const docH = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Doctor Portal - auth + shares + scoped', () => {
  beforeEach(async () => { await resetDb(); });

  it('doctor register + login + me', async () => {
    const reg = await api().post('/api/doctor/register').send({
      name: 'Dr House', crm: '12345-SP', specialty: 'Diagnostics', email: 'house@test.com', password: 'senha123',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.token).toBeTruthy();
    expect(reg.body.doctor.crm).toBe('12345-SP');

    const login = await api().post('/api/doctor/login').send({ email: 'house@test.com', password: 'senha123' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();

    const me = await api().get('/api/doctor/me').set(docH(login.body.token));
    expect(me.status).toBe(200);
    expect(me.body.doctor.name).toBe('Dr House');

    const bad = await api().post('/api/doctor/login').send({ email: 'house@test.com', password: 'wrong' });
    expect(bad.status).toBe(401);
  });

  it('doctor register rejects dup CRM + short pw', async () => {
    await api().post('/api/doctor/register').send({ name: 'A', crm: 'DUP-SP', specialty: 'X', email: 'a@t.com', password: 'senha123' });
    const dup = await api().post('/api/doctor/register').send({ name: 'B', crm: 'DUP-SP', specialty: 'Y', email: 'b@t.com', password: 'senha123' });
    expect(dup.status).toBe(409);
    const short = await api().post('/api/doctor/register').send({ name: 'C', crm: 'C-SP', specialty: 'Z', email: 'c@t.com', password: '123' });
    expect(short.status).toBe(400);
  });

  it('patient token does NOT work on doctor endpoint (401)', async () => {
    const { token } = await createUser();
    const r = await api().get('/api/doctor/me').set(docH(token));
    expect(r.status).toBe(401);
  });

  it('patient creates share + doctor sees patient + scoped exams', async () => {
    const doc = await api().post('/api/doctor/register').send({ name: 'Dra Alice', crm: '999-SP', specialty: 'Cardio', email: 'alice@t.com', password: 'senha123' });
    const docToken = doc.body.token;

    const { user, token } = await createUser({ email: 'pac@t.com' });
    const patient = await prisma.patient.findFirst({ where: { ownerId: user.id } });
    await prisma.exam.create({ data: { patientId: patient!.id, title: 'Hemograma', kind: 'LAB_PANEL', status: 'EXTRACTED', filePath: 'test.pdf', fileSha256: 'test-sha-' + Date.now(), performedAt: new Date() } });

    const share = await api().post('/api/doctor-shares').set(authHeader(token)).send({
      doctorCrm: '999-SP', scopes: ['exams', 'evolution'], convenio: 'particular', patientId: patient!.id,
    });
    expect(share.status).toBe(201);
    expect(share.body.share.scopes).toContain('exams');

    const list = await api().get('/api/doctor-shares').set(authHeader(token));
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBe(1);
    expect(list.body.items[0].doctor.name).toBe('Dra Alice');

    const patients = await api().get('/api/doctor/patients').set(docH(docToken));
    expect(patients.status).toBe(200);
    expect(patients.body.items.length).toBe(1);

    const exams = await api().get(`/api/doctor/patients/${patient!.id}/exams`).set(docH(docToken));
    expect(exams.status).toBe(200);
    expect(exams.body.items.length).toBe(1);
    expect(exams.body.items[0].title).toBe('Hemograma');
  });

  it('patient revokes share -> doctor loses access', async () => {
    const doc = await api().post('/api/doctor/register').send({ name: 'Dr B', crm: 'B-SP', specialty: 'X', email: 'b@t.com', password: 'senha123' });
    const { user, token } = await createUser({ email: 'pac2@t.com' });
    const patient = await prisma.patient.findFirst({ where: { ownerId: user.id } });

    const share = await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: 'B-SP', scopes: ['exams'] });
    expect(share.status).toBe(201);

    const rev = await api().patch(`/api/doctor-shares/${share.body.share.id}`).set(authHeader(token)).send({ active: false });
    expect(rev.status).toBe(200);
    expect(rev.body.share.active).toBe(false);

    const patients = await api().get('/api/doctor/patients').set(docH(doc.body.token));
    expect(patients.body.items.length).toBe(0);
  });

  it('doctor without evolution scope gets 403', async () => {
    const doc = await api().post('/api/doctor/register').send({ name: 'Dr C', crm: 'C-SP', specialty: 'X', email: 'c@t.com', password: 'senha123' });
    const { user, token } = await createUser({ email: 'pac3@t.com' });
    const patient = await prisma.patient.findFirst({ where: { ownerId: user.id } });

    await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: 'C-SP', scopes: ['exams'] });

    const exams = await api().get(`/api/doctor/patients/${patient!.id}/exams`).set(docH(doc.body.token));
    expect(exams.status).toBe(200);

    const evo = await api().get(`/api/doctor/patients/${patient!.id}/evolution`).set(docH(doc.body.token));
    expect(evo.status).toBe(403);
  });

  it('patient creates share with new doctor (name + CRM)', async () => {
    const { token } = await createUser({ email: 'pac4@t.com' });
    const share = await api().post('/api/doctor-shares').set(authHeader(token)).send({
      doctorName: 'Dr Novo', doctorCrm: 'NEW-SP', doctorSpecialty: 'Ortopedia', scopes: ['exams'],
    });
    expect(share.status).toBe(201);
    expect(share.body.doctor.name).toBe('Dr Novo');
    expect(share.body.doctor.crm).toBe('NEW-SP');
  });

  it('patient reactivates revoked share (upsert)', async () => {
    const doc = await api().post('/api/doctor/register').send({ name: 'Dr D', crm: 'D-SP', specialty: 'X', email: 'd@t.com', password: 'senha123' });
    const { token } = await createUser({ email: 'pac5@t.com' });

    const s1 = await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: 'D-SP', scopes: ['exams'] });
    await api().patch(`/api/doctor-shares/${s1.body.share.id}`).set(authHeader(token)).send({ active: false });

    const s2 = await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: 'D-SP', scopes: ['exams', 'evolution'] });
    expect(s2.status).toBe(200);
    expect(s2.body.share.active).toBe(true);
    expect(s2.body.share.scopes).toContain('evolution');
  });
});
