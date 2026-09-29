import { describe, it, expect } from 'vitest';
import { personalizedTargets, formatTarget } from '../src/analysis/personalized-targets';

/** F1 — Alvos personalizados por medicação/condição. Contrato:
 *  (a) levotiroxina → TSH 0,4–2,5; (b) diabetes → LDL < 100 + HbA1c < 7;
 *  (c) hipertensão → NENHUM alvo; (d) estatina só reforça (b); (e) nada além disso.
 *  Toda regra traz motivo PT + citação real. Guardas: "SEM DIABETES" e pré-diabetes
 *  NÃO disparam. Nomenclatura: nameCanonical sem acento, maiúsculo. */
describe('personalizedTargets — alvos por medicação/condição', () => {
  it('levotiroxina → TSH alvo 0,4–2,5 mUI/L (alvo de reposição, mais estrito que o genérico do lab)', () => {
    const t = personalizedTargets([], { medications: ['Levotiroxina sódica 50 mcg'], conditions: '' });
    expect(t).toHaveLength(1);
    expect(t[0].analyte).toBe('TSH');
    expect(t[0].refLow).toBe(0.4);
    expect(t[0].refHigh).toBe(2.5);
    expect(t[0].unit).toBe('mUI/L');
    expect(t[0].appliesTo.toLowerCase()).toContain('levotiroxina');
    expect(t[0].reason.toLowerCase()).toContain('reposi'); // "reposição"
  });

  it('marca da levotiroxina (Euthyrox) também dispara — mapa mínimo de marcas BR', () => {
    const t = personalizedTargets([], { medications: ['Euthyrox 25 mcg'], conditions: '' });
    expect(t).toHaveLength(1);
    expect(t[0].analyte).toBe('TSH');
  });

  it('metformina → LDL < 100 mg/dL e HEMOGLOBINA_GLICADA < 7% (regra b)', () => {
    const t = personalizedTargets([], { medications: ['Metformina 850 mg'], conditions: '' });
    expect(t).toHaveLength(2);
    const ldl = t.find((x) => x.analyte === 'LDL')!;
    const hba1c = t.find((x) => x.analyte === 'HEMOGLOBINA_GLICADA')!;
    expect(ldl.refLow).toBeNull();
    expect(ldl.refHigh).toBe(100);
    expect(ldl.unit).toBe('mg/dL');
    expect(hba1c.refLow).toBeNull();
    expect(hba1c.refHigh).toBe(7);
    expect(hba1c.unit).toBe('%');
    expect(ldl.appliesTo.toLowerCase()).toContain('metformina');
  });

  it('insulina por nome de marca (Lantus) dispara diabetes', () => {
    const t = personalizedTargets([], { medications: ['Lantus 24 unidades'], conditions: '' });
    expect(t.map((x) => x.analyte).sort()).toEqual(['HEMOGLOBINA_GLICADA', 'LDL']);
  });

  it('diabetes só no perfil clínico (sem remédio listado) também dispara', () => {
    const t = personalizedTargets([], { medications: [], conditions: 'Diabetes mellitus tipo 2' });
    expect(t.map((x) => x.analyte).sort()).toEqual(['HEMOGLOBINA_GLICADA', 'LDL']);
  });

  it('"SEM DIABETES" no perfil NÃO dispara (guarda negativa)', () => {
    const t = personalizedTargets([], { medications: [], conditions: 'Paciente sem diabetes e sem hipertensão' });
    expect(t).toEqual([]);
  });

  it('pré-diabetes NÃO dispara a regra do diabetes (borda de palavra)', () => {
    const t = personalizedTargets([], { medications: [], conditions: 'Pré-diabetes em acompanhamento nutricional' });
    expect(t).toEqual([]);
  });

  it('sem medicamentos e sem condições → lista vazia', () => {
    expect(personalizedTargets([], { medications: [], conditions: '' })).toEqual([]);
  });

  it('hipertensão / anti-hipertensivo NÃO gera alvo de analito (regra c: reconhece, não aplica)', () => {
    const t = personalizedTargets(
      [],
      { medications: ['Losartana potássica 50 mg', 'Amlodipina 5 mg'], conditions: 'Hipertensão arterial sistêmica' },
    );
    expect(t).toEqual([]);
  });

  it('estatina SOZINHA não cria regra nova (regra d: só reforça a do diabetes)', () => {
    const t = personalizedTargets([], { medications: ['Sinvastatina 20 mg'], conditions: '' });
    expect(t).toEqual([]);
  });

  it('estatina + diabetes → alvo de LDL reforçado (motivo menciona a estatina)', () => {
    const t = personalizedTargets([], { medications: ['Metformina 850 mg', 'Atorvastatina 20 mg'], conditions: '' });
    const ldl = t.find((x) => x.analyte === 'LDL')!;
    expect(ldl.refHigh).toBe(100);
    expect(ldl.reason.toLowerCase()).toContain('estatina');
  });

  it('toda regra traz motivo PT, citação real e gatilho (contrato do output)', () => {
    const t = personalizedTargets(
      [
        { nameCanonical: 'TSH', valueNumeric: 3.1 },
        { nameCanonical: 'LDL', valueNumeric: 120 },
        { nameCanonical: 'HEMOGLOBINA_GLICADA', valueNumeric: 7.4 },
      ],
      { medications: ['Levotiroxina 50 mcg', 'Metformina 850 mg'], conditions: 'Hipotireoidismo' },
    );
    expect(t).toHaveLength(3);
    for (const r of t) {
      expect(r.reason.trim().length).toBeGreaterThan(10);
      expect(r.citation.trim().length).toBeGreaterThan(5);
      expect(r.appliesTo.trim().length).toBeGreaterThan(3);
    }
    // citação real por regra: TSH → ATA/SBD (Thyroid 2014); diabetes → SBD/ADA
    expect(t.find((x) => x.analyte === 'TSH')!.citation).toMatch(/ATA.*Thyroid.*2014/);
    expect(t.find((x) => x.analyte === 'LDL')!.citation).toMatch(/SBD\/ADA/);
    expect(t.find((x) => x.analyte === 'HEMOGLOBINA_GLICADA')!.citation).toMatch(/SBD\/ADA/);
  });

  it('alvo de analito MEDIDO pelo paciente vem primeiro (ordenação p/ exibição)', () => {
    const t = personalizedTargets(
      [{ nameCanonical: 'HEMOGLOBINA_GLICADA', valueNumeric: 6.8 }],
      { medications: ['Levotiroxina 50 mcg', 'Metformina 500 mg'], conditions: '' },
    );
    expect(t).toHaveLength(3);
    expect(t[0].analyte).toBe('HEMOGLOBINA_GLICADA'); // medido → na frente de TSH/LDL
  });

  it('formatTarget renderiza intervalo e teto em pt-BR (vírgula decimal)', () => {
    expect(formatTarget({ refLow: 0.4, refHigh: 2.5 })).toBe('0,4–2,5');
    expect(formatTarget({ refLow: null, refHigh: 100 })).toBe('< 100');
    expect(formatTarget({ refLow: null, refHigh: 7 })).toBe('< 7');
  });
});
