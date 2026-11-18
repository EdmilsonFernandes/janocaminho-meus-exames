import { describe, it, expect } from 'vitest';
import { classifyKind, imagingSignalCount } from '../src/extraction/pdfutil';

/**
 * Regressão do caso real 17/11: usuário enviou laudo de TOMOGRAFIA por foto e o exame
 * "falhou" com a IA descrevendo o próprio laudo no motivo. Causa: OCR de foto deturpa
 * termos e a heurística perdia para sinais "lab" acessórios → caminho de LAB → 0 painéis.
 * Modalidades fortes agora contam dobro + reroute no guard de 0-itens (ver pipeline).
 */
const LAUDO_TOMO_RUIDO = `CLINICA DE IMAGEM
LAUDO DE TOMOGRAFIA COMPUTADORIZADA DE ABDOME E PELVE
TECNICA: aquisicao helicoidal sem contraste endovenoso. Comparacao com material anterior.
ACHADOS: leito hepatico preservado. CONCLUSAO: exame sem alteracoes significativas.`;

const LAUDO_TOMO_MINIMO = `TOMOGRAFIA DE ABDOME
CONCLUSAO: exame dentro do padrao da normalidade.`;

const PAINEL_LAB = `EXAME LABORATORIAL
HEMOGRAMA COMPLETO: HEMOGLOBINA 14,2 G/DL HEMATOCRITO 42,5%
PLAQUETAS 248.000 GLICEMIA 92 MG/DL CREATININA 0,9 UI/L LEUCOGRAMA normal`;

const DOC_QUALQUER = 'Receituario medico - uso continuo, 1 cp de 8/8h. Assinatura e carimbo.';

describe('classifyKind — laudo de imagem vs painel lab (regressão 17/11)', () => {
  it('laudo de tomografia com ruído "lab" no cabeçalho → IMAGING', () => {
    expect(classifyKind(LAUDO_TOMO_RUIDO)).toBe('IMAGING');
  });

  it('laudo mínimo (só modalidade + conclusão) → IMAGING (sinal forte vale dobro)', () => {
    expect(classifyKind(LAUDO_TOMO_MINIMO)).toBe('IMAGING');
  });

  it('painel de laboratório clássico → LAB_PANEL', () => {
    expect(classifyKind(PAINEL_LAB)).toBe('LAB_PANEL');
  });

  it('documento sem sinais → OTHER', () => {
    expect(classifyKind(DOC_QUALQUER)).toBe('OTHER');
  });
});

describe('imagingSignalCount — gatilho do reroute no guard de 0-itens', () => {
  it('laudo de tomografia tem ≥1 sinal (reroute vale tentativa)', () => {
    expect(imagingSignalCount(LAUDO_TOMO_RUIDO)).toBeGreaterThanOrEqual(1);
  });

  it('laudo garbleado de foto (título pela metade) ainda acende o sinal', () => {
    expect(imagingSignalCount('tomograf1a de abdome laudo n 12345')).toBeGreaterThanOrEqual(1); // "LAUDO" sobrevive
  });

  it('painel de laboratório puro não aciona reroute', () => {
    expect(imagingSignalCount(PAINEL_LAB)).toBe(0);
  });
});
