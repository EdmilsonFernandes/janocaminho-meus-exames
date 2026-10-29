// E2E (supertest + tick direto) — FILA DE TELECONSULTA IMEDIATA ("Falar agora", 27/10/26):
// spec docs/design/2026-10-27-fila-imediata-spec.md §2 (rotas) + §3 (tick) + §8 (estes 14).
// utils/livekit MOCKADO (match/join nunca saem da rede). O relógio do tick é INJETADO
// (runTeleconsultaQueueTick(new Date(...))) — cenários de expiração são semeados com datas
// absolutas, sem fake timers. Padrões: itR retry 2 (DB compartilhado entre arquivos) e
// fetch global mockado p/ o PIX do match (mesma família do teleconsulta-payment.test).
import { describe, it, expect, beforeEach, afterAll, vi, type Mock } from 'vitest';

vi.mock('../src/utils/livekit', () => ({
  hasLiveKitConfig: vi.fn(() => true),
  buildJoinToken: vi.fn(async () => 'mock-join-token'),
  createLiveKitRoom: vi.fn(async () => undefined),
}));

import { prisma } from '../src/prisma';
import { loadSettings } from '../src/utils/settings';
import { runTeleconsultaQueueTick } from '../src/jobs/teleconsultaQueue';
import { api, createUser, createDoctor, resetDb, authHeader, mpResponse } from './helpers';

const fetchMock = () => globalThis.fetch as unknown as Mock;
const H = (t: string) => ({ Authorization: `Bearer ${t}` });

// itR = retry 2: DB de teste é COMPARTILHADO entre arquivos paralelos do vitest —
// truncation cruzada gera flakes AMBIENTAIS (padrão medications.test.ts).
const itR = (n: string, f: () => Promise<void>) => it(n, { retry: 2 }, f);

let seq = 0;
const crm = () => `${70000 + (seq++ % 9000)}-SP`;

/** Presença online com heartbeat fresco (offsets em ms relativos ao "agora" real). */
async function seedPresence(doctorId: string, opts: { online?: boolean; heartbeatAgoMs?: number } = {}) {
  const online = opts.online ?? true;
  const hb = new Date(Date.now() - (opts.heartbeatAgoMs ?? 0));
  await prisma.doctorOnlinePresence.upsert({
    where: { doctorId },
    update: { online, lastHeartbeatAt: hb, lastOnlineAt: hb },
    create: { doctorId, online, lastHeartbeatAt: hb, lastOnlineAt: hb },
  });
}

/** Entrada na fila semeada DIRETO no banco (relógio controlado pelo teste). */
async function seedEntry(ownerId: string, patientId: string, opts: {
  maxPriceCents?: number | null;
  enteredAgoMin?: number;
  status?: string;
  matchedDoctorId?: string | null;
  reminderId?: string | null;
  offerExpiresAt?: Date | null;
  attempts?: number;
} = {}) {
  const now = Date.now();
  return prisma.teleconsultaQueue.create({
    data: {
      ownerId, patientId, consentAt: new Date(now - 10 * 60_000),
      maxPriceCents: opts.maxPriceCents ?? null,
      enteredAt: new Date(now - (opts.enteredAgoMin ?? 0) * 60_000),
      status: opts.status ?? 'waiting',
      matchedDoctorId: opts.matchedDoctorId ?? null,
      reminderId: opts.reminderId ?? null,
      offerExpiresAt: opts.offerExpiresAt ?? null,
      attempts: opts.attempts ?? 0,
    },
    select: { id: true, status: true, attempts: true, enteredAt: true },
  });
}

/** Teleconsulta "de match" semeada (mesma forma que o tick cria). */
async function seedMatchReminder(ownerId: string, patientId: string, doctorId: string, opts: { consultPriceCents?: number | null; endedAt?: Date | null; teleStatus?: string; noShowBy?: string; paidAt?: Date | null } = {}) {
  const id = `rm-${Date.now().toString(36)}-${seq++}`;
  await prisma.reminder.create({
    data: {
      id, ownerId, patientId, title: 'Consulta imediata', dueDate: new Date(),
      type: 'teleconsulta', provider: 'livekit', roomName: `teleconsulta-${id}`,
      teleStatus: opts.teleStatus ?? 'scheduled', consentAt: new Date(),
      consultPriceCents: opts.consultPriceCents ?? null, createdByDoctorId: doctorId,
      notifyOffsetsMin: [], endedAt: opts.endedAt ?? null, noShowBy: opts.noShowBy ?? null,
      paidAt: opts.paidAt ?? null,
    } as any,
  });
  return id;
}

/** Share efêmero do match (marker convenio='fila-imediata'). */
async function seedEphemeralShare(patientId: string, doctorId: string, active = true) {
  return prisma.doctorShare.create({
    data: { patientId, doctorId, scopes: ['summary', 'exams'], convenio: 'fila-imediata', active, creditsCharged: 0, openQuestionLimit: 0, examIds: [] },
    select: { id: true, active: true, revokedAt: true },
  });
}

