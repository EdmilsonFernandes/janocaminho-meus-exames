import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { grantFirstExamBonus, firstExamBonusPreconditions } from '../src/extraction/pipeline';
import { resetDb } from './helpers';

describe('firstExamBonusPreconditions — decisão pura (tem exame + CPF bate)', () => {
  it('concede quando ≥1 exame e CPF NÃO diverge', () => {
    expect(firstExamBonusPreconditions({ examCount: 1, cpfMismatch: false })).toBe(true);
    expect(firstExamBonusPreconditions({ examCount: 5, cpfMismatch: false })).toBe(true);
  });
  it('BLOQUEIA quando CPF diverge (exame alheio — anti-farm)', () => {
    expect(firstExamBonusPreconditions({ examCount: 1, cpfMismatch: true })).toBe(false);
  });
  it('não concede com 0 exames', () => {
    expect(firstExamBonusPreconditions({ examCount: 0, cpfMismatch: false })).toBe(false);
  });
});

describe('grantFirstExamBonus — anti re-farm (1x SÓ por usuário, atômico)', () => {
  beforeEach(async () => { await resetDb(); });

  it('concede 1x: incrementa créditos + flag true + ledger + notificação', async () => {
    const u = await prisma.user.create({ data: { email: 'refarm@t.com', name: 'Re Farm', passwordHash: 'x', credits: 0, firstExamBonusGranted: false } });
    const r = await grantFirstExamBonus(u.id, 45);
    expect(r).toBe(true);
    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.credits).toBe(45);
    expect(after?.firstExamBonusGranted).toBe(true);
    const tx = await prisma.creditTransaction.findFirst({ where: { userId: u.id, kind: 'first_exam_bonus' } });
    expect(tx?.delta).toBe(45);
    const notif = await prisma.notification.findFirst({ where: { userId: u.id, type: 'bonus' } });
    expect(notif).toBeTruthy();
  });

  it('NÃO re-concede na 2ª chamada (simula: extraiu → deletou → extraiu de novo)', async () => {
    const u = await prisma.user.create({ data: { email: 'refarm2@t.com', name: 'Re Farm 2', passwordHash: 'x', credits: 0, firstExamBonusGranted: false } });
    expect(await grantFirstExamBonus(u.id, 45)).toBe(true);
    // 2ª tentativa (deletou tudo e re-enviou) → flag já true → updateMany count=0 → false
    expect(await grantFirstExamBonus(u.id, 45)).toBe(false);
    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.credits).toBe(45); // inalterado — não dobrou
    const txs = await prisma.creditTransaction.findMany({ where: { userId: u.id, kind: 'first_exam_bonus' } });
    expect(txs).toHaveLength(1); // ledger único
  });

  it('user que JÁ tinha o flag true (ex: bônus histórico) não recebe de novo', async () => {
    const u = await prisma.user.create({ data: { email: 'ja@t.com', name: 'Ja Teve', passwordHash: 'x', credits: 100, firstExamBonusGranted: true } });
    expect(await grantFirstExamBonus(u.id, 45)).toBe(false);
    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.credits).toBe(100); // inalterado
  });
});
