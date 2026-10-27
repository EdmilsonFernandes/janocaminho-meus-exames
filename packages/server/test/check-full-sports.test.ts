import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, createUser, resetDb } from './helpers';
import { prisma } from '../src/prisma';
import { loadSettings, saveSettings } from '../src/utils/settings';

// Mock do LLM p/ CAPTURAR o prompt (regressão AAS P0.3: addendum esportivo no /check/full).
const { completeMock } = vi.hoisted(() => ({ completeMock: vi.fn().mockResolvedValue({ text: '✅ tudo certo' }) }));
vi.mock('../src/llm', () => ({
  getLlm: () => ({ complete: completeMock }),
  getModel: () => 'test-model',
}));

/** Cria paciente + exame EXTRAÍDO com 1 item alterado + med hormônio declarado + perfil esportivo. */
async function seedSportsPatient() {
  const { patient, token, user } = await createUser({ credits: 50 } as never);
  const exam = await prisma.exam.create({
    data: { patientId: patient.id, title: 'Hemograma', status: 'EXTRACTED', performedAt: new Date('2026-10-20T00:00:00Z'), filePath: '/tmp/test.pdf', fileSha256: 'test-sha' },
    select: { id: true },
  });
  await prisma.examItem.create({
    data: { examId: exam.id, name: 'HEMATÓCRITO', nameCanonical: 'HEMATOCRITO', valueText: '55', unit: '%', flag: 'HIGH', isAbnormal: true, extractedPage: 1 } as never,
  });
  await prisma.medication.create({
    data: { patientId: patient.id, name: '[Hormônio] Testosterona (enantato)', active: true } as never,
  });
  await prisma.sportsProfile.create({
    data: { patientId: patient.id, active: true, collectionContext: 'coleta em jejum, 48h após treino' } as never,
  });
  void user;
  return { patientId: patient.id, token };
}

describe('/check/full × contexto esportivo (AAS P0.3)', () => {
  beforeEach(async () => {
    await resetDb();
    await loadSettings();
    completeMock.mockClear();
  });

  it('perfil esportivo ATIVO + flag LIGADA → prompt recebe SUBSTÂNCIAS DECLARADAS e resposta marca sportsContextUsed', async () => {
    await saveSettings('sportsMode', { enabled: 1 });
    const { patientId, token } = await seedSportsPatient();

    const r = await api().post('/api/medications/check/full').set({ Authorization: `Bearer ${token}` }).send({ patientId });
    expect(r.status).toBe(200);
    expect(r.body.sportsContextUsed).toBe(true);

    const prompt = completeMock.mock.calls.at(-1)?.[0]?.messages?.[0]?.content ?? '';
    expect(prompt).toMatch(/SUBSTÂNCIAS DECLARADAS/);
    expect(prompt).toMatch(/CONTEXTO DE COLETA/i);
    // LGPD/segurança: dose NUNCA é usada como parâmetro; só o nome declarado entra
    expect(prompt).toContain('Testosterona (enantato)');
  });

  it('flag DESLIGADA (kill-switch) → prompt SEM o bloco esportivo e sportsContextUsed=false', async () => {
    await saveSettings('sportsMode', { enabled: 0 });
    const { patientId, token } = await seedSportsPatient();

    const r = await api().post('/api/medications/check/full').set({ Authorization: `Bearer ${token}` }).send({ patientId });
    expect(r.status).toBe(200);
    expect(r.body.sportsContextUsed).toBe(false);
    const prompt = completeMock.mock.calls.at(-1)?.[0]?.messages?.[0]?.content ?? '';
    expect(prompt).not.toMatch(/SUBSTÂNCIAS DECLARADAS/);
  });
});
