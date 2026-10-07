// sportsDomains — classificação por domínio esportivo (E4.2) + LENTE POR ARQUÉTIPO (E5:
// matriz esporte × contexto hormonal) + catálogo de impacto (E5 §2). Lógica pura, padrão
// utils/medicalData.test (delega ao categorize → importa ícones MUI: roda no ambiente
// default do vitest, não em node).
import { describe, expect, it } from 'vitest';
import {
  archetypeOf, sportsDomainOf, DEFAULT_ARCHETYPE, resolveArchetype, deduceHormonalContext,
  parseHormonalContext, domainOrderOf, androgenDeclared, hormoneDeclared,
} from './sportsDomains';
import { impactFor, SUBSTANCE_CATALOG } from './substanceCatalog';

describe('sportsDomainOf — canônicos do painel esportivo (E3.4/E3.5)', () => {
  it('eixo hormonal estendido (não coberto pelas categorias clínicas)', () => {
    expect(sportsDomainOf('SHBG')).toBe('hormonal');
    expect(sportsDomainOf('GLOBULINA LIGADORA DE HORMONIOS SEXUAIS')).toBe('hormonal');
    expect(sportsDomainOf('LH')).toBe('hormonal');
    expect(sportsDomainOf('FSH')).toBe('hormonal');
    expect(sportsDomainOf('IGF-1')).toBe('hormonal');
    expect(sportsDomainOf('SOMATOMEDINA C')).toBe('hormonal');
    expect(sportsDomainOf('TESTOSTERONA TOTAL')).toBe('hormonal');
    expect(sportsDomainOf('ESTRADIOL')).toBe('hormonal');
  });

  it('CK total é MÚSCULO; CK-MB e troponina continuam CARDIO', () => {
    expect(sportsDomainOf('CREATINO QUINASE CK TOTAL')).toBe('musculo_figado');
    expect(sportsDomainOf('CK TOTAL')).toBe('musculo_figado');
    expect(sportsDomainOf('CK-MB')).toBe('cardio');
    expect(sportsDomainOf('CREATINO QUINASE MB')).toBe('cardio');
    expect(sportsDomainOf('TROPONINA I')).toBe('cardio');
  });

  it('renal e hepática', () => {
    expect(sportsDomainOf('CISTATINA C')).toBe('renal');
    expect(sportsDomainOf('CREATININA')).toBe('renal');
    expect(sportsDomainOf('ÁCIDO ÚRICO')).toBe('renal');
    expect(sportsDomainOf('TGO AST')).toBe('musculo_figado');
    expect(sportsDomainOf('GAMA GT')).toBe('musculo_figado');
  });

  it('hemograma + ferro (reologia do endurance)', () => {
    expect(sportsDomainOf('HEMOGLOBINA')).toBe('hemograma');
    expect(sportsDomainOf('HEMATÓCRITO')).toBe('hemograma');
    expect(sportsDomainOf('FERRITINA')).toBe('hemograma');
    expect(sportsDomainOf('FERRO SÉRICO')).toBe('hemograma');
  });

  it('cardio-lipídios (delegação às categorias clínicas)', () => {
    expect(sportsDomainOf('COLESTEROL TOTAL')).toBe('cardio');
    expect(sportsDomainOf('HDL COLESTEROL')).toBe('cardio');
    expect(sportsDomainOf('TRIGLICERÍDEOS')).toBe('cardio');
    expect(sportsDomainOf('GLICOSE')).toBe('cardio'); // glicemia = cardiometabólico
  });

  it('analito sem casa → outros (nunca inventa domínio)', () => {
    expect(sportsDomainOf('VITAMINA D')).toBe('outros');
    expect(sportsDomainOf('SÓDIO')).toBe('outros');
    expect(sportsDomainOf('PCR ULTRASSENSIVEL')).toBe('outros');
  });
});

describe('archetypeOf — lente por modalidade (fuzzy)', () => {
  it('endurance (corrida/ciclismo/triatlo) → default hemograma + ferro no spotlight', () => {
    expect(archetypeOf('Corrida de rua').defaultDomain).toBe('hemograma');
    expect(archetypeOf('Ciclismo').key).toBe('endurance');
    expect(archetypeOf('Triathlon').key).toBe('endurance');
    expect(archetypeOf('Corrida de rua').spotlight.some((s) => s.key === 'FERRITINA')).toBe(true);
    expect(archetypeOf('Corrida de rua').spotlight.some((s) => s.key === 'HEMOGLOBINA')).toBe(true);
  });

  it('crossfit/funcional → INTENSA (músculo-fígado primeiro, CK no spotlight)', () => {
    expect(archetypeOf('CrossFit').key).toBe('crossfit');
    expect(archetypeOf('CrossFit').defaultDomain).toBe('musculo_figado');
    expect(archetypeOf('Treino funcional e HIIT').key).toBe('crossfit');
    expect(archetypeOf('CrossFit').spotlight.some((s) => s.key === 'CK')).toBe(true);
  });

  it('força/hipertrofia → default hormonal', () => {
    expect(archetypeOf('Musculação').defaultDomain).toBe('hormonal');
    expect(archetypeOf('Fisiculturismo').key).toBe('strength');
    expect(archetypeOf('Powerlifting').key).toBe('strength');
  });

  it('alta performance → default hemograma', () => {
    expect(archetypeOf('Futebol').defaultDomain).toBe('hemograma');
    expect(archetypeOf('MMA').key).toBe('performance');
  });

  it('sem modalidade / desconhecida → arquétipo geral (Todos)', () => {
    expect(archetypeOf(null)).toBe(DEFAULT_ARCHETYPE);
    expect(archetypeOf('')).toBe(DEFAULT_ARCHETYPE);
    expect(archetypeOf('yoga energético').key).toBe('geral');
    expect(DEFAULT_ARCHETYPE.defaultDomain).toBeNull();
  });
});

