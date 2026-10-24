// MATRIZ §18.10 — ONDA 3: interfaces financeiras (§18.1 médico + §18.8 admin).
// Derivado dos seeds de finance-ledger.test.ts (mesma snapshot congelada):
//  · summary: buckets previsto/em_validação/liberado/estornado batem (em honorários)
//  · período = data da CONSULTA (dueDate) — fora da janela não entra
//  · MÉDICO SÓ VÊ O PRÓPRIO: A não enxerga consultas de B (summary/statement/CSV)
//  · statement: campos por consulta + filtro status + CSV sem dado clínico
//  · payout-details: mascaramento, senha atual obrigatória, audit da troca
//  · admin overview: 403 não-admin; números derivam do ledger; filtro por médico
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/livekit', () => ({
  hasLiveKitConfig: vi.fn(() => true),
  buildJoinToken: vi.fn(async () => 'mock-join-token'),
  createLiveKitRoom: vi.fn(async () => undefined),
}));

import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma';
import { api, createUser, createDoctor, resetDb, authHeader, mpResponse, mintToken } from './helpers';
import { loadSettings } from '../src/utils/settings';
import { recordTeleconsultaPayment, recordTeleconsultaEnded } from '../src/finance/ledger';
import { enqueueException } from '../src/jobs/reconciliation';

const fetchMock = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
const H2 = (t: string) => ({ Authorization: `Bearer ${t}` });
const DAY = 86_400_000;
let seedSeq = 0;

// Snapshot congelada (mesma do agendamento real — 20% plataforma, D+3, piso R$ 20).
const SNAP = { ruleId: null, platformBps: 2000, feeBearer: 'platform', releaseDelayDays: 3, minPayoutCents: 2000 };

async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({
    data: { email: `admin-fin3-${Date.now().toString(36)}-${seedSeq++}@exemplo.com`, name: 'Admin Fin', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true },
    select: { id: true },
  });
  return { token: mintToken(u.id) };
}

interface SeedOpts {
  doctorId: string; ownerId: string; patientId: string;
  priceCents: number; dueDate: Date; paidAt: Date;
  teleStatus?: string | null; releaseEligibleAt?: Date | null; title?: string;
}

/** Teleconsulta paga com ledger REAL (payment + evento de fim conforme teleStatus). */
async function seedTele(o: SeedOpts) {
  const r = await prisma.reminder.create({
    data: {
      patientId: o.patientId, ownerId: o.ownerId, title: o.title ?? 'Consulta particular',
      dueDate: o.dueDate, type: 'teleconsulta', createdByDoctorId: o.doctorId,
      consultPriceCents: o.priceCents, paidAt: o.paidAt, paymentRef: `pay_${seedSeq++}`,
      teleStatus: o.teleStatus ?? null, commissionSnapshot: SNAP as any,
      ...(o.releaseEligibleAt !== undefined ? { releaseEligibleAt: o.releaseEligibleAt } : {}),
    },
    select: { id: true },
  });
  await recordTeleconsultaPayment(r.id);
  if (o.teleStatus) await recordTeleconsultaEnded(r.id, o.teleStatus);
  return r;
}

