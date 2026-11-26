// @vitest-environment node
/**
 * Panorama da sua saúde — a camada de frases. Mesmos dados do esboço aprovado (Marina, pessoa
 * fictícia), lidos do fixture que o QA visual também usa: e2e/fixtures/panorama.sample.json.
 * As datas do fixture são deslocadas até o NOW do teste, então as idades não apodrecem com o tempo.
 */
import { describe, expect, it } from 'vitest';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import type { PanoramaCareData, PanoramaHeartData, PanoramaMindData, PanoramaResponse } from '@meus-exames/shared';
import sample from '../../../../e2e/fixtures/panorama.sample.json';
import { enMessages, ptMessages } from '../i18n';
import {
  AREA_ORDER, ageText, dateAge, joinNames, presentPanorama, spanText, timeAge,
  type AreaTileModel, type HealthSummaryLike, type PanoramaModel, type StoryCard, type Translate,
} from './panoramaPresenter';

type ListCard = Extract<StoryCard, { kind: 'list' }>;
type BarsCard = Extract<StoryCard, { kind: 'bars' }>;
type ChartCard = Extract<StoryCard, { kind: 'line' | 'bars' }>;
const listOf = (tile: AreaTileModel): ListCard | undefined => tile.story.find((s): s is ListCard => s.kind === 'list');
const barsOf = (tile: AreaTileModel): BarsCard | undefined => tile.story.find((s): s is BarsCard => s.kind === 'bars');
const chartsOf = (tile: AreaTileModel): ChartCard[] => tile.story.filter((s): s is ChartCard => s.kind === 'line' || s.kind === 'bars');

const DAY = 86_400_000;
/** Meio-dia do dia do fixture, no fuso do runner. */
const NOW = new Date(2026, 10, 26, 12, 0, 0).getTime();
const pt: Translate = polyglotI18nProvider(() => ptMessages, 'pt').translate;
const en: Translate = polyglotI18nProvider(() => enMessages, 'en').translate;

interface Sample { panorama: PanoramaResponse; healthSummary: HealthSummaryLike }
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/;

/** Desloca as datas do fixture pelo tempo que passou desde o `_meta.asOf`. Data sem hora anda em
 *  dias inteiros e continua sendo "só data" (dia de calendário, no fuso local). */
