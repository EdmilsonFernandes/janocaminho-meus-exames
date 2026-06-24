/** Contratos da busca/compartilhamento de médico (TS = autocompletar + refatoração segura). */

export type DoctorLookupSource = 'base' | 'cfm' | 'manual';

/** Médico retornado pela busca (GET /api/doctor/lookup). */
export interface DoctorLookupDoctor {
  name: string | null;
  specialty: string | null;
  crm: string; // normalizado "12345-SP"
  uf: string;
  email?: string | null;
  situation?: string;
}

/** Resposta unificada da busca: nosso banco → CFM → manual. */
export interface DoctorLookupResult {
  source: DoctorLookupSource;
  doctor: DoctorLookupDoctor | null;
}

/** Médico numa lista de compartilhamentos (GET /api/doctor-shares). */
export interface SharedDoctor {
  id: string;
  name: string;
  crm: string;
  specialty?: string | null;
  email?: string | null;
  photoUrl?: string | null;
}
