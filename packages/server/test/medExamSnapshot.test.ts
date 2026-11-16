import { describe, it, expect } from 'vitest';
import { medExamSnapshot, medExamPromptLines } from '../src/analysis/medications-context';

const row = (name: string, valueText: string, isAbnormal: boolean, date: string | null) => ({
  name, nameCanonical: name.toUpperCase(), valueText, unit: 'mUI/L', isAbnormal, date: date ? new Date(date) : null,
});

describe('medExamSnapshot (leitura de IA dos remédios)', () => {
  it('usa o resultado mais recente: valor que voltou à faixa não aparece como alterado', () => {
    const s = medExamSnapshot([
      row('TSH', '8,2', true, '2025-07-10'),
      row('TSH', '2,1', false, '2026-10-02'),
    ]);
    expect(s.altered).toEqual([]);
    expect(s.inRange[0]).toContain('TSH=2,1');
    expect(s.inRange[0]).toContain('voltou à faixa');
    expect(s.lastExamDate?.toISOString().slice(0, 10)).toBe('2026-10-02');
  });

  it('mantém como alterado quando o mais recente está fora da faixa, com a data dele', () => {
    const s = medExamSnapshot([
      row('TSH', '2,1', false, '2025-07-10'),
      row('TSH', '9,0', true, '2026-10-02'),
      row('Glicose', '90', false, '2026-10-02'),
    ]);
    expect(s.altered).toHaveLength(1);
    expect(s.altered[0]).toContain('TSH=9,0');
    expect(s.altered[0]).toContain(new Date('2026-10-02').toLocaleDateString('pt-BR'));
    expect(s.inRange.some((l) => l.startsWith('Glicose=90'))).toBe(true);
  });

  it('exame sem data nunca vence um exame datado', () => {
    const s = medExamSnapshot([row('TSH', '9,0', true, null), row('TSH', '2,1', false, '2024-01-05')]);
    expect(s.altered).toEqual([]);
  });

  it('prompt informa a data do último exame e manda usar só o mais recente', () => {
    const lines = medExamPromptLines(medExamSnapshot([row('TSH', '2,1', false, '2026-10-02')])).join('\n');
    expect(lines).toContain('ÚLTIMO EXAME DO PACIENTE');
    expect(lines).toContain('FORA DA FAIXA HOJE');
    expect(lines).toContain('nenhum');
    expect(medExamPromptLines(medExamSnapshot([])).join('\n')).toContain('nenhum exame enviado');
  });
});
