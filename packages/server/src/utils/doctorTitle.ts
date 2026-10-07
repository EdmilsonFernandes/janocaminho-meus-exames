/** Título de médico na EXIBIÇÃO — o cadastro pode trazer título próprio no nome
 *  ("Dr Teste QA", "Dra. Maria") e prefixar cegamente gerava "Dr. Dr Teste QA".
 *  Mesmo strip do SportsPersonaBar (front) — fonte única de verdade no server. */

// Ordem MATTER: "dra" ANTES de "dr" (senão "dr\.?" casa o "Dr" de "Dra" e sobra "a. Nome").
const TITLE_RX = /^(dra\.?|dr\(a\)\.?|dr\.?)\s*/i;

/** Remove título duplicável do início do nome; nome todo-título vira ele mesmo. */
export function stripDoctorTitle(name: string): string {
  const clean = (name || '').replace(TITLE_RX, '').trim();
  return clean || name;
}

/** "Dr(a). Nome (CRM 00000-UF)" sem duplicar título — autoria de metas clínicas etc. */
export function doctorWithCrm(name: string, crm?: string | null): string {
  const titled = /^[Dd]ra/.test((name || '').trim()) ? 'Dra.' : 'Dr.';
  const suffix = crm ? ` (CRM ${crm})` : '';
  return `${titled} ${stripDoctorTitle(name)}${suffix}`;
}
