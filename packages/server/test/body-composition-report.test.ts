import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, authHeader, createUser, resetDb } from './helpers';
import { prisma } from '../src/prisma';
import { checkReportReading, looksLikeBodyComposition, numberInText, normalizeText } from '../src/bodycomp/report-reader';

// Laudo 100% SINTÉTICO (pessoa, clínica e valores fictícios), no jeito de uma folha Tanita.
const LAUDO = `CLÍNICA EXEMPLO — AVALIAÇÃO DE COMPOSIÇÃO CORPORAL (BIOIMPEDÂNCIA)
Aparelho: Tanita BC-601            Data da avaliação: 14/09/2026
Paciente: Fulano de Tal            Altura: 172 cm
Peso ............................ 78,4 kg      Faixa ideal: 54,7 - 74,0
Gordura corporal (%) .............. 24,1 %     Faixa: 8,0 - 19,9
Massa de gordura ................. 18,9 kg
Massa livre de gordura ........... 59,5 kg
Água corporal total .............. 43,6 L
Gordura visceral (nível) ......... 9
Taxa metabólica basal ............ 1.712 kcal
IMC .............................. 26,5
Avaliação anterior (10/06/2026): Peso 80,1 kg · Gordura 25,3 %`;

const GOOD = {
  measuredAt: '2026-09-14', deviceBrand: 'Tanita', deviceModel: 'BC-601', weightKg: 78.4, heightCm: 172,
  bodyFatPct: 24.1, fatMassKg: 18.9, fatFreeMassKg: 59.5, bodyWaterL: 43.6, visceralFatLevel: 9, bmrKcal: 1712, bmi: 26.5,
  skeletalMuscleKg: null, proteinKg: null, mineralKg: null, waistHipRatio: null,
};

const llm = vi.hoisted(() => ({ reply: '' as string, calls: 0 }));
vi.mock('../src/llm', () => ({
  getLlm: () => ({ complete: async () => { llm.calls++; return { text: llm.reply }; } }),
  getModel: () => 'test-model',
}));
const pdf = vi.hoisted(() => ({ text: '' as string }));
vi.mock('../src/extraction/pdfToText', () => ({ pdfToText: async () => pdf.text }));

const PDF_BYTES = Buffer.from('%PDF-1.4 sintético');

