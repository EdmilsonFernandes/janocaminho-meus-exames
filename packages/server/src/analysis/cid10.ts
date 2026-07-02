/**
 * cid10.ts — Mapa condição → CID-10 (sugestão, NÃO diagnóstico).
 * Usado pelo Export PES pra sugerir códigos pro prontuário eletrônico.
 * O médico confirma/edita — é só uma sugestão baseada nos achados de risco.
 */
export const CID10_MAP: Record<string, { code: string; label: string }> = {
  diabetes:        { code: 'E11.9', label: 'Diabetes mellitus tipo 2 (suspeita)' },
  prediabetes:     { code: 'R73.0', label: 'Glicemia de jejum alterada (pré-diabetes)' },
  hypertension:    { code: 'I10',   label: 'Hipertensão essencial (suspeita)' },
  high_cholesterol:{ code: 'E78.5', label: 'Hiperlipidemia não especificada' },
  cardiovascular_risk: { code: 'E78.5', label: 'Risco cardiovascular aumentado' },
  anemia:          { code: 'D50.9', label: 'Anemia ferropriva (suspeita)' },
};

/** Sugere CID-10 a partir das condições ativas do paciente. */
export function suggestCid10(conditions: string[]): { code: string; label: string; condition: string }[] {
  const out: { code: string; label: string; condition: string }[] = [];
  for (const c of conditions) {
    const cid = CID10_MAP[c];
    if (cid && !out.find((x) => x.code === cid.code)) {
      out.push({ ...cid, condition: c });
    }
  }
  return out;
}
