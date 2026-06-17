import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFileP = promisify(execFile);

/**
 * Extrai o TEXTO de um PDF via `pdftotext -layout` (poppler). O -layout preserva as
 * colunas das tabelas (Resultado x Referência) — bem melhor que o texto "embaralhado".
 * Usado pq o relay Z.ai/GLM NÃO enxerga imagem/PDF (alucina); com o texto o GLM acerta.
 */
export async function pdfToText(buffer: Buffer): Promise<string> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdftxt-'));
  const pdfPath = path.join(tmp, 'doc.pdf');
  fs.writeFileSync(pdfPath, buffer);
  try {
    const { stdout } = await execFileP('pdftotext', ['-layout', pdfPath, '-'], { maxBuffer: 30 * 1024 * 1024, timeout: 120000 });
    return stdout;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
