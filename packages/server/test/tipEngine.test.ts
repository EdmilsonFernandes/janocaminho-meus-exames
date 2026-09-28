import { describe, it, expect } from 'vitest';
import { buildTipPrompt, classifySegment, curatedFallback, isSedentaryWeek, pickTipTheme, type TipContext, type TipMarker } from '../src/jobs/tipEngine';

/** Contexto base: nenhum dado (tudo nulo/vazio) → só tema possível é rotina. */
const ctx = (over: Partial<TipContext> = {}): TipContext => ({
  firstName: 'Ana',
  score: null,
  daysSinceExam: null,
  stale: false,
  improving: [],
  worsening: [],
  cardioLevel: '',
  cardioFactors: 0,
  activeMinutesWeek: null,
  activeMinutesPrevWeek: null,
  stepsAvgDay: null,
  restingHr: null,
  medications: [],
  segment: 'rotina',
  ...over,
});

const mk = (over: Partial<TipMarker> = {}): TipMarker => ({
  name: 'LDL', value: 142, prev: 128, unit: 'mg/dL', deltaPct: 10.9, flag: 'HIGH', refHigh: 130, ...over,
});

describe('pickTipTheme — rotação com memória', () => {
  it('prefere comemorar melhora real quando existe', () => {
    const c = ctx({ improving: [mk({ name: 'HDL', value: 55, prev: 44, flag: 'LOW', refHigh: null })], worsening: [mk()] });
    expect(pickTipTheme(c, [])).toBe('melhora');
  });

  it('bloqueia o tema das 2 últimas dicas e cai pro próximo com dado', () => {
    const c = ctx({ improving: [mk({ name: 'HDL' })], worsening: [mk()] });
    expect(pickTipTheme(c, ['melhora', 'rotina'])).toBe('atencao');
    expect(pickTipTheme(c, ['atencao', 'rotina'])).toBe('melhora');
    // Tudo bloqueado: repete o de maior prioridade (o GLM evita repetição literal via recentBodies).
    expect(pickTipTheme(c, ['melhora', 'atencao'])).toBe('melhora');
  });

  it('repete por falta de opção quando só há 1 candidato', () => {
    const c = ctx({ worsening: [mk()] });
    expect(pickTipTheme(c, ['atencao', 'atencao'])).toBe('atencao');
  });

  it('cardio só quando nível existe e não é baixo', () => {
    expect(pickTipTheme(ctx({ cardioLevel: 'baixo' }), [])).toBe('rotina');
    expect(pickTipTheme(ctx({ cardioLevel: 'moderado', cardioFactors: 2 }), [])).toBe('cardio');
  });

  it('exame-velho dispara com stale ou >365 dias', () => {
    expect(pickTipTheme(ctx({ daysSinceExam: 400 }), [])).toBe('exame-velho');
    expect(pickTipTheme(ctx({ stale: true }), [])).toBe('exame-velho');
    expect(pickTipTheme(ctx({ daysSinceExam: 40 }), [])).toBe('rotina');
  });

  it('mente candidata quando nunca fez OU janela de reavaliação aberta (≥14d)', () => {
    expect(pickTipTheme(ctx({ mental: { never: true, daysSince: null, openWindow: false, lastScore: null, lastType: '' } }), [])).toBe('mente');
    expect(pickTipTheme(ctx({ mental: { never: false, daysSince: 20, openWindow: true, lastScore: 4, lastType: 'phq9' } }), [])).toBe('mente');
    // Dentro da janela (fechada) → não candidata.
    expect(pickTipTheme(ctx({ mental: { never: false, daysSince: 5, openWindow: false, lastScore: 2, lastType: 'gad7' } }), [])).toBe('rotina');
    // Sem dado/tabela → nunca candidata.
    expect(pickTipTheme(ctx({ mental: null }), [])).toBe('rotina');
  });

  it('crianca candidata quando <19a e peso/altura ausente ou em atraso (≥30d)', () => {
    expect(pickTipTheme(ctx({ childAgeMonths: 30, childLastMeasureDays: null }), [])).toBe('crianca');
    expect(pickTipTheme(ctx({ childAgeMonths: 30, childLastMeasureDays: 45 }), [])).toBe('crianca');
    // Medição recente → não candidata.
    expect(pickTipTheme(ctx({ childAgeMonths: 30, childLastMeasureDays: 10 }), [])).toBe('rotina');
    // Adulto → nunca candidata.
    expect(pickTipTheme(ctx({ childAgeMonths: 300, childLastMeasureDays: 90 }), [])).toBe('rotina');
  });

  it('sem dado nenhum → rotina', () => {
    expect(pickTipTheme(ctx(), [])).toBe('rotina');
  });
});

