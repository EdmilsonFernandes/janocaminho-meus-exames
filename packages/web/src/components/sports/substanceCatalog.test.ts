/**
 * substanceCatalog — busca inteligente + conteúdo da lista (27/10/26): correções factuais
 * (Deposteron = cipionato), lista C5 completa, selo veterinário, tolerância a erro de
 * digitação e o contrato de texto (sem dose, sem frase vedada pelo lint do CI).
 */
import { describe, expect, it } from 'vitest';
import {
  SUBSTANCE_CATALOG, catalogFindByToken, displayLabel, sameSubstance, searchSubstances,
} from './substanceCatalog';

const top = (q: string) => searchSubstances(q, 10)[0]?.name;

describe('catálogo — fatos', () => {
  it('Deposteron é testosterona CIPIONATO (não enantato)', () => {
    expect(catalogFindByToken('Deposteron')?.name).toBe('Testosterona (cipionato)');
    expect(displayLabel(catalogFindByToken('Deposteron')!).commercial).toBe('Deposteron');
    expect(SUBSTANCE_CATALOG.find((c) => c.name === 'Testosterona (enantato)')?.aliases ?? []).not.toContain('Deposteron');
  });

  it('marcas e nomes oficiais da lista colada pelo dono são encontrados', () => {
    expect(top('hormus')).toBe('Testosterona (undecilato)');
    expect(top('finaplix')).toBe('Trembolona');
    expect(top('turinabol')).toBe('Clorodehidrometiltestosterona');
    expect(top('halotestin')).toBe('Fluoximesterona');
    expect(top('prasterona')).toBe('DHEA');
  });

  it('toda substância da lista C5 cai num item com selo C5', () => {
    const C5 = ['Androstanolona', 'Bolasterona', 'Boldenona', 'Cloroxomesterona', 'Clostebol',
      'Deidroclormetiltestosterona', 'Drostanolona', 'Estanolona', 'Estanozolol', 'Etilestrenol',
      'Fluoximesterona', 'Formebolona', 'Mesterolona', 'Metandienona', 'Metandrostenolona',
      'Metandranona', 'Metandriol', 'Metenolona', 'Metiltestosterona', 'Mibolerona', 'Nandrolona',
      'Noretandrolona', 'Oxandrolona', 'Oximesterona', 'Oximetolona', 'Prasterona', 'Somatropina',
      'Testosterona', 'Trembolona'];
    for (const n of C5) expect(searchSubstances(n, 1)[0]?.anvisa, n).toBe('C5');
  });

  it('SERM/inibidor da aromatase não levam selo de lista que não é a deles', () => {
    for (const n of ['Tamoxifeno', 'Clomifeno', 'Anastrozol', 'Exemestano']) {
      expect(catalogFindByToken(n)?.anvisa, n).toBeUndefined();
    }
  });

  it('uso veterinário vira selo', () => {
    for (const n of ['Trembolona', 'Trembolona (acetato)', 'Boldenona', 'Mibolerona']) {
      expect(catalogFindByToken(n)?.origem, n).toBe('veterinario');
    }
    expect(catalogFindByToken('Durateston')?.origem).toBeUndefined();
  });

  it('apelido de rua nunca aparece como marca', () => {
    expect(displayLabel(catalogFindByToken('tren')!).commercial).toBe('Trembolona');
    expect(displayLabel(catalogFindByToken('clen')!).commercial).toBe('Clenbuterol');
    expect(displayLabel(catalogFindByToken('Deca')!)).toEqual({ commercial: 'Deca-Durabolin', chemical: 'Nandrolona (decanoato)' });
  });
});

describe('busca inteligente', () => {
  it('apelido exato vem primeiro', () => {
    expect(top('deca')).toBe('Nandrolona (decanoato)');
    expect(top('tren')).toBe('Trembolona');
    expect(top('GH')).toBe('hGH (somatropina)');
  });

  it('ignora pontuação e o número da apresentação', () => {
    expect(top('deca durabolin')).toBe('Nandrolona (decanoato)');
    expect(catalogFindByToken('dht gel')?.name).toBe('DHT (gel)');
    expect(top('durateston 250')).toBe('Durateston');
  });

  it('tolera erro de digitação', () => {
    expect(top('winstrool')).toBe('Stanozolol');
    expect(top('durasteston')).toBe('Durateston');
    expect(top('ozempik')).toBe('Semaglutida');
    expect(top('oxandrolna')).toBe('Oxandrolona');
  });

  it('texto sem relação não inventa sugestão', () => {
    // acerto real não vem acompanhado de "parecidos" ("deca" × "declarado"/"ECA")
    expect(searchSubstances('deca', 10).map((c) => c.name)).toEqual(['Nandrolona (decanoato)']);
    expect(searchSubstances('xyzw', 10)).toEqual([]);
    expect(searchSubstances('qq', 10)).toEqual([]);
  });

  it('sameSubstance: alias, comercial e princípio ativo são a mesma coisa', () => {
    expect(sameSubstance('Deca', 'Nandrolona (decanoato)')).toBe(true);
    expect(sameSubstance('Deca-Durabolin', 'deca')).toBe(true);
    expect(sameSubstance('Deposteron', 'Testosterona (cipionato)')).toBe(true);
    expect(sameSubstance('Testosterona (cypionato)', 'Deposteron')).toBe(true);
    expect(sameSubstance('Xpto Caseiro', 'xpto caseiro')).toBe(true);
    expect(sameSubstance('Durateston', 'Deca')).toBe(false);
    expect(sameSubstance('', 'Deca')).toBe(false);
  });
});

describe('contrato de texto da lista', () => {
  // Mesmo grep do job de lint do CI (linguagem vedada) + dose/benefício no "o que é".
  const VEDADO = /ciclo seguro|dose segura|comece tpc|reduza a dose|pause o ciclo|faça uma sangria|evite todos os efeitos colaterais/i;

  it('nenhum texto do catálogo usa linguagem vedada', () => {
    for (const c of SUBSTANCE_CATALOG) {
      for (const t of [c.name, ...(c.aliases ?? []), c.impacto ?? '', c.sobre ?? '']) {
        expect(t, c.name).not.toMatch(VEDADO);
      }
    }
  });

  it('"sobre" diz o que é — sem dose, sem promessa', () => {
    for (const c of SUBSTANCE_CATALOG) {
      if (!c.sobre) continue;
      expect(c.sobre, c.name).not.toMatch(/\d+\s*(mg|mcg|ui|ml|g)\b/i);
      expect(c.sobre, c.name).not.toMatch(/ganh|queim|melhor|potencializ|segur|recomend|indicad/i);
    }
  });

  it('todo hormônio da lista tem "sobre"', () => {
    for (const c of SUBSTANCE_CATALOG.filter((x) => x.cls === 'Hormônio')) expect(c.sobre, c.name).toBeTruthy();
  });
});
