import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFileP = promisify(execFile);

/**
 * Pré-processa a imagem (ImageMagick) antes do tesseract. Fotos de celular (luz irregular,
 * baixo contraste, resolução, sombra) cegam o tesseract bruto → OCR de poucas centenas de chars
 * e cheio de lixo. Pipeline: grayscale → upscale 2x → sharpen → threshold adaptativo (-lat),
 * que normaliza iluminação irregular e deixa o texto preto-sobre-branco nítido.
 * Devolve o caminho preprocessado; se faltar ImageMagick, devolve o original (tesseract direto).
 */
async function preprocess(srcPath: string): Promise<string> {
  const outPath = srcPath + '.prep.png';
  const args = [srcPath, '-colorspace', 'Gray', '-resize', '200%', '-sharpen', '0x1', '-lat', '25x25-10%', outPath];
  for (const bin of ['convert', 'magick']) {
    try {
      await execFileP(bin, args, { timeout: 90_000 });
      return outPath;
    } catch { /* tenta próximo binário */ }
  }
  return srcPath; // sem ImageMagick → tesseract na imagem original (como antes)
}

/**
 * OCR de imagem (foto de exame) via Tesseract (português). Necessário porque fotos
 * não têm camada de texto (pdftotext não funciona) e o relay GLM não enxerga imagem.
 * Retorna "" se não conseguir ler nada.
 */
export async function imageToText(buffer: Buffer): Promise<string> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
  const imgPath = path.join(tmp, 'img');
  fs.writeFileSync(imgPath, buffer);
  try {
    const target = await preprocess(imgPath);
    const { stdout } = await execFileP('tesseract', [target, '-', '-l', 'por'], { maxBuffer: 30 * 1024 * 1024, timeout: 120000 });
    return stdout;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
