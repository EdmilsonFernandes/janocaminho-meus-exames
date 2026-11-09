import { pdfToImages } from './pdfToImages';
import { imageToText } from './imageToText';

export const PDF_OCR_MAX_PAGES = 12;

/**
 * PDF-foto (sem camada de texto): rasteriza as páginas (pdftoppm) e OCRiza cada
 * uma com o MESMO caminho das fotos (pré-processamento ImageMagick + tesseract).
 *
 * Caso real 09/11: PDF de 4,6MB / 14 páginas perfeitamente legíveis, com 3 chars
 * no pdftotext — o pipeline rejeitava ("imagem difícil de decifrar") sem nunca
 * tentar OCR. O tesseract lia ~2.000 chars/página sem esforço.
 *
 * Devolve '' quando nada sai (caller decide: classificar/rejeitar como antes).
 * Página que falha não derruba as outras.
 */
export async function ocrPdfPages(buffer: Buffer, maxPages = PDF_OCR_MAX_PAGES): Promise<string> {
  const imgs = await pdfToImages(buffer, maxPages);
  const parts: string[] = [];
  for (const img of imgs) {
    try {
      const t = await imageToText(img);
      if (t.trim()) parts.push(t);
    } catch { /* página problemática: segue o baile */ }
  }
  return parts.join('\n\n');
}
