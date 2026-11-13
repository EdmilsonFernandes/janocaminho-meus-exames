// Gera frascos genéricos (sem marca) para os compostos que não têm foto.
// Uso: node gen-vials.cjs <pasta public/compounds> <pasta de prévia>
const sharp = require('sharp');
const path = require('path');
const [outDir, prevDir] = process.argv.slice(2);

const ITEMS = [
  { id: 'nand_npp', l1: 'NANDROLONA', l2: 'Fenilpropionato', conc: '100 mg/ml', color: '#8b5cf6', oil: '#f4e9b8' },
  { id: 'mast_prop', l1: 'DROSTANOLONA', l2: 'Propionato', conc: '100 mg/ml', color: '#ec4899', oil: '#f6ecc0' },
  { id: 'mast_enan', l1: 'DROSTANOLONA', l2: 'Enantato', conc: '200 mg/ml', color: '#db2777', oil: '#f3e6ad' },
  { id: 'bold_und', l1: 'BOLDENONA', l2: 'Undecilenato', conc: '250 mg/ml', color: '#10b981', oil: '#f1e3a2' },
  { id: 'tren_ace', l1: 'TREMBOLONA', l2: 'Acetato', conc: '100 mg/ml', color: '#f59e0b', oil: '#eccf7a' },
  { id: 'tren_enan', l1: 'TREMBOLONA', l2: 'Enantato', conc: '200 mg/ml', color: '#d97706', oil: '#e8c66c' },
];

const BG = '#e7ebee';

