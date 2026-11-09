// /items/abnormal — estado atual por analito (dono 09/11: "TSH alterado há 3 meses
// que normalizou não pode continuar na lista"). Cenário TSH: alterado em ago →
// normal em nov = sai de `current`, entra em `normalized`; `items` (flat) segue
// completo pros consumidores de histórico (ExamList/Timeline/Sports).
import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma';
import { api, authHeader, resetDb, mintToken } from './helpers';

let seq = 0;
async function setup() {
  const u = await prisma.user.create({
    data: { email: `abn-${Date.now().toString(36)}-${seq++}@exemplo.com`, name: 'Pac Alterados', passwordHash: await bcrypt.hash('x', 4), credits: 0, emailVerified: true },
    select: { id: true },
  });
  const patient = await prisma.patient.create({ data: { ownerId: u.id, fullName: 'Pac Alterados' }, select: { id: true } });
  return { userId: u.id, patientId: patient.id };
}

async function mkExam(patientId: string, title: string, performedAt: Date, items: { name: string; valueText: string; valueNumeric: number; abnormal: boolean }[]) {
  const exam = await prisma.exam.create({
    data: { patientId, title, status: 'EXTRACTED', performedAt, sourceLab: 'Lab Teste', filePath: `/test/${title}.pdf`, fileSha256: `sha-${Date.now()}-${seq}` },
    select: { id: true },
  });
  for (const it of items) {
    await prisma.examItem.create({
      data: {
        examId: exam.id, name: it.name, nameCanonical: it.name, valueText: it.valueText, valueNumeric: it.valueNumeric,
        unit: 'mg/dL', isAbnormal: it.abnormal, flag: it.abnormal ? 'HIGH' : 'NORMAL', refText: '70 - 100', refLow: 70, refHigh: 100,
        extractedPage: 1,
      },
    });
  }
  return exam;
}

describe('GET /api/items/abnormal — estado atual por analito', () => {
  beforeEach(async () => { await resetDb(); });

  it('TSH antigo alterado + novo normal → sai de current, entra em normalized; flat intacto', async () => {
    const { userId, patientId } = await setup();
    const ago = new Date(Date.now() - 95 * 86_400_000);
    const ontem = new Date(Date.now() - 1 * 86_400_000);
    await mkExam(patientId, 'Exame ago', ago, [
      { name: 'TSH', valueText: '6.2', valueNumeric: 6.2, abnormal: true },
      { name: 'GLICOSE', valueText: '118', valueNumeric: 118, abnormal: true },
    ]);
    await mkExam(patientId, 'Exame ontem', ontem, [
      { name: 'TSH', valueText: '2.1', valueNumeric: 2.1, abnormal: false },
      { name: 'GLICOSE', valueText: '121', valueNumeric: 121, abnormal: true },
    ]);

    const r = await api().get(`/api/items/abnormal?patientId=${patientId}`).set(authHeader(mintToken(userId)));
    expect(r.status).toBe(200);

    // flat: todas as ocorrências alteradas (compat ExamList/Timeline)
    expect(r.body.items).toHaveLength(3);

    // current: só o que está alterado AGORA (última medição) — GLICOSE do exame de ontem
    expect(r.body.current).toHaveLength(1);
    expect(r.body.current[0]).toMatchObject({ nameCanonical: 'GLICOSE', valueText: '121', abnormalStreak: 2 });
    expect(r.body.current[0].prev).toMatchObject({ valueText: '118', isAbnormal: true });
    expect(r.body.current[0].spark.length).toBe(2);

    // normalized: TSH — de 6.2 (ago) para 2.1 (ontem), dentro da janela de 90d
    expect(r.body.normalized).toHaveLength(1);
    expect(r.body.normalized[0]).toMatchObject({ nameCanonical: 'TSH', abnormalCount: 1, withinWindow: true });
    expect(r.body.normalized[0].from).toMatchObject({ valueText: '6.2' });
    expect(r.body.normalized[0].to).toMatchObject({ valueText: '2.1' });
  });

  it('analito que NUNCA alterou não aparece em current nem normalized', async () => {
    const { userId, patientId } = await setup();
    await mkExam(patientId, 'Exame', new Date(Date.now() - 2 * 86_400_000), [
      { name: 'HEMOGLOBINA', valueText: '14', valueNumeric: 14, abnormal: false },
    ]);
    const r = await api().get(`/api/items/abnormal?patientId=${patientId}`).set(authHeader(mintToken(userId)));
    expect(r.body.items).toHaveLength(0);
    expect(r.body.current).toHaveLength(0);
    expect(r.body.normalized).toHaveLength(0);
  });

  it('normalização antiga (>90d) sai da janela de celebração (withinWindow false)', async () => {
    const { userId, patientId } = await setup();
    await mkExam(patientId, 'Exame antigo', new Date(Date.now() - 200 * 86_400_000), [
      { name: 'TSH', valueText: '6.2', valueNumeric: 6.2, abnormal: true },
    ]);
    await mkExam(patientId, 'Exame 4 meses atrás', new Date(Date.now() - 120 * 86_400_000), [
      { name: 'TSH', valueText: '2.0', valueNumeric: 2.0, abnormal: false },
    ]);
    const r = await api().get(`/api/items/abnormal?patientId=${patientId}`).set(authHeader(mintToken(userId)));
    expect(r.body.normalized).toHaveLength(1);
    expect(r.body.normalized[0].withinWindow).toBe(false);
  });
});
