// E2E (supertest) — QuickNote do médico (23/10): PUT /api/teleconsulta/:id/doctor-note
// + privacidade no /summary (paciente NÃO lê a anotação clínica; médico reabre e vê).
// Fim da era localStorage "só neste aparelho" (P2-reviewer 19/10).
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { api, createUser, createDoctor, resetDb, authHeader } from './helpers';

const H2 = (t: string) => ({ Authorization: `Bearer ${t}` });

async function seedTeleconsulta() {
  const { user, patient, token } = await createUser();
  const crm = '81234-SP';
  const { token: docToken } = await createDoctor({ crm, email: 'notedoc@t.com' });
  await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: crm, scopes: ['exams'], patientId: patient.id });
  const r = await prisma.reminder.create({
    data: { ownerId: user.id, patientId: patient.id, title: 'Tele nota', dueDate: new Date(Date.now() + 3600_000), type: 'teleconsulta', consentAt: new Date(), provider: 'livekit', roomName: 'teleconsulta-note-1' },
    select: { id: true },
  });
  return { user, patient, token, docToken, r };
}

describe('PUT /api/teleconsulta/:id/doctor-note', () => {
  beforeEach(async () => { await resetDb(); });

  it('médico salva → 200; /summary devolve pro MÉDICO e esconde do PACIENTE', async () => {
    const { user, patient, token, docToken, r } = await seedTeleconsulta();
    const put = await api().put(`/api/teleconsulta/${r.id}/doctor-note`).set(H2(docToken)).send({ note: 'Paciente relatou tontura ao levantar. Reavaliar pressão em 7d.' });
    expect(put.status).toBe(200);
    expect(put.body.doctorNote).toContain('tontura');

    const sumDoc = await api().get(`/api/teleconsulta/${r.id}/summary`).set(H2(docToken));
    expect(sumDoc.status).toBe(200);
    expect(sumDoc.body.doctorNote).toContain('tontura');

    const sumPat = await api().get(`/api/teleconsulta/${r.id}/summary`).set(authHeader(token));
    expect(sumPat.status).toBe(200);
    expect(sumPat.body.doctorNote).toBeUndefined(); // privacidade: paciente não lê

    // Sobrescreve (última versão vale)
    const put2 = await api().put(`/api/teleconsulta/${r.id}/doctor-note`).set(H2(docToken)).send({ note: 'Atualizada.' });
    expect(put2.status).toBe(200);
    const row = await prisma.reminder.findUnique({ where: { id: r.id }, select: { doctorNote: true } });
    expect(row?.doctorNote).toBe('Atualizada.');
    expect(user.id).toBeTruthy();
  });

  it('paciente NÃO salva nota → 403; nota vazia limpa (null)', async () => {
    const { token, docToken, r } = await seedTeleconsulta();
    const denied = await api().put(`/api/teleconsulta/${r.id}/doctor-note`).set(authHeader(token)).send({ note: 'nota do paciente' });
    expect(denied.status).toBe(403);
    await api().put(`/api/teleconsulta/${r.id}/doctor-note`).set(H2(docToken)).send({ note: 'x' });
    const cleared = await api().put(`/api/teleconsulta/${r.id}/doctor-note`).set(H2(docToken)).send({ note: '' });
    expect(cleared.status).toBe(200);
    expect(cleared.body.doctorNote).toBeNull();
  });
});
