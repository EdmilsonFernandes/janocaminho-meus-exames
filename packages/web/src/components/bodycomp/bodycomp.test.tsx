// @vitest-environment node
/**
 * Tela de composição corporal contra a MASSA DE DADOS sintética (a mesma do seed de
 * demonstração): cada cenário de vida real passa pelas regras de leitura e pelos
 * medidores sem quebrar, sem número sem unidade e sem veredito sem faixa.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DEMO_SCENARIOS, buildDemoScenario, type DemoScenarioKey } from '../../../../server/src/bodycomp/demo-scenarios';
import { CompositionBar, RangeMeter } from './meters';
import { TrendPlot, TrendTiles } from './trend';
import {
  METRICS, TREND_KEYS, deltaOf, deviceLabel, formatDelta, formatWithUnit, isStale, rangeFor, timeAgo, zoneOf,
  type BodyCompositionResponse, type BodyReading, type MetricKey,
} from './model';

const NOW = new Date('2026-11-12T15:00:00Z');
const KEYS = Object.keys(DEMO_SCENARIOS) as DemoScenarioKey[];
const REFERENCE: BodyCompositionResponse['reference'] = { bodyFatPct: { low: 11, high: 21.9, source: 'Gallagher et al., 2000 (por sexo e idade)' } };

/** O que a API devolveria: mais recente primeiro, datas em ISO. */
const asApi = (key: DemoScenarioKey): BodyReading[] =>
  buildDemoScenario(key, NOW)
    .map((row, index) => ({ ...row, id: `${key}-${index}`, measuredAt: row.measuredAt.toISOString(), note: null }))
    .reverse();

const count = (html: string, needle: string) => html.split(needle).length - 1;
const ALL_METRICS = Object.keys(METRICS) as MetricKey[];

describe('regras de leitura', () => {
  it('zona é dita por posição: abaixo, dentro e acima (limites contam como dentro)', () => {
    expect(zoneOf(10.9, 11, 21.9)).toBe('below');
    expect(zoneOf(11, 11, 21.9)).toBe('in');
    expect(zoneOf(21.9, 11, 21.9)).toBe('in');
    expect(zoneOf(22, 11, 21.9)).toBe('above');
  });

  it('variação de % de gordura é em pontos percentuais; sinal sempre explícito', () => {
    expect(formatDelta('bodyFatPct', -1.2)).toBe('−1,2 p.p.');
    expect(formatDelta('weightKg', 0.8)).toBe('+0,8 kg');
    expect(formatDelta('bmrKcal', -14)).toBe('−14 kcal');
  });

  it('tempo desde a avaliação e aviso de dado antigo (6 meses)', () => {
    const now = NOW.getTime();
    const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();
    expect(timeAgo(ago(0), now)).toBe('hoje');
    expect(timeAgo(ago(1), now)).toBe('ontem');
    expect(timeAgo(ago(12), now)).toBe('há 12 dias');
    expect(timeAgo(ago(275), now)).toBe('há 9 meses');
    expect(timeAgo(ago(430), now)).toBe('há 1 ano e 2 meses');
    expect(isStale(ago(180), now)).toBe(false);
    expect(isStale(ago(190), now)).toBe(true);
  });

  it('toda faixa tem dono; sem faixa conhecida não há faixa (nem selo)', () => {
    const [inbody] = asApi('unica');
    expect(rangeFor('bodyFatPct', inbody, REFERENCE)?.owner).toContain('Gallagher');
    expect(rangeFor('bodyFatPct', inbody, null)).toBeNull();
    expect(rangeFor('fatMassKg', inbody, REFERENCE)?.owner).toBe('Faixa do aparelho (InBody 270)');
    expect(rangeFor('bmi', inbody, REFERENCE)?.owner).toContain('OMS');
    for (const key of ['skeletalMuscleKg', 'bmrKcal', 'visceralFatLevel', 'waistHipRatio'] as MetricKey[]) {
      expect(rangeFor(key, inbody, REFERENCE)).toBeNull();
    }
    const [manual] = asApi('semMusculo');
    expect(rangeFor('fatMassKg', manual, REFERENCE)).toBeNull();
    expect(deviceLabel(manual)).toBe('Aparelho não informado');
  });
});