describe('isSedentaryWeek — atividade do Health Connect', () => {
  it('sem sincronização não é sedentário (sem dado ≠ sedentário)', () => {
    expect(isSedentaryWeek(ctx())).toBe(false);
  });

  it('queda de 30%+ vs própria semana anterior conta', () => {
    expect(isSedentaryWeek(ctx({ activeMinutesWeek: 60, activeMinutesPrevWeek: 200 }))).toBe(true);
    expect(isSedentaryWeek(ctx({ activeMinutesWeek: 160, activeMinutesPrevWeek: 200 }))).toBe(false);
  });

  it('abaixo da metade do mínimo OMS (150/sem) conta', () => {
    expect(isSedentaryWeek(ctx({ activeMinutesWeek: 74 }))).toBe(true);
    expect(isSedentaryWeek(ctx({ activeMinutesWeek: 90 }))).toBe(false);
  });
});

describe('classifySegment', () => {
  it('mapeia pelo texto do marcador/perfil', () => {
    expect(classifySegment('TSH 4.2 uso levotiroxina')).toBe('tireoide');
    expect(classifySegment('glicose de jejum 112')).toBe('glicemia');
    expect(classifySegment('tudo normal por aqui')).toBe('rotina');
  });
});

describe('curatedFallback — específico mesmo sem GLM', () => {
  it('melhora cita marcador com valores', () => {
    const s = curatedFallback(ctx({ improving: [mk({ name: 'Glicose', value: 98, prev: 112, unit: 'mg/dL' })] }), 'melhora');
    expect(s).toContain('Glicose');
    expect(s).toContain('112');
    expect(s).toContain('98');
    expect(s).toContain('Ana');
  });

  it('atencao cita marcador piorando', () => {
    const s = curatedFallback(ctx({ worsening: [mk()] }), 'atencao');
    expect(s).toContain('LDL');
    expect(s).toContain('142');
  });

  it('movimento cita os minutos da semana', () => {
    const s = curatedFallback(ctx({ activeMinutesWeek: 40, activeMinutesPrevWeek: 180 }), 'movimento');
    expect(s).toContain('40 min');
    expect(s).toContain('180');
  });

  it('rotina usa o segmento', () => {
    expect(curatedFallback(ctx({ segment: 'glicemia' }), 'rotina')).toContain('glicose');
  });

  it('mente cita o convite ou a janela aberta (sem alarmismo de score)', () => {
    const convite = curatedFallback(ctx({ mental: { never: true, daysSince: null, openWindow: false, lastScore: null, lastType: '' } }), 'mente');
    expect(convite).toContain('2 min');
    expect(convite).toContain('Ana');
    const janela = curatedFallback(ctx({ mental: { never: false, daysSince: 17, openWindow: true, lastScore: 12, lastType: 'phq9' } }), 'mente');
    expect(janela).toContain('17 dias');
    expect(janela).not.toContain('12'); // score NÃO vira conteúdo da dica
  });

  it('crianca cita a medição em atraso ou a primeira medição', () => {
    const primeira = curatedFallback(ctx({ childAgeMonths: 18, childLastMeasureDays: null }), 'crianca');
    expect(primeira).toContain('Ana');
    expect(primeira).toContain('curva de crescimento');
    const atraso = curatedFallback(ctx({ childAgeMonths: 18, childLastMeasureDays: 40 }), 'crianca');
    expect(atraso).toContain('40 dias');
  });
});

describe('buildTipPrompt — contexto e anti-repetição', () => {
  it('inclui valores do marcador e as dicas anteriores', () => {
    const { user } = buildTipPrompt(ctx({ worsening: [mk()], score: 79, daysSinceExam: 42 }), 'atencao', ['Corte frituras esta semana.', 'Meça a pressão de manhã.']);
    expect(user).toContain('LDL');
    expect(user).toContain('142');
    expect(user).toContain('79/100');
    expect(user).toContain('42 dia(s)');
    expect(user).toContain('Corte frituras esta semana.');
    expect(user).toContain('NÃO repita');
  });

  it('não inclui atividade quando o paciente não sincroniza', () => {
    const { user } = buildTipPrompt(ctx(), 'rotina', []);
    expect(user).not.toContain('Health Connect');
  });

  it('mente: prompt traz o estado do rastreamento e a regra sem estigma', () => {
    const { user } = buildTipPrompt(ctx({ mental: { never: true, daysSince: null, openWindow: false, lastScore: null, lastType: '' } }), 'mente', []);
    expect(user).toContain('NUNCA respondeu');
    expect(user).toContain('SEM estigma');
    const { user: u2 } = buildTipPrompt(ctx({ mental: { never: false, daysSince: 20, openWindow: true, lastScore: 3, lastType: 'gad7' } }), 'mente', []);
    expect(u2).toContain('GAD-7 (ansiedade)');
    expect(u2).toContain('ABERTA');
  });

  it('crianca: prompt traz idade e atraso da medição', () => {
    const { user } = buildTipPrompt(ctx({ childAgeMonths: 18, childLastMeasureDays: 40 }), 'crianca', []);
    expect(user).toContain('18 meses');
    expect(user).toContain('40 dia(s)');
  });
});
