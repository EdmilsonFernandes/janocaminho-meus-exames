// §15.2 (spec gaps teleconsulta 24/10) — job de CONCILIAÇÃO + fila de exceção, e
// §15.1 — DRY-RUN do diagnóstico de legado. Gatilhos obrigatórios do spec:
//  - job idempotente: 2 rodadas NÃO duplicam exceção;
//  - reparo legado DRY-RUN NÃO escreve (só --apply escreve, condicional);
//  - aprovação via provedor = MESMA approvePendingSubscription dos webhooks (sem
//    efeito financeiro duplicado — sub APPROVED é filtrada na 2ª rodada).
// Sem fake timers: runReconciliation/runDiagnose recebem `now` explícito.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../src/prisma';
import { resetDb, createUser } from './helpers';
import { runReconciliation, enqueueException } from '../src/jobs/reconciliation';
import { runDiagnose, classifyLegacy } from '../scripts/teleconsulta-diagnose';

const MIN = 60_000;
const HOUR = 3_600_000;

/** Teleconsulta fixture (padrão do teleconsulta-reminder-email.test.ts, campos do §15). */
async function seedTele(opts: {
  ownerId: string; patientId: string; dueDate: Date;
  done?: boolean; endedAt?: Date | null; teleStatus?: string | null;
  paidAt?: Date | null; consultPriceCents?: number | null; doctorNote?: string | null;
}) {
  return prisma.reminder.create({
    data: {
      ownerId: opts.ownerId, patientId: opts.patientId, title: 'Teleconsulta',
      dueDate: opts.dueDate, type: 'teleconsulta', consentAt: new Date(),
      notifyOffsetsMin: [0], provider: 'livekit', roomName: 't-rec15',
      done: opts.done ?? false, endedAt: opts.endedAt ?? null,
      teleStatus: opts.teleStatus ?? null,
      paidAt: opts.paidAt ?? null,
      consultPriceCents: opts.consultPriceCents ?? null,
      doctorNote: opts.doctorNote ?? null,
    } as any,
    select: { id: true },
  });
}

/** Subscription PENDING/CANCELLED com a tag 'teleconsulta_<id>' (padrão billing.routes). */
async function seedSub(userId: string, reminderId: string, opts: { status?: string; paymentId?: string; pixExpiresAt?: Date | null; createdAt?: Date } = {}) {
  return prisma.subscription.create({
    data: {
      userId, amount: 120, periodDays: 0, status: opts.status ?? 'PENDING',
      mpPreferenceId: `teleconsulta_${reminderId}`,
      mpPaymentId: opts.paymentId ?? `pay_${reminderId.slice(-6)}`,
      pixExpiresAt: opts.pixExpiresAt ?? null,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    } as any,
    select: { id: true, status: true, mpPaymentId: true },
  });
}

/** Evento de presença auditado (mesma forma que o /join grava). */
async function seedJoin(reminderId: string, role: 'patient' | 'doctor', at: Date) {
  return prisma.auditLog.create({
    data: { actorType: role === 'doctor' ? 'DOCTOR' : 'SYSTEM', action: 'TELECONSULTA_JOIN', targetType: 'REMINDER', targetId: reminderId, after: { role }, createdAt: at },
  });
}

const openExceptions = (kind: string, reminderId: string) =>
  prisma.exceptionQueue.count({ where: { kind, reminderId, status: 'open' } });

// ────────────────────────── Fila de exceção (§14.5 base) ──────────────────────────

describe('enqueueException — dedup por (kind, reminderId, open)', () => {
  beforeEach(resetDb);

  it('2ª chamada não duplica; exception distinta (outro reminder) cria', async () => {
    expect(await enqueueException('teleconsulta_payment_unconfirmed', 'r1', { a: 1 })).toBe(true);
    expect(await enqueueException('teleconsulta_payment_unconfirmed', 'r1', { a: 2 })).toBe(false); // dedup
    expect(await enqueueException('teleconsulta_payment_unconfirmed', 'r2')).toBe(true); // outro reminder
    expect(await enqueueException('teleconsulta_ended_no_summary', 'r1')).toBe(true); // outro kind
    expect(await prisma.exceptionQueue.count({ where: { status: 'open' } })).toBe(3);
  });
});

// ─────────────────── runReconciliation — cenário 1 (pago×consulta) ───────────────────

