// @vitest-environment node
/**
 * Idade do último exame na Home: o herói diz "há quanto tempo" e avisa quando os exames saíram
 * da janela de "em dia". Datas montadas em horário LOCAL para o teste não depender do fuso.
 */
import { describe, expect, it } from 'vitest';
import { EXAMS_IN_DAY_WINDOW_DAYS, examDueNote, homeExamRecency } from './homeRecency';

const DAY = 86_400_000;
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0).getTime();
const NOW = at(2026, 11, 25, 9);

describe('homeExamRecency — idade do último exame', () => {
  it('conta de QA de 25/11: exame de 07/03/2026 → "há 8 meses", fora da janela', () => {
    expect(homeExamRecency(at(2026, 3, 7), NOW)).toEqual({ relative: 'há 8 meses', days: 263, due: true });
  });

  it('exame de hoje e de ontem estão em dia', () => {
    expect(homeExamRecency(at(2026, 11, 25, 7), NOW)).toEqual({ relative: 'hoje', days: 0, due: false });
    expect(homeExamRecency(at(2026, 11, 24), NOW)).toEqual({ relative: 'ontem', days: 1, due: false });
  });

  it('aceita a data em string ISO (formato da API), número ou Date', () => {
    const iso = new Date(at(2026, 11, 20)).toISOString();
    expect(homeExamRecency(iso, NOW).relative).toBe('há 5 dias');
    expect(homeExamRecency(at(2026, 11, 20), NOW).relative).toBe('há 5 dias');
    expect(homeExamRecency(new Date(at(2026, 11, 20)), NOW).relative).toBe('há 5 dias');
  });

  it('limite da janela: 180 dias ainda está em dia, 181 não', () => {
    expect(EXAMS_IN_DAY_WINDOW_DAYS).toBe(180);
    const edge = new Date(at(2026, 11, 25, 9) - 180 * DAY);
    expect(homeExamRecency(edge, NOW).due).toBe(false);
    expect(homeExamRecency(new Date(edge.getTime() - DAY), NOW).due).toBe(true);
  });

  it('um ano e meio → "há 1 ano e 6 meses"', () => {
    expect(homeExamRecency(at(2025, 5, 25), NOW).relative).toBe('há 1 ano e 6 meses');
  });

  it('data ausente, inválida ou futura nunca vira aviso', () => {
    const none = { relative: null, days: null, due: false };
    expect(homeExamRecency(null, NOW)).toEqual(none);
    expect(homeExamRecency(undefined, NOW)).toEqual(none);
    expect(homeExamRecency('não é data', NOW)).toEqual(none);
    expect(homeExamRecency(at(2026, 12, 2), NOW)).toEqual(none);
  });
});

describe('examDueNote — frase do aviso', () => {
  it('diz a idade e que a leitura não é de hoje', () => {
    expect(examDueNote('há 8 meses')).toBe('Seu último exame foi há 8 meses — esta leitura mostra aquele momento, não hoje.');
  });
});
