import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/uaiid', async (orig) => ({
  ...(await orig<typeof import('../src/utils/uaiid')>()),
  getUaiidVerification: vi.fn(),
}));

import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma';
import { resetDb, createDoctor, holdKycDoctorLock, api, authHeader, mintToken } from './helpers';
import { getUaiidVerification, type UaiidVerification } from '../src/utils/uaiid';
import { sendEmail } from '../src/utils/mailer';
import { syncVerification, nextDoctorStatus } from '../src/kyc/sync';
import { saveSettings } from '../src/utils/settings';

const remote = (over: Partial<UaiidVerification> = {}): UaiidVerification => ({
  id: 'v', status: 'approved', reasonCode: null, score: 830, nameRatio: null, cpfSituacao: 'REGULAR',
  externalReference: null, completedAt: new Date('2026-10-28T12:00:00Z'), ...over,
});
let seq = 60000;
async function seed(doctorStatus = 'in_progress') {
  const crm = `${seq++}-SP`;
  const { doctor } = await createDoctor({ crm, verificationStatus: doctorStatus });
  const providerId = `v-${doctor.id}`;
  await prisma.doctorVerification.create({ data: { doctorId: doctor.id, crm, providerId, status: 'collecting', cfmName: 'MARIA DA SILVA SOUZA', cfmSituation: 'Ativo' } });
  return { doctor, providerId };
}
const doctorRow = async (id: string) => prisma.doctor.findUnique({ where: { id }, select: { verificationStatus: true, blocked: true, blockedReason: true, verifiedBy: true } });

