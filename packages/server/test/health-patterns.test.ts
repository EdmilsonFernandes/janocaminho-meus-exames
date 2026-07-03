import { describe, it, expect } from 'vitest';
import { summarizePatterns } from '../src/analysis/health-patterns';

describe('health-patterns.summarizePatterns', () => {
  it('agrupa marcadores nos sistemas corretos', () => {
    const p = summarizePatterns([
      { nameCanonical: 'LDL' }, { nameCanonical: 'HDL' }, { nameCanonical: 'VCM' }, { nameCanonical: 'GLICEMIA' },
    ]);
    expect(p.find((x) => x.id === 'lipidico')?.markers).toEqual(['LDL', 'HDL']);
    expect(p.find((x) => x.id === 'hematologico')?.markers).toEqual(['VCM']);
    expect(p.find((x) => x.id === 'glicemico')?.markers).toEqual(['GLICEMIA']);
    expect(p.find((x) => x.id === 'renal')).toBeUndefined();
  });

  it('respeita a ordem de PATTERNS', () => {
    const p = summarizePatterns([{ nameCanonical: 'CREATININA' }, { nameCanonical: 'GLICEMIA' }]);
    expect(p[0].id).toBe('glicemico'); // glicemico antes de renal na definição
    expect(p[1].id).toBe('renal');
  });

  it('sem marcadores -> []', () => {
    expect(summarizePatterns([])).toEqual([]);
    expect(summarizePatterns([{ name: '' }])).toEqual([]);
  });

  it('inclui índices derivados (HOMA_IR no glicêmico e metabólico)', () => {
    const p = summarizePatterns([{ nameCanonical: 'HOMA_IR' }]);
    const ids = p.map((x) => x.id);
    expect(ids).toContain('glicemico');
    expect(ids).toContain('metabolico');
  });
});
