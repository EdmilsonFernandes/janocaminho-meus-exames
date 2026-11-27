import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetExamPrefetch, lastKnownExam, prefetchExam, rememberExam, takePrefetched } from './examPrefetch';

// O token da sessão vem do localStorage (config.ts) — aqui não há navegador.
vi.stubGlobal('localStorage', { getItem: () => 'tk', setItem: () => {}, removeItem: () => {} });
afterEach(() => { __resetExamPrefetch(); vi.useRealTimers(); });

const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe('examPrefetch — busca começa no toque', () => {
  it('o detalhe recebe o exame buscado no toque, uma vez só', async () => {
    const f = ok({ id: 'e1', status: 'EXTRACTED' });
    prefetchExam('e1', f);
    prefetchExam('e1', f); // toque duplo não busca duas vezes
    expect(f).toHaveBeenCalledTimes(1);
    expect(await takePrefetched('e1')).toEqual({ id: 'e1', status: 'EXTRACTED' });
    expect(takePrefetched('e1')).toBeNull();
  });

  it('busca velha (mais de 15 s) não é usada', async () => {
    vi.useFakeTimers();
    prefetchExam('e2', ok({ id: 'e2' }));
    vi.advanceTimersByTime(16_000);
    expect(takePrefetched('e2')).toBeNull();
  });

  it('erro de rede ou 404 vira null — a tela faz a busca normal e mostra o erro dela', async () => {
    prefetchExam('e3', vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch);
    expect(await takePrefetched('e3')).toBeNull();
    prefetchExam('e4', vi.fn(async () => new Response('{}', { status: 404 })) as unknown as typeof fetch);
    expect(await takePrefetched('e4')).toBeNull();
  });

  it('sem id não faz nada', () => {
    const f = ok({});
    prefetchExam(undefined, f);
    prefetchExam('', f);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('lastKnownExam — reabrir mostra na hora', () => {
  it('guarda exame lido e esquece exame em processamento', () => {
    rememberExam('a', { status: 'EXTRACTED' });
    expect(lastKnownExam('a')).toEqual({ status: 'EXTRACTED' });
    rememberExam('a', { status: 'EXTRACTING' });
    expect(lastKnownExam('a')).toBeNull();
  });

  it('guarda no máximo 20 exames', () => {
    for (let i = 0; i < 25; i++) rememberExam(`x${i}`, { status: 'EXTRACTED' });
    expect(lastKnownExam('x0')).toBeNull();
    expect(lastKnownExam('x24')).not.toBeNull();
  });
});
