import sharp from 'sharp';

/**
 * Comprime/redimensiona foto de avatar (paciente/médico) com sharp.
 * Padrão EdEspeto (projeto-pessoal/EdEspetoHub): resize 512×512 cover JPEG q80.
 * Reduz de ~3-5MB (bruto de celular) pra ~30-80KB → renderização instantânea.
 * Fallback gracioso: se sharp falhar, devolve o buffer original (nunca quebra o upload).
 */
export async function optimizeAvatar(buffer: Buffer): Promise<{ buffer: Buffer; contentType: string }> {
  try {
    // Strix 19/11 (CVE-2026-33327): failOn 'none' desarmava a proteção de rejeitar
    // imagens malformadas — com sharp 0.32.6 era caminho direto pra corrupção de memória.
    // Padrão do sharp 0.35.x rejeita cedo; mantemos explícito p/ clareza.
    const optimized = await sharp(buffer, { failOn: 'warning' })
      .rotate() // aplica a orientação EXIF ANTES de tudo — sem isso fotos de celular
                // saem tortas/de cabeça pra baixo (o .jpeg() final stripa o EXIF,
                // então os pixels precisam já estar girados). Bug dono 18/10.
      .resize({ width: 512, height: 512, fit: 'cover', position: 'centre', withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();
    return { buffer: optimized, contentType: 'image/jpeg' };
  } catch (e: any) {
    console.error('[optimizeAvatar] sharp falhou, usando original:', e?.message);
    return { buffer, contentType: 'image/jpeg' };
  }
}
