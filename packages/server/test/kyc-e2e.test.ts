// E2E do KYC do médico (spec §10/§11): cadastro → verificação → webhook assinado → fila do dono →
// aprovação → gate abre, com os e-mails no caminho. UaiID simulado no fetch (contrato real).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';

vi.mock('../src/utils/cfm', async (orig) => ({
  ...(await orig<typeof import('../src/utils/cfm')>()),
  lookupCfm: vi.fn(async () => ({ name: 'MARIA DA SILVA SOUZA', specialty: null, crm: '98765-SP', uf: 'SP', situation: 'Ativo', source: 'cfm' as const })),
}));

import { prisma } from '../src/prisma';
import { api, authHeader, resetDb, createDoctor, mintToken } from './helpers';
import { sendEmail } from '../src/utils/mailer';
import { saveSettings } from '../src/utils/settings';
import { runKycReconcile } from '../src/jobs/kycReconcile';

const SECRET = 'whsec_e2e';
const VID = '6c5db95c-8d67-41b3-aabc-2e1439f614c3';
let uaiidStatus = 'collecting';
const setupFetch = globalThis.fetch; // stub do setup (Mercado Pago) — nunca a rede

/** UaiID simulado no contrato real (POST cria, GET devolve VerificationOut). */
function stubUaiid() {
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    if (u === 'https://api.uaiid.com.br/v1/verifications' && init?.method === 'POST') {
      return { ok: true, status: 201, json: async () => ({ verification_id: VID, verify_url: 'https://uaiid.com.br/verify/e2e00001', expires_at: new Date(Date.now() + 3_600_000).toISOString(), reused_session: false }) };
    }
    if (u === `https://api.uaiid.com.br/v1/verifications/${VID}`) {
      return { ok: true, status: 200, json: async () => ({
        id: VID, status: uaiidStatus, reason_code: null, external_reference: null,
        completed_at: uaiidStatus === 'approved' ? new Date().toISOString() : null,
        result: { score: 830, declared_vs_document: { name_ratio: 1 }, receita_federal: { situacao_cadastral: 'REGULAR' } },
      }) };
    }
    return (setupFetch as any)(url, init);
  }));
}

const signed = (body: string) => {
  const t = Math.floor(Date.now() / 1000);
  return `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex')}`;
};
const webhook = (body: string, sig = signed(body)) =>
  api().post('/api/webhooks/uaiid').set('Content-Type', 'application/json').set('X-Uai-Signature', sig).send(body);
const subjects = () => vi.mocked(sendEmail).mock.calls.map((c: any) => String(c[0].subject));

async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({
    data: { email: `admin-e2e-${Date.now().toString(36)}@exemplo.com`, name: 'Admin E2E', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true },
    select: { id: true },
  });
  return { id: u.id, token: mintToken(u.id) };
}

