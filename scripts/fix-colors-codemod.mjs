/**
 * Codemod: unifica cores off-brand → tokens de paleta (Batch C do design-system).
 *
 * Conservador (SÓ cores sem nuance semântica perdida):
 *   Vermelhos de alerta/erro (NÃO severity — #dc2626 do PRIORITY_META fica):
 *     #d32f2f, #b91c1c, #b71c1c, #e11d48 → #ef4444 (error.main)
 *   Roxos premium/IA (NÃO os variantes light/dark #4f46e5/#818cf8):
 *     #7c3aed, #7b1fa2, #8b5cf6, #6a1b63 → #6366f1 (premium.main)
 *
 * NÃO toca: teal de marca (#20b2aa/#178f89/#5fc9c3 — já = tokens), cobre, verdes
 * (success variants + WhatsApp #25D366/Google #34a853), laranjas (severity moderada
 * + warning — nuance), #dc2626 (PRIORITY_META.importante — hue de severidade).
 *
 * Uso: node scripts/fix-colors-codemod.mjs [--write]
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('packages/web/src');
const WRITE = process.argv.includes('--write');

const MAP = {
  '#d32f2f': '#ef4444', '#b91c1c': '#ef4444', '#b71c1c': '#ef4444', '#e11d48': '#ef4444',
  '#7c3aed': '#6366f1', '#7b1fa2': '#6366f1', '#8b5cf6': '#6366f1', '#6a1b63': '#6366f1',
};
// regex case-insensitive de cada chave
const RES = Object.keys(MAP).map((k) => ({ re: new RegExp(k, 'gi'), to: MAP[k], from: k }));

let filesChanged = 0, replacements = 0;
const byFrom = {};

const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) {
      let src = fs.readFileSync(p, 'utf8');
      let changed = false;
      for (const { re, to, from } of RES) {
        src = src.replace(re, (m) => { changed = true; replacements++; byFrom[from] = (byFrom[from] || 0) + 1; return to; });
      }
      if (changed) { filesChanged++; if (WRITE) fs.writeFileSync(p, src); }
    }
  }
};

walk(SRC);
console.log(`Arquivos alterados: ${filesChanged}`);
console.log(`Substituições: ${replacements}`);
console.log(`Modo: ${WRITE ? 'ESCRITA' : 'DRY-RUN (--write p/ aplicar)'}`);
for (const [k, c] of Object.entries(byFrom).sort()) console.log(`  ${k} → ${MAP[k]}: ${c}`);
