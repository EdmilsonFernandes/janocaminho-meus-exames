/** CID-10 — busca das 12.451 subcategorias oficiais (DATASUS, rev. 2008), vendorizadas
 *  em ../data/cid10.json (fonte: www2.datasus.gov.br/cid10/V2008/downloads/CID10CSV.zip,
 *  conversão latin1→utf8; código formatado com ponto: E119 → E11.9).
 *  Registro do diagnóstico estruturado na teleconsulta (P0.3 do estudo 24/10) — o médico
 *  seleciona via autocomplete; o código É validado aqui (dado estruturado confiável). */
import RAW from '../data/cid10.json';

export interface Cid10Entry { c: string; d: string }
const ALL = RAW as Cid10Entry[];

/** Stripa acento + lowercase (regra normalizeKey da casa): busca SEM acento casa
 *  "hipertensao" com "Hipertensão" — o médico digita como pensar. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Índice pré-computado (12k × 2 strings — caro 1x no boot, busca O(n) simples e rápida).
const INDEX = ALL.map((e) => ({ ...e, nc: norm(e.c), nd: norm(e.d) }));
const BY_CODE = new Map(ALL.map((e) => [e.c, e]));

/** Busca por código (começa-com, ex.: "E11") ou descrição (começa-com > contém).
 *  Ordena por código — hierarquia natural do CID (E11.0, E11.1, …). */
export function searchCid10(q: string, limit = 12): Cid10Entry[] {
  const nq = norm(q);
  if (!nq || nq.length < 2) return [];
  const scored: { e: Cid10Entry; s: number }[] = [];
  for (const it of INDEX) {
    let s = 0;
    if (it.nc.startsWith(nq)) s = 3; // "e11" → E11.0… (código)
    else if (it.nd.startsWith(nq)) s = 2; // "diabetes…" no início
    else if (it.nd.includes(nq)) s = 1; // contém (ex.: "mellitus")
    else continue;
    scored.push({ e: { c: it.c, d: it.d }, s });
  }
  return scored
    .sort((a, b) => b.s - a.s || (a.e.c < b.e.c ? -1 : 1))
    .slice(0, limit)
    .map((x) => x.e);
}

/** Código exato (formato com ponto: 'E11.9'). null = não existe na base. */
export function getCid10(code: string): Cid10Entry | null {
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}
