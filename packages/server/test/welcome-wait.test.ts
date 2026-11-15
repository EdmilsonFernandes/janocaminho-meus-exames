import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, createUser, resetDb } from './helpers';
import { prisma } from '../src/prisma';
import { grantFirstExamBonus } from '../src/extraction/pipeline';

// PDF mínimo válido (magic bytes) — o conteúdo não importa: os testes param antes da extração.
const pdf = (tag: string) => Buffer.from(`%PDF-1.4\n% ${tag}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF`);

/** Conta recém-criada: saldo zero e bônus de boas-vindas ainda não concedido. */
async function newcomer() {
  const u = await createUser({ credits: 0 });
  await prisma.user.update({ where: { id: u.user.id }, data: { firstExamBonusGranted: false } });
  return u;
}
const firstExam = (patientId: string, status: string) =>
  prisma.exam.create({ data: { patientId, title: 'Primeiro exame', status, filePath: '/test/primeiro.pdf', fileSha256: `sha-first-${Date.now()}-${Math.random()}` } as never });
const upload = (token: string, tag: string) => api().post('/api/exams').set(authHeader(token)).field('title', `Exame ${tag}`).attach('file', pdf(tag), `${tag}.pdf`);
const credits = async (id: string) => (await prisma.user.findUnique({ where: { id }, select: { credits: true } }))!.credits;

describe('1º exame em análise: espera pelos créditos de boas-vindas (não é falta de crédito)', () => {
  beforeEach(async () => { await resetDb(); });

  it.each(['UPLOADED', 'EXTRACTING'])('1º exame %s: o 2º envio recebe "aguarde", não a oferta de compra', async (status) => {
    const u = await newcomer();
    await firstExam(u.patient.id, status);
    const r = await upload(u.token, 'segundo');
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('first_exam_processing');
    expect(r.body.message).toContain('primeiro exame');
    // não criou exame nem registrou "bateu no paywall"
    expect(await prisma.exam.count({ where: { patientId: u.patient.id } })).toBe(1);

    const st = await api().get('/api/billing/status').set(authHeader(u.token));
    expect(st.body.firstExamInProgress).toBe(true);
    expect(st.body.firstExamBonusGranted).toBe(false);
    expect(st.body.credits).toBe(0);
  });

  it('1º exame concluído: bônus entra, o status avisa e o envio seguinte passa cobrando do bônus', async () => {
    const u = await newcomer();
    const first = await firstExam(u.patient.id, 'EXTRACTING');
    expect((await upload(u.token, 'cedo')).status).toBe(409);

    await prisma.exam.update({ where: { id: first.id }, data: { status: 'EXTRACTED' } });
    expect(await grantFirstExamBonus(u.user.id, 45)).toBe(true);

    const st = await api().get('/api/billing/status').set(authHeader(u.token));
    expect(st.body.firstExamInProgress).toBe(false);
    expect(st.body.firstExamBonusGranted).toBe(true);
    expect(st.body.credits).toBe(45);

    const r = await upload(u.token, 'depois');
    expect(r.status).toBeLessThan(300);
    expect(await credits(u.user.id)).toBeLessThan(45);
    expect(await credits(u.user.id)).toBeGreaterThan(0);
  });

  it('1º exame falhou: o próximo envio continua sendo o grátis de boas-vindas', async () => {
    const u = await newcomer();
    await firstExam(u.patient.id, 'FAILED');
    const r = await upload(u.token, 'nova-tentativa');
    expect(r.status).toBeLessThan(300);
    expect(await credits(u.user.id)).toBe(0); // nada cobrado
    const st = await api().get('/api/billing/status').set(authHeader(u.token));
    expect(st.body.firstExamInProgress).toBe(true); // agora é este que está em análise
  });

  it('quem já recebeu o bônus e gastou tudo: aí sim é falta de crédito (402)', async () => {
    const u = await createUser({ credits: 0 });
    await prisma.user.update({ where: { id: u.user.id }, data: { firstExamBonusGranted: true } });
    await firstExam(u.patient.id, 'EXTRACTED');
    await firstExam(u.patient.id, 'EXTRACTING');
    const r = await upload(u.token, 'sem-saldo');
    expect(r.status).toBe(402);
    expect(r.body.error).toBe('no_credits_upload');
  });

  it('bônus pendente mas NADA em análise e saldo zero: 402 normal (não fica esperando para sempre)', async () => {
    const u = await newcomer();
    await firstExam(u.patient.id, 'EXTRACTED'); // extraído sem bônus (ex.: CPF divergente)
    const r = await upload(u.token, 'outro');
    expect(r.status).toBe(402);
  });

  it('concessões simultâneas: o bônus entra uma vez só', async () => {
    const u = await newcomer();
    const results = await Promise.all(Array.from({ length: 6 }, () => grantFirstExamBonus(u.user.id, 45)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await credits(u.user.id)).toBe(45);
    expect(await prisma.creditTransaction.count({ where: { userId: u.user.id, kind: 'first_exam_bonus' } })).toBe(1);
  });

  it('envios repetidos durante a espera não criam exame nem cobram', async () => {
    const u = await newcomer();
    await firstExam(u.patient.id, 'EXTRACTING');
    const rs = await Promise.all(['a', 'b', 'c', 'd'].map((t) => upload(u.token, t)));
    expect(rs.map((r) => r.status)).toEqual([409, 409, 409, 409]);
    expect(await prisma.exam.count({ where: { patientId: u.patient.id } })).toBe(1);
    expect(await credits(u.user.id)).toBe(0);
  });
});