/** Envia e consulta até sair do "pending" (a leitura roda em segundo plano). */
async function sendReport(token: string) {
  const sent = await api().post('/api/body-composition/report').set(authHeader(token)).attach('file', PDF_BYTES, { filename: 'laudo.pdf', contentType: 'application/pdf' });
  expect(sent.status).toBe(202);
  for (let i = 0; i < 50; i++) {
    const res = await api().get(`/api/body-composition/report/${sent.body.jobId}`).set(authHeader(token));
    // Response do supertest guarda status/body fora das próprias chaves: copiar à mão.
    if (res.body.status !== 'pending') return { status: res.status, body: res.body, jobId: sent.body.jobId as string };
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('leitura não terminou');
}

describe('Leitor de laudo de bioimpedância — regras puras', () => {
  it('reconhece laudo de bioimpedância e recusa exame de sangue', () => {
    expect(looksLikeBodyComposition(LAUDO)).toBe(true);
    expect(looksLikeBodyComposition('HEMOGRAMA COMPLETO\nHemoglobina 14,2 g/dL\nLeucócitos 6.500\nPlaquetas 250.000\nPeso: 70 kg')).toBe(false);
    expect(looksLikeBodyComposition('Recibo de pagamento — consulta nutricional')).toBe(false);
  });

  it('número só vale se estiver escrito no laudo (vírgula, ponto, milhar; sem casar dentro de outro número)', () => {
    const t = normalizeText(LAUDO);
    expect(numberInText(78.4, t)).toBe(true);
    expect(numberInText(1712, t)).toBe(true); // "1.712"
    expect(numberInText(9, t)).toBe(true);
    expect(numberInText(78.5, t)).toBe(false);
    expect(numberInText(4.1, t)).toBe(false); // existe "24,1", não "4,1"
  });

  it('aceita a leitura correta e descarta campo que a IA inventou', () => {
    const r = checkReportReading({ ...GOOD, skeletalMuscleKg: 33.2 }, LAUDO, new Date('2026-11-12T12:00:00Z'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reading.values).toMatchObject({ weightKg: 78.4, bodyFatPct: 24.1, fatMassKg: 18.9, bmrKcal: 1712, visceralFatLevel: 9 });
    expect(r.reading.values.skeletalMuscleKg).toBeUndefined();
    expect(r.reading.dropped).toContain('skeletalMuscleKg');
    expect(r.reading.measuredAt?.toISOString().slice(0, 10)).toBe('2026-09-14');
    expect(r.reading.deviceBrand).toBe('Tanita');
  });

  it('pegar a meta/faixa no lugar do valor medido não fecha → recusa', () => {
    // 74,0 é o limite da faixa ideal, não o peso medido: gordura em kg e % deixam de fechar.
    const r = checkReportReading({ ...GOOD, weightKg: 74.0 }, LAUDO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INCONSISTENT');
  });

  it('data que não está escrita no laudo é descartada (usuário informa)', () => {
    const r = checkReportReading({ ...GOOD, measuredAt: '2026-09-15' }, LAUDO);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.reading.measuredAt).toBeNull(); expect(r.reading.dropped).toContain('measuredAt'); }
  });

  it('sem peso, ou só com peso, não serve', () => {
    const noWeight = checkReportReading({ ...GOOD, weightKg: null }, LAUDO);
    expect(noWeight.ok).toBe(false);
    if (!noWeight.ok) expect(noWeight.code).toBe('NO_WEIGHT');
    const onlyWeight = checkReportReading({ weightKg: 78.4 }, LAUDO);
    expect(onlyWeight.ok).toBe(false);
    if (!onlyWeight.ok) expect(onlyWeight.code).toBe('TOO_LITTLE');
  });
});

describe('API /body-composition/report', () => {
  beforeEach(async () => { await resetDb(); llm.calls = 0; });

  it('devolve PRÉVIA sem gravar; confirmar grava como REPORT', async () => {
    const u = await createUser();
    pdf.text = LAUDO;
    llm.reply = '```json\n' + JSON.stringify(GOOD) + '\n```';
    const res = await sendReport(u.token);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.preview).toMatchObject({ weightKg: 78.4, bodyFatPct: 24.1, deviceBrand: 'Tanita', needsReview: true });
    expect(res.body.preview.measuredAt.slice(0, 10)).toBe('2026-09-14');
    expect(await prisma.bodyComposition.count()).toBe(0);

    const { measuredAt, needsReview, ...values } = res.body.preview;
    const save = await api().post('/api/body-composition').set(authHeader(u.token)).send({ ...values, measuredAt: measuredAt.slice(0, 10), source: 'REPORT' });
    expect(save.status).toBe(201);
    expect(save.body.item).toMatchObject({ source: 'REPORT', weightKg: 78.4, bodyFatPct: 24.1, fatMassKg: 18.9, bodyWaterL: 43.6, visceralFatLevel: 9, bmrKcal: 1712 });
    const row = await prisma.bodyComposition.findFirstOrThrow({ select: { parserVersion: true, rawPayload: true } });
    expect(row.parserVersion).toBe('report-llm@1');
    expect(row.rawPayload).toBeNull(); // texto do laudo não é guardado
  });

  it('exame de sangue enviado aqui é recusado ANTES de chamar a IA', async () => {
    const u = await createUser();
    pdf.text = 'HEMOGRAMA COMPLETO\nHemoglobina 14,2 g/dL\nLeucócitos 6.500 /mm3\nPlaquetas 250.000\nGlicose 92 mg/dL\nColesterol total 180 mg/dL';
    const res = await sendReport(u.token);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NOT_BODYCOMP');
    expect(llm.calls).toBe(0);
  });

  it('IA que inventa ou mistura colunas → 422, nada gravado', async () => {
    const u = await createUser();
    pdf.text = LAUDO;
    llm.reply = JSON.stringify({ ...GOOD, weightKg: 74.0 });
    const res = await sendReport(u.token);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INCONSISTENT');
    llm.reply = 'Desculpe, não consegui.';
    const res2 = await sendReport(u.token);
    expect(res2.status).toBe(422);
    expect(res2.body.code).toBe('AI_FORMAT');
    expect(await prisma.bodyComposition.count()).toBe(0);
  });

  it('a leitura de um usuário não é visível para outro', async () => {
    const dono = await createUser();
    const outro = await createUser();
    pdf.text = LAUDO;
    llm.reply = JSON.stringify(GOOD);
    const { jobId } = await sendReport(dono.token);
    const espiando = await api().get(`/api/body-composition/report/${jobId}`).set(authHeader(outro.token));
    expect(espiando.status).toBe(404);
    expect(espiando.body).not.toHaveProperty('preview');
  });

  it('sem arquivo → 400; sem login → 401', async () => {
    const u = await createUser();
    expect((await api().post('/api/body-composition/report').set(authHeader(u.token))).status).toBe(400);
    expect((await api().post('/api/body-composition/report').attach('file', PDF_BYTES, { filename: 'l.pdf', contentType: 'application/pdf' })).status).toBe(401);
  });
});