describe('resolveArchetype — matriz esporte × contexto hormonal (dimensões independentes)', () => {
  it('TRT vence qualquer esporte (reposição prescrita)', () => {
    const a = resolveArchetype({ modality: 'Corrida de rua', hormonalContext: 'trt' });
    expect(a.key).toBe('trt');
    expect(a.spotlight.some((s) => s.key === 'PSA')).toBe(true);
    expect(a.questionBias).toBe('monitoramento_trt');
  });

  it('hipertrofia + uso declarado → lens hormonal (Hct/HDL sobem, bias conduta-Hct)', () => {
    const a = resolveArchetype({ modality: 'Musculação', hormonalContext: 'declarado' });
    expect(a.key).toBe('strength');
    expect(a.spotlight.some((s) => s.key === 'HEMATOCRITO')).toBe(true);
    expect(a.spotlight.some((s) => s.key === 'HDL')).toBe(true);
    expect(a.questionBias).toBe('hct_hormonal');
  });

  it('corrida + NENHUM hormonal → sem spotlight/chip de hematócrito-esteroides', () => {
    const a = resolveArchetype({ modality: 'Corrida', hormonalContext: 'nenhum' });
    expect(a.key).toBe('endurance');
    expect(a.spotlight.some((s) => s.key === 'HEMATOCRITO')).toBe(false);
    expect(a.focusChips.join(' ')).not.toMatch(/hemat[oó]crito|andr[oó]geno/i);
  });

  it('"prefiro não dizer" NÃO assume lens hormonal', () => {
    expect(resolveArchetype({ modality: 'Musculação', hormonalContext: 'nao_dizer' }).questionBias).toBeNull();
  });

  it('dedução por substância declarada (dado antigo sem wizard continua funcionando)', () => {
    expect(deduceHormonalContext([{ name: 'Testosterona (enantato)', klass: 'Hormônio' }])).toBe('declarado');
    expect(deduceHormonalContext([{ name: 'Creatina', klass: 'Suplemento' }])).toBeNull();
    const a = resolveArchetype({ modality: 'Musculação', substances: [{ name: 'Testosterona (enantato)', klass: 'Hormônio' }] });
    expect(a.questionBias).toBe('hct_hormonal');
  });

  it('parseHormonalContext lê o jsonb do wizard (sem migration)', () => {
    expect(parseHormonalContext({ hormonalContext: 'trt', level: 'amador' })).toBe('trt');
    expect(parseHormonalContext({ hormonalContext: 'x' })).toBeNull();
    expect(parseHormonalContext(null)).toBeNull();
    expect(parseHormonalContext([1, 2])).toBeNull();
  });

  it('domainOrderOf põe o domínio da lente primeiro e "outros" sempre no fim', () => {
    expect(domainOrderOf(resolveArchetype({ modality: 'Corrida' }))[0]).toBe('hemograma');
    const crossfit = domainOrderOf(resolveArchetype({ modality: 'CrossFit' }));
    expect(crossfit[0]).toBe('musculo_figado');
    expect(crossfit[crossfit.length - 1]).toBe('outros');
    expect(new Set(crossfit).size).toBe(crossfit.length); // sem duplicata
  });
});

describe('famílias de substância declarada (banner/prep/lente)', () => {
  it('androgenDeclared detecta por nome de mercado', () => {
    expect(androgenDeclared([{ name: 'Durateston' }])).toBe(true);
    expect(androgenDeclared([{ name: 'Stanozolol' }])).toBe(true);
    expect(androgenDeclared([{ name: 'Creatina' }])).toBe(false);
    expect(androgenDeclared(undefined)).toBe(false);
  });

  it('hormoneDeclared cobre classe + eixo GH', () => {
    expect(hormoneDeclared([{ name: 'hGH (somatropina)' }])).toBe(true);
    expect(hormoneDeclared([{ name: 'X', klass: 'Hormônio' }])).toBe(true);
    expect(hormoneDeclared([{ name: 'Whey protein', klass: 'Suplemento' }])).toBe(false);
  });
});

describe('impactFor — impacto nos exames por substância (E5 §2)', () => {
  it('match por nome e alias (case/acento-insensível)', () => {
    expect(impactFor('Creatina')).toMatch(/cistatina C/);
    expect(impactFor('durateston')).toMatch(/hematócrito/i);
    expect(impactFor('Ozempic')).toMatch(/massa magra/);
    expect(impactFor('TREMBOLONA')).toMatch(/HDL/);
  });

  it('sem match → null (UI mostra linha genérica — nunca inventa efeito)', () => {
    expect(impactFor('Substância XPTO desconhecida')).toBeNull();
    expect(impactFor('')).toBeNull();
  });

  it('PROIBIDO em impacto: dose, range seguro, recomendação de uso/ajuste', () => {
    for (const c of SUBSTANCE_CATALOG) {
      if (!c.impacto) continue;
      const low = c.impacto.toLowerCase();
      expect(low, `${c.name} cita dose`).not.toMatch(/\d+\s*(mg|mcg|ui)\b/);
      expect(low, `${c.name} cita range seguro`).not.toContain('range seguro');
      expect(low, `${c.name} recomenda uso`).not.toMatch(/recomend\w+ (uso|dose)/);
    }
  });

  it('suplemento básico sem efeito laboratorial validado → sem campo impacto', () => {
    expect(impactFor('Ômega-3')).toBeNull();
    expect(impactFor('ZMA')).toBeNull();
  });
});
