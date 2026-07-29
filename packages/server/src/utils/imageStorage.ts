import sharp from 'sharp';

/**
 * Comprime/redimensiona foto de avatar (paciente/médico) com sharp.
 * Padrão EdEspeto (projeto-pessoal/EdEspetoHub): resize 512×512 cover JPEG q80.
 * Reduz de ~3-5MB (bruto de celular) pra ~30-80KB → renderização instantânea.
 * Fallback gracioso: se sharp falhar, devolve o buffer original (nunca quebra o upload).
 */
export async function optimizeAvatar(buffer: Buffer): Promise<{ buffer: Buffer; contentType: string }> {
  try {
    const optimized = await sharp(buffer, { failOn: 'none' })
      .resize({ width: 512, height: 512, fit: 'cover', position: 'centre', withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true, mozjpeg: true })
      .toBuffer();
    return { buffer: optimized, contentType: 'image/jpeg' };
  } catch (e: any) {
    console.error('[optimizeAvatar] sharp falhou, usando original:', e?.message);
    return { buffer, contentType: 'image/jpeg' };
  }
}
