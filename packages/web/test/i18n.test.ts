// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ptMessages, enMessages } from '../src/i18n';

/**
 * Teste de COMPLETUDE de i18n. Escaneia TODOS os .ts/.tsx em src/ buscando chamadas
 * translate('chave') / t('chave') e garante que cada chave usada existe em PT e EN.
 * Pega "buraco de tradução" automaticamente (chave usada mas sem tradução → chave crua
 * aparece pro usuário). Rode: npx vitest run test/i18n.test.ts
 */
const SRC = path.resolve(__dirname, '..', 'src');
// captura translate('key') e t('key') com qualquer aspa; chave precisa ter ponto (namespace)
const KEY_RE = /\b(?:translate|t)\(\s*['"`]([A-Za-z0-9_.]+)['"`]/g;

function usedKeys(): Set<string> {
  const keys = new Set<string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(full); }
      else if (/\.[jt]sx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
        const src = fs.readFileSync(full, 'utf8');
        let m: RegExpExecArray | null;
        KEY_RE.lastIndex = 0;
        while ((m = KEY_RE.exec(src))) {
          const k = m[1];
          if (k.includes('.')) keys.add(k); // só chaves com namespace (evita falso positivo de t())
        }
      }
    }
  };
  walk(SRC);
  return keys;
}

const isAppKey = (k: string) =>
  !k.startsWith('ra.') && !k.startsWith('ra-') &&
  ['menu.', 'nav.', 'dash.', 'auth.', 'profile.', 'about.', 'page.', 'common.'].some(p => k.startsWith(p));

describe('i18n — completude de tradução', () => {
  const used = [...usedKeys()].sort();

  it('cobre um conjunto de chaves (sanity — achou traduções)', () => {
    expect(used.length, 'nenhuma chave translate() encontrada').toBeGreaterThan(0);
  });

  it('toda chave translate() usada existe em PT', () => {
    const missing = used.filter(k => !(k in ptMessages));
    expect(missing, `Faltam em PT: ${missing.join(', ')}`).toEqual([]);
  });

  it('toda chave translate() usada existe em EN', () => {
    const missing = used.filter(k => !(k in enMessages));
    expect(missing, `Faltam em EN: ${missing.join(', ')}`).toEqual([]);
  });

  it('PT e EN têm as MESMAS chaves do app (menu/nav/dash/auth/profile/about)', () => {
    const ptApp = new Set(Object.keys(ptMessages).filter(isAppKey));
    const enApp = new Set(Object.keys(enMessages).filter(isAppKey));
    const onlyPt = [...ptApp].filter(k => !enApp.has(k));
    const onlyEn = [...enApp].filter(k => !ptApp.has(k));
    expect({ onlyPt, onlyEn }, `Divergência: onlyPt=${onlyPt} onlyEn=${onlyEn}`).toEqual({ onlyPt: [], onlyEn: [] });
  });
});
