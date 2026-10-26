// E2E (supertest) — bug 26/10 "transcrição pensando pra sempre no histórico do médico".
// Causa raiz: finalizeTranscription gravava transcriptAt mesmo com STT vazio
// (encryptPII('') = null → transcriptEnc null) → summary dizia "Transcrição ✓" e o
// GET devolvia text null pra sempre. Contrato novo:
//   • STT vazio → abort honesto (STT_EMPTY): transcriptAt/recordingAt = null.
//   • GET /transcript → status 'ready' | 'processing' | 'none' (client não adivinha).
//   • GET /summary → recordingAt ISO|null p/ diferenciar processando de sem gravação.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs';

vi.mock('../src/utils/stt', () => ({
  hasStt: vi.fn(() => true),
  transcribeAudio: vi.fn(async () => 'Bom dia, doutor.'),
  SttError: class SttError extends Error {
    code: string;
    status?: number;
    constructor(code: string, msg: string, status?: number) { super(msg); this.code = code; this.status = status; }
  },
  STT_MAX_BYTES: 25 * 1024 * 1024,
}));

import { prisma } from '../src/prisma';
import { hasStt, transcribeAudio } from '../src/utils/stt';
import { processPendingTranscriptions } from '../src/jobs/transcriptionQueue';
import { api, createUser, createDoctor, resetDb, authHeader } from './helpers';

const AUDIO = Buffer.alloc(512, 7);

async function seedEndedTeleconsulta() {
  const { user, patient } = await createUser();
  const doc = await createDoctor({ email: 'tx-status@test.com', crm: '99110-SP' });
  await prisma.doctorShare.create({ data: { patientId: patient.id, doctorId: doc.doctor.id, scopes: ['exams'] } });
  const r = await prisma.reminder.create({
    data: {
      ownerId: user.id, patientId: patient.id, title: 'Teleconsulta',
      dueDate: new Date(Date.now() - 3600_000), endedAt: new Date(),
      type: 'teleconsulta', consentAt: new Date(), recordConsentAt: new Date(),
      notifyOffsetsMin: [0],
    },
    select: { id: true },
  });
  return { user, doc, r, H: { Authorization: `Bearer ${doc.token}` } };
}

describe('Transcript status (bug histórico 26/10)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(hasStt).mockClear().mockReturnValue(true);
    vi.mocked(transcribeAudio).mockClear().mockResolvedValue('Bom dia, doutor.');
  });
  afterAll(() => { fs.rmSync('./data/test-teleconsultas', { recursive: true, force: true }); });

  it('upload → status processing; job conclui → ready com texto legível; summary grava recordingAt=null', async () => {
    const { r, H } = await seedEndedTeleconsulta();
    const up = await api().post(`/api/teleconsulta/${r.id}/recording`).set(H)
      .attach('file', AUDIO, { filename: 'rec.webm', contentType: 'audio/webm' });
    expect(up.status).toBe(202);

    // Pendente: áudio no disco, job ainda não rodou → o client mostra "processando" ANIMADO.
    const t0 = await api().get(`/api/teleconsulta/${r.id}/transcript`).set(H);
    expect(t0.status).toBe(200);
    expect(t0.body.status).toBe('processing');
    expect(t0.body.text).toBeNull();

    const s0 = await api().get(`/api/teleconsulta/${r.id}/summary`).set(H);
    expect(s0.body.recordingAt).toBeTruthy(); // STT pendente é visível no summary
    expect(s0.body.transcript).toBeNull();

    await processPendingTranscriptions();

    const t1 = await api().get(`/api/teleconsulta/${r.id}/transcript`).set(H);
    expect(t1.body.status).toBe('ready');
    expect(t1.body.text).toContain('Bom dia');
    const s1 = await api().get(`/api/teleconsulta/${r.id}/summary`).set(H);
    expect(s1.body.transcript?.at).toBeTruthy();
    expect(s1.body.recordingAt).toBeNull();
  });

  it('STT devolve VAZIO → abort honesto: nada de transcriptAt órfão (chip ✓ mentiroso)', async () => {
    const { r, H } = await seedEndedTeleconsulta();
    await api().post(`/api/teleconsulta/${r.id}/recording`).set(H)
      .attach('file', AUDIO, { filename: 'rec.webm', contentType: 'audio/webm' });

    transcribeAudio.mockResolvedValueOnce('   '); // silêncio — GROQ devolve whitespace
    await processPendingTranscriptions();

    const row = await prisma.reminder.findUnique({ where: { id: r.id }, select: { transcriptAt: true, recordingAt: true } });
    expect(row?.transcriptAt).toBeNull(); // o bug: antes gravava timestamp sem texto
    expect(row?.recordingAt).toBeNull();

    const t = await api().get(`/api/teleconsulta/${r.id}/transcript`).set(H);
    expect(t.body.status).toBe('none');
    expect(t.body.text).toBeNull();
    const s = await api().get(`/api/teleconsulta/${r.id}/summary`).set(H);
    expect(s.body.transcript).toBeNull(); // portal nem mostra o chip "Transcrição ✓"
  });

  it('sem gravação nenhuma → status none no GET e sem section no client', async () => {
    const { r, H } = await seedEndedTeleconsulta();
    const t = await api().get(`/api/teleconsulta/${r.id}/transcript`).set(H);
    expect(t.body.status).toBe('none');
    expect(t.body.text).toBeNull();
  });
});