describe('runReconciliation — cenário 1: pagamento × consulta não atualizada', () => {
  beforeEach(resetDb);

  it('provedor sem query (mp) + vencida relevante → exceção ÚNICA em 2 rodadas (idempotente)', async () => {
    const { user, patient } = await createUser();
    const now = Date.now();
    const tele = await seedTele({ ownerId: user.id, patientId: patient.id, dueDate: new Date(now - 1 * HOUR), consultPriceCents: 12000 });
    await seedSub(user.id, tele.id, { pixExpiresAt: new Date(now - 30 * MIN), createdAt: new Date(now - 1 * HOUR) });

    const r1 = await runReconciliation(now);
    expect(r1.exceptionsCreated).toBe(1);
    const r2 = await runReconciliation(now);
    expect(r2.exceptionsCreated).toBe(0); // dedup — 2ª rodada não duplica
    expect(await openExceptions('teleconsulta_payment_unconfirmed', tele.id)).toBe(1);
    // consulta segue não-paga: o job NUNCA marca pago sem confirmação do provedor
    const after = await prisma.reminder.findUniqueOrThrow({ where: { id: tele.id }, select: { paidAt: true } });
    expect(after.paidAt).toBeNull();
  });

  it('ASAAS RECEIVED (webhook perdido) → aprova consulta+sub; 2ª rodada é no-op (sub APPROVED fora do filtro)', async () => {
    const { user, patient } = await createUser();
    const now = Date.now();
    const tele = await seedTele({ ownerId: user.id, patientId: patient.id, dueDate: new Date(now - 20 * MIN), consultPriceCents: 12000 });
    // CANCELLED: o pix-expiry job pode ter cancelado ANTES do pagamento cair (corrida real)
    const sub = await seedSub(user.id, tele.id, { status: 'CANCELLED' });

    const lookup = vi.fn(async () => 'RECEIVED');
    const r1 = await runReconciliation(now, { asaasPaymentLookup: lookup });
    expect(r1.paymentsReconciled).toBe(1);
    const after = await prisma.reminder.findUniqueOrThrow({ where: { id: tele.id }, select: { paidAt: true, paymentRef: true } });
    expect(after.paidAt).not.toBeNull();
    expect(after.paymentRef).toBe(sub.mpPaymentId);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id }, select: { status: true } })).status).toBe('APPROVED');

    const r2 = await runReconciliation(now, { asaasPaymentLookup: lookup });
    expect(r2.paymentsReconciled).toBe(0); // idempotente: APPROVED não é mais candidata
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: tele.id }, select: { paidAt: true } })).paidAt?.getTime()).toBe(after.paidAt!.getTime());
  });

  it('ASAAS EXPIRED (verificado NÃO pago) → sem aprovação e SEM exceção (estado limpo)', async () => {
    const { user, patient } = await createUser();
    const now = Date.now();
    const tele = await seedTele({ ownerId: user.id, patientId: patient.id, dueDate: new Date(now - 20 * MIN), consultPriceCents: 12000 });
    await seedSub(user.id, tele.id, { status: 'CANCELLED' });
    const r = await runReconciliation(now, { asaasPaymentLookup: async () => 'EXPIRED' });
    expect(r.paymentsReconciled).toBe(0);
    expect(r.exceptionsCreated).toBe(0);
    expect(await openExceptions('teleconsulta_payment_unconfirmed', tele.id)).toBe(0);
  });

  it('consulta JÁ paga com sub PENDING (webhook morreu no meio) → sincroniza a sub, sem duplicar efeito', async () => {
    const { user, patient } = await createUser();
    const now = Date.now();
    const tele = await seedTele({ ownerId: user.id, patientId: patient.id, dueDate: new Date(now - 20 * MIN), consultPriceCents: 12000, paidAt: new Date(now - 10 * MIN) });
    const sub = await seedSub(user.id, tele.id, { status: 'PENDING' });
    const r = await runReconciliation(now);
    expect(r.paymentsReconciled).toBe(1);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id }, select: { status: true } })).status).toBe('APPROVED');
    // paidAt preservado (o updateMany condicional do helper não pisa em já-pago)
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: tele.id }, select: { paidAt: true } })).paidAt?.getTime()).toBe(new Date(now - 10 * MIN).getTime());
    // exceção NÃO criada: nada pendente de revisão
    expect(await prisma.exceptionQueue.count()).toBe(0);
  });
});

// ─────────────── runReconciliation — cenário 4 (encerrada×resumo) ───────────────

