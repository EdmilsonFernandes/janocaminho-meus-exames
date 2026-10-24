// E2E (supertest) — CICLO DE VIDA v2 (24/10/26, spec docs/design/2026-10-24-teleconsulta-gaps-spec.md §1-§2):
// janela de entrada (TOO_EARLY/opensAt), gate de pagamento (402 PAYMENT_REQUIRED),
// transição 'in_progress' só com AMBOS os papéis (race-safe), /end com outcome honesto
// (completed exige paciente + jointMs ≥ minJointSeconds), presença conjunta com LEAVE,
// auto-end com outcome, listas coerentes (teleStatus+endedAt no payload).
// utils/livekit MOCKADO (join nunca sai da rede). Relógio: controlado via dueDate
// futura/passada + config default (entryWindowMin=5, minJointSeconds=300).
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('../src/utils/livekit', () => ({
  hasLiveKitConfig: vi.fn(() => true),
  buildJoinToken: vi.fn(async () => 'mock-join-token'),
  createLiveKitRoom: vi.fn(async () => undefined),
}));

import { prisma } from '../src/prisma';
import { hasLiveKitConfig, buildJoinToken } from '../src/utils/livekit';
import { loadSettings } from '../src/utils/settings';
import { autoEndStaleTeleconsultas } from '../src/jobs/reminderEmails';
import { api, createUser, createDoctor, resetDb, authHeader } from './helpers';

vi.mocked(hasLiveKitConfig).mockReturnValue(true);

/** dueDate default = VENCIDA → janela de entrada aberta (join liberado). */
const PAST = () => new Date(Date.now() - 5 * 60_000);

async function createTele(ownerId: string, patientId: string, opts: {
  dueDate?: Date;
  consultPriceCents?: number | null;
  paidAt?: Date | null;
} = {}) {
  return prisma.reminder.create({
    data: {
      ownerId, patientId, title: 'Teleconsulta',
      dueDate: opts.dueDate ?? PAST(),
      type: 'teleconsulta', consentAt: new Date(),
      notifyOffsetsMin: [1440, 60, 0],
      provider: 'livekit', roomName: 't-lc2',
      consultPriceCents: opts.consultPriceCents ?? null,
      paidAt: opts.paidAt ?? null,
      teleStatus: 'scheduled',
    } as any,
    select: { id: true },
  });
}

/** Join log "fantasma" no auditLog (simula entrada de N min atrás — fonte de presença). */
async function seedJoinLog(reminderId: string, role: 'patient' | 'doctor', minutesAgo: number) {
  await prisma.auditLog.create({
    data: {
      actorType: role === 'doctor' ? 'DOCTOR' : 'USER',
      action: 'TELECONSULTA_JOIN',
      targetType: 'REMINDER',
      targetId: reminderId,
      after: { role, reminderId } as any,
      createdAt: new Date(Date.now() - minutesAgo * 60_000),
    },
  });
}

/** Leave log (client reportou desconexão N min atrás — fecha o intervalo do papel). */
async function seedLeaveLog(reminderId: string, role: 'patient' | 'doctor', minutesAgo: number) {
  await prisma.auditLog.create({
    data: {
      actorType: role === 'doctor' ? 'DOCTOR' : 'USER',
      action: 'TELECONSULTA_LEAVE',
      targetType: 'REMINDER',
      targetId: reminderId,
      after: { role, reminderId } as any,
      createdAt: new Date(Date.now() - minutesAgo * 60_000),
    },
  });
}

/** Médico com share ativo no paciente (join role=doctor). E-mail MINÚSCULO: o
 *  register normaliza p/ lowercase e o updateMany de emailVerified do helper casa
 *  por igualdade (uppercase = 0 rows = login 403 needsVerification). */
async function doctorWithShare(patientId: string, crm: string) {
  const doc = await createDoctor({ email: `doc-lc2-${crm.toLowerCase()}@test.com`, crm });
  await prisma.doctorShare.create({ data: { patientId, doctorId: doc.doctor.id, scopes: ['exams'] } });
  return doc;
}

const row = (id: string) => prisma.reminder.findUnique({
  where: { id }, select: { teleStatus: true, endedAt: true, done: true, patientJoinedAt: true, jointMs: true },
});
const startLogs = (id: string) => prisma.auditLog.count({ where: { action: 'TELECONSULTA_START', targetId: id } });

