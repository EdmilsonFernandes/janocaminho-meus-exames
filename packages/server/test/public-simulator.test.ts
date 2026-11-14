import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, resetDb } from './helpers';
import { prisma } from '../src/prisma';
import { COMPOUND_PROMPT_VERSION } from '../src/analysis/compound-explain';
import { applyPublicSeo, publicSeoFor } from '../src/utils/publicSeo';

const llm = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../src/llm', () => ({
  getLlm: () => ({ stream: async () => { llm.calls++; return { final: async () => ({ text: '' }) }; } }),
  getModel: () => 'test-model',
}));

const SECTIONS = {
  oQueE: 'É uma forma de testosterona, o principal hormônio masculino, aplicada por injeção. Ela age por bastante tempo depois de cada aplicação.',
  noCorpo: 'Aumenta a força e a massa muscular, mas o corpo percebe o hormônio de fora e reduz a própria produção. Parte dela vira estradiol.',
  porQueUsam: 'Médicos prescrevem para homens com falta de testosterona comprovada. É medicamento controlado, e os médicos são proibidos de prescrever para estética.',
  nosExames: 'O médico costuma acompanhar os glóbulos vermelhos, o colesterol e os hormônios. Exame normal não descarta dano: alguns efeitos não aparecem em exame de rotina.',
  riscos: 'Pode afetar a fertilidade e reduzir os testículos. Pode pesar no coração e na pressão. O sangue pode ficar mais espesso. Em mulheres, a voz pode engrossar.',
  levarAoMedico: 'Quais exames devo acompanhar? | Isso afeta minha fertilidade? | O que muda se eu quiser interromper? Contar tudo o que você usa ajuda o médico.',
};

describe('simulador público: explicação do composto', () => {
  beforeEach(async () => { await resetDb(); llm.calls = 0; });

  it('sem login, devolve 3 seções inteiras e só o começo das outras 3', async () => {
    await prisma.compoundKnowledge.create({ data: { compoundKey: 'test_cyp', locale: 'pt-BR', promptVersion: COMPOUND_PROMPT_VERSION, source: 'ai', sections: SECTIONS } });
    const r = await api().get('/api/public/compounds/test_cyp');
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.sections)).toEqual(['oQueE', 'noCorpo', 'porQueUsam']);
    expect(r.body.sections.oQueE).toBe(SECTIONS.oQueE);
    expect(r.body.locked.map((l: { key: string }) => l.key)).toEqual(['nosExames', 'riscos', 'levarAoMedico']);
    for (const l of r.body.locked as Array<{ key: keyof typeof SECTIONS; teaser: string }>) {
      expect(l.teaser.length).toBeLessThanOrEqual(81);
      expect(l.teaser.endsWith('…')).toBe(true);
      expect(SECTIONS[l.key].startsWith(l.teaser.slice(0, -1))).toBe(true);
    }
    expect(JSON.stringify(r.body)).not.toContain('Em mulheres, a voz pode engrossar');
  });

  it('sem cache devolve 404 e NUNCA chama a IA', async () => {
    const r = await api().get('/api/public/compounds/test_enan');
    expect(r.status).toBe(404);
    expect(llm.calls).toBe(0);
  });

  it('composto fora do catálogo: 404', async () => {
    expect((await api().get('/api/public/compounds/toString')).status).toBe(404);
    expect((await api().get('/api/public/compounds/cocaina')).status).toBe(404);
  });

  it('texto em cache que hoje seria reprovado pelas travas não é publicado', async () => {
    await prisma.compoundKnowledge.create({ data: { compoundKey: 'test_prop', locale: 'pt-BR', promptVersion: COMPOUND_PROMPT_VERSION, source: 'ai', sections: { ...SECTIONS, noCorpo: `${SECTIONS.noCorpo} A dose comum é 200 mg.` } } });
    expect((await api().get('/api/public/compounds/test_prop')).status).toBe(404);
  });
});

describe('tags de busca das páginas públicas', () => {
  const HTML = `<head>
    <meta name="description" content="antiga" />
    <meta property="og:title" content="antigo" />
    <meta property="og:description" content="antiga" />
    <meta property="og:image" content="app-icon.png" />
    <link rel="canonical" href="https://drexame.janocaminho.com.br/" />
    <title>Dr. Exame</title>
  </head><body><div id="root"></div></body>`;

  it('só páginas conhecidas têm tags próprias', () => {
    expect(publicSeoFor('/simulador-hormonal')?.canonical).toBe('https://drexame.janocaminho.com.br/simulador-hormonal');
    expect(publicSeoFor('/simulador-hormonal/')).not.toBeNull();
    expect(publicSeoFor('/exams')).toBeNull();
    expect(publicSeoFor('/toString')).toBeNull();
  });

  it('troca título, descrição, canonical e og sem mexer no resto', () => {
    const seo = publicSeoFor('/simulador-hormonal')!;
    const out = applyPublicSeo(HTML, seo);
    expect(out).toContain(`<title>${seo.title}</title>`);
    expect(out).toContain('<link rel="canonical" href="https://drexame.janocaminho.com.br/simulador-hormonal" />');
    expect(out).toContain('og:image" content="https://drexame.janocaminho.com.br/promo/simulador-og.jpg"');
    expect(out).toContain('twitter:card');
    expect(out).not.toContain('antiga');
    expect(out).toContain('<div id="root"></div>');
  });

  it('HTML sem as tags esperadas volta igual', () => {
    expect(applyPublicSeo('<html><body>oi</body></html>', publicSeoFor('/simulador-hormonal')!)).toBe('<html><body>oi</body></html>');
  });
});
