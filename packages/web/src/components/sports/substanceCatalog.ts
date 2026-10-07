/**
 * Catálogo de substâncias declaráveis — AUTOCOMPLETE de nomes (não catálogo de venda).
 *
 * Fonte: farmacologia legítima — os mesmos agentes monitorados na literatura de
 * harm-reduction (HAARLEM/JCEM 2026), bulas/registros ANVISA e classe terapêutica.
 * NÃO é pesquisa em mercado ilegal e NÃO contém "doses recomendadas": quando o nome
 * comercial embute a apresentação (ex.: "Durateston 250mg"), o número é o NOME do
 * produto, não sugestão. Campo dose continua texto livre = DECLARAÇÃO do usuário.
 *
 * `unitHint` orienta o FORMATO (unidade) do campo dose, não a quantidade.
 */
export type SubstanceClass = 'Hormônio' | 'Suplemento' | 'Medicação' | 'Outro';

export interface CatalogItem { name: string; aliases?: string[]; cls: SubstanceClass; unitHint: string }

export const SUBSTANCE_CATALOG: CatalogItem[] = [
  // ── Esteroides anabolizantes (androgênios) ──
  { name: 'Testosterona (enantato)', aliases: ['Deposteron', 'Testenat'], cls: 'Hormônio', unitHint: 'mg/semana' },
  { name: 'Testosterona (cypionato)', aliases: ['Depo-Testosterona', 'Cipionato'], cls: 'Hormônio', unitHint: 'mg/semana' },
  { name: 'Testosterona (propionato)', aliases: ['Propionato'], cls: 'Hormônio', unitHint: 'mg/semana' },
  { name: 'Testosterona (undecilato)', aliases: ['Nebido'], cls: 'Hormônio', unitHint: 'mg/mês' },
  { name: 'Testosterona (gel)', aliases: ['Androgel', 'Testavana'], cls: 'Hormônio', unitHint: 'g/dia' },
  { name: 'Durateston', aliases: ['Sustanon', 'fourtest'], cls: 'Hormônio', unitHint: 'mg/semana' },
  { name: 'Stanozolol', aliases: ['Winstrol', 'Estanozolol'], cls: 'Hormônio', unitHint: 'mg/dia' },
  { name: 'Oxandrolona', aliases: ['Anavar', 'Lipidex'], cls: 'Hormônio', unitHint: 'mg/dia' },
  { name: 'Nandrolona (decanoato)', aliases: ['Deca-Durabolin', 'Deca'], cls: 'Hormônio', unitHint: 'mg/semana' },
  { name: 'Trembolona', aliases: ['Tren', 'Trenbolona'], cls: 'Hormônio', unitHint: 'mg/semana' },
  { name: 'Drostanolona', aliases: ['Masteron', 'Drostanolona propionato'], cls: 'Hormônio', unitHint: 'mg/semana' },
  { name: 'Oximetolona', aliases: ['Hemogenin', 'Anadrol'], cls: 'Hormônio', unitHint: 'mg/dia' },
  { name: 'Metenolona', aliases: ['Primobolan', 'Primo'], cls: 'Hormônio', unitHint: 'mg/semana' },
  { name: 'Boldenona', aliases: ['Equipoise', 'Undecilenato'], cls: 'Hormônio', unitHint: 'mg/semana' },
  { name: 'Mesterolona', aliases: ['Proviron'], cls: 'Hormônio', unitHint: 'mg/dia' },
  { name: 'Metandrostenolona', aliases: ['Dianabol', 'Dianabol'], cls: 'Hormônio', unitHint: 'mg/dia' },
  { name: 'DHT (gel)', aliases: ['Andractim'], cls: 'Hormônio', unitHint: 'g/dia' },

  // ── Hormônio do crescimento e peptídeos ──
  { name: 'hGH (somatropina)', aliases: ['Genotropin', 'Norditropin', 'Jintropin', 'Hormônio do crescimento', 'GH'], cls: 'Hormônio', unitHint: 'UI/dia' },
  { name: 'IGF-1 LR3', aliases: ['IGF'], cls: 'Hormônio', unitHint: 'mcg/dia' },
  { name: 'CJC-1295', cls: 'Hormônio', unitHint: 'mcg/semana' },
  { name: 'Ipamorelina', cls: 'Hormônio', unitHint: 'mcg/dia' },
  { name: 'GHRP-2', aliases: ['GHRP'], cls: 'Hormônio', unitHint: 'mcg/dia' },
  { name: 'GHRP-6', cls: 'Hormônio', unitHint: 'mcg/dia' },
  { name: 'Sermorelina', cls: 'Hormônio', unitHint: 'mcg/dia' },
  { name: 'Insulina (uso declarado)', aliases: ['Insulina'], cls: 'Hormônio', unitHint: 'UI/dia' },
  { name: 'BPC-157', cls: 'Outro', unitHint: 'mcg/dia' },
  { name: 'TB-500', aliases: ['Timosina beta 4'], cls: 'Outro', unitHint: 'mg/semana' },

  // ── GLP-1 / emagrecimento (uso declarado) ──
  { name: 'Semaglutida', aliases: ['Ozempic', 'Wegovy'], cls: 'Medicação', unitHint: 'mg/semana' },
  { name: 'Tirzepatida', aliases: ['Mounjaro', 'Zepbound'], cls: 'Medicação', unitHint: 'mg/semana' },
  { name: 'Retatrutida', aliases: ['triple G'], cls: 'Medicação', unitHint: 'mg/semana' },
  { name: 'Liraglutida', aliases: ['Saxenda', 'Victoza'], cls: 'Medicação', unitHint: 'mg/dia' },
  { name: 'Dulaglutida', aliases: ['Trulicity'], cls: 'Medicação', unitHint: 'mg/semana' },

  // ── Antiestrogênios / moduladores (uso declarado) ──
  { name: 'Tamoxifeno', aliases: ['Nolvadex'], cls: 'Medicação', unitHint: 'mg/dia' },
  { name: 'Clomifeno', aliases: ['Clomid', 'Indux'], cls: 'Medicação', unitHint: 'mg/dia' },
  { name: 'Anastrozol', aliases: ['Arimidex'], cls: 'Medicação', unitHint: 'mg/semana' },
  { name: 'Exemestano', aliases: ['Aromasin'], cls: 'Medicação', unitHint: 'mg/dia' },

  // ── Termogênicos/estimulantes (uso declarado) ──
  { name: 'Clenbuterol', aliases: ['Clen'], cls: 'Medicação', unitHint: 'mcg/dia' },
  { name: 'ECA (efedrina+cafeína+aspirina)', aliases: ['Efedrina'], cls: 'Outro', unitHint: 'mg/dia' },

  // ── Suplementos ──
  { name: 'Creatina (monohidratada)', aliases: ['Creatina'], cls: 'Suplemento', unitHint: 'g/dia' },
  { name: 'Whey protein', aliases: ['Whey'], cls: 'Suplemento', unitHint: 'g/dia' },
  { name: 'Pré-treino', aliases: ['Pré workout'], cls: 'Suplemento', unitHint: 'dose/dia' },
  { name: 'Beta-alanina', cls: 'Suplemento', unitHint: 'g/dia' },
  { name: 'Cafeína (suplemento)', cls: 'Suplemento', unitHint: 'mg/dia' },
  { name: 'BCAA / EAA', aliases: ['BCAA'], cls: 'Suplemento', unitHint: 'g/dia' },
  { name: 'DHEA', cls: 'Suplemento', unitHint: 'mg/dia' },
  { name: 'Termogênico', cls: 'Suplemento', unitHint: 'dose/dia' },
  { name: 'Ômega-3', cls: 'Suplemento', unitHint: 'g/dia' },
  { name: 'Vitamina D', cls: 'Suplemento', unitHint: 'UI/dia' },
  { name: 'ZMA', cls: 'Suplemento', unitHint: 'dose/dia' },
  { name: 'Tribulus terrestris', cls: 'Suplemento', unitHint: 'mg/dia' },
];

/** Busca case/acento-insensível por nome OU alias — devolve itens p/ autocomplete. */
export function searchSubstances(q: string, limit = 8): CatalogItem[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const nq = norm(q);
  if (!nq) {
    // vazio: amostra representativa (1 por classe nos mais comuns)
    const seed = ['Testosterona (enantato)', 'Durateston', 'hGH (somatropina)', 'Tirzepatida', 'Creatina (monohidratada)', 'Stanozolol', 'Semaglutida', 'Whey protein'];
    return seed.map((s) => SUBSTANCE_CATALOG.find((c) => c.name === s)!).filter(Boolean);
  }
  const scored = SUBSTANCE_CATALOG
    .map((c) => {
      const nn = norm(c.name);
      const na = (c.aliases ?? []).map(norm);
      let score = 0;
      if (nn.startsWith(nq)) score = 3;
      else if (nn.includes(nq)) score = 2;
      else if (na.some((a) => a.startsWith(nq) || a.includes(nq))) score = 1;
      return { c, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((s) => s.c);
}
