import { describe, it, expect } from 'vitest';
import { dedupeIntraDoc } from '../src/extraction/pipeline';

type R = { nameCanonical: string | null; name: string; valueNumeric: number | null; valueText: string | null; unit: string | null };

describe('dedupeIntraDoc — colapsa itens duplicados dentro do MESMO documento', () => {
  it('remove o mesmo analito extraído 2x no mesmo PDF (mesmo valor + unidade)', () => {
    const rows: R[] = [
      { nameCanonical: 'TSH', name: 'TSH', valueNumeric: 2.5, valueText: '2,5', unit: 'µUI/mL' },
      { nameCanonical: 'TSH', name: 'TSH', valueNumeric: 2.5, valueText: '2,5', unit: 'µUI/mL' },
      { nameCanonical: 'T4L', name: 'T4 Livre', valueNumeric: 1.2, valueText: '1,2', unit: 'ng/dL' },
    ];
    expect(dedupeIntraDoc(rows)).toHaveLength(2);
  });

  it('mantém medições distintas do mesmo analito (valores diferentes = evolução real)', () => {
    const rows: R[] = [
      { nameCanonical: 'GLICEMIA', name: 'Glicemia', valueNumeric: 120, valueText: '120', unit: 'mg/dL' },
      { nameCanonical: 'GLICEMIA', name: 'Glicemia', valueNumeric: 168, valueText: '168', unit: 'mg/dL' },
    ];
    expect(dedupeIntraDoc(rows)).toHaveLength(2);
  });

  it('mantém analitos diferentes', () => {
    const rows: R[] = [
      { nameCanonical: 'TSH', name: 'TSH', valueNumeric: 2.5, valueText: '2,5', unit: 'µUI/mL' },
      { nameCanonical: 'T4L', name: 'T4L', valueNumeric: 1.2, valueText: '1,2', unit: 'ng/dL' },
    ];
    expect(dedupeIntraDoc(rows)).toHaveLength(2);
  });

  it('mesmo valor em unidades DIFERENTES não colapsa (escalas distintas)', () => {
    const rows: R[] = [
      { nameCanonical: 'HEMOGLOBINA', name: 'Hb', valueNumeric: 150, valueText: '150', unit: 'g/L' },
      { nameCanonical: 'HEMOGLOBINA', name: 'Hb', valueNumeric: 150, valueText: '150', unit: 'g/dL' },
    ];
    expect(dedupeIntraDoc(rows)).toHaveLength(2);
  });

  it('lida com nameCanonical nulo + valueText (ex.: culturais/qualitativos)', () => {
    const rows: R[] = [
      { nameCanonical: null, name: 'X', valueNumeric: null, valueText: 'positivo', unit: null },
      { nameCanonical: null, name: 'X', valueNumeric: null, valueText: 'positivo', unit: null },
    ];
    expect(dedupeIntraDoc(rows)).toHaveLength(1);
  });

  it('vazio ou 1 elemento retorna como está', () => {
    expect(dedupeIntraDoc([])).toHaveLength(0);
    expect(dedupeIntraDoc([{ nameCanonical: 'TSH', name: 'TSH', valueNumeric: 2, valueText: '2', unit: null }])).toHaveLength(1);
  });
});
