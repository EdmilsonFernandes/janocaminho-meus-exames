import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { api, authHeader, createUser, resetDb } from './helpers';
import { prisma } from '../src/prisma';

/** MOTOR DE SLOTS (item 7) — e2e: grade do paciente + booking com revalidação. */

const signDoctorToken = (doctorId: string) => jwt.sign({ doctorId, type: 'doctor' }, 'test-secret', { expiresIn: '7d' });

async function createDoctor() {
  const hash = await bcrypt.hash('senha123', 10);
  const d = await prisma.doctor.create({ data: { name: 'Dr Slots QA', email: `slots-${Date.now().toString(36)}@exemplo.com`, crm: `${Math.floor(Math.random() * 900000 + 100000)}-SP`, crmUf: 'SP', specialty: 'Clínico Geral', passwordHash: hash, verificationStatus: 'approved' } });
  return { id: d.id, token: signDoctorToken(d.id) };
}

const tomorrowISO = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

async function setupGrade(doctorId: string) {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const weekday = tomorrow.getDay();
  await prisma.doctorAvailability.create({
    data: { doctorId, weekday, startMinutes: 14 * 60, endMinutes: 16 * 60, slotMinutes: 30, active: true },
  });
}

async function mkPatient(userId: string, name = 'Paciente Slots') {
  return prisma.patient.create({ data: { ownerId: userId, fullName: name } });
}

describe('MOTOR DE SLOTS — grade, validação e booking com revalidação', () => {
  beforeEach(resetDb);

  it('GET slots: janelas ativas geram horários; ocupado fica unavailable', async () => {
    const doc = await createDoctor();
    await setupGrade(doc.id);
    const { user } = await createUser({ credits: 0 });
    const patient = await mkPatient(user.id);
    // Ocupa o primeiro slot (14:00)
    await prisma.reminder.create({
      data: { patientId: patient.id, ownerId: user.id, title: 'Ocupa 14:00', dueDate: new Date(`${tomorrowISO()}T14:00:00-03:00`), type: 'teleconsulta', createdByDoctorId: doc.id },
    });

    const { token } = await createUser({ credits: 0 });
    const r = await api().get(`/api/doctor/availability/${doc.id}/slots?date=${tomorrowISO()}`).set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.hasAvailability).toBe(true);
    expect(r.body.slots.length).toBe(4); // 14:00/14:30/15:00/15:30

    const s1400 = r.body.slots.find((s: any) => s.time === '14:00');
    expect(s1400.available).toBe(false); // ocupado

    const s1430 = r.body.slots.find((s: any) => s.time === '14:30');
    expect(s1430.available).toBe(true);
  });

  it('PUT availability: valida weekday/minutos/slot e salva atômico', async () => {
    const doc = await createDoctor();
    const bad = await api().put('/api/doctor/availability').set(authHeader(doc.token)).send({ items: [{ weekday: 7, startMinutes: 840, endMinutes: 1080, slotMinutes: 30 }] });
    expect(bad.status).toBe(400);

    const bad2 = await api().put('/api/doctor/availability').set(authHeader(doc.token)).send({ items: [{ weekday: 2, startMinutes: 840, endMinutes: 850, slotMinutes: 30 }] });
    expect(bad2.status).toBe(400);

    const ok = await api().put('/api/doctor/availability').set(authHeader(doc.token)).send({ items: [{ weekday: 2, startMinutes: 840, endMinutes: 1080, slotMinutes: 30 }] });
    expect(ok.status).toBe(200);
    expect(ok.body.items.length).toBe(1);
    expect(ok.body.items[0].startMinutes).toBe(840);
  });

  it('POST my-consultations: fora da janela → 409; válido → cria; repetido → 409 SLOT_TAKEN', async () => {
    const doc = await createDoctor();
    await setupGrade(doc.id);
    const { user, token } = await createUser({ credits: 0 });
    const patient = await mkPatient(user.id);

    // 1) Fora da janela (10:00 — janela é 14:00-16:00)
    const out = await api().post('/api/my-consultations').set(authHeader(token)).send({
      patientId: patient.id,
      doctorId: doc.id,
      mode: 'teleconsulta',
      scheduledAt: `${tomorrowISO()}T10:00:00-03:00`,
    });
    expect(out.status).toBe(409);
    expect(out.body.code).toBe('SLOT_OUT_OF_WINDOW');

    // 2) Válido (14:30)
    const ok = await api().post('/api/my-consultations').set(authHeader(token)).send({
      patientId: patient.id,
      doctorId: doc.id,
      mode: 'teleconsulta',
      scheduledAt: `${tomorrowISO()}T14:30:00-03:00`,
    });
    expect(ok.status).toBe(201);

    // 3) Mesmo slot (14:30) — outro paciente
    const { user: u2, token: t2 } = await createUser({ credits: 0 });
    const p2 = await mkPatient(u2.id, 'Paciente 2');
    const taken = await api().post('/api/my-consultations').set(authHeader(t2)).send({
      patientId: p2.id,
      doctorId: doc.id,
      mode: 'teleconsulta',
      scheduledAt: `${tomorrowISO()}T14:30:00-03:00`,
    });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('SLOT_TAKEN');
  });
});