describe('GET /join — janela de entrada (dueDate − entryWindowMin)', () => {
  beforeEach(async () => {
    await resetDb();
    await loadSettings(); // repõe defaults (resetDb truncou app_settings)
    vi.mocked(hasLiveKitConfig).mockClear();
    vi.mocked(buildJoinToken).mockClear();
    vi.mocked(hasLiveKitConfig).mockReturnValue(true);
    vi.mocked(buildJoinToken).mockResolvedValue('mock-join-token');
    process.env.LIVEKIT_URL = 'wss://test.example.org';
  });
  afterAll(() => { delete process.env.LIVEKIT_URL; });

  it('antes da janela (dueDate +10min) → 403 TOO_EARLY com opensAt p/ countdown', async () => {
    const { user, patient, token } = await createUser();
    const due = new Date(Date.now() + 10 * 60_000);
    const r = await createTele(user.id, patient.id, { dueDate: due });

    const res = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TOO_EARLY');
    expect(res.body.opensAt).toBe(new Date(due.getTime() - 5 * 60_000).toISOString());
    expect(buildJoinToken).not.toHaveBeenCalled();
  });

  it('na janela (dueDate +6min ainda fora; +4min dentro) e vencida (aberta)', async () => {
    const { user, patient, token } = await createUser();
    // fora: falta 6min (> janela de 5min) → bloqueado (relógio server, margem segura)
    const edge = await createTele(user.id, patient.id, { dueDate: new Date(Date.now() + 6 * 60_000) });
    expect((await api().get(`/api/teleconsulta/${edge.id}/join`).set(authHeader(token))).status).toBe(403);
    // dentro da janela: falta 4min → liberado
    const inside = await createTele(user.id, patient.id, { dueDate: new Date(Date.now() + 4 * 60_000) });
    expect((await api().get(`/api/teleconsulta/${inside.id}/join`).set(authHeader(token))).status).toBe(200);
    // vencida: janela passou há tempo → segue liberada (sem upper-bound)
    const past = await createTele(user.id, patient.id, {});
    expect((await api().get(`/api/teleconsulta/${past.id}/join`).set(authHeader(token))).status).toBe(200);
  });

  it('janela vale p/ o MÉDICO também (mesma regra, ambos os papéis)', async () => {
    const { user, patient } = await createUser();
    const doc = await doctorWithShare(patient.id, '31415-SP');
    const r = await createTele(user.id, patient.id, { dueDate: new Date(Date.now() + 10 * 60_000) });
    const res = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(doc.token));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TOO_EARLY');
  });

  it('entryWindowMin é editável (AppSetting teleconsulta) — 60min bloqueia dueDate +30min', async () => {
    const { user, patient, token } = await createUser();
    await prisma.appSetting.upsert({
      where: { key: 'teleconsulta' },
      update: { value: { entryWindowMin: 60, minJointSeconds: 300 } as any },
      create: { key: 'teleconsulta', value: { entryWindowMin: 60, minJointSeconds: 300 } as any },
    });
    await loadSettings(); // sincroniza cache
    try {
      // janela 60min: dueDate +90min → sala abre em +30min → ainda bloqueado
      const due = new Date(Date.now() + 90 * 60_000);
      const r = await createTele(user.id, patient.id, { dueDate: due });
      const res = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('TOO_EARLY');
      expect(res.body.opensAt).toBe(new Date(due.getTime() - 60 * 60_000).toISOString());
    } finally {
      await prisma.appSetting.delete({ where: { key: 'teleconsulta' } }).catch(() => {});
      await loadSettings(); // devolve defaults p/ os próximos testes
    }
  });
});

describe('GET /join — gate de pagamento (consultPriceCents>0 exige paidAt)', () => {
  beforeEach(async () => { await resetDb(); await loadSettings(); });

  it('consulta paga NÃO confirmada → 402 PAYMENT_REQUIRED {priceCents} (paciente E médico)', async () => {
    const { user, patient, token } = await createUser();
    const doc = await doctorWithShare(patient.id, '27182-SP');
    const r = await createTele(user.id, patient.id, { consultPriceCents: 15000 });

    const asPatient = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
    expect(asPatient.status).toBe(402);
    expect(asPatient.body).toMatchObject({ code: 'PAYMENT_REQUIRED', priceCents: 15000, reminderId: r.id });
    // consulta particular = produto CONJUNTO: sem paidAt o médico também não entra
    const asDoctor = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(doc.token));
    expect(asDoctor.status).toBe(402);
    expect(asDoctor.body.code).toBe('PAYMENT_REQUIRED');
  });

  it('paidAt confirmado (webhook PIX) → 200; sem cobrança (null/0) → 200 sem gate', async () => {
    const { user, patient, token } = await createUser();
    const paid = await createTele(user.id, patient.id, { consultPriceCents: 15000, paidAt: new Date() });
    expect((await api().get(`/api/teleconsulta/${paid.id}/join`).set(authHeader(token))).status).toBe(200);

    const free = await createTele(user.id, patient.id, {});
    expect((await api().get(`/api/teleconsulta/${free.id}/join`).set(authHeader(token))).status).toBe(200);
  });
});

