// E2E (supertest) — F3: gravação/transcrição da teleconsulta (backend2, 20/10/26).
// utils/stt é MOCKADO SEMPRE (nunca rede). Contrato: docs/research/2026-10-20-f3-arquitetura.md §3a-3d.
// Encriptação REAL (encryptPII/decryptPII com a key de dev do config) — o teste valida que
// o transcript NÃO vai em texto-puro pro banco e volta legível pelo GET.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs';

vi.mock('../src/utils/stt', () => ({
  hasStt: vi.fn(() => true),
  transcribeAudio: vi.fn(async () => 'Bom dia, doutor. Vamos conversar sobre o hemograma.'),
  SttError: class SttError extends Error {
    code: string;
    status?: number;
    constructor(code: string, msg: string, status?: number) { super(msg); this.code = code; this.status = status; }
  },
  STT_MAX_BYTES: 25 * 1024 * 1024,
}));

import { prisma } from '../src/prisma';
import { hasStt, transcribeAudio } from '../src/utils/stt';
import { audioPathFor, processPendingTranscriptions } from '../src/jobs/transcriptionQueue';
import { decryptPII } from '../src/utils/crypto';
import { api, createUser, createDoctor, resetDb, authHeader } from './helpers';

const MOCK_TEXT = 'Bom dia, doutor. Vamos conversar sobre o hemograma.';
/** Áudio fixture: buffer qualquer — o stt é mockado e ignora o conteúdo. */
const AUDIO = Buffer.alloc(2048, 7);

/** Cria Reminder type=teleconsulta com consent Art.15 + consent de gravação (F3). */
async function createTeleconsultaReminder(ownerId: string, patientId: string, opts: { consentAt?: Date | null; recordConsentAt?: Date | null } = {}) {
  return prisma.reminder.create({
    data: {
      ownerId,
      patientId,
      title: 'Teleconsulta',
      dueDate: new Date(Date.now() + 24 * 3600_000),
      type: 'teleconsulta',
      consentAt: opts.consentAt ?? new Date(),
      recordConsentAt: opts.recordConsentAt ?? null,
      notifyOffsetsMin: [1440, 60, 0],
    },
    select: { id: true, ownerId: true },
  });
}

/** Médico com share ativo no paciente (padrão do teleconsulta-livekit.test.ts). */
async function createSharingDoctor(patientId: string, n: number) {
  const doc = await createDoctor({ email: `doc-rec${n}@test.com`, crm: `7770${n}-SP` });
  await prisma.doctorShare.create({ data: { patientId, doctorId: doc.doctor.id, scopes: ['exams'] } });
  return doc;
}

