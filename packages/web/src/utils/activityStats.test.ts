import { describe, expect, it } from 'vitest';
import { barHeight, fmtKcal, fmtKm, fmtSteps, metersToKm, normalizeDays, STEPS_GOAL, summarize, weekOfExam, type ActivityDay } from './activityStats';

/** Fábrica de dias em ordem DESC (contrato do bridge — mais recente primeiro). */
const day = (date: string, steps: number, kcal: number, km: number): ActivityDay => ({ date, steps, kcal, km });

describe('metersToKm', () => {
  it('converte metros para km com 2 casas', () => {
    expect(metersToKm(5420)).toBe(5.42);
    expect(metersToKm(1000)).toBe(1);
    expect(metersToKm(250)).toBe(0.25);
  });
  it('arredonda na 2ª casa (não vira 5.4219999)', () => {
    expect(metersToKm(5421)).toBe(5.42);
    expect(metersToKm(5429)).toBe(5.43);
  });
  it('mantém valores negativos/zero seguros', () => {
    expect(metersToKm(0)).toBe(0);
    expect(metersToKm(-3000)).toBe(-3);
  });
});

describe('summarize — HOJE', () => {
  const days = [day('2026-08-19', 8432, 2100, 5.4), day('2026-08-18', 10000, 2000, 7)];
  it('usa o valor do dia corrente (não média)', () => {
    const s = summarize(days, 'today');
    expect(s.steps).toBe(8432);
    expect(s.kcal).toBe(2100);
    expect(s.km).toBe(5.4);
    expect(s.daysCounted).toBe(1);
  });
  it('goalRatio = passos/meta (cap em 1)', () => {
    expect(summarize([day('2026-08-19', STEPS_GOAL, 0, 0)], 'today').goalRatio).toBe(1);
    expect(summarize([day('2026-08-19', STEPS_GOAL * 2, 0, 0)], 'today').goalRatio).toBe(1); // cap
    expect(summarize([day('2026-08-19', 2000, 0, 0)], 'today').goalRatio).toBeCloseTo(0.25);
  });
});

describe('summarize — 7 DIAS (média diária)', () => {
  const days = [
    day('2026-08-19', 8000, 2000, 4),
    day('2026-08-18', 6000, 1800, 3),
    day('2026-08-17', 7000, 2100, 3.5),
  ];
  it('média exata dos dias presentes (divide pelos presentes, não por 7)', () => {
    const s = summarize(days, '7d');
    expect(s.steps).toBe(Math.round((8000 + 6000 + 7000) / 3)); // 7000
    expect(s.kcal).toBe(Math.round((2000 + 1800 + 2100) / 3)); // 1967
    expect(s.km).toBeCloseTo(3.5, 1);
    expect(s.daysCounted).toBe(3);
  });
  it('série do sparkline fica CRONOLÓGICA (mais antigo primeiro)', () => {
    const s = summarize(days, '7d');
    expect(s.series.map((d) => d.date)).toEqual(['2026-08-17', '2026-08-18', '2026-08-19']);
  });
  it('30d ignora dias além do corte', () => {
    const many = Array.from({ length: 45 }, (_, i) => day(`2026-${String(9 - Math.floor(i / 30)).padStart(2, '0')}-${String(30 - (i % 30)).padStart(2, '0')}`, 1000, 100, 1));
    const s = summarize(many, '30d');
    expect(s.daysCounted).toBeLessThanOrEqual(30);
  });
});

describe('summarize — vazio', () => {
  it('sem dias → zeros sem NaN (estado "sem dados")', () => {
    const s = summarize([], '7d');
    expect(s.steps).toBe(0);
    expect(s.kcal).toBe(0);
    expect(s.km).toBe(0);
    expect(s.series).toEqual([]);
    expect(s.goalRatio).toBe(0);
    expect(Number.isNaN(s.steps)).toBe(false);
  });
});

describe('formatação pt-BR', () => {
  it('fmtSteps: separador de milhar abaixo de 10k; compacto acima', () => {
    expect(fmtSteps(8432)).toBe('8.432');
    expect(fmtSteps(12450)).toBe('12,4 mil');
    expect(fmtSteps(10000)).toBe('10 mil'); // 10,0 → corta ",0"
    expect(fmtSteps(0)).toBe('0');
  });
  it('fmtKm: 1 casa com vírgula', () => {
    expect(fmtKm(5.42)).toBe('5,4');
    expect(fmtKm(7)).toBe('7,0');
  });
  it('fmtKcal: inteiro pt-BR', () => {
    expect(fmtKcal(1966.6)).toBe('1.967');
  });
});

describe('barHeight (sparkline)', () => {
  it('normaliza contra o máximo com piso visível', () => {
    expect(barHeight(50, 100)).toBe(0.5);
    expect(barHeight(100, 100)).toBe(1);
    expect(barHeight(1, 100)).toBe(0.08); // piso
  });
  it('máximo 0 → 0 (sem divisão por zero)', () => {
    expect(barHeight(10, 0)).toBe(0);
  });
});

describe('weekOfExam (insight "Dashboard sábio")', () => {
  const days = [
    day('2026-08-19', 8000, 2000, 5),
    day('2026-08-18', 6000, 1800, 4),
    day('2026-08-17', 7000, 2100, 4.5),
    day('2026-08-16', 9000, 2200, 6),
    day('2026-08-15', 4000, 1200, 2.5),
  ];
  it('média da janela [exame-6d, exame] com >=3 dias de dados', () => {
    const w = weekOfExam(days, '2026-08-18');
    expect(w).not.toBeNull();
    expect(w!.daysCounted).toBeGreaterThanOrEqual(3);
    expect(w!.avgSteps).toBe(6500); // janela 12–18: dias 18(6000)+17(7000)+16(9000)+15(4000) = 6500 (o dia 19 é POSTERIOR ao exame — fora)
  });
  it('SEM dados suficientes na janela → null (nada inventado)', () => {
    expect(weekOfExam([day('2026-01-01', 1000, 100, 1)], '2026-08-18')).toBeNull();
    expect(weekOfExam(days, 'data-inválida')).toBeNull();
  });
  it('exame fora do histórico → null (não extrapola)', () => {
    expect(weekOfExam(days, '2025-01-15')).toBeNull();
  });
});

describe('normalizeDays (payload do bridge)', () => {
  it('ordena DESC, dedupa por data e preserva km do bridge (já vem em km — HealthBridge.kt inKilometers)', () => {
    const raw = [
      { date: '2026-08-17', steps: 100, kcal: 100, km: 3.5 },
      { date: '2026-08-19', steps: 300, kcal: 300, km: 5.2 },
      { date: '2026-08-18', steps: 200, kcal: 200, km: 4.1 },
      { date: '2026-08-18', steps: 999, kcal: 999, km: 9.99 }, // duplicata (mantém a última)
    ];
    const out = normalizeDays(raw);
    expect(out.map((d) => d.date)).toEqual(['2026-08-19', '2026-08-18', '2026-08-17']);
    expect(out[2].km).toBe(3.5);
    expect(out[1].steps).toBe(999);
  });
  it('descarta entradas sem data e nega negativos', () => {
    const out = normalizeDays([{ steps: 10 }, { date: '2026-08-19', steps: -5, kcal: -1, km: -100 }]);
    expect(out).toHaveLength(1);
    expect(out[0].steps).toBe(0);
    expect(out[0].km).toBe(0);
  });
});