describe('TRANSIÇÃO in_progress — ambos os papéis com JOIN registrado', () => {
  beforeEach(async () => { await resetDb(); await loadSettings(); });

  it('paciente sozinho: patientJoinedAt carimbado, teleStatus segue scheduled (sem START)', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTele(user.id, patient.id, {});

    const res = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.teleStatus).toBe('scheduled');

    const db = await row(r.id);
    expect(db?.teleStatus).toBe('scheduled');
    expect(db?.patientJoinedAt).toBeTruthy();
    expect(await startLogs(r.id)).toBe(0);
  });

  it('médico sozinho NÃO inicia (sair≠concluir; sozinho≠atendimento)', async () => {
    const { user, patient } = await createUser();
    const doc = await doctorWithShare(patient.id, '16180-SP');
    const r = await createTele(user.id, patient.id, {});

    const res = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(doc.token));
    expect(res.status).toBe(200);
    const db = await row(r.id);
    expect(db?.teleStatus).toBe('scheduled');
    expect(db?.patientJoinedAt).toBeNull();
    expect(await startLogs(r.id)).toBe(0);
  });

  it('ambos (sequencial) → in_progress com exatamente 1 TELECONSULTA_START', async () => {
    const { user, patient, token } = await createUser();
    const doc = await doctorWithShare(patient.id, '14142-SP');
    const r = await createTele(user.id, patient.id, {});

    expect((await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(doc.token))).status).toBe(200);
    expect((await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token))).status).toBe(200);

    const db = await row(r.id);
    expect(db?.teleStatus).toBe('in_progress');
    expect(db?.patientJoinedAt).toBeTruthy();
    expect(await startLogs(r.id)).toBe(1);
  });

  it('RACE: 2 joins simultâneos (paciente + médico) → exatamente 1 transição', async () => {
    const { user, patient, token } = await createUser();
    const doc = await doctorWithShare(patient.id, '17320-SP');
    const r = await createTele(user.id, patient.id, {});

    const [a, b] = await Promise.all([
      api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token)),
      api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(doc.token)),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const db = await row(r.id);
    expect(db?.teleStatus).toBe('in_progress');
    expect(db?.patientJoinedAt).toBeTruthy();
    expect(await startLogs(r.id)).toBe(1); // updateMany condicional: 1 vencedor
  });
});