describe('POST /api/teleconsulta/:id/recording (F3 gravação)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(hasStt).mockClear().mockReturnValue(true);
    vi.mocked(transcribeAudio).mockClear().mockResolvedValue(MOCK_TEXT);
  });
  afterAll(() => { fs.rmSync('./data/test-teleconsultas', { recursive: true, force: true }); });

  it('médico com share + consent → 202 pending, JOB transcreve: transcript CIFRADO, audit, arquivo deletado, notificação', async () => {
    const { user, patient } = await createUser();
    const doc = await createSharingDoctor(patient.id, 1);
    const r = await createTeleconsultaReminder(user.id, patient.id, { recordConsentAt: new Date() });

    // reviewer-G: rota SEMPRE async (nginx 60s proxy_read_timeout) → o job finaliza.
    const res = await api().post(`/api/teleconsulta/${r.id}/recording`).set(authHeader(doc.token))
      .attach('file', AUDIO, { filename: 'rec.webm', contentType: 'audio/webm' });
    expect(res.status).toBe(202);
    expect(res.body.pending).toBe(true);

    // Roda o tick do job manualmente (mesma função que o setInterval chama).
    await processPendingTranscriptions();
    expect(transcribeAudio).toHaveBeenCalledTimes(1);

    // PII: transcript não é texto-puro no banco e decripta para o texto original.
    const row: any = await prisma.reminder.findUnique({ where: { id: r.id }, select: { transcriptEnc: true, transcriptIv: true, transcriptAt: true, recordingAt: true } });
    expect(row.transcriptEnc).toBeTruthy();
    expect(row.transcriptEnc).not.toContain('hemograma');
    expect(decryptPII(row.transcriptEnc, row.transcriptIv)).toBe(MOCK_TEXT);
    expect(row.transcriptAt).toBeTruthy();
    expect(row.recordingAt).toBeNull();

    // Áudio efêmero (D1): fora do disco após a transcrição.
    expect(fs.existsSync(audioPathFor(r.id))).toBe(false);

    // Audit AWAIT + notificação. reviewer-G: o JOB transcreve (não a rota) → actor é SYSTEM.
    const log = await prisma.auditLog.findFirst({ where: { action: 'TELECONSULTA_TRANSCRIPT', targetId: r.id } });
    expect(log?.actorType).toBe('SYSTEM');
    const notif = await prisma.notification.findFirst({ where: { userId: user.id, title: '📄 Transcrição disponível' } });
    expect(notif).toBeTruthy();
  });

  it('SEM recordConsentAt → 403 RECORD_CONSENT_REQUIRED (não chama STT)', async () => {
    const { user, patient } = await createUser();
    const doc = await createSharingDoctor(patient.id, 2);
    const r = await createTeleconsultaReminder(user.id, patient.id, { recordConsentAt: null });

    const res = await api().post(`/api/teleconsulta/${r.id}/recording`).set(authHeader(doc.token))
      .attach('file', AUDIO, { filename: 'rec.webm', contentType: 'audio/webm' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('RECORD_CONSENT_REQUIRED');
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it('sem GROQ (hasStt false) → 202 pending + áudio mantido no disco + recordingAt marcado', async () => {
    vi.mocked(hasStt).mockReturnValue(false);
    const { user, patient } = await createUser();
    const doc = await createSharingDoctor(patient.id, 3);
    const r = await createTeleconsultaReminder(user.id, patient.id, { recordConsentAt: new Date() });

    const res = await api().post(`/api/teleconsulta/${r.id}/recording`).set(authHeader(doc.token))
      .attach('file', AUDIO, { filename: 'rec.webm', contentType: 'audio/webm' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ pending: true });
    expect(fs.existsSync(audioPathFor(r.id))).toBe(true); // espera o job
    const row: any = await prisma.reminder.findUnique({ where: { id: r.id }, select: { recordingAt: true, transcriptAt: true } });
    expect(row.recordingAt).toBeTruthy();
    expect(row.transcriptAt).toBeNull();
    fs.unlinkSync(audioPathFor(r.id)); // cleanup manual (job não roda no teste)
  });

  it('recording é DOCTOR-only: paciente owner POST → 403', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, { recordConsentAt: new Date() });
    const res = await api().post(`/api/teleconsulta/${r.id}/recording`).set(authHeader(token))
      .attach('file', AUDIO, { filename: 'rec.webm', contentType: 'audio/webm' });
    expect(res.status).toBe(403);
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it('arquivo que não é áudio → 400 (fileFilter)', async () => {
    const { user, patient } = await createUser();
    const doc = await createSharingDoctor(patient.id, 4);
    const r = await createTeleconsultaReminder(user.id, patient.id, { recordConsentAt: new Date() });
    const res = await api().post(`/api/teleconsulta/${r.id}/recording`).set(authHeader(doc.token))
      .attach('file', Buffer.from('%PDF-fake'), { filename: 'rec.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/teleconsulta/:id/transcript (F3 pós-chamada, auth dual)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(hasStt).mockClear().mockReturnValue(true);
    vi.mocked(transcribeAudio).mockClear().mockResolvedValue(MOCK_TEXT);
  });

  it('depois da transcrição: paciente e médico leem o texto DECRYPTADO + disclaimer', async () => {
    const { user, patient, token } = await createUser();
    const doc = await createSharingDoctor(patient.id, 5);
    const r = await createTeleconsultaReminder(user.id, patient.id, { recordConsentAt: new Date() });
    const up = await api().post(`/api/teleconsulta/${r.id}/recording`).set(authHeader(doc.token))
      .attach('file', AUDIO, { filename: 'rec.webm', contentType: 'audio/webm' });
    expect(up.status).toBe(202); // reviewer-G: sempre async
    await processPendingTranscriptions(); // tick do job

    const asPatient = await api().get(`/api/teleconsulta/${r.id}/transcript`).set(authHeader(token));
    expect(asPatient.status).toBe(200);
    expect(asPatient.body.text).toBe(MOCK_TEXT);
    expect(asPatient.body.transcriptAt).toBeTruthy();
    expect(asPatient.body.disclaimer).toBe('Transcrição gerada por IA — revise com o médico.');

    const asDoctor = await api().get(`/api/teleconsulta/${r.id}/transcript`).set(authHeader(doc.token));
    expect(asDoctor.status).toBe(200);
    expect(asDoctor.body.text).toBe(MOCK_TEXT);
  });

  it('sem transcrição → {text:null} · sem auth → 401 · paciente alheio → 403', async () => {
    const { user, patient, token } = await createUser();
    const other = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, {});
    const empty = await api().get(`/api/teleconsulta/${r.id}/transcript`).set(authHeader(token));
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ text: null, transcriptAt: null });
    const noAuth = await api().get(`/api/teleconsulta/${r.id}/transcript`);
    expect(noAuth.status).toBe(401);
    const alien = await api().get(`/api/teleconsulta/${r.id}/transcript`).set(authHeader(other.token));
    expect(alien.status).toBe(403);
  });
});

describe('PATCH/PUT /api/teleconsulta/:id/record-consent (F3 D3)', () => {
  beforeEach(async () => { await resetDb(); });

  it('paciente autoriza → 200 com timestamp; 2º envio é idempotente (mantém o 1º)', async () => {
    const { user, patient, token } = await createUser();
    const r = await createTeleconsultaReminder(user.id, patient.id, {});
    const first = await api().patch(`/api/teleconsulta/${r.id}/record-consent`).set(authHeader(token));
    expect(first.status).toBe(200);
    expect(first.body.recordConsentAt).toBeTruthy();
    const second = await api().put(`/api/teleconsulta/${r.id}/record-consent`).set(authHeader(token));
    expect(second.status).toBe(200);
    expect(second.body.recordConsentAt).toBe(first.body.recordConsentAt); // não renova
    const row: any = await prisma.reminder.findUnique({ where: { id: r.id }, select: { recordConsentAt: true } });
    expect(new Date(row.recordConsentAt).toISOString()).toBe(first.body.recordConsentAt);
  });

  it('médico NÃO dá o consent de gravação → 403', async () => {
    const { user, patient } = await createUser();
    const doc = await createSharingDoctor(patient.id, 6);
    const r = await createTeleconsultaReminder(user.id, patient.id, {});
    const res = await api().patch(`/api/teleconsulta/${r.id}/record-consent`).set(authHeader(doc.token));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/teleconsulta/:id/summary (F3)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(hasStt).mockClear().mockReturnValue(true);
    vi.mocked(transcribeAudio).mockClear().mockResolvedValue(MOCK_TEXT);
  });

  it('shape: transcript.at + examRequests [] + feedback do audit + durationHint', async () => {
    const { user, patient, token } = await createUser();
    const doc = await createSharingDoctor(patient.id, 7);
    const r = await createTeleconsultaReminder(user.id, patient.id, { recordConsentAt: new Date() });
    // feedback real (F2 → auditLog) p/ o summary achar
    const fb = await api().post(`/api/teleconsulta/${r.id}/feedback`).set(authHeader(token)).send({ rating: 5, note: 'Ótimo' });
    expect(fb.status).toBe(201);
    const up = await api().post(`/api/teleconsulta/${r.id}/recording`).set(authHeader(doc.token))
      .attach('file', AUDIO, { filename: 'rec.webm', contentType: 'audio/webm' });
    expect(up.status).toBe(202); // reviewer-G: sempre async
    await processPendingTranscriptions(); // tick do job

    const res = await api().get(`/api/teleconsulta/${r.id}/summary`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.transcript?.at).toBeTruthy();
    expect(Array.isArray(res.body.examRequests)).toBe(true);
    expect(res.body.feedback).toMatchObject({ rating: 5, note: 'Ótimo', role: 'patient' });
    expect(res.body.durationHint).toBeNull(); // ninguém entrou na sala (sem TELECONSULTA_JOIN)
  });
});