describe('E2E — KYC do médico, do cadastro ao atendimento', () => {
  beforeEach(async () => {
    await resetDb();
    process.env.UAIID_API_KEY = 'uai_test_e2e';
    process.env.UAIID_WEBHOOK_SECRET = SECRET;
    await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 }); // política do começo
    uaiidStatus = 'collecting';
    stubUaiid();
    vi.mocked(sendEmail).mockClear();
  });

  it('caminho feliz: tudo verde cai na fila, dono aprova, médico passa a atender (com os e-mails premium)', async () => {
    const admin = await createAdmin();
    const { doctor, token } = await createDoctor({ crm: '98765-SP', name: 'Maria da Silva Souza', verificationStatus: 'pending' });

    // 1) pending não atende
    expect((await api().get('/api/doctor/patients').set(authHeader(token))).body.code).toBe('VERIFICATION_REQUIRED');

    // 2) inicia o KYC (declara o nome do CFM)
    const start = await api().post('/api/doctor/verification').set(authHeader(token));
    expect(start.status).toBe(201);
    expect(start.body.verifyUrl).toBe('https://uaiid.com.br/verify/e2e00001');

    // 3) UaiID aprova a identidade e manda o webhook assinado (payload real do caminho feliz)
    uaiidStatus = 'approved';
    const body = JSON.stringify({ id: 'evt-1', event: 'verification.approved', verification_id: VID, data: { verification_id: VID, score: 830, reason_code: null, full_name: 'MARIA DA SILVA SOUZA', cpf_masked: '123.***.***-09', cpf_situacao: 'REGULAR' } });
    expect((await webhook(body)).status).toBe(200);
    await vi.waitFor(async () => expect((await prisma.doctor.findUnique({ where: { id: doctor.id } }))?.verificationStatus).toBe('needs_admin'));

    // 4) e-mails: dono ("pronto para aprovar") e médico ("Recebemos seu cadastro")
    await vi.waitFor(() => expect(subjects()).toEqual(expect.arrayContaining([expect.stringContaining('pronto para aprovar'), expect.stringContaining('Recebemos seu cadastro')])));

    // 5) a fila mostra o caso com os dois nomes
    const q = await api().get('/api/admin/doctors/verification-queue').set(authHeader(admin.token));
    expect(q.body.review[0]).toMatchObject({ providerId: VID, reasonCode: 'manual_policy', documentName: 'MARIA DA SILVA SOUZA', cfmName: 'MARIA DA SILVA SOUZA', decideIn: 'drexame' });

    // 6) o médico vê "em análise" e segue sem atender
    expect((await api().get('/api/doctor/verification').set(authHeader(token))).body.status).toBe('needs_admin');
    expect((await api().get('/api/doctor/patients').set(authHeader(token))).status).toBe(403);

    // 7) dono aprova → e-mail "já pode atender" → gate abre
    expect((await api().post(`/api/admin/doctors/${doctor.id}/verification/approve`).set(authHeader(admin.token)).send({})).status).toBe(200);
    await vi.waitFor(() => expect(subjects()).toEqual(expect.arrayContaining([expect.stringContaining('já pode atender')])));
    expect((await api().get('/api/doctor/patients').set(authHeader(token))).status).toBe(200);
  });

  it('impostor: identidade real com nome diferente do CFM → fila com nomes lado a lado; dono recusa; evidência sobrevive', async () => {
    const admin = await createAdmin();
    const { doctor, token } = await createDoctor({ crm: '98765-SP', name: 'Maria da Silva Souza', verificationStatus: 'pending' });
    await api().post('/api/doctor/verification').set(authHeader(token));
    uaiidStatus = 'approved';
    const body = JSON.stringify({ id: 'evt-2', event: 'verification.approved', verification_id: VID, data: { verification_id: VID, full_name: 'JOAO PEREIRA LIMA' } });
    await webhook(body);
    await vi.waitFor(async () => expect((await prisma.doctorVerification.findUnique({ where: { providerId: VID } }))?.reasonCode).toBe('name_mismatch'));
    expect((await api().post(`/api/admin/doctors/${doctor.id}/verification/reject`).set(authHeader(admin.token)).send({ reason: 'documento de outra pessoa' })).status).toBe(200);
    await vi.waitFor(() => expect(subjects()).toEqual(expect.arrayContaining([expect.stringContaining('não foi aprovada')])));
    expect((await api().get('/api/doctor/patients').set(authHeader(token))).status).toBe(403);
    await prisma.doctor.delete({ where: { id: doctor.id } }); // dono libera o CRM
    expect(await prisma.doctorVerification.findUnique({ where: { providerId: VID } }))
      .toMatchObject({ doctorId: null, crm: '98765-SP', documentName: 'JOAO PEREIRA LIMA' });
  });

  it('webhook perdido: o job reconcilia pelo GET (sem nome, vale o name_ratio 1)', async () => {
    const { doctor, token } = await createDoctor({ crm: '98765-SP', name: 'Maria da Silva Souza', verificationStatus: 'pending' });
    await api().post('/api/doctor/verification').set(authHeader(token));
    uaiidStatus = 'approved';
    await prisma.doctorVerification.update({ where: { providerId: VID }, data: { lastSyncedAt: new Date(Date.now() - 20 * 60_000) } });
    expect((await runKycReconcile(Date.now())).synced).toBe(1);
    expect((await prisma.doctor.findUnique({ where: { id: doctor.id } }))?.verificationStatus).toBe('needs_admin');
  });

  it('assinatura falsa não muda nada', async () => {
    const { doctor, token } = await createDoctor({ crm: '98765-SP', verificationStatus: 'pending' });
    await api().post('/api/doctor/verification').set(authHeader(token));
    uaiidStatus = 'approved';
    const body = JSON.stringify({ id: 'evt-x', event: 'verification.approved', verification_id: VID, data: { full_name: 'X' } });
    expect((await webhook(body, `t=${Math.floor(Date.now() / 1000)},v1=${'a'.repeat(64)}`)).status).toBe(401);
    expect((await prisma.doctor.findUnique({ where: { id: doctor.id } }))?.verificationStatus).toBe('in_progress');
  });
});
