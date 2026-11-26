/**
 * Nome de pessoa vindo do laudo → caixa normal. Lógica pura (sem React), testada em names.test.ts.
 *
 * Laboratório costuma imprimir o médico solicitante e o paciente em CAIXA ALTA
 * ("DANIEL CESAR SHIRANE"). Em caixa alta, num espaço curto, o nome parece um grito e corta antes:
 * nas telas de Exames virava "Dr. DANIEL CESAR SHIR…". Aqui ele vira "Daniel Cesar Shirane".
 *
 * Regras: só mexe quando o nome NÃO tem nenhuma letra minúscula (está todo em caixa alta); nomes
 * já digitados em caixa normal ficam como estão (abreviaturas tipo "Dr. José" não são alteradas).
 * Conectores (da, de, do, das, dos, e) ficam em minúscula, menos no começo do nome.
 */
const CONECTORES = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'del', 'la', 'van', 'von']);

const TEM_MINUSCULA = /[a-zà-öø-ÿ]/;

const capitalizar = (palavra: string): string => palavra.replace(/(^|[-'])(.)/g, (_m, antes: string, ch: string) => antes + ch.toUpperCase());

export function prettyName(bruto: string | null | undefined): string {
  const s = (bruto ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const letras = s.replace(/[^\p{L}]/gu, '');
  if (!letras || TEM_MINUSCULA.test(letras)) return s;
  return s
    .toLowerCase()
    .split(' ')
    .map((palavra, i) => (i > 0 && CONECTORES.has(palavra) ? palavra : capitalizar(palavra)))
    .join(' ');
}