describe('syncVerification (spec §5)', () => {
  beforeEach(async () => {
    await resetDb();
    // a maioria dos casos testa o caminho automático; o da política do começo liga 0 no próprio teste
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 1 });
    vi.mocked(getUaiidVerification).mockReset();
    vi.mocked(sendEmail).mockClear();
  });

  it('approved + nome do documento = CFM (acento/caixa/partícula) → approved automático', async () => {
    const { doctor, providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote());
    expect(await syncVerification(providerId, 'webhook', { documentName: 'Maria Silva Souza' })).toEqual({ ok: true, doctorStatus: 'approved' });
    expect(await doctorRow(doctor.id)).toMatchObject({ verificationStatus: 'approved', verifiedBy: 'auto' });
    expect(await prisma.doctorVerification.findUnique({ where: { providerId } }))
      .toMatchObject({ status: 'approved', nameMatch: true, decision: 'approved', decidedBy: 'auto', syncSource: 'webhook', documentName: 'Maria Silva Souza' });
  });

  it('approved + nome diferente → needs_admin + e-mail ao dono', async () => {
    const { doctor, providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote());
    await syncVerification(providerId, 'webhook', { documentName: 'Maria Silva Santos' });
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('needs_admin');
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining('aguardando') })));
  });

  it('poll sem nome: name_ratio 1 → approved', async () => {
    const { doctor, providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote({ nameRatio: 1 }));
    await syncVerification(providerId, 'poll');
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('approved');
  });

  it('fraud_confirmed → rejected + bloqueado kyc_fraud', async () => {
    const { doctor, providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote({ status: 'rejected', reasonCode: 'fraud_confirmed' }));
    await syncVerification(providerId, 'webhook');
    expect(await doctorRow(doctor.id)).toMatchObject({ verificationStatus: 'rejected', blocked: true, blockedReason: 'kyc_fraud' });
  });

  it('manual_review → uaiid_review', async () => {
    const { doctor, providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote({ status: 'manual_review', reasonCode: 'document_not_recognized' }));
    await syncVerification(providerId, 'webhook');
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('uaiid_review');
  });

  it('legacy não regride com recusa; sobe com aprovação', async () => {
    const a = await seed('legacy');
    vi.mocked(getUaiidVerification).mockResolvedValue(remote({ status: 'rejected', reasonCode: 'face_mismatch' }));
    await syncVerification(a.providerId, 'webhook');
    expect((await doctorRow(a.doctor.id))?.verificationStatus).toBe('legacy');
    const b = await seed('legacy');
    vi.mocked(getUaiidVerification).mockResolvedValue(remote());
    await syncVerification(b.providerId, 'webhook', { documentName: 'MARIA SILVA SOUZA' });
    expect((await doctorRow(b.doctor.id))?.verificationStatus).toBe('approved');
  });

  it('decisão humana não é sobrescrita por evento atrasado', async () => {
    const { doctor, providerId } = await seed('approved');
    await prisma.doctorVerification.update({ where: { providerId }, data: { decision: 'approved', decidedBy: 'admin-1' } });
    vi.mocked(getUaiidVerification).mockResolvedValue(remote({ status: 'rejected', reasonCode: 'face_mismatch' }));
    await syncVerification(providerId, 'poll');
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('approved');
    expect((await prisma.doctorVerification.findUnique({ where: { providerId } }))?.decidedBy).toBe('admin-1');
  });

  it('tentativa antiga terminando atrasada não mexe no médico', async () => {
    const { doctor, providerId } = await seed();
    await prisma.doctorVerification.create({ data: { doctorId: doctor.id, crm: 'x', providerId: `${providerId}-new`, status: 'collecting', createdAt: new Date(Date.now() + 1000) } });
    vi.mocked(getUaiidVerification).mockResolvedValue(remote({ status: 'rejected', reasonCode: 'face_mismatch' }));
    await syncVerification(providerId, 'poll');
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('in_progress');
  });

  it('UaiID fora (null) → ok:false e lastSyncedAt intacto', async () => {
    const { providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(null);
    expect(await syncVerification(providerId, 'poll')).toEqual({ ok: false });
    expect((await prisma.doctorVerification.findUnique({ where: { providerId } }))?.lastSyncedAt).toBeNull();
  });

  it('política do começo (autoApprove 0): tudo verde → needs_admin manual_policy + e-mails (dono "pronto", médico "recebemos")', async () => {
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 });
    const { doctor, providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote());
    await syncVerification(providerId, 'webhook', { documentName: 'Maria Silva Souza' });
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('needs_admin');
    expect(await prisma.doctorVerification.findUnique({ where: { providerId } }))
      .toMatchObject({ decision: 'needs_admin', reasonCode: 'manual_policy', nameMatch: true });
    await vi.waitFor(() => {
      const subjects = vi.mocked(sendEmail).mock.calls.map((c: any) => c[0].subject);
      expect(subjects).toEqual(expect.arrayContaining([expect.stringContaining('pronto para aprovar'), expect.stringContaining('Recebemos')]));
    });
  });

  it('aprovação automática avisa o médico; recusa avisa com o motivo', async () => {
    const a = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote());
    await syncVerification(a.providerId, 'webhook', { documentName: 'Maria Silva Souza' });
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining('já pode atender') })));
    vi.mocked(sendEmail).mockClear();
    const b = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote({ status: 'rejected', reasonCode: 'face_mismatch' }));
    await syncVerification(b.providerId, 'webhook');
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('não foi aprovada'), html: expect.stringContaining('O rosto não bateu'),
    })));
  });

  it('evento repetido não reenvia e-mail', async () => {
    const { providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote({ status: 'manual_review', reasonCode: 'document_not_recognized' }));
    await syncVerification(providerId, 'webhook');
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalled());
    const n = vi.mocked(sendEmail).mock.calls.length;
    await syncVerification(providerId, 'poll');
    await new Promise((r) => setTimeout(r, 50));
    expect(vi.mocked(sendEmail).mock.calls.length).toBe(n);
  });
});

// ---------------------------------------------------------------------------------------------
// Exigência do dono: cada e-mail só numa TRANSIÇÃO real — nunca reenviado ao re-sincronizar o mesmo estado,
// nem quando webhook + GET on-demand + job chegam juntos ao fim da verificação.
// ---------------------------------------------------------------------------------------------
/** Só os e-mails do KYC (assunto do dono "Dr. Exame — …" / do médico "… | Dr. Exame"); ignora o OTP do cadastro. */
const kycMails = (): string[] =>
  vi.mocked(sendEmail).mock.calls.map((c: any) => String(c[0].subject)).filter((s) => /Dr\. Exame/.test(s));

/**
 * Força a corrida: o GET do UaiID só responde quando as N chamadas concorrentes já chegaram nele (ou após 300 ms).
 * Sem serialização por providerId, todas leram a decisão antiga ANTES de qualquer gravação e todas "transicionam";
 * com ela, chegam uma de cada vez (o timeout só evita travar a fila).
 */
function raceGate(n: number, value: UaiidVerification) {
  let arrived = 0;
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  vi.mocked(getUaiidVerification).mockImplementation(async () => {
    if (++arrived >= n) open();
    await Promise.race([gate, new Promise((r) => setTimeout(r, 300))]);
    return value;
  });
}