describe('runReconciliation — cenário 4: encerrada × resumo não gerado (só fila, nunca gerar)', () => {
  beforeEach(resetDb);

  it('completed há 49h sem doctorNote → exceção ÚNICA em 2 rodadas; com doctorNote não enfileira', async () => {
    const { user, patient } = await createUser();
    const now = Date.now();
    const sem = await seedTele({ ownerId: user.id, patientId: patient.id, dueDate: new Date(now - 50 * HOUR), done: true, endedAt: new Date(now - 49 * HOUR), teleStatus: 'completed', doctorNote: null });
    const com = await seedTele({ ownerId: user.id, patientId: patient.id, dueDate: new Date(now - 50 * HOUR), done: true, endedAt: new Date(now - 49 * HOUR), teleStatus: 'completed', doctorNote: 'Retorno em 30 dias.' });

    await runReconciliation(now);
    await runReconciliation(now);
    expect(await openExceptions('teleconsulta_ended_no_summary', sem.id)).toBe(1); // dedup
    expect(await openExceptions('teleconsulta_ended_no_summary', com.id)).toBe(0);  // tem registro
    // resumo é decisão médica: o job NÃO escreve nada na consulta
    const after = await prisma.reminder.findUniqueOrThrow({ where: { id: sem.id }, select: { doctorNote: true, teleStatus: true } });
    expect(after.doctorNote).toBeNull();
    expect(after.teleStatus).toBe('completed');
  });

  it('completed há pouco (24h) ainda NÃO enfileira (folga de 48h)', async () => {
    const { user, patient } = await createUser();
    const now = Date.now();
    const tele = await seedTele({ ownerId: user.id, patientId: patient.id, dueDate: new Date(now - 25 * HOUR), done: true, endedAt: new Date(now - 24 * HOUR), teleStatus: 'completed' });
    await runReconciliation(now);
    expect(await openExceptions('teleconsulta_ended_no_summary', tele.id)).toBe(0);
  });
});

// ─────────────── §15.1 — diagnóstico de legado + reparo seguro ───────────────

describe('classifyLegacy — classificação pura do legado pré-lifecycle', () => {
  const cfg = { minJointSeconds: 300 };
  const now = 1_764_000_000_000;
  const due = new Date(now - 2 * HOUR);
  const ended = new Date(now - 1 * HOUR);

  it('ambos + jointMs ≥ mínimo → completed; abaixo → technical (nunca completed sem critério)', () => {
    const both = new Set(['patient', 'doctor']);
    expect(classifyLegacy({ dueDate: due, endedAt: ended }, both, 400_000, cfg, now)?.teleStatus).toBe('completed');
    expect(classifyLegacy({ dueDate: due, endedAt: ended }, both, 299_999, cfg, now)?.teleStatus).toBe('technical');
  });
  it('só médico → no_show; só paciente → technical; sem JOIN vencida → no_show', () => {
    expect(classifyLegacy({ dueDate: due, endedAt: ended }, new Set(['doctor']), 0, cfg, now)?.teleStatus).toBe('no_show');
    expect(classifyLegacy({ dueDate: due, endedAt: ended }, new Set(['patient']), 0, cfg, now)?.teleStatus).toBe('technical');
    expect(classifyLegacy({ dueDate: due, endedAt: ended }, new Set(), 0, cfg, now)?.teleStatus).toBe('no_show');
  });
  it('sem JOIN e ainda não vencida → null (inseguro — só reporta)', () => {
    expect(classifyLegacy({ dueDate: new Date(now + 20 * MIN), endedAt: ended }, new Set(), 0, cfg, now)).toBeNull();
  });
});

