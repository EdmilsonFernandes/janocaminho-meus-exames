/**
 * `src` seguro para <Avatar>: o payload de médico às vezes traz `photoUrl`
 * como string "null" (coluna nula serializada) ou vazia — passar isso pro MUI
 * Avatar faz ele tratar como src VÁLIDO, quebrar a imagem e não cair no
 * fallback (inicial). Aqui só passa adiante URL de verdade.
 *
 * Uso: <Avatar src={safeAvatar(doctorPhotoUrl(docId), docName)} />
 */
export const safeAvatar = (photoUrl?: string | null, _name?: string | null): string | undefined => {
  const s = typeof photoUrl === 'string' ? photoUrl.trim() : '';
  if (!s) return undefined;
  if (s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return undefined;
  // Aceita http(s) e data: (QR/fotos inline); rejeita resto estranho.
  if (!/^(https?:\/\/|data:image\/)/i.test(s)) return undefined;
  return s;
};
