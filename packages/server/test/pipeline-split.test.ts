import { describe, it, expect } from 'vitest';
import { mergeLabsByDate } from '../src/extraction/pipeline';
import type { LabExtraction } from '../src/extraction/schemas';

const mk = (performedAt: string | null, panels = 1): LabExtraction => ({
  performedAt,
  examTitle: null,
  sourceLab: null,
  patientName: null,
  patientCpf: null,
  requestingDoctor: null,
  panels: Array.from({ length: panels }, (_, i) => ({ name: `P${i}`, items: [{ name: `item-${i}` }] as any[] })),
});

describe('mergeLabsByDate — anti-split-falso (mescla exames da MESMA data de coleta)', () => {
  it('mescla 2 exames do MESMO dia num só (hemograma + bioquímica coletados juntos)', () => {
    const labs = [mk('15/03/2026'), mk('15/03/2026')];
    const out = mergeLabsByDate(labs);
    expect(out).toHaveLength(1);
    expect(out[0].panels).toHaveLength(2); // painéis acumulados
  });

  it('NÃO mescla exames de datas DISTINTAS (histórico do laboratório = split legítimo)', () => {
    const labs = [mk('15/03/2026'), mk('20/01/2025'), mk('10/06/2021')];
    const out = mergeLabsByDate(labs);
    expect(out).toHaveLength(3);
  });

  it('mistura: 3 no mesmo dia + 2 em outra data → 2 registros', () => {
    const labs = [mk('15/03/2026'), mk('15/03/2026'), mk('15/03/2026'), mk('01/02/2026'), mk('01/02/2026')];
    const out = mergeLabsByDate(labs);
    expect(out).toHaveLength(2);
    const counts = out.map((l) => l.panels.length).sort((a, b) => a - b);
    expect(counts).toEqual([2, 3]); // um c/ 3 painéis, outro c/ 2
  });

  it('datas em formato ISO e brasileiro equivalentes mesclam', () => {
    const labs = [mk('15/03/2026'), mk('2026-03-15')];
    const out = mergeLabsByDate(labs);
    expect(out).toHaveLength(1);
  });

  it('labs SEM data ficam separados (não dá pra mesclar com segurança)', () => {
    const labs = [mk(null), mk(null)];
    const out = mergeLabsByDate(labs);
    expect(out).toHaveLength(2);
  });

  it('array vazio ou 1 elemento retorna como está (no-op)', () => {
    expect(mergeLabsByDate([])).toHaveLength(0);
    expect(mergeLabsByDate([mk('15/03/2026')])).toHaveLength(1);
  });
});