describe('POST /end — outcome honesto (completed exige critério)', () => {
  beforeEach(async () => { await resetDb(); await loadSettings(); });

  it('outcome completed SEM paciente → 400 OUTCOME_INVALID sugerindo no_show', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTele(user.id, patient.id, {});

    const res = await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(token)).send({ outcome: 'completed' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OUTCOME_INVALID');
    expect(res.body.suggestion).toBe('no_show');
    expect(res.body.reason).toBe('patient_not_joined');
    expect((await row(r.id))?.endedAt).toBeNull(); // não encerrou
  });

  it('sem outcome e sem critério → 400 OUTCOME_REQUIRED', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTele(user.id, patient.id, {});
    const res = await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(token)).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OUTCOME_REQUIRED');
    expect(res.body.suggestion).toBe('no_show');
  });

  it('ambos entraram AGORA (jointMs ~0 < 300s): completed → 400 technical; sem outcome → 400', async () => {
    const { user, patient, token } = await createUser();
    const doc = await doctorWithShare(patient.id, '26433-SP');
    const r = await createTele(user.id, patient.id, {});
    // joins reais pela rota = agora → tempo conjunto ~0s (abaixo do mínimo)
    await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(doc.token));
    await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));

    const bad = await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(doc.token)).send({ outcome: 'completed' });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ code: 'OUTCOME_INVALID', suggestion: 'technical', reason: 'min_time_not_met' });

    const none = await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(doc.token)).send({});
    expect(none.status).toBe(400);
    expect(none.body).toMatchObject({ code: 'OUTCOME_REQUIRED', suggestion: 'technical' });
  });

  it('critério atendido (paciente 10min + médico 8min, sem leave) → completed AUTOMÁTICO + jointMs persistido', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTele(user.id, patient.id, {});
    await seedJoinLog(r.id, 'patient', 10);
    await seedJoinLog(r.id, 'doctor', 8);

    const res = await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.teleStatus).toBe('completed');
    expect(res.body.jointMs).toBeGreaterThanOrEqual(300_000); // ~8min conjunto

    const db = await row(r.id);
    expect(db?.teleStatus).toBe('completed');
    expect(db?.done).toBe(true);
    expect(db?.endedAt).toBeTruthy();
    expect(db?.jointMs).toBeGreaterThanOrEqual(300_000);
  });

  it('outcome explícito no_show / technical → 200 com teleStatus distinto (não realizado)', async () => {
    const { user, patient, token } = await createUser();
    const a = await createTele(user.id, patient.id, {});
    const resA = await api().post(`/api/teleconsulta/${a.id}/end`).set(authHeader(token)).send({ outcome: 'no_show' });
    expect(resA.status).toBe(200);
    expect(resA.body.teleStatus).toBe('no_show');
    expect(resA.body.jointMs).toBe(0);

    const b = await createTele(user.id, patient.id, {});
    const resB = await api().post(`/api/teleconsulta/${b.id}/end`).set(authHeader(token)).send({ outcome: 'technical' });
    expect(resB.status).toBe(200);
    expect(resB.body.teleStatus).toBe('technical');
  });

  it('outcome inválido → 400', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTele(user.id, patient.id, {});
    const res = await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(token)).send({ outcome: 'banana' });
    expect(res.status).toBe(400);
  });

  it('LEAVE fecha o intervalo: saída cedo derruba jointMs abaixo do mínimo (teto ≠ prova)', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTele(user.id, patient.id, {});
    // ambos presentes só por ~1min (paciente saiu 1min depois do médico entrar)
    await seedJoinLog(r.id, 'patient', 10);
    await seedJoinLog(r.id, 'doctor', 8);
    await seedLeaveLog(r.id, 'patient', 7);

    const res = await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(token)).send({ outcome: 'completed' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'OUTCOME_INVALID', reason: 'min_time_not_met' });
    expect(res.body.jointMsSec).toBeLessThan(300);
  });

  it('LEAVE + re-entrada não duplica tempo (merge sem sobreposição dupla)', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTele(user.id, patient.id, {});
    // médico: entra 8min, sai 2min → 6min conjunto (≥300s) — apesar do paciente re-entrar
    await seedJoinLog(r.id, 'patient', 10);
    await seedJoinLog(r.id, 'doctor', 8);
    await seedLeaveLog(r.id, 'doctor', 2);
    // paciente re-entra (join repetido com intervalo já fechado — não conta 2x)
    await seedJoinLog(r.id, 'patient', 9);

    const res = await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(token)).send({ outcome: 'completed' });
    expect(res.status).toBe(200);
    // 8min→2min = 6min = 360s (tolerância de relógio do teste: ≥300)
    expect(res.body.jointMs).toBeGreaterThanOrEqual(300_000);
    expect(res.body.jointMs).toBeLessThan(420_000);
  });

  it('idempotente: 2º /end NÃO muda endedAt nem teleStatus (outcome do 1º vencedor fica)', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTele(user.id, patient.id, {});
    const first = await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(token)).send({ outcome: 'no_show' });
    expect(first.status).toBe(200);

    const second = await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(token)).send({ outcome: 'technical' });
    expect(second.status).toBe(200);
    expect(second.body.alreadyEnded).toBe(true);
    expect(second.body.endedAt).toBe(first.body.endedAt);
    expect(second.body.teleStatus).toBe('no_show'); // 1º outcome preservado
  });

  it('encerrada → join devolve 403 TELECONSULTA_ENDED (link antigo nunca reabre)', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTele(user.id, patient.id, {});
    await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(token)).send({ outcome: 'no_show' });

    const join = await api().get(`/api/teleconsulta/${r.id}/join`).set(authHeader(token));
    expect(join.status).toBe(403);
    expect(join.body.code).toBe('TELECONSULTA_ENDED');
  });

  it('feedback 1-toque encerra com outcome RESOLVIDO (sem critério → honesto pela presença)', async () => {
    const { user, patient, token } = await createUser();
    // sem join nenhum → no_show
    const a = await createTele(user.id, patient.id, {});
    expect((await api().post(`/api/teleconsulta/${a.id}/feedback`).set(authHeader(token)).send({ rating: 5 })).status).toBe(201);
    expect((await row(a.id))?.teleStatus).toBe('no_show');

    // paciente entrou (sozinho, jointMs ~0) → technical
    const b = await createTele(user.id, patient.id, {});
    await api().get(`/api/teleconsulta/${b.id}/join`).set(authHeader(token));
    expect((await api().post(`/api/teleconsulta/${b.id}/feedback`).set(authHeader(token)).send({ rating: 4 })).status).toBe(201);
    expect((await row(b.id))?.teleStatus).toBe('technical');
  });
});

