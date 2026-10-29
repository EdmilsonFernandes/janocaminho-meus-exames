// Revisão final do KYC — I8: GET /api/patients/:id/photo só conferia a assinatura do JWT. Qualquer token de médico
// (pendente, recusado, BLOQUEADO por fraude, ou sem nenhum vínculo com o paciente) abria a foto de qualquer
// paciente cujo CUID conhecesse (a resposta do convite devolve o patientId a um médico ainda pendente).
// Token de médico agora passa pelo gate (DOCTOR_ACCESS_SELECT + doctorAccessDenial) E precisa de vínculo com o paciente.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/prisma';
import { config } from '../src/config';
import { resolvePatientPhoto } from '../src/utils/storage';
import { saveSettings } from '../src/utils/settings';
import { api, authHeader, resetDb, createUser, createDoctor } from './helpers';

let seq = 61000;
const crm = () => `${seq++}-SP`;
const FOTO = 'https://cdn.exemplo.com/foto-paciente.jpg';

/** Paciente com foto (o storage de teste é mock: a foto "existe" como redirect 302 p/ FOTO). */
async function userWithPhoto() {
  const u = await createUser();
  await prisma.patient.update({ where: { id: u.patient.id }, data: { photoUrl: 'photos/paciente.jpg' } });
  return u;
}
const viaHeader = (patientId: string, token: string) => api().get(`/api/patients/${patientId}/photo`).set(authHeader(token));
const viaQuery = (patientId: string, token: string) => api().get(`/api/patients/${patientId}/photo`).query({ t: token });
const share = (patientId: string, doctorId: string, extra: Record<string, unknown> = {}) =>
  prisma.doctorShare.create({ data: { patientId, doctorId, scopes: ['exams'], active: true, ...extra } });

