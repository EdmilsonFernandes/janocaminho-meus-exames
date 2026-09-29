import { describe, it, expect } from 'vitest';
import { api } from './helpers';

/**
 * Android App Links (reclamação do Play Console: "1 domínio não verificado"): o Android
 * baixa https://drexame.janocaminho.com.br/.well-known/assetlinks.json e exige HTTP 200 +
 * application/json, sem redirect. Regressão do bug original: express.static ignora
 * dot-diretórios por default (dotfiles:'ignore') → o request caía no fallback da SPA e
 * devolvia index.html com 200 text/html → domínio nunca verificava.
 */
describe('assetlinks.json (Android App Links)', () => {
  it('GET /.well-known/assetlinks.json → 200 JSON declarando o package do app', async () => {
    const r = await api().get('/.well-known/assetlinks.json');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/json');
    const statements = r.body as Array<{ relation?: string[]; target?: { namespace?: string; package_name?: string } }>;
    expect(Array.isArray(statements)).toBe(true);
    expect(statements.length).toBeGreaterThan(0);
    // Statement válido: permissão de URL + package do Dr. Exame
    expect(statements.some((s) => s.relation?.includes('delegate_permission/common.handle_all_urls'))).toBe(true);
    expect(statements.some((s) => s.target?.namespace === 'android_app' && s.target.package_name === 'com.janocaminho.drexame')).toBe(true);
  });
});
