/**
 * Backfill — re-comprime TODAS as fotos do diretório de fotos (paciente/médico) com sharp
 * (512×512 cover, JPEG q80). Fotos antigas ficaram ~650KB (mozjpeg falhava → original); o alvo é ~50KB.
 *
 * Rodar no container:  docker exec meus-exames-app node /app/packages/server/scripts/backfill-photos.mjs
 * (PHOTOS_DIR vem do env do container = /app/data/photos). Seguro: só sobrescreve se o resultado for MENOR.
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const dir = process.env.PHOTOS_DIR || path.resolve('./data/photos');
console.log('[backfill-photos] dir:', dir);
if (!fs.existsSync(dir)) { console.log('diretório inexistente — nada a fazer.'); process.exit(0); }

let n = 0, saved = 0, skipped = 0;
for (const f of fs.readdirSync(dir)) {
  if (!/\.(jpg|jpeg|png)$/i.test(f)) continue;
  const p = path.join(dir, f);
  const before = fs.statSync(p).size;
  try {
    const buf = await sharp(p, { failOn: 'none' })
      .resize({ width: 512, height: 512, fit: 'cover', position: 'centre', withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();
    if (buf.length < before) {
      fs.writeFileSync(p, buf);
      saved += before - buf.length;
      n++;
      console.log(`  ${f}: ${(before / 1024).toFixed(0)}KB -> ${(buf.length / 1024).toFixed(0)}KB`);
    } else { skipped++; }
  } catch (e) { console.error(`  ${f}: ERRO ${e.message}`); }
}
console.log(`[backfill-photos] fim: ${n} re-comprimidas, ${skipped} já estavam ok, ${(saved / 1024 / 1024).toFixed(2)}MB liberados.`);
