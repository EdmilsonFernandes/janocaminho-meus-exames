import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma';
import { api, authHeader, resetDb, createDoctor, mintToken } from './helpers';
import { getDoctorKycConfig, saveSettings } from '../src/utils/settings';
import { sendEmail } from '../src/utils/mailer';

let adminSeq = 0;
async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({
    data: { email: `admin-kyc-${Date.now().toString(36)}-${adminSeq++}@exemplo.com`, name: 'Admin KYC', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true },
    select: { id: true },
  });
  return { id: u.id, token: mintToken(u.id) };
}
let seq = 40000;
const crm = () => `${seq++}-SP`;

// --- helpers da rodada 1 (decisão idempotente) ---
const approveUrl = (id: string) => `/api/admin/doctors/${id}/verification/approve`;
const rejectUrl = (id: string) => `/api/admin/doctors/${id}/verification/reject`;
const emailOf = async (doctorId: string) => (await prisma.doctor.findUniqueOrThrow({ where: { id: doctorId }, select: { email: true } })).email;
// E-mails que o mock do mailer recebeu para esse destinatário (o mock acumula entre os testes; o e-mail do médico é único por teste).
const mailsTo = (email: string, subjectPart: string) => vi.mocked(sendEmail).mock.calls.map(([m]) => m).filter((m) => m.to === email && m.subject.includes(subjectPart));
const decidedAudits = (doctorId: string) => prisma.auditLog.count({ where: { action: 'DOCTOR_VERIFICATION_DECIDED', targetId: doctorId } });
const waitMails = (email: string, subjectPart: string, n: number) => vi.waitFor(() => expect(mailsTo(email, subjectPart)).toHaveLength(n), { timeout: 5000 });
const waitAudits = (doctorId: string, n: number) => vi.waitFor(async () => expect(await decidedAudits(doctorId)).toBe(n), { timeout: 5000 });
const settle = () => new Promise<void>((r) => setTimeout(r, 250)); // audit/e-mail são fire-and-forget: se existissem, já teriam aparecido
const queueAttempt = (doctorId: string, providerId: string) => prisma.doctorVerification.create({ data: { doctorId, crm: 'x', providerId, status: 'approved', decision: 'needs_admin' } });
const kycRow = (doctorId: string) => prisma.doctor.findUnique({ where: { id: doctorId }, select: { verificationStatus: true, verifiedAt: true, verifiedBy: true } });

