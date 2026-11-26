// @vitest-environment node
/**
 * Velocidade da fala (26/11/26). Dois defeitos relatados pelo dono:
 *  1. "as velocidades parecem não funcionar" — 0,85x/1x/1,25x eram próximas demais no motor;
 *  2. "se altero a velocidade durante a fala ele volta do começo".
 * O motor é exercitado aqui com um speechSynthesis de mentira (caminho do navegador).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPEECH_RATES, engineSpeechRate, formatSpeechRate, nextSpeechRate, normalizeSpeechRate } from './speechText';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

describe('velocidades oferecidas', () => {
  it('as opções ficam bem separadas no motor de voz (dá para ouvir a diferença)', () => {
    const engine = SPEECH_RATES.map(engineSpeechRate);
    for (let i = 1; i < engine.length; i++) expect(engine[i] - engine[i - 1]).toBeGreaterThanOrEqual(0.2);
    expect(Math.min(...engine)).toBeGreaterThanOrEqual(0.5);
    expect(Math.max(...engine)).toBeLessThanOrEqual(2);
  });

  it('valor guardado estranho ou antigo cai na opção mais próxima', () => {
    expect(normalizeSpeechRate('1.25')).toBe(1.25);
    expect(normalizeSpeechRate(0.85)).toBe(0.75);
    expect(normalizeSpeechRate(9)).toBe(1.5);
    for (const bad of [null, undefined, '', 'abc', 0, -1, NaN]) expect(normalizeSpeechRate(bad)).toBe(1);
  });

  it('o botão de trocar passa por todas e volta ao começo; rótulo com vírgula', () => {
    expect([0.75, 1, 1.25, 1.5].map(nextSpeechRate)).toEqual([1, 1.25, 1.5, 0.75]);
    expect(SPEECH_RATES.map(formatSpeechRate)).toEqual(['0,75x', '1x', '1,25x', '1,5x']);
  });
});

describe('motor de fala: trocar a velocidade no meio', () => {
  interface Spoken { text: string; rate: number; end: () => void; cancel: () => void }
  let spoken: Spoken[];
  let store: Record<string, string>;
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const TEXT = 'Primeira frase do resumo. Segunda frase do resumo. Terceira frase do resumo.';

  beforeEach(() => {
    vi.resetModules();
    spoken = [];
    store = {};
    class Utterance {
      rate = 1; lang = ''; voice: unknown; onend: (() => void) | null = null; onerror: ((ev: { error: string }) => void) | null = null;
      constructor(public text: string) {}
    }
    let current: Utterance | null = null;
    const synth = {
      getVoices: () => [],
      speak: (u: Utterance) => {
        current = u;
        spoken.push({ text: u.text, rate: u.rate, end: () => { current = null; u.onend?.(); }, cancel: () => { current = null; u.onerror?.({ error: 'interrupted' }); } });
      },
      cancel: () => { const u = current; current = null; u?.onerror?.({ error: 'interrupted' }); },
    };
    vi.stubGlobal('window', { speechSynthesis: synth });
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } });
    vi.useFakeTimers({ toFake: ['setTimeout'] });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  /** Deixa as promessas andarem e vence a pausa entre frases. */
  const settle = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); await vi.advanceTimersByTimeAsync(1000); } };

  it('não volta ao começo: repete só a frase atual, já na velocidade nova, e segue', async () => {
    const { speakText, setSpeechRate, getSpeechRate } = await import('./nativeDoc');
    const done = vi.fn();
    void speakText(TEXT, { onDone: done });
    await settle();
    expect(spoken).toHaveLength(1);
    spoken[0].end();
    await settle();
    expect(spoken).toHaveLength(2); // falando a 2ª frase a 1x
    expect(spoken[1].rate).toBeCloseTo(engineSpeechRate(1));

    setSpeechRate(1.5); // no meio da 2ª frase
    await settle();
    expect(getSpeechRate()).toBe(1.5);
    expect(spoken).toHaveLength(3);
    expect(spoken[2].text).toBe(spoken[1].text); // a MESMA frase, não a primeira
    expect(spoken[2].text).not.toBe(spoken[0].text);
    expect(spoken[2].rate).toBeCloseTo(engineSpeechRate(1.5));

    spoken[2].end();
    await settle();
    expect(spoken[3].text).not.toBe(spoken[2].text); // seguiu para a 3ª
    expect(spoken[3].rate).toBeCloseTo(engineSpeechRate(1.5));
    spoken[3].end();
    await settle();
    expect(done).toHaveBeenCalledTimes(1);
    expect(spoken).toHaveLength(4);
  });

  it('a velocidade escolhida fica guardada e vale para o próximo áudio', async () => {
    const first = await import('./nativeDoc');
    first.setSpeechRate(1.25);
    expect(store['drx.speechRate']).toBe('1.25');
    vi.resetModules(); // "abriu o app de novo"
    const second = await import('./nativeDoc');
    expect(second.getSpeechRate()).toBe(1.25);
    void second.speakText(TEXT);
    await settle();
    expect(spoken[0].rate).toBeCloseTo(engineSpeechRate(1.25));
  });

  it('parar continua parando: nenhuma frase nova depois do stop, mesmo trocando a velocidade', async () => {
    const { speakText, stopSpeakText, setSpeechRate } = await import('./nativeDoc');
    const done = vi.fn();
    void speakText(TEXT, { onDone: done });
    await settle();
    await stopSpeakText();
    setSpeechRate(0.75);
    await settle();
    expect(spoken).toHaveLength(1);
    expect(done).not.toHaveBeenCalled();
  });
});
