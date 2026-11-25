// @vitest-environment node
/**
 * Assinatura de tempo dos gráficos: onde entra a linha "hoje" e o que diz o texto de
 * recência. Datas montadas em horário LOCAL para o teste não depender do fuso do runner.
 */
import { describe, expect, it } from 'vitest';
import { LAB_STALE_AFTER_DAYS, TODAY_MAX_SHARE, describeRecency, planTodayAxis } from './recency';

const DAY = 86_400_000;
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0).getTime();
const NOW = at(2026, 11, 25, 9);

describe('planTodayAxis — linha "hoje" em eixo de tempo', () => {
  it('hoje logo depois do último ponto: estende o eixo até hoje e marca no fim', () => {
    const first = NOW - 300 * DAY;
    const last = NOW - 30 * DAY;
    expect(planTodayAxis(first, last, NOW)).toEqual({ show: true, domainEnd: NOW, fraction: 1 });
  });

  it('último ponto antigo demais: NÃO estende (esmagaria os dados)', () => {
    // 2 anos de vazio para 6 meses de dados.
    const plan = planTodayAxis(NOW - 910 * DAY, NOW - 730 * DAY, NOW);
    expect(plan).toEqual({ show: false, domainEnd: null, fraction: null });
  });

  it('o corte é a fatia do eixo ocupada pelo vazio', () => {
    expect(TODAY_MAX_SHARE).toBe(1 / 3);
    // 300 dias de eixo: vazio de 100 dias (1/3) ainda desenha; 101 dias não.
    expect(planTodayAxis(0, 200 * DAY, 300 * DAY).show).toBe(true);
    expect(planTodayAxis(0, 199 * DAY, 300 * DAY).show).toBe(false);
  });

  it('hoje dentro do período dos dados: posição proporcional, eixo intacto', () => {
    const plan = planTodayAxis(0, 100 * DAY, 25 * DAY);
    expect(plan.show).toBe(true);
    expect(plan.domainEnd).toBe(100 * DAY);
    expect(plan.fraction).toBeCloseTo(0.25, 10);
  });

  it('hoje igual ao último ponto: marca no fim sem estender', () => {
    expect(planTodayAxis(0, 10 * DAY, 10 * DAY)).toEqual({ show: true, domainEnd: 10 * DAY, fraction: 1 });
  });

  it('sem dois instantes distintos, data inválida ou hoje antes do início: não desenha', () => {
    expect(planTodayAxis(NOW, NOW, NOW).show).toBe(false);
    expect(planTodayAxis(NaN, NOW, NOW).show).toBe(false);
    expect(planTodayAxis(NOW, NOW + DAY, Number.POSITIVE_INFINITY).show).toBe(false);
    expect(planTodayAxis(NOW + DAY, NOW + 5 * DAY, NOW).show).toBe(false);
  });
});

describe('describeRecency — texto do último ponto', () => {
  it('relativa + absoluta, com o rótulo padrão', () => {
    const r = describeRecency(at(2026, 8, 12), { now: NOW });
    expect(r).not.toBeNull();
    expect(r!.days).toBe(105);
    expect(r!.text).toBe('Último resultado: há 3 meses (12/08/2026)');
    expect(r!.stale).toBe(false);
  });

  it('conta dias de calendário, não horas: ontem às 23h é "ontem"; hoje mais tarde é "hoje"', () => {
    expect(describeRecency(at(2026, 11, 24, 23), { now: NOW })!.relative).toBe('ontem');
    expect(describeRecency(at(2026, 11, 25, 20), { now: NOW })!.relative).toBe('hoje');
    expect(describeRecency(at(2026, 11, 25, 20), { now: NOW })!.days).toBe(0);
  });

  it('singular e plural em português', () => {
    expect(describeRecency(NOW - 12 * DAY, { now: NOW })!.relative).toBe('há 12 dias');
    expect(describeRecency(NOW - 60 * DAY, { now: NOW })!.relative).toBe('há 1 mês');
    expect(describeRecency(NOW - 275 * DAY, { now: NOW })!.relative).toBe('há 9 meses');
    expect(describeRecency(NOW - 430 * DAY, { now: NOW })!.relative).toBe('há 1 ano e 2 meses');
  });

  it('exame de laboratório: antigo só DEPOIS de 12 meses (a régua do servidor)', () => {
    const opts = { now: NOW, staleAfterDays: LAB_STALE_AFTER_DAYS };
    expect(describeRecency(NOW - 365 * DAY, opts)!.stale).toBe(false);
    const old = describeRecency(NOW - 366 * DAY, opts)!;
    expect(old.stale).toBe(true);
    expect(old.text.endsWith(' · pode estar desatualizado')).toBe(true);
  });

  it('sem limiar informado nunca marca como antigo', () => {
    expect(describeRecency(NOW - 2000 * DAY, { now: NOW })!.stale).toBe(false);
  });

  it('o veredito da própria tela tem prioridade sobre o limiar', () => {
    expect(describeRecency(NOW - 200 * DAY, { now: NOW, staleAfterDays: 365, stale: true })!.stale).toBe(true);
    expect(describeRecency(NOW - 900 * DAY, { now: NOW, staleAfterDays: 365, stale: false })!.stale).toBe(false);
  });

  it('rótulo, formato de data e aviso são configuráveis', () => {
    const r = describeRecency(at(2026, 3, 1), {
      now: NOW, noun: 'Última avaliação', stale: true, staleNote: 'pode não refletir seu corpo hoje',
      formatDate: (d) => `${d.getDate()}.${d.getMonth() + 1}`,
    })!;
    expect(r.text).toBe('Última avaliação: há 8 meses (1.3) · pode não refletir seu corpo hoje');
  });

  it('data no futuro: só a data, sem "hoje" nem tempo relativo', () => {
    const r = describeRecency(at(2026, 12, 3), { now: NOW })!;
    expect(r.relative).toBeNull();
    expect(r.text).toBe('Último resultado: 03/12/2026');
  });

  it('nunca usa "agora", "atual" ou "ao vivo"', () => {
    for (const days of [0, 1, 5, 45, 200, 400, 1500]) {
      expect(describeRecency(NOW - days * DAY, { now: NOW, staleAfterDays: 365 })!.text).not.toMatch(/\bagora\b|\batual\b|ao vivo/i);
    }
  });

  it('data ausente ou inválida: null (a tela não mostra nada)', () => {
    expect(describeRecency(null)).toBeNull();
    expect(describeRecency('')).toBeNull();
    expect(describeRecency('não é data')).toBeNull();
  });
});
