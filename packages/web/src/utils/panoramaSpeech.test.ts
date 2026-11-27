import { describe, it, expect } from 'vitest';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import type { PanoramaResponse } from '@meus-exames/shared';
import sample from '../../../../e2e/fixtures/panorama.sample.json';
import { ptMessages } from '../i18n';
import { presentPanorama, type PanoramaModel, type Translate } from './panoramaPresenter';
import { panoramaSpeech } from './panoramaSpeech';

const pt: Translate = polyglotI18nProvider(() => ptMessages, 'pt').translate;
const model = (): PanoramaModel =>
  presentPanorama(sample.panorama as unknown as PanoramaResponse, sample.healthSummary, { t: pt, now: new Date(sample._meta.asOf).getTime() });

describe('panoramaSpeech — roteiro do "Ouvir panorama"', () => {
  it('começa pelo placar e passa por todas as áreas preenchidas', () => {
    const m = model();
    const text = panoramaSpeech(m, pt);
    expect(text.startsWith(`Seu placar de saúde é ${m.hero.score} de 100`)).toBe(true);
    for (const tile of m.tiles.filter((x) => !x.crisis)) expect(text).toContain(`${tile.name}:`);
    expect(text).toContain('não substitui a consulta médica');
  });

  it('Mente e humor e Diário de saúde ganham uma frase dizendo o que são, logo antes do dado', () => {
    const m = model();
    const text = panoramaSpeech(m, pt);
    const mind = m.tiles.find((x) => x.key === 'mind');
    const diary = m.tiles.find((x) => x.key === 'diary');
    const once = (s: string) => text.split(s).length - 1;
    if (mind) {
      expect(text.indexOf('questionário curto sobre humor e ansiedade')).toBeLessThan(text.indexOf(`${mind.name}:`));
      expect(once('questionário curto sobre humor e ansiedade')).toBe(1); // explica uma vez só
    }
    if (diary) {
      expect(text.indexOf('é onde você anota')).toBeLessThan(text.indexOf(`${diary.name}:`));
      expect(once('é onde você anota')).toBe(1);
    }
    expect(text).not.toMatch(/Remédios:|Consultas e perguntas:|Vacinas:|Cartão de emergência:/);
  });

  it('não deixa chave de tradução crua nem "undefined" no que será falado', () => {
    const text = panoramaSpeech(model(), pt);
    expect(text).not.toMatch(/panorama\.|undefined|null|%\{/);
  });

  it('área de saúde mental em alerta de crise não é lida em voz alta', () => {
    const m = model();
    const mind = m.tiles.find((x) => x.key === 'mind');
    if (!mind) return;
    const text = panoramaSpeech({ ...m, tiles: m.tiles.map((x) => (x.key === 'mind' ? { ...x, crisis: true } : x)) }, pt);
    expect(text).not.toContain(`${mind.name}:`);
  });

  it('sem placar: fala o convite, sem inventar número', () => {
    const m = model();
    const text = panoramaSpeech({ ...m, hero: { ...m.hero, score: null, verdict: 'Ainda sem placar', noScoreText: 'Envie um exame para começar' } }, pt);
    expect(text.startsWith('Ainda sem placar.')).toBe(true);
    expect(text).not.toContain('de 100');
  });
});
