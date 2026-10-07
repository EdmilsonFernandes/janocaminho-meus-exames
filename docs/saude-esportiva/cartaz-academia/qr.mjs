// qr.mjs — gera o QR Code REAL (lib qrcode) e valida decodificação (jsQR).
// Regras do briefing: escuro sobre branco, margem livre preservada, decodifica p/ URL correta.
import QRCode from 'qrcode';
import fs from 'node:fs';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const URL = 'https://drexame.janocaminho.com.br/?utm_source=academia&utm_medium=qr_code&utm_campaign=saude_esportiva';
const OUT_PNG = 'assets/qr.png';
const OUT_SVG = 'assets/qr.svg';

// SVG vetorial (usado no HTML — nítido em qualquer escala) + PNG (validação/prova).
const svg = await QRCode.toString(URL, {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 4,           // quiet zone = 4 módulos (recomendação ISO)
  color: { dark: '#000000', light: '#ffffff' },
});
fs.writeFileSync(OUT_SVG, svg);

await QRCode.toFile(OUT_PNG, URL, {
  type: 'png',
  errorCorrectionLevel: 'M',
  margin: 4,
  width: 1200,
  color: { dark: '#000000', light: '#ffffff' },
});

// Validação 1: decodificar o PNG standalone
const png = PNG.sync.read(fs.readFileSync(OUT_PNG));
const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
if (!code) { console.error('FALHA: QR standalone não decodifica'); process.exit(1); }
if (code.data !== URL) {
  console.error('FALHA: QR decodifica para URL errada:\n  obtido: ' + code.data);
  process.exit(1);
}
console.log('QR OK (standalone):');
console.log('  url   :', code.data);
console.log('  png   :', `${png.width}x${png.height}px, quiet zone 4 módulos, #000 sobre #fff`);
console.log('  svg   :', OUT_SVG, `(${svg.length} bytes)`);
