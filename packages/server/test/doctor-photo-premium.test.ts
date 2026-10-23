// E2E (supertest) — foto de perfil do médico = Dr. Exame Pro (dono 23/10) e
// e-mail de agendamento de teleconsulta (23/10).
// Gate: POST /doctor/me/photo exige plano premium ATIVO (free → 402; não consome
// o free tier de 5 usos — foto é identidade contínua, não "uso" mensal).
// GET /doctor/photo/:id de médico free responde 404 mesmo com fotoUrl no banco
// (display único ponto de gate). Agendamento: além do push, dispara e-mail com
// CTA direto pra sala (sendEmail é mockado no setup — assertimos a chamada).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../src/prisma';
import { sendEmail } from '../src/utils/mailer';
import { api, createUser, createDoctor, resetDb } from './helpers';

const H2 = (t: string) => ({ Authorization: `Bearer ${t}` });
// PNG 8x8 inline (floor do sharp) — fixture .jpg do repo local é gitignored e o CI
// não o tinha (ENOENT no runner, run 39950771853). Sem dependência de arquivo.
const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII=',
  'base64',
);

describe('POST /api/doctor/me/photo (Pro-only)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(sendEmail).mockClear();
  });

  it('médico free → 402 premium_required (não sobe, não consome free tier)', async () => {
    const { token, doctor } = await createDoctor({ crm: '71001-SP', email: 'photofree@t.com' });
    const res = await api().post('/api/doctor/me/photo').set(H2(token)).attach('photo', PHOTO, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('premium_required');
    // Free tier intacto: o gate da foto não incrementa freeUsageCount
    const d = await prisma.doctor.findUnique({ where: { id: doctor.id }, select: { freeUsageCount: true } });
    expect(d?.freeUsageCount).toBe(0);
  });

  it('médico premium ativo → 200 + photoUrl', async () => {
    const { token, doctor } = await createDoctor({ crm: '71002-SP', email: 'photopro@t.com' });
    await prisma.doctor.update({ where: { id: doctor.id }, data: { plan: 'premium', planExpiresAt: new Date(Date.now() + 86400000) } });
    const res = await api().post('/api/doctor/me/photo').set(H2(token)).attach('photo', PHOTO, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.photoUrl).toContain(`/api/doctor/photo/${doctor.id}`);
  });

  it('premium EXPIRADO → 402 (plano ativo = premium + planExpiresAt no futuro)', async () => {
    const { token, doctor } = await createDoctor({ crm: '71003-SP', email: 'photoold@t.com' });
    await prisma.doctor.update({ where: { id: doctor.id }, data: { plan: 'premium', planExpiresAt: new Date(Date.now() - 86400000) } });
    const res = await api().post('/api/doctor/me/photo').set(H2(token)).attach('photo', PHOTO, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(402);
  });
});

describe('médico agenda teleconsulta → e-mail com CTA da sala (23/10)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(sendEmail).mockClear();
  });

  it('201 + sendEmail pro owner com subject "Teleconsulta agendada" e link da sala', async () => {
    const { user, patient, token } = await createUser();
    const crm = '71004-SP';
    const { token: docToken, doctor } = await createDoctor({ crm, email: 'agendador@t.com' });
    await api().post('/api/doctor-shares').set(H2(token)).send({ doctorCrm: crm, scopes: ['exams'] });
    const due = new Date(Date.now() + 3 * 86400000);
    due.setHours(12, 0, 0, 0);
    const res = await api().post(`/api/doctor/patients/${patient.id}/teleconsulta`).set(H2(docToken)).send({ dueDate: due.toISOString(), linkUrl: 'https://meet.google.com/mail-test' });
    expect(res.status).toBe(201);
    const call = vi.mocked(sendEmail).mock.calls.find((c) => c[0].to === user.email && /Teleconsulta agendada/.test(c[0].subject));
    expect(call).toBeTruthy();
    expect(call![0].html).toContain(`/#/teleconsulta/${res.body.reminder.id}`); // App Link direto pra sala
    expect(call![0].html).toContain(doctor.name.split(' ')[0]); // nome do médico no e-mail
  });
});
