import { describe, it, expect } from 'vitest';
import { SPECIALTIES, CONVENIOS, CATS, categorize } from './medicalData';

describe('medicalData — especialidades e convênios', () => {
  it('SPECIALTIES tem entradas essenciais', () => {
    expect(SPECIALTIES.length).toBeGreaterThan(10);
    expect(SPECIALTIES).toContain('Cardiologista');
    expect(SPECIALTIES).toContain('Clinico Geral');
    expect(SPECIALTIES).toContain('Outro');
  });

  it('CONVENIOS começa com Particular (default do compartilhamento)', () => {
    expect(CONVENIOS[0]).toBe('Particular');
    expect(CONVENIOS).toContain('Unimed');
    expect(CONVENIOS).toContain('Outro');
  });
});

describe('medicalData — categorize (analito → categoria)', () => {
  it('categoriza hemograma', () => {
    expect(categorize('Hemoglobina').key).toBe('hemo');
    expect(categorize('Leucócitos').key).toBe('hemo');
    expect(categorize('Plaquetas').key).toBe('hemo');
  });

  it('categoriza lipídios e glicemia', () => {
    expect(categorize('Colesterol Total').key).toBe('lipi');
    expect(categorize('LDL Colesterol').key).toBe('lipi');
    expect(categorize('Glicose').key).toBe('glic');
    expect(categorize('Hemoglobina Glicosada').key).toBe('glic');
  });

  it('categoriza função hepática e renal', () => {
    expect(categorize('TGO (AST)').key).toBe('hepa');
    expect(categorize('Gama-GT').key).toBe('hepa');
    expect(categorize('Creatinina').key).toBe('renal');
    expect(categorize('Ureia').key).toBe('renal');
  });

  it('categoriza hormônios (tireoide)', () => {
    expect(categorize('TSH').key).toBe('horm');
    expect(categorize('T4 Livre').key).toBe('horm');
  });

  it('desconhecido cai em Outros', () => {
    expect(categorize('Exame Exótico XYZ 999').key).toBe('other');
    expect(categorize('').key).toBe('other');
  });

  it('é case-insensitive', () => {
    expect(categorize('HEMOGLOBINA').key).toBe('hemo');
    expect(categorize('colesterol').key).toBe('lipi');
  });

  it('CATS sempre expõe a categoria Outros (fallback garantido)', () => {
    expect(CATS.some((c) => c.key === 'other')).toBe(true);
  });
});
