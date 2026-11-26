// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { elapsedLabel } from './elapsed';

describe('elapsedLabel — tempo do exame em processamento', () => {
  it('menos de uma hora: minutos:segundos, como antes', () => {
    expect(elapsedLabel(0)).toBe('há 0:00');
    expect(elapsedLabel(5)).toBe('há 0:05');
    expect(elapsedLabel(200)).toBe('há 3:20');
    expect(elapsedLabel(3599)).toBe('há 59:59');
  });

  it('entre uma hora e um dia: horas e minutos', () => {
    expect(elapsedLabel(3600)).toBe('há 1 h 00 min');
    expect(elapsedLabel(7500)).toBe('há 2 h 05 min');
    expect(elapsedLabel(86399)).toBe('há 23 h 59 min');
  });

  it('a partir de um dia: nunca mais o contador gigante', () => {
    expect(elapsedLabel(86400)).toBe('há mais de 1 dia');
    expect(elapsedLabel(172799)).toBe('há mais de 1 dia');
    expect(elapsedLabel(5212800)).toBe('há 60 dias'); // o caso real: 86880:00
  });

  it('valor inválido não quebra', () => {
    expect(elapsedLabel(Number.NaN)).toBe('há 0:00');
    expect(elapsedLabel(-30)).toBe('há 0:00');
    expect(elapsedLabel(59.9)).toBe('há 0:59');
  });
});
