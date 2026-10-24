import { describe, it, expect } from 'vitest';
import { searchCid10, getCid10 } from '../src/utils/cid10';

// Base oficial DATASUS (12.451 subcategorias, rev. 2008) — busca sem acento
// (regra normalizeKey da casa) é o contrato do autocomplete do médico.
describe('cid10 — busca na base oficial', () => {
  it('busca por código (case-insensitive, começa-com): "e11" traz a família do diabetes', () => {
    const r = searchCid10('e11');
    expect(r.length).toBeGreaterThan(4);
    expect(r[0].c).toBe('E11.0');
    expect(r.some((e) => e.c === 'E11.9')).toBe(true);
  });

  it('busca por descrição SEM acento: "hipertensao" acha I10', () => {
    const r = searchCid10('hipertensao');
    expect(r.some((e) => e.c === 'I10' && /Hipertens/.test(e.d))).toBe(true);
  });

  it('busca por termo interno: "mellitus" acha E1x', () => {
    const r = searchCid10('mellitus');
    expect(r.length).toBeGreaterThan(3);
    expect(r.every((e) => /E1[0-4]/.test(e.c))).toBe(true);
  });

  it('query curta (<2) retorna vazio — não dispara busca sem sentido', () => {
    expect(searchCid10('')).toEqual([]);
    expect(searchCid10('d')).toEqual([]);
  });

  it('getCid10: código exato com ponto; inválido → null', () => {
    expect(getCid10('E11.9')?.d).toContain('Diabetes');
    expect(getCid10('i10')?.c).toBe('I10'); // tolera case
    expect(getCid10('E11.99')).toBeNull(); // E11 vai até E11.9 — .99 não existe
    expect(getCid10('')).toBeNull();
  });

  it('limite respeitado', () => {
    expect(searchCid10('diabetes', 5)).toHaveLength(5);
  });
});