describe.each(KEYS)('cenário "%s"', (key) => {
  const items = asApi(key);
  const latest = items[0];
  const previous = items[1];

  it('todo valor mostrado carrega a unidade', () => {
    for (const item of items) {
      for (const metric of ALL_METRICS) {
        const value = item[metric];
        if (value == null) continue;
        const text = formatWithUnit(metric, value);
        expect(text).not.toMatch(/NaN|undefined|Infinity/);
        if (METRICS[metric].unit) expect(text.endsWith(` ${METRICS[metric].unit}`)).toBe(true);
      }
    }
  });

  it('régua: 32 pílulas, exatamente uma marcando o valor, em qualquer avaliação', () => {
    for (const item of items) {
      for (const metric of ALL_METRICS) {
        const value = item[metric];
        const range = rangeFor(metric, item, REFERENCE);
        if (value == null || !range) continue;
        const html = renderToString(<RangeMeter value={value} range={range} unit={METRICS[metric].unit} decimals={METRICS[metric].decimals} label={METRICS[metric].label} />);
        expect(count(html, 'rounded-full')).toBe(32);
        expect(count(html, 'h-5 bg-')).toBe(1);
        // A cor do marcador acompanha a zona — e a zona também vai em palavras no rótulo.
        const zone = zoneOf(value, range.low, range.high);
        expect(html).toContain(zone === 'in' ? 'h-5 bg-success' : 'h-5 bg-warning');
        expect(html).toContain(zone === 'in' ? 'Na faixa' : zone === 'below' ? 'Abaixo da faixa' : 'Acima da faixa');
        // Os dois limites ficam dentro da régua (nunca cortados para fora).
        for (const left of [...html.matchAll(/left:([\d.]+)%/g)].map((m) => Number(m[1]))) {
          expect(left).toBeGreaterThanOrEqual(0);
          expect(left).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('barra do corpo: sempre 40 pílulas, somando o peso', () => {
    for (const item of items) {
      if (item.weightKg == null || item.fatMassKg == null) continue;
      const rest = item.weightKg - item.fatMassKg - (item.skeletalMuscleKg ?? 0);
      const parts = [
        { key: 'fat', label: 'Gordura', kg: item.fatMassKg, swatch: 'bg-copper-500' },
        ...(item.skeletalMuscleKg != null ? [{ key: 'muscle', label: 'Músculo', kg: item.skeletalMuscleKg, swatch: 'bg-sky-600' }] : []),
        { key: 'rest', label: 'Restante', kg: rest, swatch: 'bg-muted-foreground/35' },
      ];
      expect(rest).toBeGreaterThan(0);
      const html = renderToString(<CompositionBar parts={parts} totalKg={item.weightKg} />);
      expect(count(html, 'rounded-full')).toBe(40);
      // Nenhuma parte some da barra, por menor que seja.
      for (const part of parts) expect(html).toContain(part.swatch);
    }
  });

  it('blocos de evolução: valor mais recente e variação desde a anterior', () => {
    const html = renderToString(<TrendTiles keys={TREND_KEYS} active="weightKg" latest={latest} previous={previous} onSelect={() => {}} />);
    expect(count(html, 'aria-pressed="true"')).toBe(1);
    expect(count(html, 'aria-pressed="false"')).toBe(TREND_KEYS.length - 1);
    expect(html).not.toMatch(/NaN|undefined/);
    if (!previous) expect(count(html, 'Primeira avaliação')).toBe(TREND_KEYS.length);
    for (const metric of TREND_KEYS) {
      const delta = deltaOf(metric, latest, previous);
      if (delta != null && delta !== 0) expect(html).toContain(formatDelta(metric, delta));
    }
  });

  it('gráfico: com menos de duas avaliações explica o porquê em vez de desenhar', () => {
    for (const metric of TREND_KEYS) {
      const withValue = items.filter((item) => item[metric] != null).length;
      if (withValue >= 2) continue;
      const html = renderToString(<TrendPlot readings={[...items].reverse()} metric={metric} band={null} />);
      expect(html).toContain(withValue === 0 ? 'Nenhuma avaliação registrou' : 'a partir da segunda avaliação');
    }
  });
});

describe('casos que a massa foi feita para provocar', () => {
  it('"antiga" dispara o aviso de dado velho; "emagrecimento" não', () => {
    expect(isStale(asApi('antiga')[0].measuredAt, NOW.getTime())).toBe(true);
    expect(isStale(asApi('emagrecimento')[0].measuredAt, NOW.getTime())).toBe(false);
  });

  it('"foraDaFaixa" cobre os dois extremos da régua de gordura', () => {
    const [above, below] = asApi('foraDaFaixa');
    expect(zoneOf(above.bodyFatPct!, REFERENCE!.bodyFatPct.low, REFERENCE!.bodyFatPct.high)).toBe('above');
    expect(zoneOf(below.bodyFatPct!, REFERENCE!.bodyFatPct.low, REFERENCE!.bodyFatPct.high)).toBe('below');
  });

  it('"trocaDeAparelho" tem mais de um aparelho no histórico (a tela avisa)', () => {
    expect(new Set(asApi('trocaDeAparelho').map(deviceLabel))).toEqual(new Set(['InBody 270', 'Omron HBF-514C']));
  });

  it('"modeloNaoConferido" chega marcado para conferir com a folha', () => {
    expect(asApi('modeloNaoConferido').every((item) => item.needsReview)).toBe(true);
    expect(asApi('emagrecimento').some((item) => item.needsReview)).toBe(false);
  });

  it('"semMusculo" não inventa músculo: o bloco mostra travessão', () => {
    const [latest, previous] = asApi('semMusculo');
    const html = renderToString(<TrendTiles keys={TREND_KEYS} active="skeletalMuscleKg" latest={latest} previous={previous} onSelect={() => {}} />);
    expect(html).toContain('—');
  });
});