describe('syncVerification — e-mail só na transição (spec §5b)', () => {
  beforeEach(async () => {
    await resetDb();
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 1 });
    vi.mocked(getUaiidVerification).mockReset();
    vi.mocked(sendEmail).mockClear();
  });

  it.each([
    ['needs_admin (nome diferente): dono + médico', remote(), { documentName: 'Maria Silva Santos' }, 2],
    ['uaiid_review: dono + médico', remote({ status: 'manual_review', reasonCode: 'document_not_recognized' }), {}, 2],
    ['rejected (rosto): só o médico, com o motivo', remote({ status: 'rejected', reasonCode: 'face_mismatch' }), {}, 1],
    ['approved (automático): só o médico', remote(), { documentName: 'Maria Silva Souza' }, 1],
  ])('%s — 1 e-mail na transição e nenhum ao re-sincronizar', async (_nome, r, opts, esperados) => {
    const { providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(r);
    await syncVerification(providerId, 'webhook', opts);
    expect(kycMails()).toHaveLength(esperados);
    await syncVerification(providerId, 'poll');
    await syncVerification(providerId, 'on_demand');
    await syncVerification(providerId, 'webhook', opts);
    expect(kycMails()).toHaveLength(esperados);
  });

  it('webhook + on-demand + poll ao mesmo tempo (tudo verde, autoApprove 0): UM par de e-mails, estado único', async () => {
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 });
    const { doctor, providerId } = await seed();
    raceGate(3, remote());
    await Promise.all([
      syncVerification(providerId, 'webhook', { documentName: 'Maria Silva Souza' }),
      syncVerification(providerId, 'on_demand'),
      syncVerification(providerId, 'poll'),
    ]);
    expect(kycMails().sort()).toEqual([
      'Dr. Exame — médico pronto para aprovar (tudo verde)',
      'Recebemos seu cadastro — está em análise | Dr. Exame',
    ]);
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('needs_admin');
    // o nome do documento (só o webhook traz) não se perde mesmo com o on-demand/poll na frente
    expect((await prisma.doctorVerification.findUnique({ where: { providerId } }))?.documentName).toBe('Maria Silva Souza');
  });

  it('webhook + on-demand ao mesmo tempo (aprovação automática): UM e-mail "aprovado"', async () => {
    const { doctor, providerId } = await seed();
    raceGate(2, remote());
    await Promise.all([
      syncVerification(providerId, 'webhook', { documentName: 'Maria Silva Souza' }),
      syncVerification(providerId, 'on_demand'),
    ]);
    expect(kycMails()).toEqual(['Sua conta foi aprovada — você já pode atender | Dr. Exame']);
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('approved');
  });

  it('webhook + on-demand ao mesmo tempo (fraude): UM aviso de fraude ao dono e UMA recusa ao médico', async () => {
    const { doctor, providerId } = await seed();
    raceGate(2, remote({ status: 'rejected', reasonCode: 'fraud_confirmed' }));
    await Promise.all([syncVerification(providerId, 'webhook'), syncVerification(providerId, 'on_demand')]);
    expect(kycMails().sort()).toEqual([
      'Dr. Exame — fraude confirmada no KYC de médico',
      'Sua verificação não foi aprovada — veja como resolver | Dr. Exame',
    ]);
    expect(await doctorRow(doctor.id)).toMatchObject({ verificationStatus: 'rejected', blocked: true, blockedReason: 'kyc_fraud' });
  });

  it('legacy com a política do começo: segue legacy, mas dono e médico são avisados (uma vez)', async () => {
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 });
    const { doctor, providerId } = await seed('legacy');
    vi.mocked(getUaiidVerification).mockResolvedValue(remote());
    await syncVerification(providerId, 'webhook', { documentName: 'Maria Silva Souza' });
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('legacy');
    expect(kycMails()).toHaveLength(2); // dono "pronto para aprovar" + médico "Recebemos"
    await syncVerification(providerId, 'poll');
    expect(kycMails()).toHaveLength(2);
  });

  it('um sync que falha não trava os próximos do mesmo providerId', async () => {
    const { providerId } = await seed();
    vi.mocked(getUaiidVerification).mockRejectedValueOnce(new Error('boom')).mockResolvedValue(remote({ nameRatio: 1 }));
    await expect(syncVerification(providerId, 'webhook')).rejects.toThrow('boom');
    expect(await syncVerification(providerId, 'poll')).toEqual({ ok: true, doctorStatus: 'approved' });
  });
});

