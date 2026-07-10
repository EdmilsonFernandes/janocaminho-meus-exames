import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createExam } from './helpers';
import { prisma } from '../src/prisma';

const PDF = Buffer.from('%PDF-1.4 mock exam content');

describe('exames: upload, escopo, delete, duplicatas', () => {
  beforeEach(async () => { await resetDb(); });

  it('POST /exams faz upload (201) e re-envio do mesmo arquivo → duplicate:true', async () => {
    const { patient, token } = await createUser();

    const up = await api().post('/api/exams').set(authHeader(token))
      .attach('file', PDF, 'exame.pdf');
    expect(up.status).toBe(201);
    expect(up.body.id).toBeTruthy();
    expect(up.body.duplicate).toBeFalsy();
    expect(up.body.filePath).toBeFalsy(); // serializeExam esconde filePath

    // idempotência: mesmo buffer (mesmo sha) + mesmo paciente → devolve o existente
    const dup = await api().post('/api/exams').set(authHeader(token))
      .attach('file', PDF, 'exame.pdf');
    expect(dup.status).toBe(200);
    expect(dup.body.id).toBe(up.body.id);
    expect(dup.body.duplicate).toBe(true);

    // só 1 exame no banco
    const count = await prisma.exam.count({ where: { patientId: patient.id } });
    expect(count).toBe(1);
  });

  it('GET /exams lista só exames dos pacientes do usuário (escopo)', async () => {
    const mine = await createUser();
    const other = await createUser();
    await createExam(mine.patient.id, { title: 'Meu Hemograma' });
    await createExam(mine.patient.id, { title: 'Minha Glicemia' });
    await createExam(other.patient.id, { title: 'Exame Alheio' });

    const r = await api().get('/api/exams').set(authHeader(mine.token));
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(2);
    expect(r.body.every((e: any) => e.title !== 'Exame Alheio')).toBe(true);
  });

  it('DELETE /exams/:id remove o exame', async () => {
    const { patient, token } = await createUser();
    const exam = await createExam(patient.id);

    const r = await api().delete(`/api/exams/${exam.id}`).set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(exam.id);
    expect(await prisma.exam.findUnique({ where: { id: exam.id } })).toBeNull();
  });

  it('GET /exams/duplicates/list agrupa por data + título normalizado', async () => {
    const { patient, token } = await createUser();
    const dia = new Date('2026-01-15T00:00:00Z');
    // 2 exames "Hemograma" no mesmo dia (acentos/case não importam) → 1 grupo duplicado
    await createExam(patient.id, { title: 'Hemograma', performedAt: dia });
    await createExam(patient.id, { title: '  HEMOGRAMA  ', performedAt: dia });
    // 1 exame diferente → não forma par
    await createExam(patient.id, { title: 'Glicemia', performedAt: dia });
    // exame em outro dia → não junta
    await createExam(patient.id, { title: 'Hemograma', performedAt: new Date('2026-03-01T00:00:00Z') });

    const r = await api().get('/api/exams/duplicates/list').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1); // só o par de hemogramas no dia 15/01
    expect(r.body.duplicates[0]).toHaveLength(2);
  });

  it('GET /exams/duplicates/list sem duplicatas → total 0', async () => {
    const { patient, token } = await createUser();
    await createExam(patient.id, { title: 'Hemograma', performedAt: new Date('2026-01-15T00:00:00Z') });
    await createExam(patient.id, { title: 'Glicemia', performedAt: new Date('2026-01-15T00:00:00Z') });

    const r = await api().get('/api/exams/duplicates/list').set(authHeader(token));
    expect(r.body.total).toBe(0);
  });

  it('POST /analyses bloqueia exame com CPF divergente', async () => {
    const { patient, token } = await createUser({ credits: 100 });
    const exam = await createExam(patient.id);
    await prisma.exam.update({
      where: { id: exam.id },
      data: { rawExtraction: { identityMatch: { method: 'cpf', mismatch: true, severity: 'hard_block' } } },
    });

    const r = await api().post('/api/analyses').set(authHeader(token)).send({ examId: exam.id });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('cpf_mismatch');
  });
});
