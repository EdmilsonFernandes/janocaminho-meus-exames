import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFileP = promisify(execFile);

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
    const { stdout } = await execFileP('tesseract', [imgPath, '-', '-l', 'por'], { maxBuffer: 30 * 1024 * 1024, timeout: 120000 });
    return stdout;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