const entryOf = (id: string) => prisma.teleconsultaQueue.findUnique({
  where: { id }, select: { id: true, status: true, attempts: true, matchedDoctorId: true, reminderId: true, cancelReason: true, enteredAt: true },
});

describe('Fila imediata — rotas + tick (spec 2026-10-27 §2/§3/§8)', () => {
  beforeEach(async () => {
    await resetDb();
    await loadSettings(); // repõe defaults (resetDb truncou app_settings)
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({})); // default seguro p/ qualquer fetch
  });
  afterAll(() => { vi.restoreAllMocks(); });

  // 1 ─ entra na fila; 2ª entrada ativa → 409 QUEUE_ACTIVE
  itR('POST entra na fila (201 waiting) e bloqueia duplicata ativa (409 QUEUE_ACTIVE)', async () => {
    const { user, patient, token } = await createUser();
    const first = await api().post('/api/teleconsulta-queue').set(H(token)).send({ patientId: patient.id, consent: true });
    expect(first.status).toBe(201);
    expect(first.body.entry).toMatchObject({ status: 'waiting' });
    expect(first.body.entry.maxPriceCents).toBeNull();

    const dup = await api().post('/api/teleconsulta-queue').set(H(token)).send({ patientId: patient.id, consent: true });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('QUEUE_ACTIVE');
    // 1 entrada ativa por paciente no banco
    expect(await prisma.teleconsultaQueue.count({ where: { patientId: patient.id, status: 'waiting' } })).toBe(1);
    // Audit da entrada (consent Art.15 auditável) + push neutro de confirmação
    expect(await prisma.auditLog.count({ where: { action: 'QUEUE_ENTER', targetId: patient.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: user.id, type: 'teleconsulta-queue' } })).toBe(1);
  });

  // 2 ─ sem consent → 400 CONSENT_REQUIRED (nada criado)
  itR('POST sem consent=true → 400 CONSENT_REQUIRED e nenhuma entrada', async () => {
    const { patient, token } = await createUser();
    const res = await api().post('/api/teleconsulta-queue').set(H(token)).send({ patientId: patient.id, consent: false });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CONSENT_REQUIRED');
    expect(await prisma.teleconsultaQueue.count()).toBe(0);
    // paciente de OUTRO dono → 404 (não vaza existência)
    const other = await createUser();
    const res2 = await api().post('/api/teleconsulta-queue').set(H(token)).send({ patientId: other.patient.id, consent: true });
    expect(res2.status).toBe(404);
  });

  // 3 ─ toggle de presença + heartbeat + expiração 90s + reativação <5min
  itR('PUT online-presence + heartbeat + tick expira presença (90s) + heartbeat reativa (<5min)', async () => {
    const { doctor, token } = await createDoctor({ crm: crm() });
    const on = await api().put('/api/doctor/online-presence').set(H(token)).send({ online: true });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ online: true, doctorsOnline: 1 });

    const hb = await api().post('/api/doctor/online-presence/heartbeat').set(H(token)).send({});
    expect(hb.status).toBe(200);
    expect(hb.body).toMatchObject({ ok: true, online: true });

    // Passo 1 do tick: heartbeat >90s → offline
    await runTeleconsultaQueueTick(new Date(Date.now() + 91_000));
    const p1 = await prisma.doctorOnlinePresence.findUnique({ where: { doctorId: doctor.id }, select: { online: true } });
    expect(p1?.online).toBe(false);

    // Heartbeat DENTRO dos 5min da última batida → REATIVA (sem novo toggle)
    const hb2 = await api().post('/api/doctor/online-presence/heartbeat').set(H(token)).send({});
    expect(hb2.status).toBe(200);
    expect(hb2.body.online).toBe(true);

    // OFF desliga presença + audita PRESENCE_TOGGLE
    const off = await api().put('/api/doctor/online-presence').set(H(token)).send({ online: false });
    expect(off.status).toBe(200);
    expect(off.body.online).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: 'PRESENCE_TOGGLE', actorId: doctor.id } })).toBeGreaterThanOrEqual(2);
  });

  // 4 ─ tick faz o match: Reminder + share efêmero + offer 45s + FIFO attempts
  itR('tick cria Reminder (Consulta imediata/livekit) + share efêmero + offer de 45s', async () => {
    const { user, patient } = await createUser();
    const { doctor } = await createDoctor({ crm: crm(), name: 'Ana' });
    await seedPresence(doctor.id);
    const entry = await seedEntry(user.id, patient.id);

    const now = new Date();
    const report = await runTeleconsultaQueueTick(now);
    expect(report.matched).toBe(1);

    const row = await entryOf(entry.id);
    expect(row?.status).toBe('matched');
    expect(row?.matchedDoctorId).toBe(doctor.id);
    expect(row?.attempts).toBe(1);
    expect(row?.reminderId).toBeTruthy();
    // deadline = now + queueOfferTtlSec (45s default)
    const matched = await prisma.teleconsultaQueue.findUnique({ where: { id: entry.id }, select: { offerExpiresAt: true } });
    expect(Math.abs(matched!.offerExpiresAt!.getTime() - (now.getTime() + 45_000))).toBeLessThan(2_000);

    const r = await prisma.reminder.findUnique({ where: { id: row!.reminderId! }, select: { type: true, title: true, provider: true, roomName: true, teleStatus: true, consentAt: true, consultPriceCents: true, createdByDoctorId: true } });
    expect(r).toMatchObject({ type: 'teleconsulta', title: 'Consulta imediata', provider: 'livekit', teleStatus: 'scheduled', createdByDoctorId: doctor.id });
    expect(r?.roomName).toBe(`teleconsulta-${row!.reminderId}`);
    expect(r?.consentAt).toBeTruthy(); // consent da ENTRADA persistido no ato (CFM 2.314)

    const share = await prisma.doctorShare.findFirst({ where: { patientId: patient.id, doctorId: doctor.id }, select: { convenio: true, active: true, scopes: true } });
    expect(share).toMatchObject({ convenio: 'fila-imediata', active: true });
    expect(share?.scopes).toEqual(expect.arrayContaining(['summary', 'exams']));

    // Push neutro do match (sem dado clínico; data só type+reminderId) + audit MATCH
    const push = await prisma.notification.findFirst({ where: { userId: user.id, type: 'teleconsulta' } });
    expect(push?.title).toBe('✓ Dr. Ana vai te atender');
    expect(push?.data).toEqual({ type: 'teleconsulta', reminderId: row!.reminderId });
    expect(await prisma.auditLog.count({ where: { action: 'QUEUE_MATCH', targetId: row!.reminderId } })).toBe(1);
  });

  // 5 ─ médico com teleconsulta na janela slotMin NÃO recebe offer
  itR('médico em atendimento (teleconsulta na janela ±slotMin) não recebe offer', async () => {
    const { user, patient } = await createUser();
    const { doctor } = await createDoctor({ crm: crm() });
    await seedPresence(doctor.id);
    await seedMatchReminder(user.id, patient.id, doctor.id); // dueDate=agora → janela ocupada
    const entry = await seedEntry(user.id, patient.id);

    await runTeleconsultaQueueTick(new Date());
    const row = await entryOf(entry.id);
    expect(row?.status).toBe('waiting'); // ninguém elegível — segue na fila
    expect(row?.matchedDoctorId).toBeNull();
    expect(await prisma.reminder.count({ where: { type: 'teleconsulta' } })).toBe(1); // só a ocupante
  });

  // 6 ─ offer vencida sem aceite → volta a waiting com attempts+1 (e limpa o casamento)
  itR('offer expirada volta a waiting com attempts+1; Reminder e share da offer são limpos', async () => {
    const { user, patient } = await createUser();
    const { doctor } = await createDoctor({ crm: crm() });
    const { doctor: other } = await createDoctor({ crm: crm() });
    await seedPresence(other.id); // há outros médicos online → não desiste da entrada
    const reminderId = await seedMatchReminder(user.id, patient.id, doctor.id);
    await seedEphemeralShare(patient.id, doctor.id);
    const entry = await seedEntry(user.id, patient.id, {
      status: 'matched', matchedDoctorId: doctor.id, reminderId,
      offerExpiresAt: new Date(Date.now() - 1_000), attempts: 1,
    });

    const report = await runTeleconsultaQueueTick(new Date());
    expect(report.offersExpired).toBe(1);
    const row = await entryOf(entry.id);
    expect(row?.status).toBe('waiting');
    expect(row?.attempts).toBe(2);
    expect(row?.matchedDoctorId).toBeNull();
    // FIFO preservado: enteredAt intacto
    expect(row?.enteredAt.getTime()).toBe(entry.enteredAt.getTime());
    // Teleconsulta não paga/aberta da offer morta foi removida; share efêmero revogado
    expect(await prisma.reminder.findUnique({ where: { id: reminderId } })).toBeNull();
    const share = await prisma.doctorShare.findFirst({ where: { patientId: patient.id, doctorId: doctor.id }, select: { active: true, revokedAt: true } });
    expect(share?.active).toBe(false);
    expect(share?.revokedAt).toBeTruthy();
  });

  // 7 ─ 3ª offer perdida → expired 'no_accept' + share revogado + push de expiração
  itR('3 offers perdidas → entrada expired (no_accept) + share revogado + notificação', async () => {
    const { user, patient } = await createUser();
    const { doctor } = await createDoctor({ crm: crm() });
    const { doctor: other } = await createDoctor({ crm: crm() });
    await seedPresence(other.id); // ainda há médicos — mas attempts≥3 desiste
    const reminderId = await seedMatchReminder(user.id, patient.id, doctor.id);
    await seedEphemeralShare(patient.id, doctor.id);
    const entry = await seedEntry(user.id, patient.id, {
      status: 'matched', matchedDoctorId: doctor.id, reminderId,
      offerExpiresAt: new Date(Date.now() - 1_000), attempts: 2,
    });

    const report = await runTeleconsultaQueueTick(new Date());
    expect(report.entriesExpired).toBe(1);
    const row = await entryOf(entry.id);
    expect(row?.status).toBe('expired');
    expect(row?.cancelReason).toBe('no_accept');
    expect(row?.attempts).toBe(3);
    expect(await prisma.reminder.findUnique({ where: { id: reminderId } })).toBeNull();
    const share = await prisma.doctorShare.findFirst({ where: { patientId: patient.id, doctorId: doctor.id }, select: { active: true } });
    expect(share?.active).toBe(false);
    // §4 Expirou — push neutro + audit
    expect(await prisma.notification.count({ where: { userId: user.id, title: 'Atendimento imediato indisponível' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'QUEUE_EXPIRE', targetId: entry.id } })).toBe(1);
  });

  // 8 ─ corrida: 2 ticks no mesmo instante → 1 offer apenas (advisory lock + partial unique)
  itR('ticks concorrentes → exatamente 1 offer (attempts=1, 1 Reminder)', async () => {
    const { user, patient } = await createUser();
    const { doctor } = await createDoctor({ crm: crm() });
    await seedPresence(doctor.id);
    const entry = await seedEntry(user.id, patient.id);

    await Promise.all([
      runTeleconsultaQueueTick(new Date()),
      runTeleconsultaQueueTick(new Date(Date.now() + 5)),
    ]);
    const row = await entryOf(entry.id);
    expect(row?.status).toBe('matched');
    expect(row?.attempts).toBe(1); // só UM ofereceu
    expect(await prisma.reminder.count({ where: { type: 'teleconsulta', title: 'Consulta imediata' } })).toBe(1);
    // 1 offer por médico: nenhuma segunda entrada matched pro mesmo médico
    expect(await prisma.teleconsultaQueue.count({ where: { status: 'matched', matchedDoctorId: doctor.id } })).toBe(1);
  });

  // 9 ─ preço do médico acima do teto → médico pulado; grátis sempre elegível
  itR('preço do médico > maxPriceCents pula o médico (grátis continua elegível)', async () => {
    const { user, patient } = await createUser();
    const { doctor: caro } = await createDoctor({ crm: crm() });
    const { doctor: gratis } = await createDoctor({ crm: crm() });
    await prisma.doctor.update({ where: { id: caro.id }, data: { consultPriceCents: 50000 } });
    await seedPresence(caro.id);
    await seedPresence(gratis.id);
    const entry = await seedEntry(user.id, patient.id, { maxPriceCents: 2000 });

    await runTeleconsultaQueueTick(new Date());
    const row = await entryOf(entry.id);
    expect(row?.status).toBe('matched');
    expect(row?.matchedDoctorId).toBe(gratis.id); // caro (R$500) foi pulado
    expect(await prisma.reminder.findUnique({ where: { id: row!.reminderId! } }).then((r) => r?.consultPriceCents)).toBeNull();

    // maxPriceCents null = só grátis: médico pago NUNCA casa
    const p2 = await createUser();
    const { doctor: pago } = await createDoctor({ crm: crm() });
    await prisma.doctor.update({ where: { id: pago.id }, data: { consultPriceCents: 20000 } });
    await seedPresence(pago.id);
    const entry2 = await seedEntry(p2.user.id, p2.patient.id, { maxPriceCents: null });
    await runTeleconsultaQueueTick(new Date());
    expect((await entryOf(entry2.id))?.status).toBe('waiting');
  });

  // 10 ─ PIX nasce no MATCH (§3.2) e o /join barra 402 nos DOIS papéis até pagar
  itR('match com preço gera PIX (Subscription teleconsulta_<id>) e join 402 PAYMENT_REQUIRED p/ ambos', async () => {
    const { user, patient, token } = await createUser();
    const { doctor, token: docToken } = await createDoctor({ crm: crm() });
    await prisma.doctor.update({ where: { id: doctor.id }, data: { consultPriceCents: 15000 } });
    await seedPresence(doctor.id);
    await seedEntry(user.id, patient.id, { maxPriceCents: 15000 });

    fetchMock().mockResolvedValueOnce(mpResponse({ id: 'pay_q1', point_of_interaction: { transaction_data: { qr_code: 'QUEUEPIX1', qr_code_base64: 'QUJDMQ==' } } }));
    await runTeleconsultaQueueTick(new Date());

    const row = await prisma.teleconsultaQueue.findFirst({ where: { patientId: patient.id }, select: { reminderId: true } });
    expect(row?.reminderId).toBeTruthy();
    const sub = await prisma.subscription.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    expect(sub?.status).toBe('PENDING');
    expect(sub?.mpPreferenceId).toBe(`teleconsulta_${row!.reminderId}`);
    expect(sub?.mpPaymentId).toBe('pay_q1');

    // GET status devolve o PIX vivo no matched.payment (retomada, sem ordem nova)
    const status = await api().get('/api/teleconsulta-queue/status').set(H(token));
    expect(status.status).toBe(200);
    expect(status.body.matched).toMatchObject({ reminderId: row!.reminderId, priceCents: 15000 });
    expect(status.body.matched.payment).toMatchObject({ qrCode: 'QUEUEPIX1' });

    // Join bloqueado por pagamento nos DOIS papéis (produto conjunto — lifecycle §2)
    const asPatient = await api().get(`/api/teleconsulta/${row!.reminderId}/join`).set(H(token));
    expect(asPatient.status).toBe(402);
    expect(asPatient.body).toMatchObject({ code: 'PAYMENT_REQUIRED', priceCents: 15000 });
    const asDoctor = await api().get(`/api/teleconsulta/${row!.reminderId}/join`).set(H(docToken));
    expect(asDoctor.status).toBe(402);
    expect(asDoctor.body.code).toBe('PAYMENT_REQUIRED');
  });

  // 11 ─ desistência durante a offer → cancelled + cleanup (share/reminder)
  itR('DELETE durante offer → cancelled, share efêmero revogado e Reminder não pago removido', async () => {
    const { user, patient, token } = await createUser();
    const { doctor } = await createDoctor({ crm: crm() });
    const reminderId = await seedMatchReminder(user.id, patient.id, doctor.id);
    await seedEphemeralShare(patient.id, doctor.id);
    await seedEntry(user.id, patient.id, {
      status: 'matched', matchedDoctorId: doctor.id, reminderId,
      offerExpiresAt: new Date(Date.now() + 30_000), attempts: 1,
    });

    const res = await api().delete('/api/teleconsulta-queue').set(H(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const row = await prisma.teleconsultaQueue.findFirst({ where: { patientId: patient.id }, select: { status: true, cancelReason: true } });
    expect(row).toMatchObject({ status: 'cancelled', cancelReason: 'patient_cancel' });
    expect(await prisma.reminder.findUnique({ where: { id: reminderId } })).toBeNull();
    const share = await prisma.doctorShare.findFirst({ where: { patientId: patient.id, doctorId: doctor.id }, select: { active: true } });
    expect(share?.active).toBe(false);
    // sem entrada ativa → novo DELETE é 404 NOT_IN_QUEUE
    expect((await api().delete('/api/teleconsulta-queue').set(H(token))).body.code).toBe('NOT_IN_QUEUE');
  });

  // 12 ─ espera além do knob (10min) → expired 'timeout' + notificação
  itR('espera > queuePatientTimeoutMin (10min) → expired timeout + notificação neutra', async () => {
    const { user, patient } = await createUser();
    const entry = await seedEntry(user.id, patient.id, { enteredAgoMin: 11 });

    const report = await runTeleconsultaQueueTick(new Date());
    expect(report.waitingExpired).toBe(1);
    const row = await entryOf(entry.id);
    expect(row?.status).toBe('expired');
    expect(row?.cancelReason).toBe('timeout');
    expect(await prisma.notification.count({ where: { userId: user.id, title: 'Atendimento imediato indisponível' } })).toBe(1);

    // dentro do timeout NÃO expira (entrada fresca segue waiting)
    const p2 = await createUser();
    const fresh = await seedEntry(p2.user.id, p2.patient.id, { enteredAgoMin: 9 });
    await runTeleconsultaQueueTick(new Date());
    expect((await entryOf(fresh.id))?.status).toBe('waiting');
  });

  // 13 ─ decline devolve à fila PRESERVANDO FIFO (enteredAt intocado)
  itR('decline preserva FIFO: 1º da fila é re-oferecido ANTES do 2º', async () => {
    const { user: uA, patient: pA } = await createUser();
    const { user: uB, patient: pB } = await createUser();
    const { doctor, token: docToken } = await createDoctor({ crm: crm() });
    await seedPresence(doctor.id);
    const entryA = await seedEntry(uA.id, pA.id, { enteredAgoMin: 2 }); // 1º
    const entryB = await seedEntry(uB.id, pB.id, { enteredAgoMin: 1 }); // 2º

    // 1º tick: FIFO casa A
    await runTeleconsultaQueueTick(new Date());
    expect((await entryOf(entryA.id))?.status).toBe('matched');
    expect((await entryOf(entryB.id))?.status).toBe('waiting');

    // Médico recusa → A volta pra fila com enteredAt preservado
    const decline = await api().post(`/api/doctor/queue/calls/${entryA.id}/decline`).set(H(docToken)).send({ reason: 'busy' });
    expect(decline.status).toBe(200);
    expect(decline.body).toEqual({ ok: true });
    const backA = await entryOf(entryA.id);
    expect(backA?.status).toBe('waiting');
    expect(backA?.attempts).toBe(2);
    expect(backA?.enteredAt.getTime()).toBe(entryA.enteredAt.getTime());

    // 2º tick: A (1º da fila) é casado de novo — não B
    await runTeleconsultaQueueTick(new Date());
    const again = await entryOf(entryA.id);
    expect(again?.status).toBe('matched');
    expect(again?.matchedDoctorId).toBe(doctor.id);
    expect((await entryOf(entryB.id))?.status).toBe('waiting');
    const rem = await prisma.reminder.findUnique({ where: { id: again!.reminderId! }, select: { patientId: true } });
    expect(rem?.patientId).toBe(pA.id);
  });

  // 14 ─ no_show do MÉDICO pago → fim da entrada + share revogado + fila de triagem (estorno)
  itR('accepted com no_show do médico (pago) → ended + share revogado + ExceptionQueue doctor_no_show', async () => {
    const { user, patient } = await createUser();
    const { doctor } = await createDoctor({ crm: crm() });
    const reminderId = await seedMatchReminder(user.id, patient.id, doctor.id, {
      endedAt: new Date(Date.now() - 60_000), teleStatus: 'no_show', noShowBy: 'doctor', paidAt: new Date(),
    });
    await seedEphemeralShare(patient.id, doctor.id);
    const entry = await seedEntry(user.id, patient.id, { status: 'accepted', matchedDoctorId: doctor.id, reminderId });

    const report = await runTeleconsultaQueueTick(new Date());
    expect(report.ended).toBe(1);
    const row = await entryOf(entry.id);
    expect(row?.status).toBe('ended');
    const share = await prisma.doctorShare.findFirst({ where: { patientId: patient.id, doctorId: doctor.id }, select: { active: true, revokedAt: true } });
    expect(share?.active).toBe(false);
    expect(share?.revokedAt).toBeTruthy();
    // "refund agendado": triagem humana detecta o caso (a reserva já está no ledger do /end)
    const ex = await prisma.exceptionQueue.findFirst({ where: { kind: 'doctor_no_show', reminderId } });
    expect(ex).toBeTruthy();
    expect(ex?.payload).toMatchObject({ source: 'fila-imediata' });

    // chamada VIVA não finaliza a entrada
    const p2 = await createUser();
    const { doctor: d2 } = await createDoctor({ crm: crm() });
    const alive = await seedMatchReminder(p2.user.id, p2.patient.id, d2.id); // sem endedAt
    const entry2 = await seedEntry(p2.user.id, p2.patient.id, { status: 'accepted', matchedDoctorId: d2.id, reminderId: alive });
    await runTeleconsultaQueueTick(new Date());
    expect((await entryOf(entry2.id))?.status).toBe('accepted');
  });

  // 14b ─ bug 29/10: aceite ENCALHADO (consulta aceita há >2h sem /end) mantinha o
  // médico busyOffer pra sempre → nenhum match novo. A fila solta (ended +
  // cancelReason stale_accepted + share revogado) e o médico volta a ser casável.
  itR('accepted encalhado (>2h, reminder vivo) → ended stale_accepted e o médico volta ao pool', async () => {
    const { user, patient } = await createUser();
    const { doctor } = await createDoctor({ crm: crm() });
    const reminderId = await seedMatchReminder(user.id, patient.id, doctor.id); // sem endedAt (nunca fecharam)
    await seedEphemeralShare(patient.id, doctor.id);
    const entry = await seedEntry(user.id, patient.id, { status: 'accepted', matchedDoctorId: doctor.id, reminderId });
    // Como na vida real: aceite e dueDate são de 3h atrás (fora da janela ±slotMin
    // da agenda — o bloqueio que sobra é só o busyOffer do accepted encalhado).
    await prisma.teleconsultaQueue.update({ where: { id: entry.id }, data: { acceptedAt: new Date(Date.now() - 3 * 60 * 60_000) } });
    await prisma.reminder.update({ where: { id: reminderId }, data: { dueDate: new Date(Date.now() - 3 * 60 * 60_000) } });
    await seedPresence(doctor.id);
    // outro paciente esperando — com o médico preso, NÃO casaria
    const p2 = await createUser();
    const e2 = await seedEntry(p2.user.id, p2.patient.id, { maxPriceCents: null });

    const report = await runTeleconsultaQueueTick(new Date());
    expect(report.ended).toBe(1);
    const row = await entryOf(entry.id);
    expect(row?.status).toBe('ended');
    expect(row?.cancelReason).toBe('stale_accepted');
    // médico liberado → o PRÓXIMO tick casa o paciente que esperava (o match
    // do passo 4 roda antes da liberação do passo 6 no mesmo tick)
    const report2 = await runTeleconsultaQueueTick(new Date());
    expect(report2.matched).toBe(1);
    expect((await entryOf(e2.id))?.matchedDoctorId).toBe(doctor.id);
  });

  // 15 ─ v1.1: status expõe doctors[] (especialidade/cidade/preço) ordenado por
  // atendimentos HOJE desc ("online primeiro e melhor primeiro"), empate = preço asc.
  itR('GET status lista doctors[] com specialty/city/price, ordenado por atendimentos hoje desc', async () => {
    const { user, patient, token } = await createUser();
    const other = await createUser(); // pacientes das teleconsultas que Ana já atendeu
    const { doctor: ana } = await createDoctor({ crm: crm(), name: 'Ana Ativa', specialty: 'Cardiologia', crmUf: 'SP' });
    const { doctor: bruno } = await createDoctor({ crm: crm(), name: 'Bruno Novo', specialty: 'Clínica Geral', crmUf: 'SP' });
    await prisma.doctor.update({ where: { id: ana.id }, data: { city: 'São José dos Campos', instantPriceCents: 20000 } });
    await prisma.doctor.update({ where: { id: bruno.id }, data: { instantPriceCents: 15000 } });
    // Ana atendeu 2 HOJE (contam na ordenação); Bruno 0 — Ana vem primeiro MESMO
    // sendo mais cara (experiência da fila vence o empate por preço).
    // endedAt: consultas ENCERRADAS — desde 29/10 o /status esconde médico com
    // teleconsulta aberta no horário (agenda ocupada = incasável, fora da lista).
    await seedMatchReminder(user.id, patient.id, ana.id, { endedAt: new Date(Date.now() - 30 * 60_000) });
    await seedMatchReminder(user.id, other.patient.id, ana.id, { endedAt: new Date(Date.now() - 10 * 60_000) });
    await seedPresence(ana.id);
    await seedPresence(bruno.id);

    const res = await api().get('/api/teleconsulta-queue/status').set(H(token));
    expect(res.status).toBe(200);
    expect(res.body.doctorsOnline).toBe(2);
    expect(res.body.doctors).toHaveLength(2);
    expect(res.body.doctors[0]).toMatchObject({
      id: ana.id, name: 'Ana Ativa', specialty: 'Cardiologia',
      city: 'São José dos Campos', photoAvailable: false, priceCents: 20000, crmUf: 'SP',
    });
    expect(res.body.doctors[1]).toMatchObject({ id: bruno.id, priceCents: 15000, city: null });
    // Faixa de preço derivada da mesma lista
    expect(res.body.priceRangeCents).toEqual({ min: 15000, max: 20000 });

    // Empate de carga → preço ASC vence (Bruno 150 < Ana 200 num empate forçado: ambos 0 hoje).
    const p3 = await createUser();
    const { doctor: caro } = await createDoctor({ crm: crm(), name: 'Caro', specialty: 'Dermatologia' });
    const { doctor: barato } = await createDoctor({ crm: crm(), name: 'Barato', specialty: 'Dermatologia' });
    await prisma.doctor.update({ where: { id: caro.id }, data: { instantPriceCents: 30000 } });
    await prisma.doctor.update({ where: { id: barato.id }, data: { instantPriceCents: 5000 } });
    await seedPresence(caro.id);
    await seedPresence(barato.id);
    const res2 = await api().get('/api/teleconsulta-queue/status').set(H(p3.token));
    const ids = res2.body.doctors.map((d: any) => d.id);
    expect(ids.indexOf(barato.id)).toBeLessThan(ids.indexOf(caro.id)); // empate → preço asc
  });

  // 16 ─ v1.1: POST com specialty — o match SÓ casa médico da especialidade exata
  // (ortopedista seria o 1º do pool por presença antiga; filtro o pula).
  itR('POST com specialty filtra o match (médico de outra especialidade é pulado)', async () => {
    const { user, patient, token } = await createUser();
    const { doctor: orto } = await createDoctor({ crm: crm(), specialty: 'Ortopedia' });
    const { doctor: cardio } = await createDoctor({ crm: crm(), specialty: 'Cardiologia' });
    await seedPresence(orto.id, { heartbeatAgoMs: 60_000 }); // lastOnlineAt antigo → 1º do pool
    await seedPresence(cardio.id, { heartbeatAgoMs: 0 });

    const res = await api().post('/api/teleconsulta-queue').set(H(token)).send({
      patientId: patient.id, consent: true, specialty: 'Cardiologia',
    });
    expect(res.status).toBe(201);
    expect(res.body.entry).toMatchObject({ status: 'waiting' });

    await runTeleconsultaQueueTick(new Date());
    const row = await prisma.teleconsultaQueue.findFirst({ where: { patientId: patient.id }, select: { status: true, matchedDoctorId: true, specialtyFilter: true } });
    expect(row).toMatchObject({ status: 'matched', matchedDoctorId: cardio.id, specialtyFilter: 'Cardiologia' });
  });

  // 17 ─ v1.1: POST com preferredDoctorId — o escolhido recebe a offer PRIMEIRO
  // (mesmo com outro médico na frente do pool por presença antiga).
  itR('POST com preferredDoctorId casa com o médico escolhido primeiro', async () => {
    const { user, patient, token } = await createUser();
    const { doctor: primeiro } = await createDoctor({ crm: crm(), name: 'Primeiro Pool' });
    const { doctor: escolhido } = await createDoctor({ crm: crm(), name: 'Escolhido' });
    await seedPresence(primeiro.id, { heartbeatAgoMs: 60_000 }); // seria o match natural
    await seedPresence(escolhido.id, { heartbeatAgoMs: 0 });

    const res = await api().post('/api/teleconsulta-queue').set(H(token)).send({
      patientId: patient.id, consent: true, preferredDoctorId: escolhido.id,
    });
    expect(res.status).toBe(201);

    await runTeleconsultaQueueTick(new Date());
    const row = await prisma.teleconsultaQueue.findFirst({ where: { patientId: patient.id }, select: { status: true, matchedDoctorId: true, preferredDoctorId: true } });
    expect(row).toMatchObject({ status: 'matched', matchedDoctorId: escolhido.id, preferredDoctorId: escolhido.id });
  });
});

