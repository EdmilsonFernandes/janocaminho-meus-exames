// Páginas públicas indexáveis (25/11/26): tags por página, apelidos com canonical da original,
// 404 para caminho inexistente e a lista do index.html em sincronia com a do servidor.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { publicSeoFor, isKnownPath, sitemapXml, PUBLIC_PATHS } from './publicSeo';

const SITE = 'https://drexame.janocaminho.com.br';
const PROPRIAS = ['/', '/saude-esportiva', '/simulador-hormonal', '/features', '/faq', '/como-validamos', '/para-medicos', '/termos', '/privacidade'];

describe('SEO das páginas públicas', () => {
  it('cada página com conteúdo próprio tem título e descrição ÚNICOS', () => {
    const all = PROPRIAS.map((p) => publicSeoFor(p)!);
    expect(all.every(Boolean)).toBe(true);
    expect(new Set(all.map((s) => s.title)).size).toBe(PROPRIAS.length);
    expect(new Set(all.map((s) => s.description)).size).toBe(PROPRIAS.length);
    expect(new Set(all.map((s) => s.canonical)).size).toBe(PROPRIAS.length);
    for (const s of all) {
      expect(s.description.length).toBeLessThanOrEqual(200);
      expect(s.image.startsWith(`${SITE}/`)).toBe(true); // prévia no WhatsApp exige URL absoluta
    }
  });

  it('a home fala de exame de sangue para qualquer paciente (não de nicho esportivo)', () => {
    const home = publicSeoFor('/')!;
    expect(home.canonical).toBe(`${SITE}/`);
    expect(home.title.toLowerCase()).toContain('exame de sangue');
    expect(`${home.title} ${home.description}`).not.toMatch(/esportiv|atleta|trt/i);
  });

  it('rota que mostra a mesma tela aponta o canonical para a original', () => {
    expect(publicSeoFor('/como-funciona')!.canonical).toBe(`${SITE}/`);
    expect(publicSeoFor('/entender-exames-de-sangue')!.canonical).toBe(`${SITE}/`);
    expect(publicSeoFor('/landing')!.canonical).toBe(`${SITE}/`);
    expect(publicSeoFor('/exames-para-atletas')!.canonical).toBe(`${SITE}/saude-esportiva`);
    expect(publicSeoFor('/calculadora-de-esteres')!.canonical).toBe(`${SITE}/simulador-hormonal`);
    expect(publicSeoFor('/FAQ/')!.canonical).toBe(`${SITE}/faq`);
  });

  it('nenhum texto promete diagnóstico, previsão ou risco (ferramenta educativa)', () => {
    for (const p of PROPRIAS) {
      const s = publicSeoFor(p)!;
      expect(`${s.title} ${s.description}`).not.toMatch(/leitura de risco|idade biol|prev[eê] |detecta|cura|score de sa/i);
    }
  });

  it('caminho inexistente não é "conhecido" (vira 404); rotas do app e públicas são', () => {
    for (const p of ['/', '/faq', '/como-funciona', '/exams', '/exams/abc123/show', '/tendencias', '/entrar', '/doctor/vincular', '/medicoes/historico/peso', '/minhasaude/alterados']) {
      expect(isKnownPath(p)).toBe(true);
    }
    for (const p of ['/naoexiste-xyz', '/wp-admin', '/toString', '/constructor', '/.env', '/faq-antigo']) {
      expect(isKnownPath(p)).toBe(false);
    }
  });

  it('sitemap lista só as páginas com conteúdo próprio, sem as repetidas', () => {
    const xml = sitemapXml();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(PROPRIAS.map((p) => (p === '/' ? `${SITE}/` : `${SITE}${p}`)));
    expect(xml).not.toContain('como-funciona');
    expect(xml).not.toContain('exames-para-atletas');
  });

  it('a lista de caminhos públicos do index.html é a mesma do servidor', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../../web/index.html'), 'utf8');
    const m = html.match(/var PUBLIC_PATHS = (\[[^\]]*\]);/);
    expect(m).not.toBeNull();
    expect([...(JSON.parse(m![1]) as string[])].sort()).toEqual([...PUBLIC_PATHS].sort());
  });
});