describe('admin — KYC do médico (spec §3)', () => {
  beforeEach(async () => { await resetDb(); });

  it('fila: needs_admin com nomes lado a lado + tentativas anteriores no CRM (inclusive conta excluída) + legados', async () => {
    const admin = await createAdmin();
    const c = crm();
    const { doctor } = await createDoctor({ crm: c, verificationStatus: 'needs_admin' });
    await prisma.doctorVerification.create({ data: { doctorId: null, crm: c, providerId: 'v-old', status: 'rejected', decision: 'rejected', decidedBy: 'auto' } });
    await prisma.doctorVerification.create({ data: { doctorId: doctor.id, crm: c, providerId: 'v-new', status: 'approved', decision: 'needs_admin', reasonCode: 'name_mismatch', documentName: 'MARIA SANTOS', cfmName: 'MARIA SOUZA' } });
    const leg = await createDoctor({ crm: crm(), verificationStatus: 'legacy' });
    const r = await api().get('/api/admin/doctors/verification-queue').set(authHeader(admin.token));
    expect(r.status).toBe(200);
    expect(r.body.review).toHaveLength(1);
    expect(r.body.review[0]).toMatchObject({ providerId: 'v-new', documentName: 'MARIA SANTOS', cfmName: 'MARIA SOUZA', priorAttempts: 1, decideIn: 'drexame' });
    expect(r.body.legacy.map((d: any) => d.id)).toEqual([leg.doctor.id]);
  });

  it('aprovar → approved com verifiedBy = admin; a tentativa guarda quem decidiu', async () => {
    const admin = await createAdmin();
    const { doctor } = await createDoctor({ crm: crm(), verificationStatus: 'needs_admin' });
    await prisma.doctorVerification.create({ data: { doctorId: doctor.id, crm: 'x', providerId: 'v-a', status: 'approved', decision: 'needs_admin' } });
    const r = await api().post(`/api/admin/doctors/${doctor.id}/verification/approve`).set(authHeader(admin.token)).send({ note: 'conferi no painel' });
    expect(r.status).toBe(200);
    expect(await prisma.doctor.findUnique({ where: { id: doctor.id }, select: { verificationStatus: true, verifiedBy: true } })).toEqual({ verificationStatus: 'approved', verifiedBy: admin.id });
    expect((await prisma.doctorVerification.findUnique({ where: { providerId: 'v-a' } }))?.decidedBy).toBe(admin.id);
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining('já pode atender') })));
  });

  it('recusar exige motivo', async () => {
    const admin = await createAdmin();
    const { doctor } = await createDoctor({ crm: crm(), verificationStatus: 'needs_admin' });
    expect((await api().post(`/api/admin/doctors/${doctor.id}/verification/reject`).set(authHeader(admin.token)).send({})).body.code).toBe('REASON_REQUIRED');
    const r = await api().post(`/api/admin/doctors/${doctor.id}/verification/reject`).set(authHeader(admin.token)).send({ reason: 'não é o titular' });
    expect(r.status).toBe(200);
    expect((await prisma.doctor.findUnique({ where: { id: doctor.id } }))?.verificationStatus).toBe('rejected');
    // dono (28/10): o motivo que ELE digitou vai no e-mail do médico (e não o texto padrão do reasonCode)
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ html: expect.stringContaining('não é o titular') })));
  });

  it('aprovar legados em lote só mexe em quem é legacy', async () => {
    const admin = await createAdmin();
    const leg = await createDoctor({ crm: crm(), verificationStatus: 'legacy' });
    const pend = await createDoctor({ crm: crm(), verificationStatus: 'pending' });
    const r = await api().post('/api/admin/doctors/verification/approve-legacy').set(authHeader(admin.token)).send({ ids: [leg.doctor.id, pend.doctor.id] });
    expect(r.body).toMatchObject({ ok: true, approved: 1 });
    expect((await prisma.doctor.findUnique({ where: { id: pend.doctor.id } }))?.verificationStatus).toBe('pending');
  });

  it('prazo dos legados editável pelo PATCH de config existente (data futura em ms) + auditado', async () => {
    const admin = await createAdmin();
    const until = Date.now() + 30 * 86_400_000;
    const r = await api().patch('/api/admin/config/costs').set(authHeader(admin.token)).send({ category: 'doctorKyc', legacyGraceUntilMs: until, autoApprove: 1 });
    expect(r.status).toBe(200);
    expect(getDoctorKycConfig()).toEqual({ legacyGraceUntilMs: until, autoApprove: 1 });
    const log = await prisma.auditLog.findFirst({ where: { action: 'KYC_CONFIG_CHANGED' }, orderBy: { createdAt: 'desc' } });
    expect(log).toMatchObject({ actorId: admin.id, before: { legacyGraceUntilMs: 0, autoApprove: 0 }, after: { legacyGraceUntilMs: until, autoApprove: 1 } });
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 });
  });

  it('config do KYC recusa prazo em segundos, no passado, autoApprove fora de 0/1 e campo desconhecido — e nada muda', async () => {
    const admin = await createAdmin();
    const logsBefore = await prisma.auditLog.count({ where: { action: 'KYC_CONFIG_CHANGED' } });
    for (const body of [
      { legacyGraceUntilMs: Math.floor(Date.now() / 1000) + 86_400 }, // em segundos → viraria 1970 e trancaria todo legado
      { legacyGraceUntilMs: Date.now() - 1000 }, // no passado
      { autoApprove: 2 },
      { foo: 1 },
    ]) {
      const r = await api().patch('/api/admin/config/costs').set(authHeader(admin.token)).send({ category: 'doctorKyc', ...body });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('KYC_CONFIG_INVALID');
    }
    expect(getDoctorKycConfig()).toEqual({ legacyGraceUntilMs: 0, autoApprove: 0 });
    expect(await prisma.auditLog.count({ where: { action: 'KYC_CONFIG_CHANGED' } })).toBe(logsBefore);
  });

  // ===== Rodada 1: a decisão do dono é idempotente e "aprovar" só vale a partir da fila (needs_admin) =====

  it('aprovar é idempotente: 2º aprovar → unchanged, sem 2º e-mail, sem 2º audit e sem regravar', async () => {
    const a1 = await createAdmin();
    const a2 = await createAdmin();
    const { doctor } = await createDoctor({ crm: crm(), verificationStatus: 'needs_admin' });
    await queueAttempt(doctor.id, 'v-idem-a');
    const email = await emailOf(doctor.id);

    const first = await api().post(approveUrl(doctor.id)).set(authHeader(a1.token)).send({});
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true, status: 'approved' });
    await waitMails(email, 'já pode atender', 1);
    await waitAudits(doctor.id, 1);
    const afterFirst = await kycRow(doctor.id);
    expect(afterFirst).toMatchObject({ verificationStatus: 'approved', verifiedBy: a1.id });

    const second = await api().post(approveUrl(doctor.id)).set(authHeader(a2.token)).send({ note: 'de novo' });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ ok: true, status: 'approved', unchanged: true });
    await settle();
    expect(mailsTo(email, 'já pode atender')).toHaveLength(1);
    expect(await decidedAudits(doctor.id)).toBe(1);
    expect(await kycRow(doctor.id)).toEqual(afterFirst); // verifiedAt/verifiedBy do 1º aprovador intactos
    expect((await prisma.doctorVerification.findUnique({ where: { providerId: 'v-idem-a' } }))?.decidedBy).toBe(a1.id);
  });

  it('aprovar só a partir da fila (needs_admin): pending / in_progress / rejected / uaiid_review / legacy → 409 INVALID_STATE com o status atual; nada muda', async () => {
    const admin = await createAdmin();
    const { doctor } = await createDoctor({ crm: crm(), verificationStatus: 'needs_admin' });
    await queueAttempt(doctor.id, 'v-409');
    const email = await emailOf(doctor.id);
    for (const status of ['pending', 'in_progress', 'rejected', 'uaiid_review', 'legacy']) {
      await prisma.doctor.update({ where: { id: doctor.id }, data: { verificationStatus: status } });
      const r = await api().post(approveUrl(doctor.id)).set(authHeader(admin.token)).send({});
      expect(r.status, status).toBe(409);
      expect(r.body, status).toEqual({ code: 'INVALID_STATE', status, error: 'Só dá para aprovar quem está em análise na fila do Dr. Exame.' });
      expect(await kycRow(doctor.id), status).toEqual({ verificationStatus: status, verifiedAt: null, verifiedBy: null });
    }
    await settle();
    expect(mailsTo(email, 'já pode atender')).toHaveLength(0);
    expect(await decidedAudits(doctor.id)).toBe(0);
    expect(await prisma.doctorVerification.findUnique({ where: { providerId: 'v-409' } })).toMatchObject({ decision: 'needs_admin', decidedBy: null }); // a tentativa da fila não foi tocada
  });

  it('recusar é idempotente: 2º recusar → unchanged, um único e-mail (com o 1º motivo), sem 2º audit — e o motivo segue obrigatório antes', async () => {
    const a1 = await createAdmin();
    const a2 = await createAdmin();
    const { doctor } = await createDoctor({ crm: crm(), verificationStatus: 'needs_admin' });
    await queueAttempt(doctor.id, 'v-idem-r');
    const email = await emailOf(doctor.id);

    const first = await api().post(rejectUrl(doctor.id)).set(authHeader(a1.token)).send({ reason: 'primeiro motivo' });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true, status: 'rejected' });
    await waitMails(email, 'não foi aprovada', 1);
    await waitAudits(doctor.id, 1);

    // a checagem do motivo continua sendo a 1ª, mesmo com o médico já recusado
    const noReason = await api().post(rejectUrl(doctor.id)).set(authHeader(a2.token)).send({});
    expect(noReason.status).toBe(400);
    expect(noReason.body.code).toBe('REASON_REQUIRED');

    const second = await api().post(rejectUrl(doctor.id)).set(authHeader(a2.token)).send({ reason: 'segundo motivo' });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ ok: true, status: 'rejected', unchanged: true });
    await settle();
    const mails = mailsTo(email, 'não foi aprovada');
    expect(mails).toHaveLength(1);
    expect(mails[0].html).toContain('primeiro motivo');
    expect(mails[0].html).not.toContain('segundo motivo');
    expect(await decidedAudits(doctor.id)).toBe(1);
    expect(await prisma.doctorVerification.findUnique({ where: { providerId: 'v-idem-r' } })).toMatchObject({ decision: 'rejected', decidedBy: a1.id, reasonCode: 'admin_rejected' });
  });

  it('recusar continua permitido a partir de qualquer outro estado (inclusive revogar quem já estava aprovado)', async () => {
    const admin = await createAdmin();
    const { doctor } = await createDoctor({ crm: crm(), verificationStatus: 'approved' });
    for (const from of ['approved', 'needs_admin', 'uaiid_review', 'in_progress', 'legacy', 'pending']) {
      await prisma.doctor.update({ where: { id: doctor.id }, data: { verificationStatus: from, verifiedAt: from === 'approved' ? new Date() : null, verifiedBy: from === 'approved' ? 'auto' : null } });
      const r = await api().post(rejectUrl(doctor.id)).set(authHeader(admin.token)).send({ reason: `revisão do dono (de ${from})` });
      expect(r.status, from).toBe(200);
      expect(r.body, from).toEqual({ ok: true, status: 'rejected' });
      expect(await kycRow(doctor.id), from).toEqual({ verificationStatus: 'rejected', verifiedAt: null, verifiedBy: null });
    }
  });

  it('duplo clique (2 pedidos simultâneos): aprovar e recusar têm um único efeito — um aplica, o outro vem unchanged, um e-mail só', async () => {
    const admin = await createAdmin();
    const ap = await createDoctor({ crm: crm(), verificationStatus: 'needs_admin' });
    const rj = await createDoctor({ crm: crm(), verificationStatus: 'needs_admin' });
    await queueAttempt(ap.doctor.id, 'v-race-a');
    await queueAttempt(rj.doctor.id, 'v-race-r');
    const apMail = await emailOf(ap.doctor.id);
    const rjMail = await emailOf(rj.doctor.id);

    const [a1, a2, r1, r2] = await Promise.all([
      api().post(approveUrl(ap.doctor.id)).set(authHeader(admin.token)).send({}),
      api().post(approveUrl(ap.doctor.id)).set(authHeader(admin.token)).send({}),
      api().post(rejectUrl(rj.doctor.id)).set(authHeader(admin.token)).send({ reason: 'não é o titular' }),
      api().post(rejectUrl(rj.doctor.id)).set(authHeader(admin.token)).send({ reason: 'não é o titular' }),
    ]);
    for (const pair of [[a1, a2], [r1, r2]]) {
      expect(pair.map((r) => r.status)).toEqual([200, 200]);
      expect(pair.filter((r) => r.body.unchanged === true)).toHaveLength(1);
    }
    expect((await kycRow(ap.doctor.id))?.verificationStatus).toBe('approved');
    expect((await kycRow(rj.doctor.id))?.verificationStatus).toBe('rejected');
    await waitMails(apMail, 'já pode atender', 1);
    await waitMails(rjMail, 'não foi aprovada', 1);
    await settle();
    expect(mailsTo(apMail, 'já pode atender')).toHaveLength(1);
    expect(mailsTo(rjMail, 'não foi aprovada')).toHaveLength(1);
    expect(await decidedAudits(ap.doctor.id)).toBe(1);
    expect(await decidedAudits(rj.doctor.id)).toBe(1);
  });
});
