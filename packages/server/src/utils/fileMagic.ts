/**
 * Sniff do tipo REAL do arquivo pelos magic bytes (assinatura nos primeiros bytes).
 *
 * Não confia no `Content-Type`/`mimetype` que o cliente envia — esse header é trivialmente
 * falsificável (qualquer um manda um .exe/.html/.svg com `Content-Type: application/pdf`).
 * Validar os magic bytes garante que o arquivo É o que diz ser antes de salvar/servir.
 */

const SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] }, // JPEG SOI
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }, // \x89PNG...
];

export const ALLOWED_UPLOAD_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

/** Detecta o MIME real do buffer (ou null se não casa nenhuma assinatura conhecida). */
export function detectMime(buf: Buffer): string | null {
  if (!buf || buf.length < 4) return null;
  for (const s of SIGNATURES) {
    if (s.bytes.every((b, i) => buf[i] === b)) return s.mime;
  }
  return null;
}

/** True se o buffer é um PDF/JPEG/PNG válido (pelo conteúdo, não pelo header do cliente). */
export function isAllowedUpload(buf: Buffer): boolean {
  const m = detectMime(buf);
  return !!m && ALLOWED_UPLOAD_MIMES.has(m);
}
