// Gera assets visuais do canal YouTube @janocaminho (guarda-chuva Dr. Exame + Jano Caminho).
// Identidade Dr. Exame: teal #20b2aa / cobre #d4a574 / ink #0f3d3a. Logo oficial = app-icon.png.
// Logo é composto por overlay (sharp.composite) — robusto, não depende de data-URI no SVG.
// Uso: node scripts/gen-marketing-assets.mjs
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';

const OUT = 'marketing/assets';
mkdirSync(OUT, { recursive: true });

const TEAL = '#20b2aa', TEAL_DARK = '#178f89', TEAL_LIGHT = '#5fc9c3';
const COBRE = '#d4a574', COBRE_DARK = '#b8895a', INK = '#0f3d3a', PAPER = '#ffffff';
const FONT = "'Arial','Helvetica',sans-serif";

const LOGO = 'packages/web/public/app-icon.png';
// buffers de logo nos tamanhos necessários
const logo = (s) => sharp(LOGO).resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

// ---------- 1. MARCA-D'ÁGUA 150x150 ----------
await sharp(LOGO)
  .resize(150, 150, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png().toFile(`${OUT}/marca-dagua-150.png`);

// ---------- 2. BANNER do canal 2560x1440 ----------
const bannerSvg = `
<svg width="2560" height="1440" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${TEAL_DARK}"/><stop offset="100%" stop-color="${TEAL}"/>
    </linearGradient>
    <linearGradient id="cobre" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${COBRE}"/><stop offset="1" stop-color="${COBRE_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="2560" height="1440" fill="url(#bg)"/>
  <circle cx="2180" cy="240" r="340" fill="${TEAL_LIGHT}" opacity="0.16"/>
  <circle cx="270" cy="1300" r="400" fill="${TEAL_LIGHT}" opacity="0.12"/>
  <circle cx="1500" cy="200" r="120" fill="${COBRE}" opacity="0.18"/>
  <text x="180" y="540" font-family="${FONT}" font-size="196" font-weight="800" fill="${PAPER}" letter-spacing="-3">Jano Caminho</text>
  <text x="188" y="640" font-family="${FONT}" font-size="56" font-weight="500" fill="${COBRE}">Tecnologia que facilita seu dia — da fome à saúde</text>
  <rect x="180" y="820" width="1080" height="380" rx="36" fill="${PAPER}" opacity="0.96"/>
  <text x="540" y="985" font-family="${FONT}" font-size="68" font-weight="800" fill="${INK}">Dr. Exame</text>
  <text x="540" y="1060" font-family="${FONT}" font-size="42" font-weight="700" fill="${TEAL_DARK}">Seus exames com IA</text>
  <text x="540" y="1120" font-family="${FONT}" font-size="32" fill="#4a5b5a">Entenda cada valor do seu exame</text>
  <rect x="1300" y="820" width="1080" height="380" rx="36" fill="url(#cobre)" opacity="0.96"/>
  <g transform="translate(1360,895)" fill="none" stroke="${PAPER}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 60 h160 l-14 150 a16 16 0 0 1 -16 15 h-100 a16 16 0 0 1 -16 -15 z"/>
    <path d="M60 60 a50 50 0 0 1 100 0"/>
  </g>
  <text x="1620" y="985" font-family="${FONT}" font-size="68" font-weight="800" fill="${PAPER}">Jano Caminho</text>
  <text x="1620" y="1060" font-family="${FONT}" font-size="42" font-weight="700" fill="#fff3e6">Pedidos online e delivery</text>
  <text x="1620" y="1120" font-family="${FONT}" font-size="32" fill="#fff3e6">Restaurantes, mercados e farmácias</text>
  <text x="180" y="1360" font-family="${FONT}" font-size="46" font-weight="600" fill="#e8f7f5">youtube.com/@janocaminho</text>
</svg>`;
await sharp(Buffer.from(bannerSvg)).png().toBuffer().then(async (fundo) => {
  await sharp(fundo).composite([
    { input: await logo(200), top: 150, left: 180 },   // canto superior esquerdo
    { input: await logo(240), top: 890, left: 230 },    // bloco Dr. Exame
  ]).png().toFile(`${OUT}/banner-canal-2560x1440.png`);
});

// ---------- 3. THUMB do 1º vídeo 1280x720 ----------
const thumbSvg = `
<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${TEAL_DARK}"/><stop offset="1" stop-color="${TEAL}"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg2)"/>
  <circle cx="1110" cy="130" r="190" fill="${TEAL_LIGHT}" opacity="0.16"/>
  <circle cx="1180" cy="640" r="130" fill="${COBRE}" opacity="0.16"/>
  <text x="78" y="350" font-family="${FONT}" font-size="116" font-weight="800" fill="${PAPER}">Seu exame,</text>
  <text x="78" y="468" font-family="${FONT}" font-size="116" font-weight="800" fill="${COBRE}">explicado.</text>
  <text x="82" y="552" font-family="${FONT}" font-size="36" fill="#e8f7f5">Envie o PDF e a IA explica cada valor — em segundos.</text>
  <text x="82" y="648" font-family="${FONT}" font-size="46" font-weight="800" fill="${PAPER}" letter-spacing="2">DR. EXAME</text>
</svg>`;
await sharp(Buffer.from(thumbSvg)).png().toBuffer().then(async (fundo) => {
  await sharp(fundo).composite([
    { input: await logo(150), top: 80, left: 80 },
  ]).png().toFile(`${OUT}/thumb-video-1280x720.png`);
});

// ---------- confirmação ----------
for (const f of ['marca-dagua-150.png', 'banner-canal-2560x1440.png', 'thumb-video-1280x720.png']) {
  const m = await sharp(`${OUT}/${f}`).metadata();
  console.log(`${f}: ${m.width}x${m.height} (${m.format})`);
}
console.log('Assets gerados em marketing/assets/');
