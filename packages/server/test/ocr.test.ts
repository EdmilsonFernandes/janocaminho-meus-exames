import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { imageToText } from '../src/extraction/imageToText';

/**
 * Teste do DOWNSTREAM do scanner de documentos: confirma que o tesseract (OCR)
 * consegue ler imagens reais de exame. O scanner (ML Kit, nativo) produz a imagem
 * LIMPA; este teste valida que o OCR que recebe essa imagem extrai texto significativo.
 *
 * Roda no Docker/CI (onde o tesseract está instalado). No Windows dev (sem tesseract)
 * o suite é SKIPADO automaticamente.
 *
 * Fixtures: copie imagens reais (ex.: daniel1.jpg, daniel2.jpg) pra `test/fixtures/`
 * — são gitignored (dado de saúde, não commitadas).
 */
const FIX = path.join(__dirname, 'fixtures');
const imgs = fs.existsSync(FIX) ? fs.readdirSync(FIX).filter((f) => /\.(jpg|jpeg|png)$/i.test(f)) : [];

let tesseractOk = false;
try { execFileSync('tesseract', ['--version'], { stdio: 'ignore' }); tesseractOk = true; } catch { /* sem tesseract neste ambiente */ }

const suite = tesseractOk ? describe : describe.skip;

suite('OCR (tesseract) — downstream do scanner de documentos', () => {
  if (!imgs.length) {
    it.skip('sem fixtures de imagem — copie daniel1.jpg/daniel2.jpg pra test/fixtures', () => {});
    return;
  }
  for (const f of imgs) {
    it(`lê ${f} com texto significativo (≥50 chars + ao menos 1 número)`, async () => {
      const buf = fs.readFileSync(path.join(FIX, f));
      const text = await imageToText(buf);
      expect(text.trim().length).toBeGreaterThan(50);
      expect(/\d/.test(text)).toBe(true); // exames têm valores numéricos
    });
  }
});
