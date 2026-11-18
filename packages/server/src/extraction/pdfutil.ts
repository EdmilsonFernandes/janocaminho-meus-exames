import type { ExamKind } from '@prisma/client';
import { pdfToText } from './pdfToText';

export interface PdfInfo {
  pageCount: number;
  text: string;
}

/**
 * Conta páginas + extrai texto via pdftotext -layout (preserva colunas da tabela).
 * Fonte de verdade para a extração (o relay GLM lê TEXTO, não imagem).
 * Não-fatal: se falhar, retorna vazio.
 */
export async function readPdf(buffer: Buffer): Promise<PdfInfo> {
  try {
    const text = await pdfToText(buffer);
    const pageCount = text.split('\f').length; // pdftotext separa páginas com form-feed
    return { pageCount: Math.max(pageCount, 1), text };
  } catch (e) {
    console.warn('[pdfutil] leitura de PDF falhou (não fatal):', (e as Error).message);
    return { pageCount: 0, text: '' };
  }
}

const LAB_SIGNALS = [
  'HEMOGRAMA', 'LEUCOGRAMA', 'PLAQUETAS', 'GLICEMIA', 'GLICOSE', 'COLESTEROL',
  'TRIGLICERIDES', 'TRIGLICÉRIDES', 'HEMOGLOBINA', 'HEMATOCRITO', 'HEMATÓCRITO',
  'CREATININA', 'MG/DL', 'UI/L', 'G/DL', 'ERITROGRAMA',
];
const IMG_SIGNALS = [
  'TOMOGRAFIA', 'RESSONANCIA', 'RESSONÂNCIA', 'ULTRASSON', 'ECOGRAFIA',
  'RAIOS-X', 'RADIOGRAFIA', 'LAUDO', 'RELATORIO', 'RELATÓRIO', 'ACHADOS',
  'CONCLUSAO', 'CONCLUSÃO', 'ECG', 'ELETROCARDIOGRAMA',
];
// Modalidades de imagem: quase nunca aparecem num painel de laboratório — contam DOBRO
// na heurística (caso real 17/11: laudo de TOMOGRAFIA de foto perdia p/ termos "lab"
// acessórios do cabeçalho e morria no guard de 0-itens como se não fosse exame).
const IMG_STRONG = [
  'TOMOGRAFIA', 'RESSONANCIA', 'RESSONÂNCIA', 'ULTRASSON',
  'RADIOGRAFIA', 'MAMOGRAFIA', 'ECOGRAFIA',
];

function countSignals(upper: string, signals: string[]): number {
  return signals.reduce((n, s) => (upper.includes(s) ? n + 1 : n), 0);
}

/** Heurística para classificar o tipo de exame (roteia o prompt). */
export function classifyKind(text: string): ExamKind {
  const t = (text || '').toUpperCase();
  const lab = countSignals(t, LAB_SIGNALS);
  const img = countSignals(t, IMG_SIGNALS) + countSignals(t, IMG_STRONG);
  if (img >= 2 && img >= lab) return 'IMAGING';
  if (lab >= 3 && lab > img) return 'LAB_PANEL';
  return 'OTHER';
}

/** Nº de sinais de imagem no texto (≥1 = vale tentar extração de laudo no reroute). */
export function imagingSignalCount(text: string): number {
  return countSignals((text || '').toUpperCase(), IMG_SIGNALS);
}

/** Tem sinal médico no texto? (p/ descartar documento que não é exame/laudo) */
export function looksLikeMedical(text: string): boolean {
  const t = (text || '').toUpperCase();
  return countSignals(t, LAB_SIGNALS) + countSignals(t, IMG_SIGNALS) > 0;
}
