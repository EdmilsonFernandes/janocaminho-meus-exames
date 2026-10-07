// sportsDomains — classificação por domínio esportivo (E4.2). Lógica pura, padrão
// utils/medicalData.test (delega ao categorize → importa ícones MUI: roda no ambiente
// default do vitest, não em node). Cobertura: canônicos do painel esportivo (E3.4/E3.5),
// categorias clínicas existentes (delegação ao categorize) e arquétipos de modalidade.
import { describe, expect, it } from 'vitest';
import { archetypeOf, sportsDomainOf, DEFAULT_ARCHETYPE } from './sportsDomains';

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

describe('archetypeOf — whitelabel por modalidade (só copy/filtro-padrão)', () => {
  it('endurance (corrida/ciclismo/triatlo) → default cardio', () => {
    expect(archetypeOf('Corrida de rua').defaultDomain).toBe('cardio');
    expect(archetypeOf('Ciclismo').key).toBe('endurance');
    expect(archetypeOf('Triathlon').key).toBe('endurance');
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
