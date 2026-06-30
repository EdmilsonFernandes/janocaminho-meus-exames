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

  it('continua reduzindo qualificadores DEscrição do mesmo analito (não-compostos)', () => {
    expect(canonicalName('TSH - TIREOESTIMULANTE')).toBe('TSH');
    expect(canonicalName('HEMOGLOBINA GLICADA - HBA1C')).toBe('HEMOGLOBINA_GLICADA');
    expect(canonicalName('VITAMINA B12')).toBe('VITAMINA_B12');
    expect(canonicalName('SEGMENTADOS (ABS)')).toBe('NEUTROFILOS');
    expect(canonicalName('TRANSAMINASE OXALACETICA TGO (AST)')).toBe('TGO');
  });
});

describe('canonicalName — NÃO colapsa analito composto/derivado no analito-base', () => {
  // Casos pegos no dry-run de produção que o fuzzy ingênuo fundiria errado (clinicamente).
  const keep = (s: string) => canonicalName(s);
  it('G6PD, não-HDL, razões, eAG, cálcio iônico, urinário, anticorpo', () => {
    expect(keep('GLICOSE 6 FOSFATO DESIDROGENASE')).toBe(normalizeKey('GLICOSE 6 FOSFATO DESIDROGENASE'));
    expect(keep('COLESTEROL NAO HDL')).toBe(normalizeKey('COLESTEROL NAO HDL'));
    expect(keep('RELACAO PROTEINA/CREATININA')).toBe(normalizeKey('RELACAO PROTEINA/CREATININA'));
    expect(keep('RELACAO ALBUMINA/CREATININA')).toBe(normalizeKey('RELACAO ALBUMINA/CREATININA'));
    expect(keep('GLICEMIA MEDIA ESTIMADA')).toBe(normalizeKey('GLICEMIA MEDIA ESTIMADA'));
    expect(keep('CALCIO IONICO')).toBe(normalizeKey('CALCIO IONICO'));
    expect(keep('CALCIO IONICO/LIVRE')).toBe(normalizeKey('CALCIO IONICO/LIVRE'));
    expect(keep('CREATININA URINARIA')).toBe(normalizeKey('CREATININA URINARIA'));
    expect(keep('ANTICORPOS ANTI-HBS')).toBe(normalizeKey('ANTICORPOS ANTI-HBS'));
    expect(keep('PESQUISA DE HEMACIAS FALCIFORMES')).toBe(normalizeKey('PESQUISA DE HEMACIAS FALCIFORMES'));
  });
  it('frações de hemoglobina (HbA/HbA2/HbF) ≠ hemoglobina total', () => {
    expect(keep('HEMOGLOBINA A')).toBe(normalizeKey('HEMOGLOBINA A'));
    expect(keep('HEMOGLOBINA A2')).toBe(normalizeKey('HEMOGLOBINA A2'));
    expect(keep('HEMOGLOBINA FETAL')).toBe(normalizeKey('HEMOGLOBINA FETAL'));
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
