// Gerador da animação Lottie da celebração do 1º exame (paleta da marca — zero asset externo).
// Uso: node packages/web/scripts/gen-celebration-lottie.mjs
// Saída: packages/web/src/components/celebrationLottie.ts (embutida no bundle — sem fetch, sem import() de JSON).
//
// Design (skill motion-design): alvo emocional = alegria; herói = robô (fica por cima);
// esta animação é a camada ambiente: anel explosivo + confete radial + 3 sparkles.
// ~2,4s @30fps, loop. Cores: teal #20b2aa · teal-dark #178f89 · teal-light #5fc9c3 · cobre #d4a574 · #34d399 · branco.
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const FR = 30;
const OP = 72; // 2,4s
const W = 300, H = 300, CX = 150, CY = 150;

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
};
const PALETTE = ['#20b2aa', '#178f89', '#5fc9c3', '#d4a574', '#34d399', '#ffffff'].map(hex);

// Easing: saída suave (decelerate) — entrada de celebração nunca é brusca.
const EO = { i: { x: [0.2], y: [1] }, o: { x: [0.45], y: [0] } };   // ease-out
const EIO = { i: { x: [0.42], y: [0] }, o: { x: [0.58], y: [1] } }; // ease-in-out

const kfs = (arr) => ({ a: 1, k: arr });
const fixed = (v) => ({ a: 0, k: v });

let ind = 1;
const layer = (nm, shapes, ks, ip = 0, op = OP) => ({
  ddd: 0, ind: ind++, ty: 4, nm, sr: 1, ks, ao: 0, shapes, ip, op, st: 0, bm: 0,
});
const trShape = (items, nm) => ({
  ty: 'gr', it: [...items, { ty: 'tr', p: fixed([0, 0]), a: fixed([0, 0]), s: fixed([100, 100]), r: fixed(0), o: fixed(100) }], nm, np: items.length + 1,
});

/* ── Anéis explosivos (2, teal + cobre atrasado) ─────────────────────── */
const ringLayer = (color, delay, maxScale, width) => {
  const dur = 42;
  const t0 = delay;
  return layer(
    `ring-${delay}`,
    [trShape([
      { ty: 'el', d: 1, s: fixed([150, 150]), p: fixed([0, 0]), nm: 'el' },
      { ty: 'st', c: fixed(color), o: fixed(100), w: fixed(width), lc: 2, lj: 2, nm: 'st' },
    ], 'g')],
    {
      o: kfs([{ t: t0, s: [85], ...EO }, { t: t0 + dur, s: [0] }]),
      r: fixed(0), p: fixed([CX, CY, 0]), a: fixed([0, 0, 0]),
      s: kfs([{ t: t0, s: [12, 12, 100], ...EO }, { t: t0 + dur, s: [maxScale, maxScale, 100] }]),
    },
    t0, OP,
  );
};

/* ── Confete radial (12 papéis com arco + gravidade) ─────────────────── */
const confettiLayers = [];
const N = 12;
for (let i = 0; i < N; i++) {
  const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
  const r1 = 82 + (i % 3) * 14;
  const r2 = r1 + 34;
  const arc = (i % 2 === 0 ? 1 : -1) * 26;
  const x1 = CX + Math.cos(ang) * r1 - Math.sin(ang) * arc;
  const y1 = CY + Math.sin(ang) * r1 + Math.cos(ang) * arc;
  const x2 = CX + Math.cos(ang) * r2;
  const y2 = CY + Math.sin(ang) * r2 + 42; // gravidade
  confettiLayers.push(layer(
    `conf-${i}`,
    [trShape([
      { ty: 'rc', d: 1, s: fixed([13, 21]), p: fixed([0, 0]), r: fixed(4), nm: 'rc' },
      { ty: 'fl', c: fixed(PALETTE[i % PALETTE.length]), o: fixed(100), r: 1, nm: 'fl' },
    ], 'g')],
    {
      o: kfs([{ t: 0, s: [0], ...EO }, { t: 5, s: [100], ...EO }, { t: 46, s: [100], ...EIO }, { t: 62, s: [0] }]),
      r: kfs([{ t: 0, s: [0], ...EIO }, { t: 62, s: [i % 2 === 0 ? 320 : -320] }]),
      p: kfs([{ t: 0, s: [CX, CY, 0], ...EO }, { t: 26, s: [x1, y1, 0], ...EIO }, { t: 62, s: [x2, y2, 0] }]),
      a: fixed([0, 0, 0]),
      s: kfs([{ t: 0, s: [0, 0, 100], ...EO }, { t: 7, s: [100, 100, 100] }]),
    },
  ));
}

/* ── Sparkles (3 estrelas, pop com overshoot, escalonadas) ───────────── */
const sparkles = [[-74, -58, 3], [66, -50, 4], [4, 78, 5]].map(([x, y, ci], i) => {
  const t0 = 12 + i * 10;
  return layer(
    `spark-${i}`,
    [trShape([
      { ty: 'sr', sy: 1, d: 1, pt: fixed(5), p: fixed([0, 0]), r: fixed(0), or: fixed(13), ir: fixed(5.5), is: fixed(0), nm: 'sr' },
      { ty: 'fl', c: fixed(PALETTE[ci]), o: fixed(100), r: 1, nm: 'fl' },
    ], 'g')],
    {
      o: kfs([{ t: t0, s: [0], ...EO }, { t: t0 + 5, s: [100], ...EIO }, { t: t0 + 26, s: [0] }]),
      r: kfs([{ t: t0, s: [0], ...EIO }, { t: t0 + 30, s: [i % 2 ? 120 : -120] }]),
      p: fixed([CX + x, CY + y, 0]),
      a: fixed([0, 0, 0]),
      s: kfs([{ t: t0, s: [0, 0, 100], ...EO }, { t: t0 + 7, s: [145, 145, 100], ...EO }, { t: t0 + 14, s: [100, 100, 100] }]),
    },
    t0, t0 + 34,
  );
});

/* ── Halo suave (respiração atrás do robô, dura o loop todo) ─────────── */
const halo = layer(
  'halo',
  [trShape([
    { ty: 'el', d: 1, s: fixed([170, 170]), p: fixed([0, 0]), nm: 'el' },
    { ty: 'fl', c: fixed([0.125, 0.698, 0.667, 0.16]), o: fixed(100), r: 1, nm: 'fl' },
  ], 'g')],
  {
    o: fixed(60), r: fixed(0), p: fixed([CX, CY, 0]), a: fixed([0, 0, 0]),
    s: kfs([{ t: 0, s: [70, 70, 100], ...EIO }, { t: 36, s: [104, 104, 100], ...EIO }, { t: OP, s: [70, 70, 100] }]),
  },
);

const anim = {
  v: '5.9.0', fr: FR, ip: 0, op: OP, w: W, h: H,
  nm: 'dr-exame-celebration', ddd: 0, assets: [], markers: [],
  layers: [halo, ringLayer(PALETTE[0], 0, 168, 7), ringLayer(PALETTE[3], 10, 128, 5), ...sparkles, ...confettiLayers],
};

const out = `// GENERATED by packages/web/scripts/gen-celebration-lottie.mjs — não editar à mão.
// Animação Lottie da celebração do 1º exame (marca Dr. Exame, sem asset externo).
export const celebrationLottie: Record<string, unknown> = ${JSON.stringify(anim)};
`;
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'celebration-lottie-data.ts');
writeFileSync(dest, out);
console.log('✓', dest, `(${(out.length / 1024).toFixed(1)} KB)`);
