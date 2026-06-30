import { describe, it, expect } from 'vitest';
import { canonicalName, findMarkerInText, normalizeKey } from './normalize';

describe('canonicalName — reduz nomes de lab ao canônico (casa sinônimos entre labs)', () => {
  it('casa sinônimos exatos (rápido)', () => {
    expect(canonicalName('Hemoglobina')).toBe('HEMOGLOBINA');
    expect(canonicalName('HGB')).toBe('HEMOGLOBINA');
    expect(canonicalName('TSH')).toBe('TSH');
    expect(canonicalName('Hormônio tireoestimulante')).toBe('TSH');
  });

  it('REDUZ sufixos/qualificadores de laboratório (O BUG corrigido)', () => {
    // TGO / TGP vinham com "(AST)"/"(ALT)" ou prefixo de lab → ficavam rachados em
    // vários nameCanonical diferentes, quebrando evolução e o roteador do chat.
    expect(canonicalName('TGO (AST)')).toBe('TGO');
    expect(canonicalName('TGP (ALT)')).toBe('TGP');
    expect(canonicalName('TRANSAMINASE OXALACETICA TGO (AST)')).toBe('TGO');
    expect(canonicalName('TRANSAMINASE PIRUVICA TGP (ALT)')).toBe('TGP');
    expect(canonicalName('Aspartato aminotransferase')).toBe('TGO');
    expect(canonicalName('Alanina aminotransferase')).toBe('TGP');
  });

  it('prioriza frase mais longa (HEMOGLOBINA GLICADA ≠ HEMOGLOBINA)', () => {
    expect(canonicalName('Hemoglobina glicada')).toBe('HEMOGLOBINA_GLICADA');
    expect(canonicalName('HbA1c')).toBe('HEMOGLOBINA_GLICADA');
    expect(canonicalName('Colesterol total')).toBe('COLESTEROL_TOTAL');
    expect(canonicalName('LDL Colesterol')).toBe('LDL');
  });

  it('NÃO casa substring dentro de palavra (BASTONETES ≠ TGO via "AST")', () => {
    // "BASTONETES" contém "AST" mas é outra coisa — não pode virar TGO.
    expect(canonicalName('BASTONETES')).toBe('BASTONETES');
    expect(canonicalName('BASTOES')).toBe('BASTOES');
    // "LDL" não casa dentro de "LDLC"/"COLESTEROLLDL" sem borda
    expect(canonicalName('RELATORIO CONSOLIDADO')).toBe('RELATORIO CONSOLIDADO');
  });

  it('mantém nome normalizado quando é desconhecido (sem retrocesso)', () => {
    expect(canonicalName('Papanicolaou')).toBe(normalizeKey('Papanicolaou'));
    expect(canonicalName('VHS')).toBe('VHS');
  });
});

describe('findMarkerInText — acha o analito numa pergunta livre', () => {
  it('reconhece TGO/TGP numa pergunta do paciente (pós-fix, responde em vez de "não encontrei")', () => {
    expect(findMarkerInText('qual foi meu último TGO?')).toBe('TGO');
    expect(findMarkerInText('como está minha TGP?')).toBe('TGP');
    expect(findMarkerInText('meu hemograma, valor da hemoglobina')).toBe('HEMOGLOBINA');
    expect(findMarkerInText('e a hemoglobina glicada?')).toBe('HEMOGLOBINA_GLICADA');
  });

  it('devolve null quando não há marcador', () => {
    expect(findMarkerInText('bom dia')).toBeNull();
  });
});
