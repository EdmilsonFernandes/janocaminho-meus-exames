import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }));

import { signupSource } from './signupSource';

// O projeto não usa jsdom: simula só o que a função lê (location, referrer, localStorage).
const store = new Map<string, string>();
const go = (search: string, hash: string, referrer = '') => {
  vi.stubGlobal('window', { location: { search, hash } });
  vi.stubGlobal('document', { referrer });
};

describe('signupSource — de onde veio o cadastro', () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    });
    go('', '');
  });

  it('lê a UTM da query normal', () => {
    go('?utm_source=instagram&utm_campaign=bio', '');
    expect(signupSource()).toBe('instagram/bio');
  });

  it('lê a UTM que vem DENTRO do hash (o app usa rotas com #)', () => {
    go('', '#/landing?utm_source=whatsapp&utm_campaign=grupo-tireoide');
    expect(signupSource()).toBe('whatsapp/grupo-tireoide');
  });

  it('guarda a origem do primeiro toque e devolve a mesma no cadastro, já sem UTM na URL', () => {
    go('', '#/landing?utm_source=tiktok');
    expect(signupSource()).toBe('tiktok');
    go('', '#/registrar');
    expect(signupSource()).toBe('tiktok');
  });

  it('sem UTM usa o site de onde a pessoa veio', () => {
    go('', '#/landing', 'https://www.google.com/search?q=exame');
    expect(signupSource()).toBe('google.com');
  });

  it('sem UTM, sem referrer e fora do app → vazio (vira "direto" no admin)', () => {
    go('', '#/registrar');
    expect(signupSource()).toBe('');
  });
});