// ── Rotas do médico: polling de chamadas + aceite com deadline (§2) ──────────────────
describe('Fila imediata — portal do médico (GET /queue/calls + accept)', () => {
  beforeEach(async () => {
    await resetDb();
    await loadSettings();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({}));
  });

  itR('GET /queue/calls expõe offer (nome/idade/preço/deadline) e stats; accept devolve reminderId', async () => {
    const { user, patient } = await createUser();
    const { doctor, token: docToken } = await createDoctor({ crm: crm(), name: 'Roy' });
    await prisma.patient.update({ where: { id: patient.id }, data: { dateOfBirth: new Date('1990-06-15T00:00:00Z') } });
    const now = Date.now();
    const reminderId = await seedMatchReminder(user.id, patient.id, doctor.id);
    await seedEphemeralShare(patient.id, doctor.id);
    await seedEntry(user.id, patient.id, {
      status: 'matched', matchedDoctorId: doctor.id, reminderId,
      offerExpiresAt: new Date(now + 45_000), attempts: 1, enteredAgoMin: 1,
    });

    const calls = await api().get('/api/doctor/queue/calls').set(H(docToken));
    expect(calls.status).toBe(200);
    expect(calls.body.offer).toMatchObject({ patientAge: expect.any(Number), priceCents: 0, callId: expect.any(String) });
    expect(calls.body.offer.briefUrl).toBe(`/api/doctor/patients/${patient.id}/context`);
    expect(new Date(calls.body.offer.acceptDeadlineIso).getTime()).toBeGreaterThan(now);
    expect(calls.body.stats).toEqual({ waiting: 0, myAccepted: 0 });

    const accept = await api().post(`/api/doctor/queue/calls/${calls.body.offer.callId}/accept`).set(H(docToken)).send({});
    expect(accept.status).toBe(200);
    expect(accept.body).toEqual({ reminderId });
    const row = await prisma.teleconsultaQueue.findUnique({ where: { id: calls.body.offer.callId }, select: { status: true, acceptedAt: true } });
    expect(row?.status).toBe('accepted');
    expect(row?.acceptedAt).toBeTruthy();
    // push de aceite no paciente (padrão join :252) + audit
    const acceptPush = await prisma.notification.findFirst({ where: { userId: user.id, title: '✓ Dr. Roy vai te atender' } });
    expect(acceptPush?.data).toEqual({ type: 'teleconsulta', reminderId });
    expect(await prisma.auditLog.count({ where: { action: 'QUEUE_ACCEPT', actorId: doctor.id } })).toBe(1);
  });

  itR('accept fora do deadline → 409 CALL_EXPIRED (estado não muda)', async () => {
    const { user, patient } = await createUser();
    const { doctor, token: docToken } = await createDoctor({ crm: crm() });
    const reminderId = await seedMatchReminder(user.id, patient.id, doctor.id);
    await seedEphemeralShare(patient.id, doctor.id);
    const entry = await seedEntry(user.id, patient.id, {
      status: 'matched', matchedDoctorId: doctor.id, reminderId,
      offerExpiresAt: new Date(Date.now() - 1_000), attempts: 1,
    });
    const res = await api().post(`/api/doctor/queue/calls/${entry.id}/accept`).set(H(docToken)).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CALL_EXPIRED');
    expect((await entryOf(entry.id))?.status).toBe('matched'); // tick é quem re-estoca
  });
});
