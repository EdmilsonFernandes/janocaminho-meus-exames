// E2E (supertest) — dono 26/10: consulta que NÃO acontece não some nem fica muda.
//   • DELETE cancel → teleStatus 'cancelled' (histórico honesto, NÃO apaga) + push
//     (paciente/Android) + e-mail (paciente e médico) com QUEM cancelou e o MOTIVO.
//   • /end no_show/technical → mesma notificação dupla (linha do /end chama o mesmo
//     notifyTeleconsultaNotHeld — coberto aqui pelo unitário de notHeldReason).
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/mailer', () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));
vi.mock('../src/utils/push', () => ({ sendPushToUser: vi.fn(async () => ({ sent: 1 })) }));

import { prisma } from '../src/prisma';
import { sendEmail } from '../src/utils/mailer';
import { sendPushToUser } from '../src/utils/push';
import { notHeldReason } from '../src/utils/teleconsultaNotify';
import { api, createUser, createDoctor, resetDb, authHeader } from './helpers';

async function seedScheduledTeleconsulta() {
  const { user, patient } = await createUser();
  const doc = await createDoctor({ email: 'cancel-doc@test.com', crm: '88220-SP' });
  await prisma.doctorShare.create({ data: { patientId: patient.id, doctorId: doc.doctor.id, scopes: ['exams'] } });
  const r = await prisma.reminder.create({
    data: {
      ownerId: user.id, patientId: patient.id, title: 'Retorno teleconsulta',
      dueDate: new Date(Date.now() + 24 * 3600_000),
      type: 'teleconsulta', consentAt: new Date(),
      createdByDoctorId: doc.doctor.id,
      notifyOffsetsMin: [60],
    },
    select: { id: true },
  });
  return { user, patient, doc, r, H: { Authorization: `Bearer ${doc.token}` } };
}

describe('DELETE /doctor/patients/:pid/teleconsulta/:rid — cancelada com motivo', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(sendEmail).mockClear();
    vi.mocked(sendPushToUser).mockClear();
  });

  it('marca cancelled (não apaga) + notifica paciente (push+email) e médico (email) com quem/motivo', async () => {
    const { user, patient, doc, r, H } = await seedScheduledTeleconsulta();

    const res = await api().delete(`/api/doctor/patients/${patient.id}/teleconsulta/${r.id}`)
      .set(H).send({ reason: 'Conflito de agenda' });
    expect(res.status).toBe(200);

    // Notify é fire-and-forget (a resposta não espera o push/e-mail) → poll curto.
    const cancelMails = () => vi.mocked(sendEmail).mock.calls.map((c) => c[0]).filter((m) => /cancelada/i.test(m.subject));
    const t0 = Date.now();
    while ((vi.mocked(sendPushToUser).mock.calls.length < 1 || cancelMails().length < 2) && Date.now() - t0 < 4000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    const row = await prisma.reminder.findUnique({ where: { id: r.id }, select: { endedAt: true, teleStatus: true, noShowBy: true } });
    expect(row).not.toBeNull(); // NÃO deletado — vai pro histórico
    expect(row?.teleStatus).toBe('cancelled');
    expect(row?.endedAt).toBeTruthy();
    expect(row?.noShowBy).toBeNull();

    // Push: 1× pro paciente (owner), com quem cancelou e o motivo.
    const pushes = vi.mocked(sendPushToUser).mock.calls;
    expect(pushes.length).toBe(1);
    expect(pushes[0][0]).toBe(user.id);
    expect(String(pushes[0][2])).toContain('cancelada');
    expect(String(pushes[0][2])).toContain('Conflito de agenda');

    // E-mail: paciente + médico, assunto de cancelamento. (O seed do médico também
    // dispara e-mail de verificação de conta — o filtro por assunto isola o lote.)
    const mails = cancelMails();
    expect(mails.length).toBe(2);
    expect(mails.some((m) => m.to === user.email)).toBe(true);
    expect(mails.some((m) => m.to === doc.doctor.email)).toBe(true);

    // Race/dedup: cancelar de novo → 409, sem segunda rodada de notificação.
    const again = await api().delete(`/api/doctor/patients/${patient.id}/teleconsulta/${r.id}`).set(H);
    expect(again.status).toBe(409);
    const t1 = Date.now();
    while (Date.now() - t1 < 400) await new Promise((r) => setTimeout(r, 50)); // garante que nada async vaze
    expect(vi.mocked(sendPushToUser).mock.calls.length).toBe(1);
    expect(cancelMails().length).toBe(2);
  });

  it('motivo do body é sanitizado (string >300 chars trunca, não-string ignora)', async () => {
    const { patient, r, H } = await seedScheduledTeleconsulta();
    const long = 'x'.repeat(400);
    const res = await api().delete(`/api/doctor/patients/${patient.id}/teleconsulta/${r.id}`)
      .set(H).send({ reason: long });
    expect(res.status).toBe(200);
    const push = vi.mocked(sendPushToUser).mock.calls[0];
    expect(String(push?.[2]).length).toBeLessThan(400);
  });
});

describe('notHeldReason — frases honestas por desfecho (unit)', () => {
  it('cobre os 5 casos sem vazar jargão', () => {
    expect(notHeldReason({ outcome: 'cancelled', byName: 'Dra. Helena', reason: 'doença' }))
      .toBe('Consulta cancelada por Dra. Helena — motivo: doença.');
    expect(notHeldReason({ outcome: 'cancelled', byName: null, reason: null }))
      .toBe('Consulta cancelada pelo médico.');
    expect(notHeldReason({ outcome: 'technical' })).toContain('problema técnico');
    expect(notHeldReason({ outcome: 'no_show', noShowBy: 'patient' })).toContain('paciente não compareceu');
    expect(notHeldReason({ outcome: 'no_show', noShowBy: 'doctor' })).toContain('médico não compareceu');
    expect(notHeldReason({ outcome: 'no_show', noShowBy: 'none' })).toContain('Ninguém entrou');
  });
});
