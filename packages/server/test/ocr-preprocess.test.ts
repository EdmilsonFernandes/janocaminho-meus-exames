import { describe, it, expect } from 'vitest';
import { ocrPreprocessArgs, ocrWordCount, ocrConfidentWords, OCR_MAX_EDGE, OCR_MIN_EDGE, OCR_UNREADABLE_WORDS, OCR_WEAK_WORDS } from '../src/extraction/imageToText';

describe('preparo da foto antes do leitor (OCR)', () => {
  it('aplica a rotação da câmera antes de tudo', () => {
    const args = ocrPreprocessArgs('in.jpg', 'out.png');
    expect(args[0]).toBe('in.jpg');
    expect(args[1]).toBe('-auto-orient');
    expect(args[args.length - 1]).toBe('out.png');
  });

  it('normaliza o tamanho: reduz foto grande, amplia só a pequena, e nunca dobra tudo', () => {
    const args = ocrPreprocessArgs('in.jpg', 'out.png');
    expect(args).toContain(`${OCR_MAX_EDGE}x${OCR_MAX_EDGE}>`);
    expect(args).toContain(`${OCR_MIN_EDGE}x${OCR_MIN_EDGE}<`);
    expect(args).not.toContain('200%'); // regressão: foto de 10 MP virava 40 MP e levava ~1 min
    expect(OCR_MAX_EDGE).toBeLessThanOrEqual(3000);
  });

  it('dois tratamentos: contraste (padrão) e folha endireitada (reserva)', () => {
    const gray = ocrPreprocessArgs('a', 'b', 'gray');
    expect(gray).toContain('-normalize');
    expect(gray).not.toContain('-deskew');
    const deskew = ocrPreprocessArgs('a', 'b', 'deskew');
    expect(deskew).toContain('-deskew');
    expect(deskew.indexOf('-deskew')).toBeLessThan(deskew.indexOf('-resize')); // endireita antes de redimensionar
  });
});

describe('medida de legibilidade', () => {
  it('conta palavras de 4+ letras, com acento; ignora lixo de leitura', () => {
    expect(ocrWordCount('GLICOSE 92 mg/dL Valor de referência: 70 a 99')).toBe(3);
    expect(ocrWordCount('|| ~~ .. 1 l i 0 — = ,, ;;')).toBe(0);
    expect(ocrWordCount('')).toBe(0);
  });

  it('escolhe pela CONFIANÇA do leitor, não por quantidade de caracteres', () => {
    const row = (conf: number, word: string) => ['5', '1', '1', '1', '1', '1', '0', '0', '10', '10', String(conf), word].join('\t');
    const tsv = [
      'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
      row(96, 'GLICOSE'), row(91, '92'), row(88, 'dL'), row(31, 'xkqzw'), row(12, 'lIlIl'), row(85, 'referência'), row(-1, ''),
    ].join('\n');
    expect(ocrConfidentWords(tsv)).toBe(2); // GLICOSE e referência; número, sigla curta e lixo ficam de fora
    expect(ocrConfidentWords('')).toBe(0);
  });

  it('um resultado curto e legítimo NÃO é tratado como foto ilegível', () => {
    const slip = 'Laboratório Exemplo\nPaciente: Fulana de Tal\nGLICOSE 92 mg/dL\nValor de referência: 70 a 99 mg/dL\nMétodo: enzimático';
    expect(ocrWordCount(slip)).toBeGreaterThanOrEqual(OCR_UNREADABLE_WORDS);
  });

  it('limites coerentes: ilegível é bem menor que leitura fraca', () => {
    expect(OCR_UNREADABLE_WORDS).toBeLessThan(OCR_WEAK_WORDS);
  });
});
