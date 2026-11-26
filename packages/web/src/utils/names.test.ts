// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { prettyName } from './names';

describe('prettyName — nome do laudo em caixa normal', () => {
  it('nome todo em caixa alta vira caixa normal', () => {
    expect(prettyName('DANIEL CESAR SHIRANE')).toBe('Daniel Cesar Shirane');
    expect(prettyName('EDMILSON LOPES FERNANDES DOS SANTOS')).toBe('Edmilson Lopes Fernandes dos Santos');
  });

  it('conectores ficam em minúscula, menos no começo', () => {
    expect(prettyName('DA SILVA COSTA')).toBe('Da Silva Costa');
    expect(prettyName('MARIA DE FATIMA E SOUZA')).toBe('Maria de Fatima e Souza');
  });

  it('nome já em caixa normal não muda', () => {
    expect(prettyName('Daniel Cesar Shirane')).toBe('Daniel Cesar Shirane');
    expect(prettyName('Dr. José da Silva')).toBe('Dr. José da Silva');
  });

  it('letras acentuadas e hífen', () => {
    expect(prettyName('JOSÉ VITÓRIA SILVA-SANTOS')).toBe('José Vitória Silva-Santos');
    expect(prettyName('RENATA SOUZA')).toBe('Renata Souza');
  });

  it('vazio, nulo ou sem letras', () => {
    expect(prettyName('')).toBe('');
    expect(prettyName(null)).toBe('');
    expect(prettyName(undefined)).toBe('');
    expect(prettyName('   ')).toBe('');
    expect(prettyName('123')).toBe('123');
  });

  it('espaços repetidos são fechados', () => {
    expect(prettyName('  ANA   PAULA  ')).toBe('Ana Paula');
  });
});
