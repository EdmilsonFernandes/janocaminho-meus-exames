/**
 * Codemod: cura o bug do borderRadius ×14 do MUI em packages/web/src.
 *
 * Causa: sx={{ borderRadius: <número> }} é multiplicado por theme.shape.borderRadius (14).
 * Ex.: 2 → 28px, 3 → 42px, 14 → 196px → "blobs" em elementos baixos.
 *
 * Mapeamento (PRESERVA a estética arredondada da marca — "cards grandes, arredondados"):
 *   >= 90        → '999px'  (pill/Avatar/Chip full-round; 99×14=1386 já cap-em-pill)
 *   >= 13        → '16px'   (lg — cards grandes)
 *   >= 2         → '12px'   (md — cards/tiles/botões/inputs; o workhorse "arredondado")
 *   >= 1 (1,1.5) → '8px'    (sm — elementos inline pequenos)
 *   < 1 (0, 0.5) → intocado (sharp intencional)
 *
 * Strings ('12px', '50%'), tokens (RADIUS.*) e objects ({xs:2}) NÃO são tocados
 * (string px não é multiplicada pelo MUI).
 *
 * Uso: node scripts/fix-radius-codemod.mjs [--write]
 * Sem --write: apenas reporta. Com --write: reescreve os arquivos.
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('packages/web/src');
const WRITE = process.argv.includes('--write');

const map = (n) => {
  if (n >= 90) return '999px';
  if (n >= 13) return '16px';
  if (n >= 2) return '12px';
  if (n >= 1) return '8px';
  return null; // 0, 0.5 → deixar intocado
};

// borderRadius: <número>  — captura só números literais.
// Lookahead exclui SÓ unidades (px/%/em/rem) p/ não tocar em '50%' nem 12px.
// NÃO exclui ',' ou '}' (senão backtrack: "99," casava como "9"). Vírgula/chove é fluxo normal de objeto.
// '12px' (string) e RADIUS.* não casam (não começam com dígito).
const RE = /(\bborderRadius:\s*)(\d+(?:\.\d+)?)(?!\s*(?:px|%|em|rem))/g;

let filesChanged = 0, replacements = 0;
const byVal = {};

const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) {
      let src = fs.readFileSync(p, 'utf8');
      let changed = false;
      src = src.replace(RE, (full, prefix, numStr) => {
        const n = parseFloat(numStr);
        const to = map(n);
        if (to == null) return full; // 0 / 0.5 → intocado
        changed = true;
        replacements++;
        byVal[`${numStr}→${to}`] = (byVal[`${numStr}→${to}`] || 0) + 1;
        return `${prefix}'${to}'`;
      });
      if (changed) {
        filesChanged++;
        if (WRITE) fs.writeFileSync(p, src);
      }
    }
  }
};

walk(SRC);

console.log(`Arquivos alterados: ${filesChanged}`);
console.log(`Substituições: ${replacements}`);
console.log(`Modo: ${WRITE ? 'ESCRITA' : 'DRY-RUN (--write p/ aplicar)'}`);
console.log('Por mapeamento:');
for (const [k, c] of Object.entries(byVal).sort()) console.log(`  ${k}: ${c}`);
