import { describe, it, expect } from 'vitest';
import { BADGES, MONTHLY_BADGES, ALL_BADGES, resolveBadges, claimKeyOf, evalBadges } from '../src/utils/achievements';

/** Desafios mensais (renováveis): claim-key, métricas do mês e merge com settings. */
describe('conquistas mensais (renováveis)', () => {
  it('claim-key mensal carrega o mês corrente; permanente fica limpa', () => {
    const m = MONTHLY_BADGES.find((b) => b.id === 'm_upload1')!;
    expect(claimKeyOf(m)).toMatch(/^m_upload1:\d{4}-\d{2}$/);
    const p = BADGES.find((b) => b.id === 'first_exam')!;
    expect(claimKeyOf(p)).toBe('first_exam');
  });

  it('claim-key mensal muda de mês pra mês (renova sozinho no virar do calendário)', () => {
    const now = new Date();
    const next = new Date(now.getTime() + 32 * 86400000); // >= 1 mês à frente
    const k1 = `${'m_upload1'}:${now.toISOString().slice(0, 7)}`;
    const k2 = `${'m_upload1'}:${next.toISOString().slice(0, 7)}`;
    expect(k1).not.toBe(k2);
  });

  it('evalBadges pontua métricas do mês (examsMonth/sharesMonth) sem afetar as permanentes', () => {
    const m = { exams: 30, score: null, streak: 12, examsMonth: 1, sharesMonth: 0 };
    const st = evalBadges(m, ALL_BADGES);
    const up1 = st.find((b) => b.id === 'm_upload1')!;
    expect(up1.earned).toBe(true); // 1 upload no mês ≥ threshold 1
    const up3 = st.find((b) => b.id === 'm_upload3')!;
    expect(up3.earned).toBe(false); // 1 < 3
    expect(Math.round(up3.progress * 100)).toBe(33);
    const share = st.find((b) => b.id === 'm_share1')!;
    expect(share.earned).toBe(false);
    // Permanente usa o TOTAL, não o mês:
    const collector = st.find((b) => b.id === 'collector')!;
    expect(collector.earned).toBe(true); // exams=30 ≥ 5
  });

  it('streak mensal usa a métrica streak compartilhada', () => {
    const st = evalBadges({ exams: 0, score: null, streak: 10, examsMonth: 0, sharesMonth: 0 }, ALL_BADGES);
    expect(st.find((b) => b.id === 'm_streak10')!.earned).toBe(true);
    const st2 = evalBadges({ exams: 0, score: null, streak: 9, examsMonth: 0, sharesMonth: 0 }, ALL_BADGES);
    expect(st2.find((b) => b.id === 'm_streak10')!.earned).toBe(false);
  });

  it('resolveBadges APENDA mensais mesmo com lista customizada do admin (settings nunca esconde o mês)', () => {
    const custom = [BADGES[0]]; // admin só configurou 1 badge
    const merged = resolveBadges(custom);
    expect(merged).toHaveLength(custom.length + MONTHLY_BADGES.length);
    expect(merged.some((b) => b.id === 'm_upload1')).toBe(true);
  });

  it('resolveBadges sem settings = ALL_BADGES (permanentes + mensais, sem duplicar)', () => {
    const merged = resolveBadges(undefined);
    expect(merged).toHaveLength(ALL_BADGES.length);
    expect(new Set(merged.map((b) => b.id)).size).toBe(merged.length);
  });
});
