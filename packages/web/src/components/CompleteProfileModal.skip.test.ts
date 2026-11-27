// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PROFILE_SKIP_DAYS, profileSkippedRecently } from './CompleteProfileModal';

const DAY = 86_400_000;
const NOW = new Date('2026-11-27T12:00:00Z').getTime();

describe('assistente de perfil — "Agora não" vale 7 dias', () => {
  it('não volta a abrir dentro de 7 dias', () => {
    expect(profileSkippedRecently(String(NOW - 1 * DAY), NOW)).toBe(true);
    expect(profileSkippedRecently(String(NOW - 6.9 * DAY), NOW)).toBe(true);
  });

  it('depois de 7 dias pode perguntar de novo', () => {
    expect(profileSkippedRecently(String(NOW - PROFILE_SKIP_DAYS * DAY), NOW)).toBe(false);
  });

  it('sem registro (ou registro estragado) não bloqueia', () => {
    expect(profileSkippedRecently(null, NOW)).toBe(false);
    expect(profileSkippedRecently('abc', NOW)).toBe(false);
  });
});
