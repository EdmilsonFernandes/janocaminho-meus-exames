import { describe, it, expect } from 'vitest';
import { synthesizeExamTitle } from '../src/utils/examIdentity';

// Auditoria premium item 18: "EXAMES LABORATORIAIS" ×5 no histórico não deixava escanear.
// Síntese é DISPLAY-ONLY: título específico nunca muda; genérico sem painel mantém original.
describe('synthesizeExamTitle (título genérico → painéis)', () => {
  it('sintetiza a partir dos painéis quando o título é genérico', () => {
    expect(synthesizeExamTitle('EXAMES LABORATORIAIS', ['HORMÔNIOS', 'LEUCOGRAMA'])).toBe('Hormônios + Leucograma');
    expect(synthesizeExamTitle('Exames laboratoriais', ['LIPÍDEOS'])).toBe('Lipídeos');
  });

  it('1 painel → título único; 3+ → junta com vírgula e +', () => {
    expect(synthesizeExamTitle('LABORATORIAL', ['HEMOGRAMA'])).toBe('Hemograma');
    expect(synthesizeExamTitle('Exames', ['A', 'B', 'C', 'D'])).toBe('A, B + C');
  });

  it('preserva siglas nos painéis (CHCM não vira Chcm)', () => {
    expect(synthesizeExamTitle('EXAMES LABORATORIAIS', ['CHCM', 'TSH_TOTAL'])).toBe('CHCM + TSH Total');
  });

  it('título ESPECÍFICO nunca é alterado', () => {
    expect(synthesizeExamTitle('HEMOGRAMA COMPLETO', ['HORMÔNIOS'])).toBe('HEMOGRAMA COMPLETO');
    expect(synthesizeExamTitle('CULTURA DE URINA', [])).toBe('CULTURA DE URINA');
  });

  it('genérico SEM painel mantém o original (nunca piora)', () => {
    expect(synthesizeExamTitle('Exames', [])).toBe('Exames');
    expect(synthesizeExamTitle('', ['A'])).toBe('');
  });

  it('ignora painel "Outros/Geral"', () => {
    expect(synthesizeExamTitle('Exames', ['Outros', 'GERAL', 'LIPÍDEOS'])).toBe('Lipídeos');
  });
});
