// @vitest-environment node
/**
 * nativeDoc — fala no app nativo (regressão de 26/11/26).
 *
 * O plugin do Capacitor é um Proxy que responde a QUALQUER propriedade, inclusive `then`. Se o objeto do plugin
 * é devolvido por uma função `async`, o JavaScript o trata como "thenable" e chama `TextToSpeech.then()` — e o
 * Capacitor responde `"TextToSpeech.then()" is not implemented on android`. Foi isso que fez TODO áudio do app
 * falhar nos pacotes 635 e 636. Aqui o plugin é um proxy-armadilha com o mesmo comportamento: se o código
 * voltar a passar o plugin por dentro de uma Promise, o teste falha.
 */
import { describe, expect, it, vi } from 'vitest';

type SpeakOptions = { text: string; lang: string };

const { trap, spoken, stops } = vi.hoisted(() => {
  const spoken: SpeakOptions[] = [];
  const stops: number[] = [];
  const trap = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'speak') return async (opts: SpeakOptions) => { spoken.push(opts); };
      if (prop === 'stop') return async () => { stops.push(1); };
      return () => { throw new Error(`${String(prop)}() chamado no proxy do plugin (o plugin virou "thenable")`); };
    },
  });
  return { trap, spoken, stops };
});

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor-community/text-to-speech', () => ({ TextToSpeech: trap }));

describe('speakText no app nativo', () => {
  it('fala sem tratar o plugin como thenable', async () => {
    const { speakText } = await import('./nativeDoc');
    const onDone = vi.fn();
    const onFail = vi.fn();
    spoken.length = 0;
    await speakText('Seu exame está pronto.', { onDone, onFail });
    expect(spoken.length).toBeGreaterThan(0);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onFail).not.toHaveBeenCalled();
  });

  it('fala cada frase como um trecho e diz a unidade por extenso (os números ficam como estão)', async () => {
    const { speakText } = await import('./nativeDoc');
    spoken.length = 0;
    await speakText('TSH 2,1 mUI/mL. Tudo dentro da faixa.');
    expect(spoken.length).toBe(2);
    const first = spoken[0];
    expect(first.text).toMatch(/2,1/);
    expect(first.text).toMatch(/mili unidades por mililitro/i);
    expect(first.lang).toBe('pt-BR');
  });

  it('parar a fala não passa o plugin por dentro de uma Promise', async () => {
    const { stopSpeakText } = await import('./nativeDoc');
    stops.length = 0;
    await expect(stopSpeakText()).resolves.toBeUndefined();
    expect(stops.length).toBe(1);
  });
});