describe('finance: §18.1 rotas do médico (E2E)', () => {
  let docA: { doctor: any; token: string };
  let docB: { doctor: any; token: string };
  let base: Awaited<ReturnType<typeof createUser>>;
  const now = () => new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  beforeEach(async () => {
    await resetDb();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({}));
    await loadSettings();
    docA = await createDoctor({ crm: `${70001 + seedSeq++}-SP` });
    docB = await createDoctor({ crm: `${80001 + seedSeq++}-SP` });
    base = await createUser();
  });

  it('summary: buckets por situação (honorários) + próximo repasse; período = data da consulta', async () => {
    // A: previsto (pago, não realizada) — honorários estimados 80% de R$ 100
    await seedTele({ doctorId: docA.doctor.id, ownerId: base.user.id, patientId: base.patient.id, priceCents: 10_000, dueDate: now(), paidAt: now(), teleStatus: null, releaseEligibleAt: new Date(now().getTime() + 3 * DAY) });
    // A: em validação (concluída, libera D+3 futuro) — R$ 160
    await seedTele({ doctorId: docA.doctor.id, ownerId: base.user.id, patientId: base.patient.id, priceCents: 20_000, dueDate: now(), paidAt: now(), teleStatus: 'completed', releaseEligibleAt: new Date(now().getTime() + DAY) });
    // A: liberado (concluída, elegibilidade passada) — R$ 240
    await seedTele({ doctorId: docA.doctor.id, ownerId: base.user.id, patientId: base.patient.id, priceCents: 30_000, dueDate: now(), paidAt: now(), teleStatus: 'completed', releaseEligibleAt: new Date(now().getTime() - DAY) });
    // A: estornado (no_show pago → reserva; honorários 0)
    await seedTele({ doctorId: docA.doctor.id, ownerId: base.user.id, patientId: base.patient.id, priceCents: 15_000, dueDate: now(), paidAt: now(), teleStatus: 'no_show', releaseEligibleAt: new Date(now().getTime() - DAY) });
    // A: FORA do período (dueDate 60d atrás) — não entra no default 30d
    const fora = await seedTele({ doctorId: docA.doctor.id, ownerId: base.user.id, patientId: base.patient.id, priceCents: 99_000, dueDate: new Date(now().getTime() - 60 * DAY), paidAt: new Date(now().getTime() - 60 * DAY), teleStatus: 'completed', releaseEligibleAt: new Date(now().getTime() - 59 * DAY) });
    // B: liberado — só B vê
    await seedTele({ doctorId: docB.doctor.id, ownerId: base.user.id, patientId: base.patient.id, priceCents: 50_000, dueDate: now(), paidAt: now(), teleStatus: 'completed', releaseEligibleAt: new Date(now().getTime() - DAY) });

    const r = await api().get('/api/doctor/finance/summary').set(H2(docA.token));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ previstosCents: 8_000, emValidacaoCents: 16_000, liberadosCents: 24_000, emProcessamentoCents: 0, repassadosCents: 0, estornadosCents: 15_000 });
    expect(r.body.periodoBase).toBe('data_da_consulta');
    // Liberado (R$ 240) ≥ piso (R$ 20) → próximo repasse disponível agora
    expect(r.body.proximoRepasse).toMatchObject({ valorEstimadoCents: 24_000 });
    expect(new Date(r.body.proximoRepasse.quando).getTime()).toBeGreaterThan(Date.now() - 60_000);

    // Janela de 90d inclui a consulta antiga
    const wide = await api().get(`/api/doctor/finance/summary?from=${iso(new Date(now().getTime() - 90 * DAY))}&to=${iso(now())}`).set(H2(docA.token));
    expect(wide.status).toBe(200);
    expect(wide.body.liberadosCents).toBe(24_000 + 79_200);
    expect(wide.body.rows).toBeUndefined();

    // Isolamento (§18.10): B só vê os próprios R$ 400
    const rb = await api().get('/api/doctor/finance/summary').set(H2(docB.token));
    expect(rb.status).toBe(200);
    expect(rb.body).toMatchObject({ previstosCents: 0, emValidacaoCents: 0, liberadosCents: 40_000, estornadosCents: 0 });
    expect(fora.id).toBeTruthy();
  });

  it('summary: próximo repasse espera a liberação cruzar o piso (estimativa)', async () => {
    // Em validação: R$ 16 de honorários liberáveis amanhã — piso de repasse é R$ 20
    await seedTele({ doctorId: docA.doctor.id, ownerId: base.user.id, patientId: base.patient.id, priceCents: 2_000, dueDate: now(), paidAt: now(), teleStatus: 'completed', releaseEligibleAt: new Date(now().getTime() + DAY) });
    const r1 = await api().get('/api/doctor/finance/summary').set(H2(docA.token));
    expect(r1.body.proximoRepasse).toBeNull(); // 1_600 < 2_000
    // + outra em validação no mesmo dia → soma cruza o piso
    await seedTele({ doctorId: docA.doctor.id, ownerId: base.user.id, patientId: base.patient.id, priceCents: 2_000, dueDate: now(), paidAt: now(), teleStatus: 'completed', releaseEligibleAt: new Date(now().getTime() + DAY) });
    const r2 = await api().get('/api/doctor/finance/summary').set(H2(docA.token));
    expect(r2.body.proximoRepasse).toMatchObject({ valorEstimadoCents: 3_200 }); // 1_600 × 2 ≥ 2_000
    expect(new Date(r2.body.proximoRepasse.quando).getTime()).toBeGreaterThan(Date.now());
  });

  it('statement: linha por consulta com split da snapshot + filtro status + CSV sem dado clínico', async () => {
    const liberado = await seedTele({ doctorId: docA.doctor.id, ownerId: base.user.id, patientId: base.patient.id, priceCents: 30_000, dueDate: now(), paidAt: now(), teleStatus: 'completed', releaseEligibleAt: new Date(now().getTime() - DAY), title: 'Retorno cardiológico' });
    await seedTele({ doctorId: docA.doctor.id, ownerId: base.user.id, patientId: base.patient.id, priceCents: 10_000, dueDate: now(), paidAt: now(), teleStatus: null, releaseEligibleAt: new Date(now().getTime() + 3 * DAY) });
    await seedTele({ doctorId: docB.doctor.id, ownerId: base.user.id, patientId: base.patient.id, priceCents: 50_000, dueDate: now(), paidAt: now(), teleStatus: 'completed', releaseEligibleAt: new Date(now().getTime() - DAY) });

    const r = await api().get('/api/doctor/finance/statement').set(H2(docA.token));
    expect(r.status).toBe(200);
    expect(r.body.rows).toHaveLength(2); // isolamento: nada de B
    const row = r.body.rows.find((x: any) => x.reminderId === liberado.id);
    expect(row).toMatchObject({
      title: 'Retorno cardiológico', valorContratadoCents: 30_000, descontosCents: 0, baseCents: 30_000,
      platformBps: 2000, taxaPlataformaCents: 6_000, honorariosCents: 24_000, statusFinanceiro: 'liberado',
    });
    const previsto = r.body.rows.find((x: any) => x.statusFinanceiro === 'previsto');
    expect(previsto.honorariosCents).toBe(8_000); // estimativa (§18.2 — antes de contratar/realizar)

    // Filtro por situação
    const f = await api().get('/api/doctor/finance/statement?status=liberado').set(H2(docA.token));
    expect(f.body.rows).toHaveLength(1);
    expect(f.body.rows[0].reminderId).toBe(liberado.id);

    // CSV: header pt-BR + valores formatados + NADA de B (R$ 400,00) + sem nota clínica
    const csv = await api().get('/api/doctor/finance/statement?format=csv').set(H2(docA.token));
    expect(csv.status).toBe(200);
    expect(String(csv.headers['content-type'])).toContain('text/csv');
    const text = csv.text;
    expect(text).toContain('Data da consulta;Consulta;Situação');
    expect(text).toContain('R$ 240,00');
    expect(text).toContain('Retorno cardiológico');
    expect(text).not.toContain('R$ 400,00'); // isolamento no export
    expect(text).not.toContain('doctorNote');
  });

  it('payout-details: mascarada, senha atual obrigatória (auth reforçada §18.5) + audit', async () => {
    const g0 = await api().get('/api/doctor/finance/payout-details').set(H2(docA.token));
    expect(g0.status).toBe(200);
    expect(g0.body).toMatchObject({ hasPixKey: false, pixKeyMasked: null, pixKeyType: null });

    // Sem senha → 400
    const noPwd = await api().put('/api/doctor/finance/payout-details').set(H2(docA.token)).send({ pixKey: '11999999999', pixKeyType: 'phone' });
    expect(noPwd.status).toBe(400);
    // Senha errada → 403 (auth reforçada)
    const wrong = await api().put('/api/doctor/finance/payout-details').set(H2(docA.token)).send({ currentPassword: 'errada', pixKey: '11999999999', pixKeyType: 'phone' });
    expect(wrong.status).toBe(403);
    // Tipo inválido → 400
    const badType = await api().put('/api/doctor/finance/payout-details').set(H2(docA.token)).send({ currentPassword: 'senha123', pixKey: 'x', pixKeyType: 'pix' });
    expect(badType.status).toBe(400);

    // Troca OK → resposta MASCARADA (nunca a chave completa)
    const ok = await api().put('/api/doctor/finance/payout-details').set(H2(docA.token)).send({ currentPassword: 'senha123', pixKey: 'dr.financeiro@exemplo.com', pixKeyType: 'email' });
    expect(ok.status).toBe(200);
    expect(ok.body.pixKeyMasked).toBe('****@***.com');
    expect(JSON.stringify(ok.body)).not.toContain('dr.financeiro@exemplo.com');

    // GET volta mascarada + histórico de troca (audit)
    const g1 = await api().get('/api/doctor/finance/payout-details').set(H2(docA.token));
    expect(g1.body).toMatchObject({ hasPixKey: true, pixKeyMasked: '****@***.com', pixKeyType: 'email' });
    expect(g1.body.changes).toHaveLength(1);
    expect(g1.body.changes[0].after).toBe('****@***.com');

    // Audit registrado (§18.5) — antes/depois mascarados, ator = o médico
    const log = await prisma.auditLog.findFirst({ where: { action: 'TELECONSULTA_PAYOUT_DETAILS_CHANGED', targetId: docA.doctor.id } });
    expect(log?.actorId).toBe(docA.doctor.id);
    expect((log?.after as any)?.pixKeyMasked).toBe('****@***.com');
    expect(JSON.stringify(log)).not.toContain('dr.financeiro@exemplo.com');

    // Isolamento: B não vê a chave de A
    const gb = await api().get('/api/doctor/finance/payout-details').set(H2(docB.token));
    expect(gb.body.hasPixKey).toBe(false);
  });

  it('admin overview §18.8: 403 não-admin; números derivam do ledger; filtro por médico; divergências', async () => {
    // Mesmas seeds do summary (A: 10k previsto / 20k validação / 30k liberado / 15k estornado; B: 50k)
    await seedTele({ doctorId: docA.doctor.id, ownerId: base.user.id, patientId: base.patient.id, priceCents: 10_000, dueDate: now(), paidAt: now(), teleStatus: null, releaseEligibleAt: new Date(now().getTime() + 3 * DAY) });
    await seedTele({ doctorId: docA.doctor.id, ownerId: base.user.id, patientId: base.patient.id, priceCents: 20_000, dueDate: now(), paidAt: now(), teleStatus: 'completed', releaseEligibleAt: new Date(now().getTime() + DAY) });
    await seedTele({ doctorId: docA.doctor.id, ownerId: base.user.id, patientId: base.patient.id, priceCents: 30_000, dueDate: now(), paidAt: now(), teleStatus: 'completed', releaseEligibleAt: new Date(now().getTime() - DAY) });
    await seedTele({ doctorId: docA.doctor.id, ownerId: base.user.id, patientId: base.patient.id, priceCents: 15_000, dueDate: now(), paidAt: now(), teleStatus: 'no_show', releaseEligibleAt: new Date(now().getTime() - DAY) });
    await seedTele({ doctorId: docB.doctor.id, ownerId: base.user.id, patientId: base.patient.id, priceCents: 50_000, dueDate: now(), paidAt: now(), teleStatus: 'completed', releaseEligibleAt: new Date(now().getTime() - DAY) });
    await enqueueException('teleconsulta_finance_divergence', 'rem_div_1', { reason: 'test' });

    // Não-admin → 403
    const forbidden = await api().get('/api/admin/finance/overview').set(authHeader(base.token));
    expect(forbidden.status).toBe(403);

    const admin = await createAdmin();
    const r = await api().get('/api/admin/finance/overview').set(H2(admin.token));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      volumeBrutoCents: 125_000, // GMV: tudo que pacientes pagaram (NÃO é receita)
      aDevolverCents: 15_000, // no_show reservado p/ estorno
      obrigacoesMedicosCents: 80_000, // 16k+24k+40k — só o que CONCLUIU (previsto ainda não é obrigação)
      receitaPlataformaCents: 20_000, // 20% dos concluídos (4k+6k+10k)
      taxasCents: 0,
      margemContribuicaoCents: 20_000,
      caixaAsaasCents: null, // onda 4 — declarado, nunca 0 falso
      divergenciasAbertas: 1,
      ultimaConciliacao: null,
    });
    expect(r.body.seriePorDia.length).toBeGreaterThanOrEqual(1);
    expect(r.body.seriePorDia.at(-1)).toMatchObject({ volumeCents: expect.any(Number), receitaCents: expect.any(Number) });
    expect(r.body.divergencias[0]).toMatchObject({ kind: 'teleconsulta_finance_divergence', reminderId: 'rem_div_1' });

    // Filtro por médico: só as consultas de A
    const fa = await api().get(`/api/admin/finance/overview?doctorId=${docA.doctor.id}`).set(H2(admin.token));
    expect(fa.status).toBe(200);
    expect(fa.body).toMatchObject({ volumeBrutoCents: 75_000, obrigacoesMedicosCents: 40_000, receitaPlataformaCents: 10_000, aDevolverCents: 15_000 });
  });
});
