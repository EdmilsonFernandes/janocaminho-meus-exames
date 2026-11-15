import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFileP = promisify(execFile);

/** Lado maior, em pixels, com que a foto vai para o leitor. Uma folha A4 a 300 dpi tem ~3500 px;
 *  2600 mantém a letra de laudo legível e cabe na memória do servidor. */
export const OCR_MAX_EDGE = 2600;
/** Foto pequena (recorte, print) é ampliada até este lado maior: letra miúda não é lida. */
export const OCR_MIN_EDGE = 1600;

/**
 * Argumentos do ImageMagick para preparar a foto antes do tesseract.
 *
 * Caso real (15/11/26), medido no servidor com 6 fotos de celular (5 a 11 MP): o tratamento
 * antigo ampliava TODA foto em 200% (uma de 10 MP virava 40 MP) e levava de 22 a 64 s por foto.
 * Com o tamanho normalizado a leitura cai para 5 a 13 s e o leitor reconhece a mesma quantidade
 * de palavras com confiança.
 *
 * Passos: 1) aplica a rotação gravada pela câmera; 2) NORMALIZA o tamanho (reduz foto grande,
 * amplia só a pequena); 3) cinza + contraste + nitidez. A variante 'deskew' também endireita a
 * folha fotografada torta (segunda tentativa, quando a primeira leu pouco).
 */
export function ocrPreprocessArgs(srcPath: string, outPath: string, variant: 'gray' | 'deskew' = 'gray'): string[] {
  return [
    srcPath, '-auto-orient',
    ...(variant === 'deskew' ? ['-deskew', '40%'] : []),
    '-resize', `${OCR_MAX_EDGE}x${OCR_MAX_EDGE}>`, // só reduz se for maior
    '-resize', `${OCR_MIN_EDGE}x${OCR_MIN_EDGE}<`, // só amplia se for menor
    '-colorspace', 'Gray', '-normalize', '-sharpen', '0x1', outPath,
  ];
}

/** Quantas palavras "de verdade" (4+ letras) o leitor tirou da imagem — medida simples de legibilidade. */
export function ocrWordCount(text: string): number {
  return (String(text ?? '').match(/[A-Za-zÀ-ú]{4,}/g) ?? []).length;
}

/**
 * Palavras (3+ letras) que o leitor marcou com confiança >= 70, a partir da saída TSV do tesseract
 * (coluna 11 = confiança, 12 = texto). É a medida usada para escolher entre dois tratamentos:
 * contar caracteres premia lixo de leitura; confiança, não.
 */
export function ocrConfidentWords(tsv: string): number {
  let n = 0;
  for (const line of String(tsv ?? '').split('\n').slice(1)) {
    const cols = line.split('\t');
    if (cols.length < 12) continue;
    if (Number(cols[10]) >= 70 && /[A-Za-zÀ-ú]{3,}/.test(cols[11])) n += 1;
  }
  return n;
}

/** Abaixo disto a primeira leitura é considerada fraca e vale tentar o segundo tratamento. */
export const OCR_WEAK_WORDS = 60;
/** Abaixo disto a foto é tratada como ilegível: nem vai para a IA (ver pipeline). */
export const OCR_UNREADABLE_WORDS = 6;

async function preprocess(srcPath: string, variant: 'gray' | 'deskew'): Promise<string | null> {
  const outPath = `${srcPath}.${variant}.png`;
  for (const bin of ['convert', 'magick']) {
    try {
      await execFileP(bin, ocrPreprocessArgs(srcPath, outPath, variant), { timeout: 90_000 });
      return outPath;
    } catch { /* tenta próximo binário */ }
  }
  return null; // sem ImageMagick
}

/** Uma leitura: texto + quantas palavras saíram com confiança (uma execução só do tesseract). */
async function read(target: string): Promise<{ text: string; confident: number }> {
  const base = `${target}.out`;
  await execFileP('tesseract', [target, base, '-l', 'por', 'txt', 'tsv'], { maxBuffer: 30 * 1024 * 1024, timeout: 120000 });
  const text = fs.readFileSync(`${base}.txt`, 'utf8');
  let confident = 0;
  try { confident = ocrConfidentWords(fs.readFileSync(`${base}.tsv`, 'utf8')); } catch { confident = ocrWordCount(text); }
  return { text, confident };
}

/**
 * OCR de imagem (foto de exame) via Tesseract (português). Necessário porque fotos
 * não têm camada de texto (pdftotext não funciona) e o relay GLM não enxerga imagem.
 * Lê com o tratamento principal; se sair pouco texto confiável, tenta endireitando a folha e
 * fica com a leitura melhor. Retorna "" se não conseguir ler nada.
 */
export async function imageToText(buffer: Buffer): Promise<string> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
  const imgPath = path.join(tmp, 'img');
  fs.writeFileSync(imgPath, buffer);
  try {
    const first = await preprocess(imgPath, 'gray');
    // sem ImageMagick → tesseract na imagem original (como antes)
    let best = await read(first ?? imgPath);
    if (first && best.confident < OCR_WEAK_WORDS) {
      const second = await preprocess(imgPath, 'deskew');
      if (second) {
        try {
          const alt = await read(second);
          if (alt.confident > best.confident) {
            console.log(`[ocr] 2º tratamento (folha endireitada) leu mais: ${best.confident} → ${alt.confident} palavras confiáveis`);
            best = alt;
          }
        } catch { /* fica com a primeira leitura */ }
      }
    }
    return best.text;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