// ---------------------------------------------------------------------------------------------
// Revisão final, I1: o sync usava a trava `kyc-sync:<providerId>` e as decisões do dono `kyc-decide:<doctorId>` —
// duas travas, nenhuma exclusão mútua. Um sync atrasado (webhook repetido, poll, GET do portal) lia o estado
// ANTES da recusa do dono, esperava o lock de linha e gravava POR CIMA: o médico recusado voltava à fila.
// Agora os dois usam `kyc-doctor:<doctorId>`.
// ---------------------------------------------------------------------------------------------
async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({
    data: { email: `admin-race-${Date.now().toString(36)}@exemplo.com`, name: 'Admin Race', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true },
    select: { id: true },
  });
  return { id: u.id, token: mintToken(u.id) };
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('syncVerification × decisão do dono — mesma trava por médico (revisão final I1)', () => {
  beforeEach(async () => {
    await resetDb();
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 });
    vi.mocked(getUaiidVerification).mockReset();
    vi.mocked(sendEmail).mockClear();
  });

  it('o sync espera a trava `kyc-doctor:<id>` (a mesma da decisão do dono) e só então lê e grava', async () => {
    const { doctor, providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote());
    const lock = await holdKycDoctorLock(doctor.id);
    let done = false;
    const sync = syncVerification(providerId, 'webhook', { documentName: 'Maria Silva Souza' }).then((r) => { done = true; return r; });
    await pause(500);
    expect(done).toBe(false); // preso na trava do médico
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('in_progress'); // nada gravado enquanto ela está presa
    await lock.release();
    expect(await sync).toMatchObject({ ok: true, doctorStatus: 'needs_admin' });
  });

  it('a recusa do dono espera a MESMA trava e sobrevive a um sync concorrente, em qualquer ordem', async () => {
    const admin = await createAdmin();
    const { doctor, providerId } = await seed();
    vi.mocked(getUaiidVerification).mockResolvedValue(remote()); // tudo verde: o sync levaria o médico à fila
    const lock = await holdKycDoctorLock(doctor.id);
    let syncDone = false;
    let rejectDone = false;
    const sync = syncVerification(providerId, 'webhook', { documentName: 'Maria Silva Souza' }).then((r) => { syncDone = true; return r; });
    const reject = api().post(`/api/admin/doctors/${doctor.id}/verification/reject`).set(authHeader(admin.token)).send({ reason: 'não é o titular' })
      .then((r) => { rejectDone = true; return r; });
    await pause(600);
    expect(syncDone).toBe(false);
    expect(rejectDone).toBe(false); // com a trava antiga (kyc-decide) a recusa passava direto aqui
    await lock.release();
    const [, rr] = await Promise.all([sync, reject]);
    expect(rr.status).toBe(200);
    // invariante: a decisão do dono nunca é desfeita por um sync concorrente (qualquer que seja quem pegou a trava 1º)
    expect(await doctorRow(doctor.id)).toMatchObject({ verificationStatus: 'rejected' });
    expect(await prisma.doctorVerification.findUnique({ where: { providerId } })).toMatchObject({ decision: 'rejected', decidedBy: admin.id });
  });

  it('tentativa sem médico (conta apagada) ainda sincroniza: trava do providerId', async () => {
    const { doctor, providerId } = await seed();
    await prisma.doctorVerification.update({ where: { providerId }, data: { doctorId: null } });
    vi.mocked(getUaiidVerification).mockResolvedValue(remote());
    expect(await syncVerification(providerId, 'poll')).toEqual({ ok: true });
    expect((await doctorRow(doctor.id))?.verificationStatus).toBe('in_progress'); // sem vínculo, nada muda no médico
  });
});

describe('nextDoctorStatus — não regride (spec §1)', () => {
  it.each([
    // approved não muda por evento nenhum
    ['approved', 'rejected', null], ['approved', 'needs_admin', null], ['approved', 'in_progress', null], ['approved', 'approved', null],
    // legacy só sobe p/ approved
    ['legacy', 'approved', 'approved'], ['legacy', 'rejected', null], ['legacy', 'needs_admin', null],
    ['legacy', 'uaiid_review', null], ['legacy', 'in_progress', null], ['legacy', 'pending', null],
    // demais: muda quando o proposto é diferente
    ['in_progress', 'approved', 'approved'], ['in_progress', 'needs_admin', 'needs_admin'], ['in_progress', 'in_progress', null],
    ['uaiid_review', 'needs_admin', 'needs_admin'], ['needs_admin', 'needs_admin', null],
    ['rejected', 'in_progress', 'in_progress'], ['pending', 'in_progress', 'in_progress'], ['in_progress', 'pending', 'pending'],
  ] as const)('%s + %s → %s', (current, proposed, expected) => {
    expect(nextDoctorStatus(current, proposed)).toBe(expected);
  });
});
