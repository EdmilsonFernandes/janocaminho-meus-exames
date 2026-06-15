// CLI de teste: roda a extração do Claude num PDF e imprime o JSON estruturado.
// Uso:  npx tsx scripts/test-extraction.ts <caminho/do/exame.pdf>
import 'dotenv/config';
import fs from 'fs';
import { readPdf, classifyKind } from '../src/extraction/pdfutil';
import { extractLabPanel, extractImaging } from '../src/extraction/claude';
import { mediaTypeFromRef } from '../src/utils/storage';

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error('Uso: npx tsx scripts/test-extraction.ts <caminho/do/exame.pdf>');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error('Defina ANTHROPIC_API_KEY (ou ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL) antes de rodar.');
    process.exit(1);
  }

  const buffer = fs.readFileSync(file);
  const media = mediaTypeFromRef(file);
  const { pageCount, text } = await readPdf(buffer);
  const kind = classifyKind(text);
  console.log(`arquivo: ${file}`);
  console.log(`páginas: ${pageCount} | texto: ${text.length} chars | tipo: ${kind} | media: ${media}`);
  console.log('chamando Claude (visão)...');

  const result = kind === 'IMAGING' ? await extractImaging(buffer, media) : await extractLabPanel(buffer, media);
  console.log('\n===== JSON EXTRAÍDO =====\n');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error('Falha:', e?.message ?? e);
  process.exit(1);
});