function vial({ l1, l2, conc, color, oil }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="glass" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#b9c4ca"/><stop offset="0.12" stop-color="#f4f7f8"/><stop offset="0.5" stop-color="#ffffff"/><stop offset="0.88" stop-color="#eef2f4"/><stop offset="1" stop-color="#aab6bd"/>
    </linearGradient>
    <linearGradient id="oil" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${oil}" stop-opacity="0.75"/><stop offset="0.5" stop-color="${oil}"/><stop offset="1" stop-color="${oil}" stop-opacity="0.7"/>
    </linearGradient>
    <linearGradient id="metal" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#8d979d"/><stop offset="0.3" stop-color="#e3e8ea"/><stop offset="0.6" stop-color="#b4bdc2"/><stop offset="1" stop-color="#7f898f"/>
    </linearGradient>
    <linearGradient id="cap" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${color}" stop-opacity="0.82"/><stop offset="0.35" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0.72"/>
    </linearGradient>
    <linearGradient id="shade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity="0.10"/><stop offset="0.2" stop-color="#000" stop-opacity="0"/><stop offset="0.8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.12"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="${BG}"/>
  <ellipse cx="256" cy="474" rx="112" ry="10" fill="#000" opacity="0.10"/>
  <!-- tampa -->
  <rect x="186" y="36" width="140" height="48" rx="10" fill="url(#cap)"/>
  <rect x="186" y="36" width="140" height="10" rx="5" fill="#fff" opacity="0.22"/>
  <!-- anel de alumínio e gargalo -->
  <rect x="194" y="84" width="124" height="30" rx="5" fill="url(#metal)"/>
  <rect x="212" y="114" width="88" height="22" fill="url(#glass)"/>
  <!-- corpo -->
  <path d="M212 136 C170 144 152 158 152 186 L152 440 Q152 468 180 468 L332 468 Q360 468 360 440 L360 186 C360 158 342 144 300 136 Z" fill="url(#glass)" stroke="#9aa6ad" stroke-width="2"/>
  <!-- líquido -->
  <path d="M156 214 L356 214 L356 438 Q356 464 330 464 L182 464 Q156 464 156 438 Z" fill="url(#oil)"/>
  <rect x="156" y="212" width="200" height="5" fill="#fff" opacity="0.5"/>
  <rect x="170" y="176" width="10" height="270" rx="5" fill="#fff" opacity="0.55"/>
  <!-- rótulo -->
  <rect x="152" y="238" width="208" height="176" fill="#ffffff"/>
  <rect x="152" y="238" width="208" height="30" fill="${color}"/>
  <rect x="152" y="396" width="208" height="18" fill="${color}" opacity="0.9"/>
  <text x="256" y="304" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${l1.length > 11 ? 23 : 27}" fill="#1a202c">${l1}</text>
  <text x="256" y="333" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="400" font-size="22" fill="#2d3748">${l2}</text>
  <rect x="196" y="348" width="120" height="32" rx="6" fill="${color}" opacity="0.14"/>
  <text x="256" y="371" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="20" fill="#1a202c">${conc}</text>
  <!-- sombreado lateral e brilho -->
  <path d="M212 136 C170 144 152 158 152 186 L152 440 Q152 468 180 468 L332 468 Q360 468 360 440 L360 186 C360 158 342 144 300 136 Z" fill="url(#shade)"/>
</svg>`;
}

function bottle() {
  const color = '#ef4444';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="body" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#d9dee2"/><stop offset="0.2" stop-color="#ffffff"/><stop offset="0.75" stop-color="#f3f5f6"/><stop offset="1" stop-color="#c5ccd1"/>
    </linearGradient>
    <linearGradient id="lid" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#c9d0d5"/><stop offset="0.3" stop-color="#ffffff"/><stop offset="1" stop-color="#b9c1c7"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="${BG}"/>
  <ellipse cx="256" cy="474" rx="128" ry="10" fill="#000" opacity="0.10"/>
  <!-- tampa de rosca -->
  <rect x="176" y="52" width="160" height="66" rx="10" fill="url(#lid)" stroke="#aab3b9" stroke-width="2"/>
  ${Array.from({ length: 13 }, (_, i) => `<rect x="${186 + i * 11.5}" y="60" width="3" height="50" fill="#9aa4ab" opacity="0.5"/>`).join('')}
  <rect x="196" y="118" width="120" height="16" fill="#dfe4e7"/>
  <!-- frasco -->
  <path d="M196 134 C160 142 140 158 140 190 L140 436 Q140 468 172 468 L340 468 Q372 468 372 436 L372 190 C372 158 352 142 316 134 Z" fill="url(#body)" stroke="#aab3b9" stroke-width="2"/>
  <rect x="158" y="176" width="10" height="270" rx="5" fill="#fff" opacity="0.6"/>
  <!-- rótulo -->
  <rect x="140" y="214" width="232" height="196" fill="#ffffff"/>
  <rect x="140" y="214" width="232" height="34" fill="${color}"/>
  <rect x="140" y="392" width="232" height="18" fill="${color}" opacity="0.9"/>
  <text x="256" y="290" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="25" fill="#1a202c">OXANDROLONA</text>
  <text x="256" y="320" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="400" font-size="21" fill="#2d3748">Comprimidos</text>
  <!-- comprimidos desenhados -->
  <ellipse cx="226" cy="358" rx="22" ry="11" fill="#fff" stroke="#c2cad0" stroke-width="2"/>
  <line x1="226" y1="348" x2="226" y2="368" stroke="#c2cad0" stroke-width="2"/>
  <ellipse cx="288" cy="358" rx="22" ry="11" fill="#fff" stroke="#c2cad0" stroke-width="2"/>
  <line x1="288" y1="348" x2="288" y2="368" stroke="#c2cad0" stroke-width="2"/>
</svg>`;
}

(async () => {
  const comps = [];
  const all = [...ITEMS.map((it) => [it.id, vial(it)]), ['oxand', bottle()]];
  for (let i = 0; i < all.length; i++) {
    const [id, svg] = all[i];
    const buf = await sharp(Buffer.from(svg), { density: 144 }).resize(256, 256).webp({ quality: 88 }).toBuffer();
    require('fs').writeFileSync(path.join(outDir, id + '.webp'), buf);
    console.log(id, buf.length);
    comps.push({ input: await sharp(buf).png().toBuffer(), left: i * 264, top: 0 });
  }
  await sharp({ create: { width: all.length * 264, height: 256, channels: 3, background: '#fff' } }).composite(comps).png().toFile(path.join(prevDir, 'frascos-gerados.png'));
})();
