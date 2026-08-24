/**
 * matches() do provider VTEX — regressão dos bugs reais de campo (2026-08-24):
 *  - 125mcg vazando pro card de 25mcg (substring sem borda de dígito)
 *  - "12,5mg" casando dose 5 (normDrug troca "," por espaço → "12 5")
 *  - Mounjaro sem ofertas (pack default 30 ≠ "4 Canetas" do injetável)
 *  - Sibutramina com 1 oferta (multi-palavra underperforma; token-match salva)
 *  - Baristar sem preço (dose==pack do suplemento)
 */
import { describe, it, expect } from 'vitest';
import { matches } from '../src/pricing/providers/vtexDynamic';
import { parseActiveIngredient } from '../src/pricing/normalize';

const med = (ai: string, dose: number | null, pack: number | null) =>
  ({ medicationKey: null, activeIngredient: ai, dosageValue: dose, dosageUnit: 'mg', form: 'CP', packQty: pack }) as any;

describe('matches(): dose com borda de dígito', () => {
  it('25mcg aceita 25mcg, REJEITA 125mcg (vazamento real do card da Levotiroxina)', () => {
    const n = med('LEVOTIROXINA', 25, 30);
    expect(matches('Levotiroxina Sódica 25mcg 30 Comprimidos Genérico Merck', n)).toBe(true);
    expect(matches('Levotiroxina Sódica 125mcg Genérico Merck S/A 30 Comprimidos', n)).toBe(false);
  });

  it('dose 5 NÃO casa "12,5mg" (vírgula decimal preservada)', () => {
    const n = med('MOUNJARO', 5, 30);
    expect(matches('Mounjaro Tirzepatida 12,5mg 4 Canetas', n, { loosePack: true })).toBe(false);
    expect(matches('Mounjaro 5mg Tirzepatida 4 Doses Injetáveis', n, { loosePack: true })).toBe(true);
  });

  it('500mg não casa 850mg', () => {
    const n = med('METFORMINA', 500, 30);
    expect(matches('Metformina 500mg Genérico 30 Comprimidos', n)).toBe(true);
    expect(matches('Metformina 850mg 30 Comprimidos', n)).toBe(false);
  });
});

describe('matches(): embalagem é preferência (loosePack)', () => {
  it('injetável "4 Canetas" nunca tem "30" — strict rejeita, loose aceita (Mounjaro)', () => {
    const n = med('MOUNJARO', 5, 30);
    expect(matches('Mounjaro 5mg Tirzepatida 4 Doses Injetáveis', n)).toBe(false);
    expect(matches('Mounjaro 5mg Tirzepatida 4 Doses Injetáveis', n, { loosePack: true })).toBe(true);
  });

  it('comprimido normal continua exigindo o pack certo (30 ≠ 60 cápsulas)', () => {
    const n = med('CLORIDRATO DE SIBUTRAMINA MONOIDRATADO', 15, 30);
    expect(matches('Cloridrato de Sibutramina 15mg Genérico Biosintética 30 Cápsulas', n)).toBe(true);
    expect(matches('Sibus Cloridrato De Sibutramina 15mg 60 Cápsulas', n)).toBe(false);
  });
});

describe('matches(): token do ativo (sal "CLORIDRATO DE X")', () => {
  it('qualquer token ≥4 casa — nome com "Cloridrato de Sibutramina" passa', () => {
    const n = med('CLORIDRATO DE SIBUTRAMINA MONOIDRATADO', 15, 30);
    expect(matches('Cloridrato de Sibutramina 15mg Genérico 30 Cápsulas', n)).toBe(true);
  });

  it('marca sem o sal também casa (Síbus tem "Sibutramina")', () => {
    const n = med('CLORIDRATO DE SIBUTRAMINA MONOIDRATADO', 15, 30);
    expect(matches('Sibutramina 15mg 30 Cápsulas Genérico', n)).toBe(true);
  });

  it('outro remédio cloridrato NÃO casa (dose/pack differentes)', () => {
    const n = med('CLORIDRATO DE SIBUTRAMINA MONOIDRATADO', 15, 30);
    expect(matches('Cloridrato de Metformina 850mg 30 Comprimidos', n)).toBe(false);
  });
});

describe('matches(): suplemento (dose == pack)', () => {
  it('"30 Cápsulas" parser duplica → dose=30 E pack=30; não filtrar por dose (Baristar)', () => {
    const n = med('BARISTAR SABOR BAUNILHA 30', 30, 30);
    expect(matches('Baristar Sabor Baunilha 30 Cápsulas Gelatinosas Moles', n)).toBe(true);
  });

  it('marca da família casa (Puran T4 é Levotiroxina)', () => {
    const n = med('LEVOTIROXINA', 25, 30);
    expect(matches('Puran T4 Levotiroxina Sódica 25mcg 30 Comprimidos', n)).toBe(true);
  });
});

describe('bug Ozempic × seringa (2026-08-24)', () => {
  it('parseActiveIngredient: dose órfã "0,25" NÃO fica no ingrediente (virava token)', () => {
    expect(parseActiveIngredient('Ozempic 0,25 e 0,5mg Semaglutida Injetável com 6 Agulhas')).toBe('OZEMPIC');
  });

  it('parseActiveIngredient: nome com B12/T4 preserva o código (não é dose órfã)', () => {
    expect(parseActiveIngredient('Vitamina B12 2500mcg')).toBe('VITAMINA B12');
  });

  it('SERINGA "6x0,25mm 0,5ml" NÃO casa Ozempic 0,5mg (era R$ 2,89 de melhor preço)', () => {
    const n = med('OZEMPIC', 0.5, 30);
    expect(matches('Seringa Insulina Uniqmed 0,5ml 6x0,25mm 31G - unidade', n, { loosePack: true })).toBe(false);
  });

  it('acessório com a marca ("Agulhas p/ Ozempic 0,5ml") NÃO casa — guard ML', () => {
    const n = med('OZEMPIC', 0.5, 30);
    expect(matches('Agulhas para Caneta Ozempic 0,5ml - caixa com 6', n, { loosePack: true })).toBe(false);
  });

  it('Ozempic de verdade ("0,25+0,5Mg Sol Inj") casa — inclusive loosePack (6 agulhas ≠ 30)', () => {
    const n = med('OZEMPIC', 0.5, 30);
    expect(matches('Ozempic 0,25+0,5Mg Sol Inj', n, { loosePack: true })).toBe(true);
  });

  it('xarope em ML continua casando (unit do remédio É ml)', () => {
    const n = { medicationKey: null, activeIngredient: 'IBUPROFENO', dosageValue: 100, dosageUnit: 'ML', form: 'ML', packQty: null } as any;
    expect(matches('Ibuprofeno 100mg/5ml Xarope 100ml', n)).toBe(true);
  });
});
