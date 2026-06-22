import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, authHeader, createUser } from './helpers';
import { prisma } from '../src/prisma';

const docH = (t: string) => ({ Authorization: `Bearer ${t}` });

const setupShare = async (crm: string, docEmail: string, pacEmail: string) => {
  const doc = await api().post('/api/doctor/register').send({ name: 'Dra ' + crm, crm, specialty: 'Clinico Geral', email: docEmail, password: 'senha123' });
  const { user, token } = await createUser({ email: pacEmail });
  const patient = await prisma.patient.findFirst({ where: { ownerId: user.id } });
  await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: crm, scopes: ['exams'] });
  return { docToken: doc.body.token as string, patientId: patient!.id, patientToken: token };
};

describe('Doctor Portal - anotações clínicas (DoctorNote)', () => {
  beforeEach(async () => { await resetDb(); });

  it('cria + lista anotação', async () => {
    const { docToken, patientId } = await setupShare('N1-SP', 'n1@t.com', 'pn1@t.com');
    const create = await api().post(`/api/doctor/patients/${patientId}/notes`).set(docH(docToken)).send({ content: 'Iniciar metformina 500mg. Retorno em 90 dias.' });
    expect(create.status).toBe(201);
    expect(create.body.note.content).toContain('metformina');
    expect(create.body.note.id).toBeTruthy();

    const list = await api().get(`/api/doctor/patients/${patientId}/notes`).set(docH(docToken));
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBe(1);
    expect(list.body.items[0].content).toContain('metformina');
  });

  it('rejeita anotação vazia', async () => {
    const { docToken, patientId } = await setupShare('N2-SP', 'n2@t.com', 'pn2@t.com');
    const r = await api().post(`/api/doctor/patients/${patientId}/notes`).set(docH(docToken)).send({ content: '   ' });
    expect(r.status).toBe(400);
  });

  it('edita + exclui anotação', async () => {
    const { docToken, patientId } = await setupShare('N3-SP', 'n3@t.com', 'pn3@t.com');
    const c = await api().post(`/api/doctor/patients/${patientId}/notes`).set(docH(docToken)).send({ content: 'Original' });
    const id = c.body.note.id;

    const edit = await api().patch(`/api/doctor/notes/${id}`).set(docH(docToken)).send({ content: 'Editado pelo médico' });
    expect(edit.status).toBe(200);
    expect(edit.body.note.content).toBe('Editado pelo médico');

    const del = await api().delete(`/api/doctor/notes/${id}`).set(docH(docToken));
    expect(del.status).toBe(200);

    const list = await api().get(`/api/doctor/patients/${patientId}/notes`).set(docH(docToken));
    expect(list.body.items.length).toBe(0);
  });

  it('médico SEM share (403) não cria/lista anotação', async () => {
    const a = await setupShare('N4-SP', 'n4@t.com', 'pn4@t.com'); // share do médico A
    // médico B sem share nesse paciente
    const b = await api().post('/api/doctor/register').send({ name: 'Dr B', crm: 'B4-SP', specialty: 'X', email: 'b4@t.com', password: 'senha123' });
    const create = await api().post(`/api/doctor/patients/${a.patientId}/notes`).set(docH(b.body.token)).send({ content: 'tentativa' });
    expect(create.status).toBe(403);
    const list = await api().get(`/api/doctor/patients/${a.patientId}/notes`).set(docH(b.body.token));
    expect(list.status).toBe(403);
  });

  it('token de paciente (401) não acessa anotações', async () => {
    const { docToken, patientId, patientToken } = await setupShare('N5-SP', 'n5@t.com', 'pn5@t.com');
    void docToken; void patientId;
    const r = await api().get(`/api/doctor/patients/${patientId}/notes`).set(authHeader(patientToken));
    expect(r.status).toBe(401);
  });

  it('médico A não edita/exclui anotação do médico B', async () => {
    const { docToken: tokenA, patientId } = await setupShare('N6-SP', 'n6@t.com', 'pn6@t.com');
    const c = await api().post(`/api/doctor/patients/${patientId}/notes`).set(docH(tokenA)).send({ content: 'do A' });
    const id = c.body.note.id;
    // médico B compartilha o MESMO paciente (outro share)
    const { docToken: tokenB } = await setupShare('N6B-SP', 'n6b@t.com', 'pn6b@t.com');
    // B tenta editar a nota de A -> 404 (findFirst por doctorId não acha)
    const edit = await api().patch(`/api/doctor/notes/${id}`).set(docH(tokenB)).send({ content: 'hack' });
    expect(edit.status).toBe(404);
    const del = await api().delete(`/api/doctor/notes/${id}`).set(docH(tokenB));
    expect(del.status).toBe(404);
  });
});
