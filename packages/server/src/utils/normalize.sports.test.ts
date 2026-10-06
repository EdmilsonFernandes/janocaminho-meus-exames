import { describe, it, expect } from 'vitest';
import { canonicalName, normalizeKey, reconcileScaleFlag } from './normalize';
import { toCanonicalUnit } from './units';

// E3.4 (Saúde Esportiva) — canônicos/unidades do painel esportivo: SHBG, IGF-1, LH, FSH,
// cistatina C (+ CK p/ o card de exercício). Padrão do normalize.test.ts: sinônimos PT
// com/sem acento, conversão à unidade-padrão e guarda de escala falsa.

describe('canonicalName — sinônimos esportivos (PT com/sem acento, sigla, EN)', () => {
  it('SHBG: sigla e expansões PT colapsam num canônico só', () => {
    expect(canonicalName('SHBG')).toBe('SHBG');
    expect(canonicalName('Shbg')).toBe('SHBG');
    expect(canonicalName('Globulina ligante de hormônios sexuais')).toBe('SHBG');
    expect(canonicalName('GLOBULINA DE LIGACAO DE HORMONIOS SEXUAIS')).toBe('SHBG');
    expect(canonicalName('Sex Hormone Binding Globulin')).toBe('SHBG');
  });
  it('IGF-1: IGF-1 / IGF 1 / IGF-I / somatomedina C → IGF1', () => {
    expect(canonicalName('IGF-1')).toBe('IGF1');
    expect(canonicalName('IGF 1')).toBe('IGF1');
    expect(canonicalName('IGF-I')).toBe('IGF1');
    expect(canonicalName('Somatomedina C')).toBe('IGF1');
    expect(canonicalName('Fator de crescimento semelhante à insulina 1')).toBe('IGF1');
  });
  it('Cistatina C: com/sem o sufixo C e em EN → CISTATINA_C', () => {
    expect(canonicalName('Cistatina C')).toBe('CISTATINA_C');
    expect(canonicalName('Cistatina')).toBe('CISTATINA_C');
    expect(canonicalName('Cystatin C')).toBe('CISTATINA_C');
  });
  it('CK/CPK → CREATINO_QUINASE, mas CK-MB NÃO colapsa (fração distinta)', () => {
    expect(canonicalName('CK')).toBe('CREATINO_QUINASE');
    expect(canonicalName('CPK')).toBe('CREATINO_QUINASE');
    expect(canonicalName('Creatino quinase')).toBe('CREATINO_QUINASE');
    expect(canonicalName('CK-MB')).not.toBe('CREATINO_QUINASE'); // exato 'CK-MB' ≠ 'CK' (sem fuzzy curto)
  });
  it('LH/FSH continuam nos canônicos existentes (sem regressão)', () => {
    expect(canonicalName('Fsh - Hormonio Foliculo Estimulante')).toBe('FSH');
    expect(canonicalName('Hormônio luteinizante')).toBe('LH');
  });
});

describe('toCanonicalUnit — conversão às unidades-padrão esportivas', () => {
  it('SHBG: nmol/L é o padrão (e nada inventado)', () => {
    expect(toCanonicalUnit('SHBG', 42, 'nmol/L')).toEqual({ value: 42, unit: 'nmol/L' });
    // unidade alternativa não confiável → SEM conversão (retorna null, valor cru segue)
    expect(toCanonicalUnit('SHBG', 42, 'µg/mL')).toBeNull();
  });
  it('IGF-1 → ng/mL: µg/L identidade numérica, nmol/L ×7,649, ng/dL ÷100', () => {
    expect(toCanonicalUnit('IGF1', 180, 'ng/mL')).toEqual({ value: 180, unit: 'ng/mL' });
    expect(toCanonicalUnit('IGF1', 180, 'µg/L')).toEqual({ value: 180, unit: 'ng/mL' });
    expect(toCanonicalUnit('IGF1', 26, 'nmol/L')).toEqual({ value: Number((26 * 7.649).toFixed(4)), unit: 'ng/mL' });
    expect(toCanonicalUnit('IGF1', 22000, 'ng/dL')).toEqual({ value: 220, unit: 'ng/mL' });
  });
  it('LH/FSH → U/L: UI/L idêntico, mUI/mL idêntico (×1), µIU/mL e mUI/L ×0,001', () => {
    for (const canon of ['LH', 'FSH'] as const) {
      expect(toCanonicalUnit(canon, 4.5, 'U/L')).toEqual({ value: 4.5, unit: 'U/L' });
      expect(toCanonicalUnit(canon, 4.5, 'UI/L')).toEqual({ value: 4.5, unit: 'U/L' });
      expect(toCanonicalUnit(canon, 4.5, 'mUI/mL')).toEqual({ value: 4.5, unit: 'U/L' });
      expect(toCanonicalUnit(canon, 4500, 'µIU/mL')).toEqual({ value: 4.5, unit: 'U/L' });
      expect(toCanonicalUnit(canon, 4500, 'mUI/L')).toEqual({ value: 4.5, unit: 'U/L' });
    }
  });
  it('Cistatina C → mg/L: mg/dL ×10', () => {
    expect(toCanonicalUnit('CISTATINA_C', 0.85, 'mg/L')).toEqual({ value: 0.85, unit: 'mg/L' });
    expect(toCanonicalUnit('CISTATINA_C', 0.085, 'mg/dL')).toEqual({ value: 0.85, unit: 'mg/L' });
  });
  it('unidade desconhecida/nula → null (nunca arrisca conversão)', () => {
    expect(toCanonicalUnit('SHBG', 42, 'lol')).toBeNull();
    expect(toCanonicalUnit('IGF1', 180, null)).toBeNull();
  });
});

describe('reconcileScaleFlag — escala falsa nos analitos esportivos (guarda anti-HIGH/LOW falso)', () => {
  it('valor em escala pg/mL contra ref em escala grande (IGF-1 ng/mL) → UNKNOWN c/ scaleConflict', () => {
    // ex. do backlog: valor pequeno onde a ref é de outra escala — regra pg/mL existente pega
    const r = reconcileScaleFlag(5.2, 100, 300, 'pg/mL');
    expect(r.scaleConflict).toBe(true);
    expect(r.flag).toBe('UNKNOWN');
    expect(r.isAbnormal).toBe(false);
  });
  it('SHBG legítimo em nmol/L contra ref nmol/L continua HIGH normal (não mascarado)', () => {
    const r = reconcileScaleFlag(88, 10, 70, 'nmol/L');
    expect(r.scaleConflict).toBe(false);
    expect(r.flag).toBe('HIGH');
  });
  it('hematócrito % alto REAL (54,2%) continua HIGH — contexto esportivo não suprime flag', () => {
    const r = reconcileScaleFlag(54.2, 40, 50, '%');
    expect(r.scaleConflict).toBe(false);
    expect(r.flag).toBe('HIGH');
    expect(r.isAbnormal).toBe(true);
  });
});

describe('normalizeKey — chaves esportivas sem acento (padrão do projeto)', () => {
  it('normalizeKey stripa acento/colapsa espaços (sinônimos dependentes disso)', () => {
    expect(normalizeKey('Globulina de Ligação dos Hormônios Sexuais'))
      .toBe('GLOBULINA DE LIGACAO DOS HORMONIOS SEXUAIS');
    expect(normalizeKey('creatino quinase')).toBe('CREATINO QUINASE');
  });
});