describe('runDiagnose — DRY-RUN não escreve; --apply repara só o seguro', () => {
  beforeEach(resetDb);

  it('DRY-RUN: reporta ended_sem_done + telestatus_legado, planeja reparo, NÃO escreve nada', async () => {
    const { user, patient } = await createUser();
    const now = Date.now();
    const tele = await seedTele({ ownerId: user.id, patientId: patient.id, dueDate: new Date(now - 90 * MIN), done: false, endedAt: new Date(now - 30 * MIN), teleStatus: null });
    await seedJoin(tele.id, 'patient', new Date(now - 85 * MIN));
    await seedJoin(tele.id, 'doctor', new Date(now - 80 * MIN));

    const noop = () => {};
    const res = await runDiagnose(now, { repair: true, log: noop });
    expect(res.inconsistent).toBe(1);
    expect(res.findings[0].problems).toContain('ended_sem_done');
    expect(res.findings[0].problems).toContain('telestatus_legado');
    expect(res.repairs.length).toBeGreaterThanOrEqual(2); // done=true + classificação
    // DRY-RUN: banco INTACTO
    const after = await prisma.reminder.findUniqueOrThrow({ where: { id: tele.id }, select: { done: true, teleStatus: true, endedAt: true } });
    expect(after.done).toBe(false);
    expect(after.teleStatus).toBeNull();
    expect(await prisma.exceptionQueue.count()).toBe(0);
  });

  it('--apply: done/endedAt coerentes + legado classificado (ambos ≥ 300s → completed); cada reparo rastreável', async () => {
    const { user, patient } = await createUser();
    const now = Date.now();
    const tele = await seedTele({ ownerId: user.id, patientId: patient.id, dueDate: new Date(now - 90 * MIN), done: false, endedAt: new Date(now - 30 * MIN), teleStatus: null });
    await seedJoin(tele.id, 'patient', new Date(now - 85 * MIN));
    await seedJoin(tele.id, 'doctor', new Date(now - 80 * MIN));

    const lines: string[] = [];
    const res = await runDiagnose(now, { repair: true, apply: true, log: (l) => lines.push(l) });
    expect(res.applied).toBe(2);
    const after = await prisma.reminder.findUniqueOrThrow({ where: { id: tele.id }, select: { done: true, teleStatus: true, jointMs: true } });
    expect(after.done).toBe(true);               // (a) coerência
    expect(after.teleStatus).toBe('completed');  // (b) ambos + jointMs (50min) ≥ mínimo
    expect(after.jointMs).toBeGreaterThanOrEqual(300_000);
    // before/after logado p/ rastreabilidade (spec §15.1)
    expect(lines.some((l) => l.startsWith('[repair]') && l.includes('done'))).toBe(true);
    expect(lines.some((l) => l.startsWith('[repair]') && l.includes('teleStatus'))).toBe(true);
  });

  it('paga_sem_atendimento: NUNCA repara — só enfileira revisão humana; paidAt/teleStatus intactos', async () => {
    const { user, patient } = await createUser();
    const now = Date.now();
    const tele = await seedTele({ ownerId: user.id, patientId: patient.id, dueDate: new Date(now - 2 * HOUR), done: true, endedAt: new Date(now - 1 * HOUR), teleStatus: 'no_show', paidAt: new Date(now - 90 * MIN), consultPriceCents: 12000 });

    const res = await runDiagnose(now, { repair: true, apply: true, log: () => {} });
    expect(res.findings[0].problems).toContain('paga_sem_atendimento');
    expect(res.repairs.length).toBe(0); // nada seguro a fazer — dinheiro é decisão humana
    expect(res.enqueued).toBe(1);
    expect(await openExceptions('teleconsulta_paid_no_atendimento', tele.id)).toBe(1);
    const after = await prisma.reminder.findUniqueOrThrow({ where: { id: tele.id }, select: { paidAt: true, teleStatus: true } });
    expect(after.paidAt?.getTime()).toBe(new Date(now - 90 * MIN).getTime()); // intocado
    expect(after.teleStatus).toBe('no_show'); // intocado
  });

  it('pix_vencida_sem_pagamento (402-eterna) é reportada; done_sem_ended recebe endedAt sintético', async () => {
    const { user, patient } = await createUser();
    const now = Date.now();
    const pendente = await seedTele({ ownerId: user.id, patientId: patient.id, dueDate: new Date(now - 2 * HOUR), consultPriceCents: 12000 }); // nunca paga, vencida
    const doneSemEnd = await seedTele({ ownerId: user.id, patientId: patient.id, dueDate: new Date(now - 2 * HOUR), done: true, endedAt: null });

    const res = await runDiagnose(now, { repair: true, apply: true, log: () => {} });
    const probs = Object.fromEntries(res.findings.map((f) => [f.id, f.problems]));
    expect(probs[pendente.id]).toContain('pix_vencida_sem_pagamento');
    expect(probs[doneSemEnd.id]).toContain('done_sem_ended');
    // 402-eterna: sem exceção automática (dúplice com o job §15.2; política humana)
    expect(await openExceptions('teleconsulta_paid_no_atendimento', pendente.id)).toBe(0);
    // done_sem_ended → endedAt = dueDate+30min (régua do auto-end), já no passado
    const after = await prisma.reminder.findUniqueOrThrow({ where: { id: doneSemEnd.id }, select: { endedAt: true } });
    expect(after.endedAt?.getTime()).toBe(new Date(now - 2 * HOUR + 30 * MIN).getTime());
  });
});
