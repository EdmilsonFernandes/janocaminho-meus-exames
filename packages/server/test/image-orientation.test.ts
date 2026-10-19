import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { optimizeAvatar } from '../src/utils/imageStorage';

/**
 * Regressão do "foto de perfil de cabeça pra baixo" (bug dono 18/10/26):
 * sharp só aplica a orientação EXIF se .rotate() for chamado — sem isso o
 * .jpeg() final stripa o metadado e os pixels ficam na orientação do sensor.
 *
 * Prova por pixel: imagem 16×8 com METADE esquerda azul e direita vermelha,
 * EXIF orientation=3 (180°). Com rotate aplicado, a saída tem esquerda VERMELHA.
 * (Blocos grandes — JPEG amassa cores em imagens de 1-2px; 8px de margem segura.)
 */
const BLUE = [40, 90, 220];
const RED = [220, 60, 50];
const W = 16, H = 8;

async function halfHalfImage(orientation?: 3): Promise<Buffer> {
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = x < W / 2 ? BLUE : RED;
      const i = (y * W + x) * 3;
      raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2];
    }
  }
  let img = sharp(raw, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 90 });
  if (orientation) img = img.withMetadata({ orientation });
  return img.toBuffer();
}

const pixelAt = async (buf: Buffer, x: number, y: number): Promise<number[]> => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
};
// Asserção RELATIVA (R vs B), não cor absoluta: o encoder do libvips varia entre
// plataformas (Windows local × Linux do CI) e quebrou a comparação absoluta —
// "qual metade é mais vermelha" é imune a isso (contraste ~170px de canal).
const redder = (px: number[]) => px[0] - px[2] > 30;
const bluer = (px: number[]) => px[2] - px[0] > 30;

describe('optimizeAvatar — orientação EXIF', () => {
  it('orientation=3 (180°): metades trocam de lado (rotate aplicado antes do resize)', async () => {
    const out = await optimizeAvatar(await halfHalfImage(3));
    // 180°: o que era direita (vermelho) vira esquerda
    expect(redder(await pixelAt(out.buffer, 2, 4))).toBe(true);
    expect(bluer(await pixelAt(out.buffer, W - 3, 4))).toBe(true);
  });

  it('sem EXIF (normal): não inventa rotação', async () => {
    const out = await optimizeAvatar(await halfHalfImage());
    expect(bluer(await pixelAt(out.buffer, 2, 4))).toBe(true);
    expect(redder(await pixelAt(out.buffer, W - 3, 4))).toBe(true);
  });
});
