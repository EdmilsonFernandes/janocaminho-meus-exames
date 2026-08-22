import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createPatient, createExam, createItem } from './helpers';
import { prisma } from '../src/prisma';

/**
 * E2E MODO CUIDADOR + FAIXAS PEDIÁTRICAS (Lote 2) — valida pela API o mesmo fluxo do
 * manual de teste do dono (UC1: Helena/Theo), sem tocar em prod nem gastar IA:
 * o PATCH do item é o mesmo caminho de decisão (ageBandAt + applyPediatricRange)
 * que o pipeline usa no fim da extração.
 */
describe('faixas pediátricas (Lote 2) — dependente de 4 anos', () => {
  beforeEach(async () => { await resetDb(); });

  it('FOSFATASE 300 com ref de ADULTO no exame de criança → régua 2-6a, falso ⚠️ vira ✅', async () => {
    const { user, token } = await createUser({});
    // Theo: nascido 2022-06-15 → exame em 2026-08-01 = 4 anos (banda 2-6a)
    const dep = await createPatient(user.id, { fullName: 'Theo Teste', relationship: 'Filho', dateOfBirth: new Date('2022-06-15T00:00:00Z') });
    const exam = await createExam(dep.id, { title: 'Hemograma + Bioquímica', performedAt: new Date('2026-08-01T00:00:00Z') });
    // Lab imprimiu default ADULTO (40-130) → 300 ficaria HIGH (o falso-alarme clássico)
    const item = await createItem(exam.id, { name: 'Fosfatase Alcalina', nameCanonical: 'FOSFATASE', valueNumeric: 300, unit: 'UI/L', refLow: 40, refHigh: 130, flag: 'HIGH', isAbnormal: true });

    const r = await api().patch(`/api/items/${item.id}`).set(authHeader(token)).send({ valueNumeric: 300 });
    expect(r.status).toBe(200);
    expect(r.body.refLow).toBe(105);            // régua pediátrica 2-6a
    expect(r.body.refHigh).toBe(420);
    expect(r.body.flag).toBe('NORMAL');          // 300 é NORMAL pra 4 anos
    expect(r.body.isAbnormal).toBe(false);
    expect(String(r.body.refAppliesTo)).toContain('Pediátrico');
    expect(String(r.body.refAppliesTo)).toContain('2–6 anos');
  });

  it('LEUCÓCITOS 9.800 de 4 anos com ref adulta → NORMAL (antes: HIGH falso no limite)', async () => {
    const { user, token } = await createUser({});
    const dep = await createPatient(user.id, { fullName: 'Ana Teste', relationship: 'Filha', dateOfBirth: new Date('2022-01-10T00:00:00Z') });
    const exam = await createExam(dep.id, { performedAt: new Date('2026-08-01T00:00:00Z') });
    const item = await createItem(exam.id, { name: 'Leucócitos', nameCanonical: 'LEUCOCITOS', valueNumeric: 9800, unit: '/mm³', refLow: 4000, refHigh: 11000, flag: 'NORMAL', isAbnormal: false });

    const r = await api().patch(`/api/items/${item.id}`).set(authHeader(token)).send({ valueNumeric: 9800 });
    expect(r.status).toBe(200);
    expect(r.body.refLow).toBe(5000);
    expect(r.body.refHigh).toBe(15000);
    expect(r.body.flag).toBe('NORMAL');
  });

  it('TITULAR (sem nascimento): PATCH NÃO muda a referência — adulto intocado', async () => {
    const { user, patient, token } = await createUser({});
    expect(patient).toBeTruthy();
    const exam = await createExam(patient.id, { performedAt: new Date('2026-08-01T00:00:00Z') });
    const item = await createItem(exam.id, { name: 'Fosfatase Alcalina', nameCanonical: 'FOSFATASE', valueNumeric: 300, unit: 'UI/L', refLow: 40, refHigh: 130, flag: 'HIGH', isAbnormal: true });

    const r = await api().patch(`/api/items/${item.id}`).set(authHeader(token)).send({ valueNumeric: 300 });
    expect(r.status).toBe(200);
    expect(r.body.refLow).toBe(40);              // régua do laudo intacta
    expect(r.body.refHigh).toBe(130);
    expect(r.body.flag).toBe('HIGH');            // segue adulto
    expect(r.body.isAbnormal).toBe(true);
  });

  it('laudo trouxe faixa PRÓPRIA infantil (100-500) → pediatria NÃO sobrepõe', async () => {
    const { user, token } = await createUser({});
    const dep = await createPatient(user.id, { fullName: 'Bebê Teste', relationship: 'Filho', dateOfBirth: new Date('2024-03-01T00:00:00Z') });
    const exam = await createExam(dep.id, { performedAt: new Date('2026-08-01T00:00:00Z') });
    const item = await createItem(exam.id, { name: 'Fosfatase Alcalina', nameCanonical: 'FOSFATASE', valueNumeric: 300, unit: 'UI/L', refLow: 100, refHigh: 500, flag: 'NORMAL', isAbnormal: false });

    const r = await api().patch(`/api/items/${item.id}`).set(authHeader(token)).send({ valueNumeric: 300 });
    expect(r.status).toBe(200);
    expect(r.body.refLow).toBe(100);             // faixa do laudo vence
    expect(r.body.refHigh).toBe(500);
    expect(r.body.flag).toBe('NORMAL');
  });

  it('usuário digita faixa MANUAL no PATCH → respeitada (nunca sobrepõe humano)', async () => {
    const { user, token } = await createUser({});
    const dep = await createPatient(user.id, { fullName: 'Lia Teste', relationship: 'Filha', dateOfBirth: new Date('2020-01-01T00:00:00Z') });
    const exam = await createExam(dep.id, { performedAt: new Date('2026-08-01T00:00:00Z') });
    const item = await createItem(exam.id, { name: 'Hemoglobina', nameCanonical: 'HEMOGLOBINA', valueNumeric: 12, unit: 'g/dL', refLow: 12, refHigh: 17, flag: 'NORMAL', isAbnormal: false });

    const r = await api().patch(`/api/items/${item.id}`).set(authHeader(token)).send({ valueNumeric: 12, refLow: 11, refHigh: 14 });
    expect(r.status).toBe(200);
    expect(r.body.refLow).toBe(11);              // manual vence sempre
    expect(r.body.refHigh).toBe(14);
  });

  it('criação de dependente pela API aceita nascimento (fluxo UC2: Helena cadastra Theo)', async () => {
    const { user, token } = await createUser({});
    const r = await api().post('/api/patients').set(authHeader(token)).send({ fullName: 'Zé Teste', relationship: 'Filho', dateOfBirth: '2018-05-20T00:00:00Z', cpf: testCpfValid() });
    expect(r.status).toBe(201);
    const dep = await prisma.patient.findUnique({ where: { id: r.body.id }, select: { dateOfBirth: true, relationship: true } });
    expect(dep?.dateOfBirth?.toISOString().slice(0, 10)).toBe('2018-05-20');
    expect(dep?.relationship).toBe('Filho');
  });
});

/** CPF válido e único por chamada (mesma matemática do helpers.testCpf, aqui isolado p/ POST). */
function testCpfValid(): string {
  const digits = () => Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (arr: number[]) => {
    let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i] * (arr.length + 1 - i);
    const r = (s * 10) % 11; return r === 10 ? 0 : r;
  };
  const base = digits(); const d1 = dv(base); const d2 = dv([...base, d1]);
  return [...base, d1, d2].join('');
}
