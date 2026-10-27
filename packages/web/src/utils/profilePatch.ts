import { parseHeightCm } from './height';

/**
 * Perfil (aba Dados & Saúde) — o que o "Salvar" pode mandar pro PUT /patients/:id.
 *
 * Bug 27/10/26: o save mandava o FORMULÁRIO INTEIRO e o servidor grava vazio como null.
 * Tocar "Salvar" antes do load terminar (form ainda vazio) apagava alergias, condições
 * clínicas, nascimento, sexo e altura. Agora: só sai o campo que o usuário MUDOU em
 * relação ao que veio do servidor — limpar de propósito continua possível.
 */
export interface ProfileFormValues {
  fullName: string;
  phone: string;
  clinicalProfile: string;
  allergies: string;
  gender: string;
  heightCm: string;
  ethnicity: string;
  dateOfBirth: string; // AAAA-MM-DD ou ''
}

/** Paciente da API → valores do form (mesma normalização que o form exibe). */
export const profileFormFromPatient = (p: any): ProfileFormValues => ({
  fullName: p?.fullName ?? '',
  phone: p?.phone ?? '',
  clinicalProfile: p?.clinicalProfile ?? '',
  allergies: p?.allergies ?? '',
  gender: p?.gender ?? '',
  heightCm: p?.heightCm != null ? String(p.heightCm) : '',
  ethnicity: p?.ethnicity ?? '',
  dateOfBirth: p?.dateOfBirth ? String(p.dateOfBirth).split('T')[0] : '',
});

export type ProfilePatch = Partial<Record<keyof ProfileFormValues, string | number | null>>;

/** Diferença base (servidor) × atual (form). Espaço sobrando não conta como mudança;
 *  altura compara em cm ("1,78" = "178"). Vazio vira null onde o servidor espera null. */
export const buildProfilePatch = (base: ProfileFormValues, cur: ProfileFormValues): ProfilePatch => {
  const patch: ProfilePatch = {};
  for (const k of ['fullName', 'phone', 'clinicalProfile', 'gender', 'ethnicity'] as const) {
    if (cur[k].trim() !== base[k].trim()) patch[k] = cur[k].trim();
  }
  if (cur.allergies.trim() !== base.allergies.trim()) patch.allergies = cur.allergies.trim() || null;
  const h = parseHeightCm(cur.heightCm);
  if (h !== parseHeightCm(base.heightCm)) patch.heightCm = h;
  if (cur.dateOfBirth !== base.dateOfBirth) patch.dateOfBirth = cur.dateOfBirth || null;
  return patch;
};
