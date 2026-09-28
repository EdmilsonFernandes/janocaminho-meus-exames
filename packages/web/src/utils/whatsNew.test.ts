// @vitest-environment node
/**
 * Novidades da versão (G5) — lógica pura: mapa por versionCode + gatilho
 * (onboarded + não-visto + slot de cold-dialog). Sem DOM.
 */
import { describe, expect, it } from 'vitest';
import {
  RELEASE_NOTES, markWhatsNewSeen, notesForVersion, shouldShowWhatsNew, whatsNewKey,
} from './whatsNew';

const mkStorage = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
  };
};
const claimTrue = () => true;
const claimFalse = () => false;

describe('RELEASE_NOTES — mapa por versionCode', () => {
  it('v443 tem os 5 itens (leva 1 + FAERS + voz) com deep-links válidos', () => {
    const n = notesForVersion(443);
    expect(n.map((x) => x.title)).toEqual([
      'Saúde mental no app',
      'Curva de crescimento do seu filho',
      'Respostas com fonte',
      'Efeitos mais relatados do seu remédio',
      'Fale com o Dr. Exame',
    ]);
    for (const item of n) {
      expect(item.emoji).toBeTruthy();
      expect(item.desc).toBeTruthy();
      expect(item.to.startsWith('/')).toBe(true);
    }
    expect(RELEASE_NOTES[443].length).toBeLessThanOrEqual(5); // spec: máx ~5 (scroll)
  });

  it('v442 tem a leva 1 (A/B/C)', () => {
    const n = notesForVersion(442);
    expect(n).toHaveLength(3);
    expect(n[0].to).toBe('/saude-mental');
  });

  it('versão sem entrada no mapa → sem novidades (não abre)', () => {
    expect(notesForVersion(441)).toEqual([]);
    expect(notesForVersion(999)).toEqual([]);
  });
});

describe('shouldShowWhatsNew — gatilho', () => {
  it('abre 1× para a versão com conteúdo (onboarded, não vista, slot ganho)', () => {
    const s = mkStorage({ onboarded: '1' });
    expect(shouldShowWhatsNew(443, s, claimTrue)).toBe(true);
  });

  it('não abre sem onboarding', () => {
    expect(shouldShowWhatsNew(443, mkStorage({}), claimTrue)).toBe(false);
  });

  it('não abre de novo após visto (chave por versionCode)', () => {
    const s = mkStorage({ onboarded: '1', [whatsNewKey(443)]: '1' });
    expect(shouldShowWhatsNew(443, s, claimTrue)).toBe(false);
  });

  it('viu a versão anterior mas a NOVA (com conteúdo) volta a mostrar — fim do congelamento por major.minor', () => {
    const s = mkStorage({ onboarded: '1', [whatsNewKey(442)]: '1' }); // já viu a 442
    expect(shouldShowWhatsNew(443, s, claimTrue)).toBe(true);
  });

  it('versão sem conteúdo nunca abre, mesmo sem chave', () => {
    expect(shouldShowWhatsNew(441, mkStorage({ onboarded: '1' }), claimTrue)).toBe(false);
  });

  it('perdeu o slot de cold-dialog (outro modal abriu 1º) → não abre', () => {
    const s = mkStorage({ onboarded: '1' });
    expect(shouldShowWhatsNew(443, s, claimFalse)).toBe(false);
  });

  it('storage bloqueado não trava: claim decide', () => {
    const blocked = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    expect(shouldShowWhatsNew(443, blocked, claimTrue)).toBe(true);
    expect(shouldShowWhatsNew(443, blocked, claimFalse)).toBe(false);
  });
});

describe('markWhatsNewSeen', () => {
  it('grava a chave da versão e a leitura seguinte não reabre', () => {
    const s = mkStorage({ onboarded: '1' });
    markWhatsNewSeen(443, s);
    expect(s.getItem(whatsNewKey(443))).toBe('1');
    expect(shouldShowWhatsNew(443, s, claimTrue)).toBe(false);
  });

  it('storage bloqueado: engole o erro sem quebrar', () => {
    const blocked = {
      getItem: () => null,
      setItem: () => { throw new Error('denied'); },
    };
    expect(() => markWhatsNewSeen(443, blocked)).not.toThrow();
  });
});
