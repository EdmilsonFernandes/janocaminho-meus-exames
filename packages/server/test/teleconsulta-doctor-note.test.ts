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

  // CID-10 (P0.3, 24/10): diagnóstico estruturado validado na base oficial DATASUS.
  it('CID-10: salva válido, rejeita inválido, ausente não mexe, "" limpa; médico vê / paciente não', async () => {
    const { token, docToken, r } = await seedTeleconsulta();

    const ok = await api().put(`/api/teleconsulta/${r.id}/doctor-note`).set(H2(docToken)).send({ note: 'DM2 em uso de metformina', cid10Code: 'E11.9' });
    expect(ok.status).toBe(200);
    expect(ok.body.cid10).toMatchObject({ code: 'E11.9' });
    const row = await prisma.reminder.findUnique({ where: { id: r.id }, select: { cid10Code: true, cid10Desc: true } });
    expect(row?.cid10Code).toBe('E11.9');
    expect(row?.cid10Desc).toContain('Diabetes');

    // código inexistente → 400: o autocomplete é a única porta de entrada do dado
    const bad = await api().put(`/api/teleconsulta/${r.id}/doctor-note`).set(H2(docToken)).send({ note: 'x', cid10Code: 'E11.99' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('CID10_INVALID');

    // nota SEM cid10Code no body NÃO apaga o CID salvo (ausente = não mexe)
    const keep = await api().put(`/api/teleconsulta/${r.id}/doctor-note`).set(H2(docToken)).send({ note: 'só nota' });
    expect(keep.status).toBe(200);
    const kept = await prisma.reminder.findUnique({ where: { id: r.id }, select: { cid10Code: true } });
    expect(kept?.cid10Code).toBe('E11.9');

    // '' explícito limpa
    const clr = await api().put(`/api/teleconsulta/${r.id}/doctor-note`).set(H2(docToken)).send({ note: 'x', cid10Code: '' });
    expect(clr.status).toBe(200);
    expect(clr.body.cid10).toBeNull();

    // summary: mesma regra de privacidade do doctorNote (paciente lê o resumo APROVADO)
    await api().put(`/api/teleconsulta/${r.id}/doctor-note`).set(H2(docToken)).send({ note: 'x', cid10Code: 'I10' });
    const sumDoc = await api().get(`/api/teleconsulta/${r.id}/summary`).set(H2(docToken));
    expect(sumDoc.body.cid10?.code).toBe('I10');
    const sumPat = await api().get(`/api/teleconsulta/${r.id}/summary`).set(authHeader(token));
    expect(sumPat.body.cid10).toBeUndefined();
  });

  it('GET /api/doctor/cid10 — autocomplete (base oficial, sem acento)', async () => {
    const { docToken, token } = await seedTeleconsulta();
    const s1 = await api().get('/api/doctor/cid10?q=hipertensao').set(H2(docToken));
    expect(s1.status).toBe(200);
    expect(s1.body.items.some((i: any) => i.c === 'I10')).toBe(true);
    const s2 = await api().get('/api/doctor/cid10?q=e11').set(H2(docToken));
    expect(s2.body.items[0].c).toBe('E11.0');
    // paciente (token user) não usa a referência médica → 401/403
    const denied = await api().get('/api/doctor/cid10?q=diabetes').set(authHeader(token));
    expect([401, 403]).toContain(denied.status);
  });
});
