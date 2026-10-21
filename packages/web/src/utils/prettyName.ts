/** Title Case pra exibição de nameCanonical (ALL CAPS/underscore → legível):
 *  "ACIDO URICO" → "Acido Urico", "VITAMINA_D" → "Vitamina D".
 *  Fonte ÚNICA entre telas (Trends/Evolução) — achado do critic: o mesmo exame
 *  aparecia com 2 nomes (nameCanonical cru na Evolução × prettyName nas Tendências). */
export const prettyName = (n: string) => {
  if (!n) return '';
  const tokens = n.split(/[_\s]+/);
  return tokens.map((tok) => {
    // Siglas curtas só-dígitos/maiúsculas ficam como estão (TSH, HDL, TGO...) —
    // exceto palavras da lista, que são Termos e não siglas.
    if (tok.length <= 4 && /^[A-Z0-9]+$/.test(tok) && !['ACIDO', 'URICO', 'BILIRRUBINA', 'DIRETA', 'INDIRETA', 'TOTAL'].includes(tok)) return tok;
    return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
  }).join(' ');
};