function shiftDates<T>(value: T, deltaMs: number): T {
  if (typeof value === 'string') {
    if (DATE_ONLY.test(value)) {
      const d = new Date(`${value}T12:00:00`);
      d.setDate(d.getDate() + Math.round(deltaMs / DAY));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` as unknown as T;
    }
    if (DATE_TIME.test(value)) return new Date(new Date(value).getTime() + deltaMs).toISOString() as unknown as T;
    return value;
  }
  if (Array.isArray(value)) return value.map((x) => shiftDates(x, deltaMs)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(value as Record<string, unknown>)) if (k !== '_meta') out[k] = shiftDates(x, deltaMs);
    return out as T;
  }
  return value;
}

const load = (): Sample => {
  const delta = NOW - new Date(sample._meta.asOf).getTime();
  const root = shiftDates(sample, delta);
  return { panorama: root.panorama as unknown as PanoramaResponse, healthSummary: root.healthSummary };
};
/** A amostra principal com uma troca pontual de área (`variants` do fixture). */
const withVariant = (name: 'mindOnlyGad7' | 'bodyCompKg' | 'staleExams'): Sample => {
  const delta = NOW - new Date(sample._meta.asOf).getTime();
  const root = shiftDates(sample, delta);
  const v = root.variants[name] as unknown as Record<string, unknown>;
  const fx = load();
  const panorama = { ...(fx.panorama as unknown as Record<string, unknown>) };
  for (const [k, val] of Object.entries(v)) if (!k.startsWith('_')) panorama[k] = val;
  return { panorama: panorama as unknown as PanoramaResponse, healthSummary: fx.healthSummary };
};
const present = (fx: Sample, t: Translate = pt, now: number = NOW, health: HealthSummaryLike | null = fx.healthSummary): PanoramaModel =>
  presentPanorama(fx.panorama, health, { t, now });
/** Acesso tipado às áreas que os testes alteram (no contrato, `data` e `latest` aceitam null). */
const mindOf = (fx: Sample) => fx.panorama.mind.data as PanoramaMindData;
const latestOf = (fx: Sample) => mindOf(fx).latest as NonNullable<PanoramaMindData['latest']>;
const tileOf = (m: PanoramaModel, key: PanoramaKeyLike) => m.tiles.find((x) => x.key === key) as AreaTileModel;
type PanoramaKeyLike = AreaTileModel['key'];
/** Todos os textos de um modelo, achatados. */
const stringsOf = (v: unknown, into: string[] = []): string[] => {
  if (typeof v === 'string') into.push(v);
  else if (Array.isArray(v)) v.forEach((x) => stringsOf(x, into));
  else if (v && typeof v === 'object') Object.entries(v as Record<string, unknown>).forEach(([, x]) => stringsOf(x, into));
  return into;
};

describe('idade do dado — nenhuma área sem dizer de quando é', () => {
  it('todo azulejo com dado mostra a idade (ou, na consulta, para quando é)', () => {
    const m = present(load());
    expect(m.tiles.length).toBe(9);
    for (const tile of m.tiles) {
      if (tile.key === 'care') continue; // data futura: "próxima · daqui a 16 dias"
      expect(tile.when).toMatch(/hoje|ontem|há \d+/);
      expect(tile.when).not.toMatch(/undefined|null|NaN/);
    }
  });

  it('as idades do esboço: exame há 5 dias, pressão há 2, peso há 1, PHQ-9 há 3, sono há 2 h', () => {
    const m = present(load());
    expect(tileOf(m, 'exams').when).toBe('exame de 21 nov · há 5 dias');
    expect(tileOf(m, 'heart').when).toBe('medido há 2 dias');
    expect(tileOf(m, 'weight').when).toBe('ontem');
    expect(tileOf(m, 'hormones').when).toBe('Vitamina D · há 5 dias');
    expect(tileOf(m, 'mind').when).toBe('PHQ-9 · há 3 dias');
    expect(tileOf(m, 'diary').when).toBe('registrado hoje');
    expect(tileOf(m, 'vitality').when).toBe('sincronizado há 2 h');
    expect(tileOf(m, 'care').when).toBe('próxima · daqui a 16 dias');
  });

  it('a idade vem da régua dos gráficos (dias de calendário) e "só data" é dia local, não UTC', () => {
    expect(dateAge(new Date(NOW - 5 * DAY).toISOString(), NOW).days).toBe(5);
    expect(dateAge('2026-11-26', NOW).days).toBe(0); // meia-noite UTC seria "ontem" no Brasil
    expect(dateAge('2026-11-25', NOW).days).toBe(1);
    expect(dateAge('2027-01-01', NOW).days).toBeNull(); // futuro não tem idade
    expect(dateAge('lixo', NOW).days).toBeNull();
    expect(timeAge(new Date(NOW - 2 * 3_600_000).toISOString(), NOW)).toEqual({ kind: 'time', days: 0, hours: 2 });
  });

  it('todo gráfico diz de quando é o último dado (eixo categórico → legenda de recência)', () => {
    const m = present(load());
    const charts = m.tiles.flatMap((t) => chartsOf(t).map((card) => ({ area: t.key, card })));
    expect(charts.length).toBeGreaterThanOrEqual(6);
    for (const { area, card } of charts) {
      expect(card.lastAge.days, `${area}: idade do último ponto`).not.toBeNull();
      expect(card.lastLead, `${area}: rótulo da legenda`).toMatch(/^Últim[ao]/);
    }
    expect(tileOf(m, 'exams').story.find((s) => s.kind === 'line')).toMatchObject({ lastAge: { days: 5 } });
    expect(tileOf(m, 'hormones').story.find((s) => s.kind === 'line')).toMatchObject({ lastAge: { days: 5 } });
    expect(tileOf(m, 'vitality').story.find((s) => s.kind === 'line')).toMatchObject({ lastAge: { days: 0 } });
  });

  it('o herói diz o dado mais recente e o mais antigo', () => {
    const hero = present(load()).hero;
    expect(hero.newest).toEqual({ area: 'Sono e atividade', when: 'sincronizado há 2 h' });
    expect(hero.oldest).toEqual({ area: 'Exames e sangue', when: 'exame de 21 nov · há 5 dias' });
  });
});

describe('dado antigo nunca parece atual', () => {
  const staleFx = (): Sample => {
    const fx = load();
    const exams = fx.panorama.exams as unknown as { status: string; asOf: string; data: { lastExam: { performedAt: string } | null; abnormalPerExam: { at: string }[] } };
    const old = new Date(NOW - 425 * DAY).toISOString();
    exams.status = 'stale';
    exams.asOf = old;
    exams.data.lastExam = { performedAt: old };
    exams.data.abnormalPerExam = exams.data.abnormalPerExam.map((x) => ({ ...x, at: new Date(new Date(x.at).getTime() - 400 * DAY).toISOString() }));
    return fx;
  };

  it('tom neutro, pílula "dado de há X meses" e nenhum sinal de "em dia"', () => {
    const tile = tileOf(present(staleFx()), 'exams');
    expect(tile.stale).toBe(true);
    expect(tile.tone).toBe('neutral');
    expect(tile.pill).toBe('dado de há 1 ano e 2 meses');
    expect(tile.pill).not.toMatch(/em dia|na faixa|LDL/);
    expect(tile.sparkTone).toBe('neutral');
    expect(tile.when).toBe('exame de 27 set · há 1 ano e 2 meses');
    expect(tile.age.days).toBe(425);
  });

  it('o número continua lá (era o resultado daquele exame), mas o cartão avisa que é antigo', () => {
    const tile = tileOf(present(staleFx()), 'exams');
    expect(tile.big).toBe('3');
    expect(tile.story[0]).toMatchObject({ kind: 'number', band: { tone: 'neutral', label: 'dado de há 1 ano e 2 meses' } });
    // A lista de valores fora da faixa mantém seta + texto: descreve aquele exame, não o hoje.
    expect(listOf(tile)?.rows[0]).toMatchObject({ arrow: 'up', tone: 'warn' });
  });

  it('o tracinho de cobertura fica no estado "antigo" e o rótulo acessível leva o aviso', () => {
    const m = present(staleFx());
    expect(m.hero.ticks[AREA_ORDER.indexOf('exams')]).toBe('stale');
    expect(tileOf(m, 'exams').ariaLabel).toContain('(dado antigo)');
  });
});

describe('o que mudou — frase só quando há mudança de verdade', () => {
  it('os três cartões do esboço: verbo + número + de quando', () => {
    const cards = present(load()).changes;
    expect(cards.map((c) => c.title)).toEqual([
      'Vitamina D entrou na faixa',
      'Sintomas de humor relatados diminuíram',
      'Você dormiu 40 min a mais por noite',
    ]);
    expect(cards[0]).toMatchObject({ before: '28', after: '41', unit: 'ng/mL', whenLead: 'exame de 21 nov', tone: 'ok' });
    expect(cards[0].age.days).toBe(5);
    expect(cards[1]).toMatchObject({ before: '8', after: '3', unit: 'PHQ-9', whenLead: 'respondeu', tone: 'ok' });
    expect(cards[1].age.days).toBe(3);
    expect(cards[2]).toMatchObject({ before: '6h32', after: '7h12', unit: 'por noite', whenLead: 'nesta semana, contra sua média de 30 dias' });
  });

  it('sem mudança (antes = depois), sem número ou sem data → não existe cartão', () => {
    const fx = load();
    fx.panorama.changed = [
      { area: 'weight', kind: 'habit', subject: 'Peso', before: 76.8, after: 76.8, unit: 'kg', at: new Date(NOW).toISOString() },
      { area: 'hormones', kind: 'improved', subject: 'TSH', before: null, after: 2.1, unit: 'mUI/mL', at: new Date(NOW).toISOString() },
      { area: 'hormones', kind: 'worsened', subject: 'TSH', before: 4.5, after: null, unit: 'mUI/mL', at: new Date(NOW).toISOString() },
      { area: 'weight', kind: 'habit', subject: 'Peso', before: 76.8, after: 76.5, unit: 'kg', at: '' },
      { area: 'weight', kind: 'habit', subject: 'Peso', before: 76.8, after: 76.5, unit: 'kg', at: new Date(NOW).toISOString() },
    ];
    const cards = present(fx).changes;
    expect(cards.length).toBe(1);
    expect(cards[0].title).toBe('0,3 kg a menos nesta semana');
    expect(cards[0].tone).toBe('info'); // peso cair não é comemorado nem alarmado
  });

  it('o título carrega a tendência e o tom acompanha', () => {
    const fx = load();
    fx.panorama.changed = [
      { area: 'hormones', kind: 'left_range', subject: 'Vitamina D', before: 41, after: 24, unit: 'ng/mL', at: new Date(NOW - DAY).toISOString() },
      { area: 'hormones', kind: 'improved', subject: 'LDL', before: 160, after: 142, unit: 'mg/dL', at: new Date(NOW - DAY).toISOString() },
      { area: 'hormones', kind: 'worsened', subject: 'Ferritina', before: 40, after: 28, unit: 'ng/mL', at: new Date(NOW - DAY).toISOString() },
      { area: 'mind', kind: 'screening', subject: 'GAD-7', before: 3, after: 9, unit: 'pontos', at: new Date(NOW - DAY).toISOString() },
      { area: 'vitality', kind: 'habit', subject: 'Passos', before: 8430, after: 7100, unit: '', at: new Date(NOW - DAY).toISOString() },
    ];
    const cards = present(fx).changes;
    expect(cards.map((c) => [c.title, c.sub, c.tone])).toEqual([
      ['Vitamina D saiu da faixa', '', 'bad'],
      ['LDL melhorou', 'ainda fora da faixa do laboratório', 'ok'],
      ['Ferritina se afastou da faixa', 'ainda fora da faixa do laboratório', 'warn'],
    ]);
    fx.panorama.changed = fx.panorama.changed.slice(3);
    expect(present(fx).changes.map((c) => [c.title, c.tone])).toEqual([
      ['Ansiedade relatada aumentou', 'warn'],
      ['1.330 passos a menos por dia', 'neutral'],
    ]);
  });

  it('no máximo 3 cartões; sem mudança nenhuma, lista vazia (a tela mostra o estado vazio)', () => {
    const fx = load();
    fx.panorama.changed = Array.from({ length: 6 }, (_, i) => ({ area: 'weight' as const, kind: 'habit' as const, subject: 'Peso', before: 80, after: 80 - i - 1, unit: 'kg', at: new Date(NOW).toISOString() }));
    expect(present(fx).changes.length).toBe(3);
    fx.panorama.changed = [];
    expect(present(fx).changes).toEqual([]);
    delete (fx.panorama as Partial<PanoramaResponse>).changed;
    expect(present(fx).changes).toEqual([]);
  });
});

describe('mente e humor — sempre rastreio, nunca diagnóstico', () => {
  it('azulejo e cartões dizem que é rastreio', () => {
    const tile = tileOf(present(load()), 'mind');
    expect(tile.screeningNote).toBe(true);
    expect(tile.take).toMatch(/^Rastreio, não diagnóstico\./);
    expect(tile.story[0]).toMatchObject({ kind: 'number', big: '3', unit: 'de 27', text: expect.stringContaining('não um diagnóstico') });
    expect(tile.story[0]).toMatchObject({ band: { label: 'mínima (0 a 4)' } });
    expect(tile.story.find((s) => s.kind === 'crisis')).toBeUndefined();
  });

  it('com ideação suicida, o aviso de crise vem primeiro e traz CVV 188 e SAMU 192', () => {
    const fx = load();
    (fx.panorama.mind.data as { latest: { suicidalIdeation: boolean } }).latest.suicidalIdeation = true;
    const tile = tileOf(present(fx), 'mind');
    expect(tile.crisis).toBe(true);
    expect(tile.pill).toBe('apoio 24h: CVV 188');
    expect(tile.story[0]).toMatchObject({ kind: 'crisis', call: expect.stringContaining('CVV 188'), urgent: expect.stringContaining('192') });
  });

  it('o cartão de barras compara a primeira com a última resposta', () => {
    const tile = tileOf(present(load()), 'mind');
    const bars = tile.story.find((s) => s.kind === 'bars');
    expect(bars).toMatchObject({ kind: 'bars', values: [8, 8, 5, 3], labels: ['18 set', '16 out', '6 nov', '23 nov'], text: 'Caiu 5 pontos em 2 meses.' });
  });

  it('só o GAD-7 respondido: PHQ-9 null não vira número nem frase; o azulejo lidera com a ansiedade', () => {
    const fx = withVariant('mindOnlyGad7');
    fx.panorama.changed = []; // o "o que mudou" de PHQ-9 da amostra principal não cabe aqui
    const m = present(fx);
    const tile = tileOf(m, 'mind');
    expect([tile.big, tile.unit, tile.whenLead, tile.when, tile.pill]).toEqual(['4', 'de 21', 'GAD-7 (ansiedade)', 'GAD-7 (ansiedade) · há 3 dias', 'antes era 9']);
    expect(tile.story.map((s) => s.kind)).toEqual(['number', 'step']);
    expect(tile.story[0]).toMatchObject({ big: '4', eyebrow: 'GAD-7 (ansiedade) · há 3 dias', band: { label: 'mínima (0 a 4)' } });
    expect(tile.take).toBe('Rastreio, não diagnóstico. Na resposta anterior, há 1 mês, GAD-7 (ansiedade) era 9.');
    for (const s of stringsOf(m)) expect(s).not.toMatch(/PHQ-9|de 27/);
  });

  it('nenhum questionário respondido: não há azulejo — é convite, não "0"', () => {
    const fx = load();
    fx.panorama.mind.data = { latest: { at: new Date(NOW - 3 * DAY).toISOString(), phq9: null, gad7: null, phq9Band: 'não realizado', gad7Band: 'não realizado', suicidalIdeation: false }, previous: null, history: [] };
    const m = present(fx);
    expect(m.tiles.some((t) => t.key === 'mind')).toBe(false);
    expect(m.todo.find((t) => t.key === 'mind')).toMatchObject({ why: 'Questionário não respondido', to: '/saude-mental' });
  });

  it('cada questionário tem a própria data de "de quando"', () => {
    const fx = load();
    mindOf(fx).latest = { ...latestOf(fx), phq9At: new Date(NOW - 3 * DAY).toISOString(), gad7At: new Date(NOW - 40 * DAY).toISOString() };
    const tile = tileOf(present(fx), 'mind');
    expect(tile.when).toBe('PHQ-9 · há 3 dias');
    expect(tile.story[0]).toMatchObject({ eyebrow: 'PHQ-9 · há 3 dias' });
    expect(tile.story[2]).toMatchObject({ eyebrow: 'GAD-7 (ansiedade) · há 1 mês' });
  });

  it('banda "não realizado" ao lado de um total não vira rótulo da faixa', () => {
    const fx = load();
    mindOf(fx).latest = { ...latestOf(fx), phq9Band: 'não realizado' };
    expect(tileOf(present(fx), 'mind').story[0]).toMatchObject({ band: { label: 'faixa mínima (0 a 4)' } });
  });
});

describe('contrato atualizado em 26/11', () => {
  it('cartão de emergência (asOf sempre null): rótulo sem separador pendurado e azulejo sem data', () => {
    const fx = load();
    fx.panorama.emergency = { key: 'emergency', status: 'ok', asOf: null, data: { configured: true } };
    const tile = tileOf(present(fx), 'emergency');
    expect(tile.big).toBe('Pronto');
    expect(tile.when).toBe('');
    expect(tile.when).not.toMatch(/·|há /);
    expect(tile.story[0]).toMatchObject({ kind: 'number', eyebrow: 'Cartão de emergência' });
  });

  it('sem idade do corpo, a área de coração segue só com a pressão', () => {
    const fx = load();
    (fx.panorama.heart.data as PanoramaHeartData).bodyAge = null;
    const tile = tileOf(present(fx), 'heart');
    expect(tile.big).toBe('12/8');
    expect(tile.story.some((s) => s.kind === 'number' && s.eyebrow.includes('estimativa'))).toBe(false);
  });

  it('composição corporal com músculo em kg (sem %): mostra kg de músculo', () => {
    const tile = tileOf(present(withVariant('bodyCompKg')), 'bodyComp');
    expect([tile.big, tile.unit]).toEqual(['27,5', '% de gordura']);
    expect(tile.story[1]).toMatchObject({ kind: 'number', big: '28,4', unit: 'kg de músculo' });
    expect(tile.take).toBe('27,5% de gordura corporal. 28,4 kg de músculo.');
  });

  it('título do compromisso: contexto quando há médico, nome quando não há', () => {
    const tile = tileOf(present(load()), 'care');
    expect(tile.story[0]).toMatchObject({ band: { label: 'Dr. Daniel Cesar · endocrinologia' }, text: 'Retorno com novos exames' });
    expect(tile.take).toContain('Próxima consulta: Retorno com novos exames — 12 dez, às 14h30.');
    const fx = load();
    (fx.panorama.care.data as PanoramaCareData).nextAppointment = { at: new Date(NOW + 16 * DAY).toISOString(), doctor: null, specialty: null, title: 'Consulta no posto' };
    expect(tileOf(present(fx), 'care').story[0]).toMatchObject({ band: { label: 'Consulta no posto' }, text: '' });
  });

  it('exame de 14 meses com valores fora da faixa: stale vence attention e o azulejo mostra dado antigo', () => {
    const tile = tileOf(present(withVariant('staleExams')), 'exams');
    expect(tile.stale).toBe(true);
    expect(tile.tone).toBe('neutral');
    expect([tile.big, tile.pill]).toEqual(['3', 'dado de há 1 ano e 2 meses']);
    expect(tile.story[0]).toMatchObject({ band: { tone: 'neutral', label: 'dado de há 1 ano e 2 meses' } });
  });

  it('faixa que o servidor deu em desacordo com o total nunca sai com intervalo numérico', () => {
    const fx = load();
    mindOf(fx).latest = { ...latestOf(fx), phq9: 4, phq9Band: 'leve' };
    expect(tileOf(present(fx), 'mind').story[0]).toMatchObject({ band: { label: 'leve' } });
    mindOf(fx).latest = { ...latestOf(fx), phq9: 4, phq9Band: 'Faixa mínima' };
    expect(tileOf(present(fx), 'mind').story[0]).toMatchObject({ band: { label: 'Faixa mínima (0 a 4)' } });
  });
});

describe('missing e unavailable', () => {
  it('missing vira convite em "Para completar", com motivo e botão para a tela certa', () => {
    const m = present(load());
    expect(m.todo.map((t) => [t.key, t.why, t.cta, t.to])).toEqual([
      ['bodyComp', 'Nunca medida', 'Medir', '/composicao'],
      ['vaccines', 'Nenhuma vacina registrada', 'Registrar', '/vacinas'],
      ['emergency', 'Não configurado', 'Configurar', '/emergencia'],
    ]);
    expect(m.unavailable).toEqual([]);
    expect(m.filled).toBe(9);
    expect(m.hero.filled).toBe(9);
    expect(m.hero.ticks.filter((t) => t === 'off').length).toBe(3);
  });

  it('unavailable vira aviso discreto: não entra na grade nem nos convites', () => {
    const fx = load();
    fx.panorama.vitality = { key: 'vitality', status: 'unavailable', asOf: null, data: null };
    const m = present(fx);
    expect(m.unavailable).toEqual([{ key: 'vitality', name: 'Sono e atividade' }]);
    expect(m.tiles.some((t) => t.key === 'vitality')).toBe(false);
    expect(m.todo.some((t) => t.key === 'vitality')).toBe(false);
    expect(m.hero.ticks[AREA_ORDER.indexOf('vitality')]).toBe('off');
  });

  it('status "ok" sem dado, ou área ausente do payload, é "não foi possível carregar"', () => {
    const fx = load();
    fx.panorama.meds = { key: 'meds', status: 'ok', asOf: null, data: null };
    const partial = { ...fx.panorama } as Partial<PanoramaResponse>;
    delete partial.diary;
    const m = present({ ...fx, panorama: partial as PanoramaResponse });
    expect(m.unavailable.map((u) => u.key)).toEqual(['diary', 'meds']);
  });

  it('área com dado vazio (status ok, nada dentro) é convite, não número', () => {
    const fx = load();
    fx.panorama.weight = { key: 'weight', status: 'ok', asOf: null, data: { latest: null, series: [], bmi: null } };
    const m = present(fx);
    expect(m.tiles.some((t) => t.key === 'weight')).toBe(false);
    expect(m.todo.find((t) => t.key === 'weight')).toMatchObject({ why: 'Nenhum peso registrado', to: '/medicoes' });
    // E o passo de "Peso e corpo" não aparece — não há azulejo para ele.
    expect(m.tiles.length).toBe(8);
  });
});

describe('sem dado não se inventa número nem frase', () => {
  it('nenhum texto do modelo carrega NaN, undefined, null ou chave sem tradução (pt e en)', () => {
    for (const t of [pt, en]) {
      const texts = stringsOf(present(load(), t));
      expect(texts.length).toBeGreaterThan(150);
      for (const s of texts) {
        expect(s).not.toMatch(/NaN|undefined|\bnull\b/);
        expect(s.startsWith('panorama.')).toBe(false);
        expect(s).not.toContain('%{');
      }
    }
  });

  it('exames sem nenhum resultado não viram azulejo "0 fora da faixa"', () => {
    const fx = load();
    fx.panorama.exams = { key: 'exams', status: 'ok', asOf: null, data: { lastExam: null, examCount: 0, itemCount: 0, abnormalCount: 0, abnormal: [], retest: null, abnormalPerExam: [] } };
    const m = present(fx);
    expect(m.tiles.some((t) => t.key === 'exams')).toBe(false);
    expect(m.todo.find((x) => x.key === 'exams')?.cta).toBe('Enviar exame');
  });

  it('série com menos de 2 pontos não gera gráfico; média nula não gera frase', () => {
    const fx = load();
    const h = fx.panorama.hormones.data as unknown as { markers: { key: string; series: unknown[] }[] };
    h.markers.find((x) => x.key === 'TSH')!.series = [{ at: new Date(NOW - DAY).toISOString(), v: 2.1 }];
    const diary = fx.panorama.diary.data as { moodAvg7: number | null };
    diary.moodAvg7 = null;
    const mind = fx.panorama.mind.data as unknown as { history: unknown[] };
    mind.history = mind.history.slice(-1);
    const m = present(fx);
    const tsh = tileOf(m, 'hormones').story[2]; // TSH é o 2º marcador → 1 cartão de número
    expect(tsh.kind).toBe('number');
    expect(tileOf(m, 'hormones').story.filter((s) => s.kind === 'line').length).toBe(1);
    const bars = barsOf(tileOf(m, 'diary'));
    expect(bars?.text).toBe('');
    expect(tileOf(m, 'mind').story.some((s) => s.kind === 'bars')).toBe(false);
  });

  it('idade do corpo é chamada de estimativa', () => {
    const heart = tileOf(present(load()), 'heart').story;
    const bodyAge = heart.find((s) => s.kind === 'number' && s.eyebrow.includes('estimativa'));
    expect(bodyAge).toMatchObject({ big: '37', unit: 'anos', text: 'Estimativa feita a partir dos seus exames e medições. Você tem 41.' });
  });
});

describe('fora da faixa tem cor e um segundo sinal', () => {
  it('lista de exames: seta ↑/↓, texto da referência e o tom da régua única do app', () => {
    const list = listOf(tileOf(present(load()), 'exams'));
    expect(list?.rows).toEqual([
      { name: 'Colesterol LDL', detail: 'referência: abaixo de 130', value: '142 mg/dL', tone: 'warn', arrow: 'up' },
      { name: 'Ferritina', detail: 'referência: 30 a 200', value: '12 ng/mL', tone: 'warn', arrow: 'down' },
      { name: 'VCM', detail: 'referência: 80 a 96', value: '96,8 fL', tone: 'warn', arrow: 'up' },
    ]);
    expect(list?.text).toContain('Nenhum veio marcado como crítico');
  });

  it('valor marcado como crítico pelo laboratório não é minimizado', () => {
    const fx = load();
    const abnormal = (fx.panorama.exams.data as { abnormal: { flag: string }[] }).abnormal;
    abnormal[0].flag = 'CRITICAL';
    const tile = tileOf(present(fx), 'exams');
    expect(tile.tone).toBe('bad');
    expect(listOf(tile)?.text).toContain('crítico pelo laboratório — procure um serviço de saúde');
  });

  it('hormônio fora da faixa diz acima/abaixo da faixa do laboratório', () => {
    const fx = load();
    const markers = (fx.panorama.hormones.data as unknown as { markers: { key: string; status: string }[] }).markers;
    markers.find((x) => x.key === 'TSH')!.status = 'high';
    const tile = tileOf(present(fx), 'hormones');
    expect(tile.big).toBe('2,1');
    expect(tile.pill).toBe('acima da faixa do laboratório');
    expect(tile.tone).toBe('warn');
    expect(tile.story[0]).toMatchObject({ band: { tone: 'warn', label: 'acima da faixa do laboratório' } });
  });
});

describe('herói — mesmo placar e mesmos rótulos da Home', () => {
  it('72 → "Em boa forma", 3 fora da faixa, 35 na faixa, o que puxa e o que segura', () => {
    const hero = present(load()).hero;
    expect(hero.score).toBe(72);
    expect(hero.verdict).toBe('Em boa forma');
    expect(hero.outOfRange).toBe(3);
    expect(hero.inRange).toBe(35);
    expect(hero.pullLead).toBe('O que mais puxa o placar para baixo:');
    expect(joinNames(hero.pullDown, pt)).toBe('Colesterol LDL, Ferritina e VCM');
    expect(hero.holds).toBe('O que segura: os outros 35 resultados na faixa.');
    expect(hero.nothingPulls).toBe('');
  });

  it('os rótulos são os mesmos limiares do statusFromScore da Home', () => {
    const fx = load();
    const verdictFor = (score: number) => present({ ...fx, healthSummary: { ...fx.healthSummary, score } }).hero.verdict;
    expect(verdictFor(85)).toBe('Em ótima forma');
    expect(verdictFor(80)).toBe('Em ótima forma');
    expect(verdictFor(60)).toBe('Em boa forma');
    expect(verdictFor(45)).toBe('Pede atenção');
    expect(verdictFor(40)).toBe('Pede atenção');
    expect(verdictFor(20)).toBe('Precisa de cuidados');
  });

  it('sem resumo de saúde: sem placar, sem pílulas, com convite', () => {
    const hero = present(load(), pt, NOW, null).hero;
    expect(hero.score).toBeNull();
    expect(hero.verdict).toBe('Ainda sem placar');
    expect(hero.outOfRange).toBeNull();
    expect(hero.inRange).toBeNull();
    expect(hero.noScoreText).toContain('Envie um exame');
    expect(hero.pullLead).toBe('');
  });

  it('tudo na faixa: nada puxa o placar para baixo', () => {
    const fx = load();
    fx.healthSummary = { ...fx.healthSummary, score: 100, byPriority: { normal: 38, leve: 0, moderada: 0, importante: 0 }, topAttention: [] };
    const hero = present(fx).hero;
    expect(hero.pullLead).toBe('');
    expect(hero.holds).toBe('');
    expect(hero.nothingPulls).toBe('Nada puxa o placar para baixo: todos os 38 resultados estão na faixa.');
  });

  it('cobertura: 9 de 12, com um tracinho âmbar para a área em atenção', () => {
    const hero = present(load()).hero;
    expect([hero.filled, hero.total]).toEqual([9, 12]);
    expect(hero.ticks).toEqual(['warn', 'on', 'on', 'off', 'on', 'on', 'on', 'on', 'on', 'on', 'off', 'off']);
  });
});

describe('cartões por área', () => {
  it('3 a 4 cartões por área, sempre terminando em um próximo passo com um botão', () => {
    for (const tile of present(load()).tiles.slice(0, -1)) {
      const cards = tile.story;
      expect(cards.length, tile.key).toBeGreaterThanOrEqual(3);
      expect(cards.length, tile.key).toBeLessThanOrEqual(5);
      const last = cards[cards.length - 1];
      expect(last.kind, tile.key).toBe('step');
      if (last.kind === 'step') expect(last.to.startsWith('/'), tile.key).toBe(true);
    }
  });

  it('o fim do panorama entra como último cartão da última área', () => {
    const m = present(load());
    const lastTile = m.tiles[m.tiles.length - 1];
    expect(lastTile.key).toBe('care');
    expect(lastTile.story[lastTile.story.length - 1]).toMatchObject({ kind: 'end', title: 'Você passou pelas 9 áreas' });
  });

  it('pressão: notação do dia a dia no azulejo, valor exato no cartão', () => {
    const tile = tileOf(present(load()), 'heart');
    expect([tile.big, tile.unit]).toEqual(['12/8', 'mmHg']);
    expect(tile.story[0]).toMatchObject({ big: '120/80', band: { label: 'em dia' } });
    expect(tile.story[1]).toMatchObject({ kind: 'line', ref: null, text: 'Caiu 8 mmHg em 6 meses.' });
    expect(tile.take).toBe('Pressão arterial medida há 2 dias. O risco cardiometabólico calculado pelos seus exames está baixo.');
  });

  it('peso: variação com sinal, IMC com a faixa de referência e convite para a composição', () => {
    const tile = tileOf(present(load()), 'weight');
    expect(tile.big).toBe('76,8');
    expect(tile.pill).toBe('−1,4 kg em 3 meses');
    expect(tile.take).toBe('Queda de 0,47 kg por mês.');
    expect(tile.story[0]).toMatchObject({ band: { label: 'IMC 24,1 · faixa de referência 18,5 a 24,9' } });
    expect(tile.story[tile.story.length - 1]).toMatchObject({ kind: 'step', to: '/composicao' });
  });

  it('sono: 7h12, 40 min acima da média de 30 dias; passos como 2º número', () => {
    const tile = tileOf(present(load()), 'vitality');
    expect([tile.big, tile.unit, tile.pill]).toEqual(['7h12', 'por noite', '40 min acima da sua média']);
    expect(tile.story[2]).toMatchObject({ kind: 'number', big: '8.430', band: { label: '1.330 passos acima da sua média' } });
    expect(tile.story[1]).toMatchObject({ kind: 'line', ref: [7, 9] });
  });

  it('consultas: dia grande, mês e hora na unidade, perguntas prontas na pílula', () => {
    const tile = tileOf(present(load()), 'care');
    expect([tile.big, tile.unit, tile.pill]).toEqual(['12', 'dez · 14h30', '4 perguntas prontas']);
    expect(tile.story[0]).toMatchObject({ band: { label: 'Dr. Daniel Cesar · endocrinologia' } });
  });
});

describe('textos auxiliares', () => {
  it('idade em português e em inglês', () => {
    const d = (days: number) => ({ kind: 'date' as const, days, hours: null });
    expect(ageText(d(0), pt)).toBe('hoje');
    expect(ageText(d(1), pt)).toBe('ontem');
    expect(ageText(d(5), pt)).toBe('há 5 dias');
    expect(ageText(d(45), pt)).toBe('há 1 mês');
    expect(ageText(d(95), pt)).toBe('há 3 meses');
    expect(ageText(d(400), pt)).toBe('há 1 ano e 1 mês');
    expect(ageText(d(730), pt)).toBe('há 2 anos');
    expect(ageText(null, pt)).toBe('');
    expect(ageText(d(0), en)).toBe('today');
    expect(ageText(d(45), en)).toBe('1 month ago');
    expect(ageText(d(400), en)).toBe('1 year and 1 month ago');
    expect(spanText(16, pt)).toBe('16 dias');
    expect(spanText(75, pt)).toBe('2 meses');
  });

  it("lista de nomes: 'a, b e c' em português, 'a, b, and c' em inglês", () => {
    expect(joinNames(['LDL', 'ferritina', 'VCM'], pt)).toBe('LDL, ferritina e VCM');
    expect(joinNames(['LDL', 'ferritina', 'VCM'], en)).toBe('LDL, ferritina, and VCM');
    expect(joinNames(['LDL'], pt)).toBe('LDL');
  });
});
