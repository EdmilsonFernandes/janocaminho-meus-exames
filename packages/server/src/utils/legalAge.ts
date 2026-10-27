/**
 * Maioridade (18 anos completos) pela data de nascimento — aniversário de CALENDÁRIO.
 * O `ageMonths` da análise usa meses de 30 dias e erra a virada exata dos 18.
 * Nascimento é gravado como meia-noite UTC → a comparação é em UTC.
 */
export const LEGAL_AGE = 18;

export function ageYearsAt(dob: Date | null | undefined, at: Date = new Date()): number | null {
  if (!dob || Number.isNaN(dob.getTime())) return null;
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday = at.getUTCMonth() < dob.getUTCMonth()
    || (at.getUTCMonth() === dob.getUTCMonth() && at.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** true = menor confirmado · false = maior · null = sem data de nascimento (não dá pra afirmar). */
export function isMinorAt(dob: Date | null | undefined, at: Date = new Date()): boolean | null {
  const age = ageYearsAt(dob, at);
  return age == null ? null : age < LEGAL_AGE;
}
