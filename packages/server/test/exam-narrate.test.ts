// 🔊 Narração do resumo por exame (POST /api/exams/:id/narrate):
// - roteiro pt-BR determinístico (buildExamNarration, função pura)
// - 1 geração por exame cobra créditos de chat; replay do cache é grátis
// - IDOR: exame alheio → 404; exame não extraído → 409; sem saldo → 402
import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, createUser, createExam, createItem, getUserCredits, api, authHeader } from './helpers';
import { buildExamNarration, type NarrationItem } from '../src/utils/examNarration';
import { CREDIT_COSTS } from '../src/utils/credits';

const abnormalItem = (o: Partial<NarrationItem> = {}): NarrationItem => ({
  name: 'GLICEMIA',
  nameCanonical: 'GLICEMIA',
  valueNumeric: 140,
  valueText: '140',
  unit: 'mg/dL',
  refLow: 70,
  refHigh: 99,
  flag: 'HIGH',
  isAbnormal: true,
  ...o,
});

describe('buildExamNarration (pura)', () => {
  it('monta o roteiro com nome, data, contagem, glossário leigo, score e disclaimer', () => {
    const text = buildExamNarration({
      patientName: 'Maria Oliveira Souza',
      examTitle: 'Hemograma Completo',
      performedAt: new Date('2026-01-15T00:00:00Z'),
      items: [abnormalItem(), abnormalItem({ name: 'HEMOGLOBINA', nameCanonical: 'HEMOGLOBINA', valueNumeric: 10.1, valueText: '10,1', refLow: 12, refHigh: 16, flag: 'LOW' })],
      score: 72,
    });
    expect(text).toContain('Maria');           // primeiro nome
    expect(text).toContain('2 valores');       // contagem de alterados
    expect(text).toContain('açúcar no sangue'); // glossário leigo (GLICEMIA)
    expect(text).toContain('proteína que transporta oxigênio'); // glossário (HEMOGLOBINA)
    expect(text).toContain('72 de 100');       // score
    expect(text).toContain('Consulte seu médico'); // disclaimer obrigatório
  });

  it('limita aos 3 maiores desvios e mantém texto curto (30–60s de fala)', () => {
    const items = [
      abnormalItem({ name: 'A', nameCanonical: 'GLICEMIA', valueNumeric: 150 }),      // +51%
      abnormalItem({ name: 'B', nameCanonical: 'COLESTEROL_TOTAL', valueNumeric: 300, refLow: 0, refHigh: 190, unit: 'mg/dL' }),
      abnormalItem({ name: 'C', nameCanonical: 'ACIDO_URICO', valueNumeric: 9, refLow: 3.5, refHigh: 7.2, unit: 'mg/dL' }),
      abnormalItem({ name: 'D', nameCanonical: 'FERRITINA', valueNumeric: 10, refLow: 23, refHigh: 120, unit: 'ng/mL', flag: 'LOW' }),
    ];
    const text = buildExamNarration({ patientName: 'João', examTitle: 'Painel', performedAt: null, items, score: null });
    expect(text).toContain('4 valores');
    expect(text).not.toContain('FERRITINA'); // 4º maior desvio não entra
    expect(text.length).toBeLessThan(900);    // ~60s de fala
  });

  it('sem alterados: mensagem positiva (sem top 3)', () => {
    const text = buildExamNarration({
      patientName: 'Ana', examTitle: 'Painel', performedAt: new Date(),
      items: [{ name: 'LDL', nameCanonical: 'LDL', valueNumeric: 90, valueText: '90', unit: 'mg/dL', refLow: 0, refHigh: 130, flag: 'NORMAL', isAbnormal: false }],
      score: null,
    });
    expect(text).toContain('dentro da faixa');
    expect(text).toContain('Consulte seu médico');
  });
});

describe('POST /api/exams/:id/narrate', () => {
  beforeEach(resetDb);

  it('gera o roteiro, cobra créditos de chat e cacheia (2ª chamada grátis)', async () => {
    const { user, patient, token } = await createUser({ credits: 10 });
    const exam = await createExam(patient.id);
    await createItem(exam.id, { name: 'GLICEMIA', nameCanonical: 'GLICEMIA', valueNumeric: 140, valueText: '140', unit: 'mg/dL', refLow: 70, refHigh: 99, flag: 'HIGH', isAbnormal: true });
    await createItem(exam.id, { name: 'LDL', nameCanonical: 'LDL', valueNumeric: 90, valueText: '90', unit: 'mg/dL', refLow: 0, refHigh: 130, flag: 'NORMAL' });

    const r1 = await api().post(`/api/exams/${exam.id}/narrate`).set(authHeader(token));
    expect(r1.status).toBe(200);
    expect(r1.body.cached).toBe(false);
    expect(r1.body.text).toContain('GLICEMIA');
    expect(r1.body.text).toContain('Consulte seu médico');
    expect(await getUserCredits(user.id)).toBe(10 - CREDIT_COSTS.chat);

    // replay: cache → sem nova cobrança
    const r2 = await api().post(`/api/exams/${exam.id}/narrate`).set(authHeader(token));
    expect(r2.status).toBe(200);
    expect(r2.body.cached).toBe(true);
    expect(r2.body.text).toBe(r1.body.text);
    expect(await getUserCredits(user.id)).toBe(10 - CREDIT_COSTS.chat);
  });

  it('402 quando não há créditos', async () => {
    const { patient, token } = await createUser({ credits: 0 });
    const exam = await createExam(patient.id);
    const r = await api().post(`/api/exams/${exam.id}/narrate`).set(authHeader(token));
    expect(r.status).toBe(402);
    expect(r.body.error).toBe('insufficient_credits');
  });

  it('409 para exame ainda não extraído', async () => {
    const { patient, token } = await createUser();
    const exam = await createExam(patient.id, { status: 'EXTRACTING' });
    const r = await api().post(`/api/exams/${exam.id}/narrate`).set(authHeader(token));
    expect(r.status).toBe(409);
  });

  it('404 para exame de outro usuário (IDOR)', async () => {
    const { patient } = await createUser();
    const exam = await createExam(patient.id);
    const other = await createUser();
    const r = await api().post(`/api/exams/${exam.id}/narrate`).set(authHeader(other.token));
    expect(r.status).toBe(404);
  });
});