describe('foto do paciente — token de médico passa pelo gate e exige vínculo (I8)', () => {
  beforeEach(async () => {
    await resetDb();
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 });
    vi.mocked(resolvePatientPhoto).mockResolvedValue({ kind: 'url', url: FOTO } as any);
  });

  it('sem token → 401; token inválido → 401', async () => {
    const { patient } = await userWithPhoto();
    expect((await api().get(`/api/patients/${patient.id}/photo`)).status).toBe(401);
    expect((await viaQuery(patient.id, 'lixo')).status).toBe(401);
  });

  it('token de PACIENTE: inalterado — qualquer token válido abre (header ou ?t=)', async () => {
    const dono = await userWithPhoto();
    const outro = await createUser();
    for (const r of [await viaHeader(dono.patient.id, dono.token), await viaQuery(dono.patient.id, dono.token), await viaHeader(dono.patient.id, outro.token)]) {
      expect(r.status).toBe(302);
      expect(r.headers.location).toBe(FOTO);
    }
  });

  it.each(['pending', 'in_progress', 'uaiid_review', 'needs_admin', 'rejected'])('médico %s, MESMO com share ativo → 403 VERIFICATION_REQUIRED', async (verificationStatus) => {
    const { patient } = await userWithPhoto();
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus });
    await share(patient.id, doctor.id);
    const r = await viaHeader(patient.id, token);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: 'VERIFICATION_REQUIRED', status: verificationStatus });
    expect((await viaQuery(patient.id, token)).status).toBe(403);
  });

  it('médico BLOQUEADO (mesmo aprovado, com share) → 403 DOCTOR_BLOCKED', async () => {
    const { patient } = await userWithPhoto();
    const { doctor, token } = await createDoctor({ crm: crm() });
    await share(patient.id, doctor.id);
    await prisma.doctor.update({ where: { id: doctor.id }, data: { blocked: true, blockedReason: 'kyc_fraud' } });
    const r = await viaHeader(patient.id, token);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: 'DOCTOR_BLOCKED', blocked: true });
  });

  it('aprovado SEM vínculo com o paciente → 403 NO_SHARE (o CUID sozinho não basta)', async () => {
    const { patient } = await userWithPhoto();
    const { token } = await createDoctor({ crm: crm() });
    const r = await viaHeader(patient.id, token);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('NO_SHARE');
    expect((await viaQuery(patient.id, token)).status).toBe(403);
  });

  it('aprovado com share ATIVO → abre como hoje (header e ?t=); vínculo com OUTRO paciente não vale', async () => {
    const a = await userWithPhoto();
    const b = await userWithPhoto();
    const { doctor, token } = await createDoctor({ crm: crm() });
    await share(a.patient.id, doctor.id);
    for (const r of [await viaHeader(a.patient.id, token), await viaQuery(a.patient.id, token)]) {
      expect(r.status).toBe(302);
      expect(r.headers.location).toBe(FOTO);
    }
    expect((await viaHeader(b.patient.id, token)).body.code).toBe('NO_SHARE');
  });

  it('share REVOGADO ou EXPIRADO não é vínculo', async () => {
    const rev = await userWithPhoto();
    const exp = await userWithPhoto();
    const { doctor, token } = await createDoctor({ crm: crm() });
    await share(rev.patient.id, doctor.id, { active: false, revokedAt: new Date() });
    await share(exp.patient.id, doctor.id, { expiresAt: new Date(Date.now() - 60_000) });
    expect((await viaHeader(rev.patient.id, token)).body.code).toBe('NO_SHARE');
    expect((await viaHeader(exp.patient.id, token)).body.code).toBe('NO_SHARE');
    await prisma.doctorShare.updateMany({ where: { patientId: exp.patient.id }, data: { expiresAt: new Date(Date.now() + 3_600_000) } }); // ainda vale por 1 h
    expect((await viaHeader(exp.patient.id, token)).status).toBe(302);
  });

  it('legado: dentro do prazo + share abre; prazo vencido → 403 VERIFICATION_REQUIRED', async () => {
    const { patient } = await userWithPhoto();
    const { doctor, token } = await createDoctor({ crm: crm(), verificationStatus: 'legacy' });
    await share(patient.id, doctor.id);
    expect((await viaHeader(patient.id, token)).status).toBe(302);
    await saveSettings('doctorKyc', { legacyGraceUntilMs: Date.now() - 1000 });
    const r = await viaHeader(patient.id, token);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: 'VERIFICATION_REQUIRED', status: 'legacy' });
  });

  it('token de médico cuja conta sumiu → 401 DOCTOR_NOT_FOUND', async () => {
    const { patient } = await userWithPhoto();
    const fantasma = jwt.sign({ doctorId: 'cl0000000000000000000fake', type: 'doctor' }, config.jwtSecret, { expiresIn: '1h' });
    const r = await viaHeader(patient.id, fantasma);
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('DOCTOR_NOT_FOUND');
  });

  // Usos legítimos SEM share ativo: a tela do médico mostra a foto de quem ele atendeu / de quem lhe perguntou
  // (histórico de teleconsultas, fila imediata — o share efêmero é revogado no fim da chamada —, caixa de perguntas).
  it('teleconsulta PRÓPRIA do médico com o paciente vale como vínculo (agendada, ao vivo ou já encerrada, sem share)', async () => {
    const { user, patient } = await userWithPhoto();
    const { doctor, token } = await createDoctor({ crm: crm() });
    expect((await viaHeader(patient.id, token)).body.code).toBe('NO_SHARE');
    await prisma.reminder.create({
      data: { ownerId: user.id, patientId: patient.id, title: 'Consulta imediata', dueDate: new Date(), type: 'teleconsulta', createdByDoctorId: doctor.id, teleStatus: 'completed', endedAt: new Date() },
    });
    expect((await viaHeader(patient.id, token)).status).toBe(302);
  });

  it('teleconsulta de OUTRO médico, ou lembrete que não é teleconsulta, não dá vínculo', async () => {
    const { user, patient } = await userWithPhoto();
    const outro = await createDoctor({ crm: crm() });
    const eu = await createDoctor({ crm: crm() });
    await prisma.reminder.create({ data: { ownerId: user.id, patientId: patient.id, title: 'Consulta', dueDate: new Date(), type: 'teleconsulta', createdByDoctorId: outro.doctor.id } });
    await prisma.reminder.create({ data: { ownerId: user.id, patientId: patient.id, title: 'Tomar remédio', dueDate: new Date(), type: 'medicamento', createdByDoctorId: eu.doctor.id } });
    expect((await viaHeader(patient.id, eu.token)).body.code).toBe('NO_SHARE');
  });

  it('pergunta do paciente a este médico (caixa de perguntas, mesmo já fechada) vale como vínculo', async () => {
    const { patient } = await userWithPhoto();
    const { doctor, token } = await createDoctor({ crm: crm() });
    expect((await viaHeader(patient.id, token)).body.code).toBe('NO_SHARE');
    await prisma.doctorQuestion.create({ data: { patientId: patient.id, doctorId: doctor.id, subject: 'Posso tomar em jejum?', status: 'closed', closedReason: 'revoked' } });
    expect((await viaHeader(patient.id, token)).status).toBe(302);
  });

  it('a foto do MÉDICO (vista por pacientes) segue aceitando qualquer token válido', async () => {
    const { token: tokenPaciente } = await createUser();
    const pend = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    await prisma.doctor.update({ where: { id: pend.doctor.id }, data: { photoUrl: 'photos/medico.jpg' } });
    const r = await api().get(`/api/doctor/photo/${pend.doctor.id}`).query({ t: tokenPaciente });
    expect(r.status).toBe(302);
    // e o próprio médico pendente vê a foto de outro médico (rota inalterada)
    expect((await api().get(`/api/doctor/photo/${pend.doctor.id}`).query({ t: pend.token })).status).toBe(302);
  });
});
