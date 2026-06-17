import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFileP = promisify(execFile);

/**
 * Rasteriza um PDF em imagens PNG (uma por página) via pdftoppm (poppler).
 * Necessário porque o relay Z.ai descarta blocos "document" de PDF — só lê "image".
 * Limita a `maxPages` páginas (painéis lab costumam estar nas primeiras).
 */
export async function pdfToImages(buffer: Buffer, maxPages = 12, dpi = 150): Promise<Buffer[]> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfimg-'));
  const pdfPath = path.join(tmp, 'doc.pdf');
  const outPrefix = path.join(tmp, 'p');
  fs.writeFileSync(pdfPath, buffer);
  try {
    await execFileP('pdftoppm', ['-png', '-r', String(dpi), '-l', String(maxPages), pdfPath, outPrefix], { timeout: 120000 });
    const files = fs
      .readdirSync(tmp)
      .filter((f) => /^p-\d+\.png$/.test(f))
      .sort((a, b) => parseInt(a.match(/\d+/)![0], 10) - parseInt(b.match(/\d+/)![0], 10));
    return files.map((f) => fs.readFileSync(path.join(tmp, f)));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
