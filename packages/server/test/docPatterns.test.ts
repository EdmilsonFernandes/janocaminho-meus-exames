import { describe, it, expect } from 'vitest';
import { classifyDoc } from '../src/extraction/docPatterns';

/**
 * Classificador de documento (classifyDoc): decide se o texto extraído é um exame/laudo
 * real, um não-exame conhecido (rejeição específica) ou indefinido (soft reject).
 *
 * Casos derivados de uploads REAIS rejeitados em produção (set/26):
 *  - solicitação de exame assinada digitalmente (PDF com camada de texto);
 *  - guia TISS em branco (foto, lida via tesseract — "Hipótese Diagnóstica", "Matrícula").
 */

describe('classifyDoc — não-exames conhecidos', () => {
  it('SOLICITAÇÃO de exame (pedido médico) → rejeição específica, não o genérico', () => {
    // Texto real (renata.pdf, 23/09/26): pedido assinado digitalmente pelo médico.
    const t = [
      'Documento assinado digitalmente',
      'Solicitação de Exame(s)',
      'Solicito à RENATA GUIMARAES OLIVEIRA CIOLETTE, o(s) seguinte(s) exame(s):',
      'Anticorpos Beta 2 glicoproteina I - IgA',
      'Indicação Clínica: Trombose venosa ou arterial',
      'CRM 521304739/RJ',
    ].join('\n');
    const r = classifyDoc(t);
    expect(r.accept).toBe(false);
    expect(r.strong).toBe(true);
    expect(r.reason).toMatch(/PEDIDO de exame/i);
  });

  it('GUIA TISS em branco (hipótese diagnóstica / matrícula) → rejeição de pedido', () => {
    // Texto real do tesseract (silvana.jpg, 09/09/26): formulário de solicitação vazio.
    const t = [
      'Unidade Prestadora:',
      'NOME SOCIAL',
      'Matrícula:',
      'Endereço:',
      'Cidade/Estado:',
      'Descrição do exame ou procedi mento solicitado',
      'Hipótese Diagnóstica:',
      'Rotina ou Prioridade',
      'Justificativa para exames:',
      'Solicitante Carimbo e Assinatura',
    ].join('\n');
    const r = classifyDoc(t);
    expect(r.accept).toBe(false);
    expect(r.strong).toBe(true);
    expect(r.reason).toMatch(/PEDIDO de exame/i);
  });

  it('RECEITA continua rejeitada com mensagem própria', () => {
    const r = classifyDoc('Receituário médico\nTomar 1 comprimido de 8 em 8 horas\nPosologia');
    expect(r.accept).toBe(false);
    expect(r.strong).toBe(true);
    expect(r.reason).toMatch(/RECEITA/i);
  });
});

describe('classifyDoc — exames reais NÃO podem ser rejeitados', () => {
  it('hemograma com valores de referência → aceito (mesmo citando CRM/solicitante)', () => {
    const t = [
      'Laboratório Exemplo — Posto de coleta',
      'Paciente: João da Silva',
      'Hemograma completo',
      'Hemoglobina 13.5 g/dL  Valores de referência: 13.0 - 17.0',
      'Hematócrito 41 %',
      'Leucócitos 6.200 /mm3',
      'Médico solicitante: Dr. Ana — CRM: 12345',
    ].join('\n');
    expect(classifyDoc(t).accept).toBe(true);
  });

  it('laudo de imagem → aceito', () => {
    const t = 'ULTRASSONOGRAFIA abdominal total\nLaudo médico: fígado de dimensões normais.\nMédico responsável: CRM 9999';
    expect(classifyDoc(t).accept).toBe(true);
  });

  it('exame que menciona "solicitação" MAS tem resultados → aceito (VALID_MEDICAL tem prioridade)', () => {
    // Resultado real pode trazer "Procedimento solicitado: TSH" no cabeçalho —
    // a checagem de sinais médicos roda ANTES da rejeição, então não pode cair no REJECT.
    const t = 'Procedimento solicitado: TSH\nResultado: 2.10 mUI/L\nReferência: 0.4 - 4.0 mUI/L';
    expect(classifyDoc(t).accept).toBe(true);
  });
});

describe('classifyDoc — indefinidos', () => {
  it('texto sem sinais médicos nem categoria conhecida → soft reject genérico', () => {
    const r = classifyDoc('Lista de compras: arroz, feijão, café');
    expect(r.accept).toBe(false);
    expect(r.strong).toBe(false);
  });

  it('vazio → strong reject de imagem ilegível', () => {
    const r = classifyDoc('   ');
    expect(r.accept).toBe(false);
    expect(r.strong).toBe(true);
  });
});
