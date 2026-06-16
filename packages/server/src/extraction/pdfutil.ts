import type { ExamKind } from '@prisma/client';

// pdf-parse v2 exporta a classe PDFParse (API: load(Buffer) -> getText/getInfo).
async function loadPdf(buffer: Buffer): Promise<any> {
  const mod: any = await import('pdf-parse');
  const pdf = new mod.PDFParse();
  await pdf.load(buffer);
  return pdf;
}

export interface PdfInfo {
  pageCount: number;
  text: string;
}

/**
 * Conta páginas + extrai texto bruto (apenas p/ metadados e trava anti-alucinação;
 * a fonte de verdade é a VISÃO do modelo). Não-fatal: se falhar, retorna vazio.
 */
export async function readPdf(buffer: Buffer): Promise<PdfInfo> {
  try {
    const pdf = await loadPdf(buffer);
    const [text, info] = await Promise.all([
      pdf.getText?.().catch(() => ''),
      pdf.getInfo?.().catch(() => null),
    ]);
    const pageCount = Number(
      info?.numPages ?? info?.pages ?? info?.pageCount ?? info?.metadata?.numPages ?? 0,
    );
    pdf.destroy?.();
    return { pageCount, text: String(text ?? '') };
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

function countSignals(upper: string, signals: string[]): number {
  return signals.reduce((n, s) => (upper.includes(s) ? n + 1 : n), 0);
}

/** Heurística para classificar o tipo de exame (roteia o prompt). */
export function classifyKind(text: string): ExamKind {
  const t = (text || '').toUpperCase();
  const lab = countSignals(t, LAB_SIGNALS);
  const img = countSignals(t, IMG_SIGNALS);
  if (img >= 2 && img >= lab) return 'IMAGING';
  if (lab >= 3 && lab > img) return 'LAB_PANEL';
  return 'OTHER';
}

/** Tem sinal médico no texto? (p/ descartar documento que não é exame/laudo) */
export function looksLikeMedical(text: string): boolean {
  const t = (text || '').toUpperCase();
  return countSignals(t, LAB_SIGNALS) + countSignals(t, IMG_SIGNALS) > 0;
}