describe('autoEndStaleTeleconsultas — outcome pela presença (nunca completed)', () => {
  beforeEach(async () => { await resetDb(); await loadSettings(); });

  it('só o PACIENTE entrou há >30min → technical (havia presença, não houve atendimento)', async () => {
    const { user, patient } = await createUser();
    const r = await createTele(user.id, patient.id, {});
    await seedJoinLog(r.id, 'patient', 40);

    await autoEndStaleTeleconsultas(Date.now());
    const db = await row(r.id);
    expect(db?.endedAt).toBeTruthy();
    expect(db?.teleStatus).toBe('technical');
    expect(db?.jointMs).toBe(0); // sem intervalo com ambos
  });

  it('só o MÉDICO entrou (paciente nunca) → no_show', async () => {
    const { user, patient } = await createUser();
    const r = await createTele(user.id, patient.id, {});
    await seedJoinLog(r.id, 'doctor', 40);

    await autoEndStaleTeleconsultas(Date.now());
    const db = await row(r.id);
    expect(db?.teleStatus).toBe('no_show');
    expect(db?.done).toBe(true);
  });

  it('NINGUÉM entrou + vencida >30min → no_show (comportamento de encerrar vencidas mantido)', async () => {
    const { user, patient } = await createUser();
    const due = new Date(Date.now() - 40 * 60_000);
    const r = await createTele(user.id, patient.id, { dueDate: due });

    await autoEndStaleTeleconsultas(Date.now());
    const db = await row(r.id);
    expect(db?.teleStatus).toBe('no_show');
    expect(db?.endedAt).toBeTruthy();
    expect(new Date(db!.endedAt!).getTime()).toBe(due.getTime() + 30 * 60_000);
  });

  it('AMBOS entraram → job NÃO encerra (fim humano com critério)', async () => {
    const { user, patient } = await createUser();
    const r = await createTele(user.id, patient.id, {});
    await seedJoinLog(r.id, 'patient', 60);
    await seedJoinLog(r.id, 'doctor', 50);

    await autoEndStaleTeleconsultas(Date.now());
    expect((await row(r.id))?.endedAt).toBeNull();
  });
});

describe('LISTAS coerentes — teleStatus + endedAt no payload (UI filtra CTA por endedAt)', () => {
  beforeEach(async () => { await resetDb(); await loadSettings(); });

  it('GET /api/reminders (paciente) expõe teleStatus/endedAt/patientJoinedAt/jointMs', async () => {
    const { user, patient, token } = await createUser();
    await createTele(user.id, patient.id, {});
    const res = await api().get('/api/reminders').set(authHeader(token));
    expect(res.status).toBe(200);
    const tele = res.body.find((r: any) => r.type === 'teleconsulta');
    expect(tele).toBeTruthy();
    expect(tele.teleStatus).toBe('scheduled');
    expect('endedAt' in tele).toBe(true);
    expect('patientJoinedAt' in tele).toBe(true);
    expect('jointMs' in tele).toBe(true);
  });

  it('GET /api/doctor/teleconsultas (portal) expõe teleStatus/endedAt', async () => {
    const { user, patient } = await createUser();
    const doc = await doctorWithShare(patient.id, '11235-SP');
    const r = await createTele(user.id, patient.id, {});
    await api().post(`/api/teleconsulta/${r.id}/end`).set(authHeader(doc.token)).send({ outcome: 'no_show' });

    const res = await api().get('/api/doctor/teleconsultas').set(authHeader(doc.token));
    expect(res.status).toBe(200);
    const item = res.body.items.find((it: any) => it.id === r.id);
    expect(item).toBeTruthy();
    expect(item.teleStatus).toBe('no_show');
    expect(item.endedAt).toBeTruthy();
  });
});
