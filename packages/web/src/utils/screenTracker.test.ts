import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../config', () => ({ API_URL: 'https://api.teste/api', token: () => 'tok' }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' } }));

import { normalizeScreen, trackScreen, flushScreens, __resetScreenTracker, __bufferSnapshot } from './screenTracker';

describe('normalizeScreen — nunca deixa id, token ou busca sair do aparelho', () => {
  it('mantém rota simples', () => {
    expect(normalizeScreen('/tendencias')).toBe('/tendencias');
    expect(normalizeScreen('/')).toBe('/');
    expect(normalizeScreen('')).toBe('/');
    expect(normalizeScreen('/Radar-Hormonal/')).toBe('/radar-hormonal');
  });
  it('troca ids por :id', () => {
    expect(normalizeScreen('/exams/cmvqws02w00oknu1fezuvet4e/show')).toBe('/exams/:id/show');
    expect(normalizeScreen('/suporte/8841')).toBe('/suporte/:id');
    expect(normalizeScreen('/convite/a1b2c3d4e5f6a7b8c9d0')).toBe('/convite/:id');
    expect(normalizeScreen('/teleconsulta/3f2b9c1e-77aa-4c1d-9b11-0a2b3c4d5e6f')).toBe('/teleconsulta/:id');
    expect(normalizeScreen('/x/ab12cd34')).toBe('/x/:id');
  });
  it('mantém parâmetro que é nome de tela, não id', () => {
    expect(normalizeScreen('/medicoes/historico/peso')).toBe('/medicoes/historico/peso');
    expect(normalizeScreen('/exams/create')).toBe('/exams/create');
  });
  it('descarta query string, hash e texto livre', () => {
    expect(normalizeScreen('/chat?pergunta=minha%20glicose')).toBe('/chat');
    expect(normalizeScreen('/lembretes?tab=hoje#topo')).toBe('/lembretes');
    expect(normalizeScreen('/busca/minha glicose alta')).toBe('/busca/:id');
    expect(normalizeScreen('/busca/Jo%C3%A3o')).toBe('/busca/:id');
  });
});

describe('trackScreen — acumula e manda em lote', () => {
  beforeEach(() => {
    __resetScreenTracker();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-25T12:00:00Z'));
  });

  it('conta aberturas por tela e ignora render duplicado em sequência', () => {
    trackScreen('/tendencias');
    trackScreen('/tendencias'); // duplicado imediato
    vi.advanceTimersByTime(2000);
    trackScreen('/chat');
    vi.advanceTimersByTime(2000);
    trackScreen('/tendencias');
    expect(__bufferSnapshot()).toEqual({ '/tendencias': 2, '/chat': 1 });
  });

  it('envia o lote com a plataforma e esvazia o acumulado', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    trackScreen('/exams/cmvqws02w00oknu1fezuvet4e/show');
    flushScreens();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.teste/api/usage/screens');
    expect(JSON.parse(init.body)).toEqual({ platform: 'android', views: [{ screen: '/exams/:id/show', n: 1 }] });
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(__bufferSnapshot()).toEqual({});
    flushScreens(); // nada acumulado → não chama de novo
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('manda sozinho depois de 20s e não quebra se a rede falhar', () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    trackScreen('/radar-hormonal');
    vi.advanceTimersByTime(19_000);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
