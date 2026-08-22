import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Provider Pague Menos (VTEX) — mapping/filter com fetch MOCKADO (sem rede).
 * A resposta real foi capturada em campo (Losartana 50mg cx30 = R$ 4,19, EAN, foto).
 */
const FIXTURE = [
  {
    productName: 'Losartana Potássica 50mg 30 Comprimidos Genérico Prati',
    link: 'https://www.paguemenos.com.br/losartana-30',
    linkText: 'losartana-30',
    items: [{ nameComplete: 'Losartana Potássica 50mg 30 Comprimidos Revestidos Genérico Prati-Donaduzzi', ean: '7899547505252', images: [{ imageUrl: 'https://vteximg.com.br/a.webp' }], sellers: [{ commertialOffer: { Price: 4.19, IsAvailable: true } }] }],
  },
  {
    productName: 'Losartana 60 Comprimidos',
    link: 'https://www.paguemenos.com.br/losartana-60',
    linkText: 'losartana-60',
    items: [{ nameComplete: 'Losartana Potássica 50mg 60 Comprimidos Genérico', ean: '2', images: [], sellers: [{ commertialOffer: { Price: 7.5, IsAvailable: true } }] }],
  },
  {
    productName: 'Vitamina C',
    link: 'https://www.paguemenos.com.br/vitc',
    linkText: 'vitc',
    items: [{ nameComplete: 'Vitamina C 500mg', sellers: [{ commertialOffer: { Price: 10, IsAvailable: true } }] }],
  },
  {
    productName: 'Losartana sem estoque',
    link: 'https://www.paguemenos.com.br/x',
    linkText: 'x',
    items: [{ nameComplete: 'Losartana Potássica 50mg 30 Comprimidos', sellers: [{ commertialOffer: { Price: 1, IsAvailable: false } }] }],
  },
];

describe('pagueMenosProvider (VTEX mapping)', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify(FIXTURE), { status: 200, headers: { 'content-type': 'application/json' } })) as any;
  });

  it('filtra: ativo+dose+embalagem, com estoque; devolve foto+EAN; ordena por preço', async () => {
    const { pagueMenosProvider } = await import('../src/pricing/providers/pagueMenos');
    const offers = await pagueMenosProvider.search({ medicationKey: 'k', activeIngredient: 'Losartana Potassica', dosageValue: 50, dosageUnit: 'MG', form: 'CP', packQty: 30 });
    // só o produto 30-comprimidos em estoque casa (60 é outra embalagem; vitamina não é o ativo; sem estoque sai)
    expect(offers.length).toBe(1);
    expect(offers[0].priceCents).toBe(419);
    expect(offers[0].ean).toBe('7899547505252');
    expect(offers[0].imageUrl).toContain('vteximg');
    expect(offers[0].pharmacy).toBe('Pague Menos');
  });

  it('sem packQty: aceita qualquer embalagem do ativo+dose (com estoque)', async () => {
    const { pagueMenosProvider } = await import('../src/pricing/providers/pagueMenos');
    const offers = await pagueMenosProvider.search({ medicationKey: null, activeIngredient: 'Losartana Potassica', dosageValue: 50, dosageUnit: 'MG', form: 'CP' });
    expect(offers.length).toBe(2); // 30cp (419) e 60cp (750), ambos em estoque — ordenados
    expect(offers[0].priceCents).toBe(419);
    expect(offers[1].priceCents).toBe(750);
  });

  it('erro HTTP → lança (worker marca provider_error, não inventa)', async () => {
    global.fetch = vi.fn(async () => new Response('[]', { status: 500 })) as any;
    const { pagueMenosProvider } = await import('../src/pricing/providers/pagueMenos');
    await expect(pagueMenosProvider.search({ medicationKey: 'k', activeIngredient: 'Losartana', dosageValue: 50, dosageUnit: 'MG', form: 'CP', packQty: 30 })).rejects.toThrow();
  });
});
