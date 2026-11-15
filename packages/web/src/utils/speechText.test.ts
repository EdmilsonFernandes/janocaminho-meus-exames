// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeForSpeech, prepareSpeech } from './speechText';

describe('texto para fala: unidades e símbolos', () => {
  it('unidades de laudo viram palavras, sem mexer no número', () => {
    expect(normalizeForSpeech('LDL de 168 mg/dL')).toBe('LDL de 168 miligramas por decilitro');
    expect(normalizeForSpeech('TSH 2,45 µUI/mL')).toBe('TSH 2,45 micro unidades por mililitro');
    expect(normalizeForSpeech('Hematócrito 54,1%')).toBe('Hematócrito 54,1 por cento');
    expect(normalizeForSpeech('TGO 42 U/L')).toBe('TGO 42 unidades por litro');
    expect(normalizeForSpeech('Pressão 120 mmHg')).toBe('Pressão 120 milímetros de mercúrio');
  });

  it('faixa e comparadores são ditos por extenso', () => {
    expect(normalizeForSpeech('faixa 70-99 mg/dL')).toBe('faixa 70 a 99 miligramas por decilitro');
    expect(normalizeForSpeech('ideal < 130')).toBe('ideal abaixo de 130');
    expect(normalizeForSpeech('HDL > 40')).toBe('HDL acima de 40');
  });

  it('tira marcação e símbolo que a voz leria em voz alta', () => {
    expect(normalizeForSpeech('**Atenção** — veja ✨ isto')).toBe('Atenção, veja isto');
  });

  it('todo número do texto original continua no texto falado', () => {
    const src = 'Glicose 104 mg/dL (faixa 70-99), hemoglobina glicada 5,9%, colesterol 1.234 e LDL 168 mg/dL.';
    const spoken = prepareSpeech(src).map((c) => c.text).join(' ');
    for (const n of ['104', '70', '99', '5,9', '1234', '168']) expect(spoken).toContain(n);
  });
});

describe('texto para fala: trechos e pausas', () => {
  it('uma frase por trecho, com pausa entre elas e pausa maior entre parágrafos', () => {
    const chunks = prepareSpeech('Seu colesterol subiu. A glicose está estável.\n\nLeve estes pontos ao seu médico.');
    expect(chunks.map((c) => c.text)).toEqual(['Seu colesterol subiu.', 'A glicose está estável.', 'Leve estes pontos ao seu médico.']);
    expect(chunks[0].pauseMs).toBeGreaterThan(0);
    expect(chunks[1].pauseMs).toBeGreaterThan(chunks[0].pauseMs); // fim de parágrafo
    expect(chunks[2].pauseMs).toBe(0); // último trecho não espera
  });

  it('não quebra em decimal nem em "Dr."', () => {
    const chunks = prepareSpeech('O valor foi 7.5 e o Dr. Exame comparou com a faixa. Tudo certo.');
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toContain('7.5');
    expect(chunks[0].text).toContain('Doutor Exame');
  });

  it('frase longa é dividida nas vírgulas, nunca no meio de um número', () => {
    const long = 'Seus exames mostram colesterol total de 245,5 miligramas, LDL de 168,2 miligramas, triglicerídeos de 241,7 miligramas, glicose de 104,3 miligramas, hemoglobina glicada de 5,9 e ácido úrico de 7,9 miligramas, todos acima da faixa do laudo.';
    const chunks = prepareSpeech(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(230);
    expect(chunks.map((c) => c.text).join(' ')).toBe(long);
  });

  it('texto vazio não gera trecho', () => {
    expect(prepareSpeech('')).toEqual([]);
    expect(prepareSpeech('   \n\n ')).toEqual([]);
  });
});
