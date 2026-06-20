import { describe, it, expect } from 'vitest';
import { compareVersions, isUpdateRequired } from './version';

describe('compareVersions', () => {
  it('menor / maior / igual', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.3.8', '1.4.0')).toBe(-1);
    expect(compareVersions('1.4.0', '1.3.8')).toBe(1);
    expect(compareVersions('1.3.8', '1.3.9')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });
  it('comprimentos diferentes (1.3 vs 1.3.0)', () => {
    expect(compareVersions('1.3', '1.3.0')).toBe(0);
    expect(compareVersions('1.3', '1.3.1')).toBe(-1);
  });
  it('tolera sufixos não-numéricos (1.3.8-beta)', () => {
    expect(compareVersions('1.3.8-beta', '1.3.8')).toBe(0);
    expect(compareVersions('v1.3.8', '1.3.8')).toBe(0);
  });
});

describe('isUpdateRequired', () => {
  it('exige atualização quando atual < mínimo', () => {
    expect(isUpdateRequired('1.3.8', '1.4.0')).toBe(true);
    expect(isUpdateRequired('1.0.0', '1.3.0')).toBe(true);
  });
  it('não exige quando atual >= mínimo', () => {
    expect(isUpdateRequired('1.4.0', '1.4.0')).toBe(false);
    expect(isUpdateRequired('1.5.0', '1.4.0')).toBe(false);
  });
});
