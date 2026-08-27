import { describe, it, expect } from 'vitest';
import { api } from './helpers';

/**
 * Política de privacidade PÚBLICA (Play Store): deve abrir SEM login e SEM depender do
 * SPA de hash — o crawler de política do Google não executa JS. Violação original:
 * "#/privacidade" vivia atrás do shell autenticado → "Política exige login" (27/08/2026).
 */
describe('Política de privacidade pública (sem login)', () => {
  for (const path of ['/privacidade', '/termos', '/privacy']) {
    it(`GET ${path} → 200 HTML com o conteúdo, sem auth`, async () => {
      const r = await api().get(path);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toContain('text/html');
      const html: string = r.text;
      // Seções obrigatórias (retenção foi exigência de rejeição anterior do Play)
      expect(html).toContain('Retenção de Dados');
      expect(html).toContain('LGPD');
      expect(html).toContain('Termos de Uso');
      expect(html).toContain('contato@janocaminho.com.br');
      // É página standalone: não é o index.html do SPA (que carrega <script src>)
      expect(html).not.toMatch(/<script[^>]*src=/);
      expect(html).toContain('<!doctype html>');
    });
  }
});
