import { describe, expect, it } from 'vitest';
import { reminderIsPast } from './reminderExpiry';

const H = 3_600_000;
const NOW = new Date('2026-11-27T12:00:00Z').getTime();

describe('reminderIsPast — "faltam 5 horas" não aparece depois do compromisso', () => {
  it('caso real: avisou "faltam 5 horas" anteontem → já passou', () => {
    const n = { type: 'reminder', createdAt: new Date(NOW - 50 * H).toISOString(), data: { type: 'reminder', offset: '300' } };
    expect(reminderIsPast(n, NOW)).toBe(true);
  });

  it('ainda dentro da antecedência → continua valendo', () => {
    const n = { type: 'reminder', createdAt: new Date(NOW - 2 * H).toISOString(), data: { offset: 300 } };
    expect(reminderIsPast(n, NOW)).toBe(false);
  });

  it('a data do compromisso, quando vem, manda', () => {
    expect(reminderIsPast({ type: 'reminder', createdAt: new Date(NOW).toISOString(), data: { offset: 300, dueAt: new Date(NOW - 2 * H).toISOString() } }, NOW)).toBe(true);
    expect(reminderIsPast({ type: 'reminder', data: { dueAt: new Date(NOW - 30 * 60_000).toISOString() } }, NOW)).toBe(false);
  });

  it('outros tipos de notificação e dados incompletos não são afetados', () => {
    expect(reminderIsPast({ type: 'alert', createdAt: new Date(NOW - 100 * H).toISOString(), data: { offset: 0 } }, NOW)).toBe(false);
    expect(reminderIsPast({ type: 'reminder', data: {} }, NOW)).toBe(false);
  });
});
