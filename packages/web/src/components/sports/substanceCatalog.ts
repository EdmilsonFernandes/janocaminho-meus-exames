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
 *
 * `anvisa` (P0.2): classe da lista de controle da Anvisa (C5 = esteroides anabolizantes
 * e moduladores; C1 = GH/somatropina) — alimenta um BADGE educativo na UI: informativo,
 * SEM julgamento e SEM número de resolução (conferir DOU/AnvisaLegis antes de citar RDC
 * em texto público — blueprint AAS §9 P2). Sem classificação → sem campo.
 *
 * `impacto` (E5 §2) = O QUE ESPERAR NOS EXAMES — educativo-descritivo, baseado no
 * monitoramento da literatura (HAARLEM/JCEM) e em diretrizes. PROIBIDO por contrato:
 * doses, "range seguro", recomendação de uso/ajuste. Sem texto validado → sem campo.
 */
export type SubstanceClass = 'Hormônio' | 'Suplemento' | 'Medicação' | 'Outro';

/** Via/apresentação p/ ilustração neutra (SubstanceArt) — nunca marca real. */
export type SubstanceArtKind = 'ampola' | 'frasco' | 'comprimido' | 'caneta' | 'gel' | 'seringa';

export interface CatalogItem {
  name: string;
  aliases?: string[];
  cls: SubstanceClass;
  unitHint: string;
  impacto?: string;
  anvisa?: 'C5' | 'C1';
  /** Ilustração por via (redesign hormonal v2). Sem valor → artFor() deriva por classe. */
  art?: SubstanceArtKind;
  /** Entre as mais buscadas → alimenta os chips 1-tap do card de contexto. */
  popular?: boolean;
}

/** Testosterona exógena (ésteres, Durateston, gel) — texto APROVADO do brief (§2). */
const IMPACTO_TESTOSTERONA = 'Testosterona total acima da referência é esperada durante uso; LH/FSH suprimidos (feedback); hematócrito tende a subir — acompanhar.';
/** AAS injetáveis não-testosterona (família androgênica — queda de HDL descrita). */
const IMPACTO_ANDROGENO = 'Impacto acentuado no HDL (queda) — acompanhar perfil lipídico; o eixo LH/FSH tende à supressão.';
/** AAS orais 17aa (alquilados) — lipídios + estresse hepático possível. */
const IMPACTO_ORAL_17AA = 'Impacto acentuado no HDL (queda) — acompanhar perfil lipídico; pela via oral, estresse hepático (TGO/TGP) é possível.';
/** Eixo do GH (hGH e secretagogos). */
const IMPACTO_EIXO_GH = 'Pode reduzir sensibilidade à insulina; IGF-1 elevado é esperado.';
/** GLP-1 e análogos (uso declarado). */
const IMPACTO_GLP1 = 'Perda de peso e massa magra é possível — proteína e força importam; náusea pode alterar alimentação pré-coleta.';
/** Antiestrogênios / moduladores do eixo. */
const IMPACTO_ANTIESTROGENO = 'Alteram eixo hormonal (LH/FSH, estradiol) — interpretação depende do momento de uso.';
/** Estimulantes/termogênicos. */
const IMPACTO_ESTIMULANTE = 'Taquicardia e queda de potássio possíveis — eletrocardiograma e eletrólitos merecem atenção médica.';

export const SUBSTANCE_CATALOG: CatalogItem[] = [
  // ── Esteroides anabolizantes (androgênios) — lista C5 ──
  { name: 'Testosterona (enantato)', aliases: ['Deposteron', 'Testenat'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_TESTOSTERONA, anvisa: 'C5', art: 'frasco', popular: true },
  { name: 'Testosterona (cypionato)', aliases: ['Depo-Testosterona', 'Cipionato'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_TESTOSTERONA, anvisa: 'C5', art: 'frasco', popular: true },
  { name: 'Testosterona (propionato)', aliases: ['Propionato'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_TESTOSTERONA, anvisa: 'C5', art: 'frasco' },
  { name: 'Testosterona (undecilato)', aliases: ['Nebido'], cls: 'Hormônio', unitHint: 'mg/mês', impacto: IMPACTO_TESTOSTERONA, anvisa: 'C5', art: 'frasco' },
  { name: 'Testosterona (gel)', aliases: ['Androgel', 'Testavana'], cls: 'Hormônio', unitHint: 'g/dia', impacto: IMPACTO_TESTOSTERONA, anvisa: 'C5', art: 'gel' },
  { name: 'Durateston', aliases: ['Sustanon', 'fourtest'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_TESTOSTERONA, anvisa: 'C5', art: 'frasco', popular: true },
  { name: 'Stanozolol', aliases: ['Winstrol', 'Estanozolol', 'Stano'], cls: 'Hormônio', unitHint: 'mg/dia', impacto: IMPACTO_ORAL_17AA, anvisa: 'C5', art: 'comprimido', popular: true },
  { name: 'Oxandrolona', aliases: ['Anavar', 'Lipidex'], cls: 'Hormônio', unitHint: 'mg/dia', impacto: IMPACTO_ORAL_17AA, anvisa: 'C5', art: 'comprimido', popular: true },
  { name: 'Nandrolona (decanoato)', aliases: ['Deca-Durabolin', 'Deca'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_ANDROGENO, anvisa: 'C5', art: 'frasco', popular: true },
  { name: 'Trembolona', aliases: ['Tren', 'Trenbolona', 'trembo', 'fina'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: 'HDL reduzido e possível aumento da pressão — acompanhamento cardiovascular merece atenção.', anvisa: 'C5', art: 'ampola', popular: true },
  { name: 'Trembolona (acetato)', aliases: ['trembo', 'fina', 'trena', 'acetato'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: 'HDL reduzido e possível aumento da pressão — acompanhamento cardiovascular merece atenção.', anvisa: 'C5', art: 'ampola' },
  { name: 'Drostanolona', aliases: ['Masteron', 'Drostanolona propionato'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_ANDROGENO, anvisa: 'C5', art: 'ampola', popular: true },
  { name: 'Oximetolona', aliases: ['Hemogenin', 'Anadrol'], cls: 'Hormônio', unitHint: 'mg/dia', impacto: IMPACTO_ORAL_17AA, anvisa: 'C5', art: 'comprimido' },
  { name: 'Metenolona', aliases: ['Primobolan', 'Primo'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_ANDROGENO, anvisa: 'C5', art: 'frasco' },
  { name: 'Boldenona', aliases: ['Equipoise', 'EQ', 'undecilenato'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_ANDROGENO, anvisa: 'C5', art: 'frasco' },
  { name: 'Mesterolona', aliases: ['Proviron'], cls: 'Hormônio', unitHint: 'mg/dia', impacto: IMPACTO_ANDROGENO, anvisa: 'C5', art: 'comprimido' },
  { name: 'Metandrostenolona', aliases: ['Dianabol', 'DBol', 'metandienona'], cls: 'Hormônio', unitHint: 'mg/dia', impacto: IMPACTO_ORAL_17AA, anvisa: 'C5', art: 'comprimido' },
  { name: 'DHT (gel)', aliases: ['Andractim'], cls: 'Hormônio', unitHint: 'g/dia', impacto: IMPACTO_ANDROGENO, anvisa: 'C5', art: 'gel', popular: true },

  // ── Hormônio do crescimento e peptídeos (GH = lista C1) ──
  { name: 'hGH (somatropina)', aliases: ['Genotropin', 'Norditropin', 'Jintropin', 'Hormônio do crescimento', 'GH'], cls: 'Hormônio', unitHint: 'UI/dia', impacto: IMPACTO_EIXO_GH, anvisa: 'C1', art: 'frasco', popular: true },
  { name: 'IGF-1 LR3', aliases: ['IGF'], cls: 'Hormônio', unitHint: 'mcg/dia', impacto: IMPACTO_EIXO_GH, art: 'frasco' },
  { name: 'CJC-1295', cls: 'Hormônio', unitHint: 'mcg/semana', impacto: IMPACTO_EIXO_GH, art: 'frasco' },
  { name: 'Ipamorelina', cls: 'Hormônio', unitHint: 'mcg/dia', impacto: IMPACTO_EIXO_GH, art: 'frasco' },
  { name: 'GHRP-2', aliases: ['GHRP'], cls: 'Hormônio', unitHint: 'mcg/dia', impacto: IMPACTO_EIXO_GH, art: 'frasco' },
  { name: 'GHRP-6', cls: 'Hormônio', unitHint: 'mcg/dia', impacto: IMPACTO_EIXO_GH, art: 'frasco' },
  { name: 'Sermorelina', cls: 'Hormônio', unitHint: 'mcg/dia', impacto: IMPACTO_EIXO_GH, art: 'frasco' },
  { name: 'Insulina (uso declarado)', aliases: ['Insulina'], cls: 'Hormônio', unitHint: 'UI/dia', impacto: 'A glicemia da coleta depende do horário da dose — vale informar o laboratório.', art: 'caneta' },
  { name: 'BPC-157', cls: 'Outro', unitHint: 'mcg/dia', art: 'frasco' },
  { name: 'TB-500', aliases: ['Timosina beta 4'], cls: 'Outro', unitHint: 'mg/semana', art: 'frasco' },

  // ── GLP-1 / emagrecimento (uso declarado) ──
  { name: 'Semaglutida', aliases: ['Ozempic', 'Wegovy'], cls: 'Medicação', unitHint: 'mg/semana', impacto: IMPACTO_GLP1, art: 'caneta', popular: true },
  { name: 'Tirzepatida', aliases: ['Mounjaro', 'Zepbound'], cls: 'Medicação', unitHint: 'mg/semana', impacto: IMPACTO_GLP1, art: 'caneta' },
  { name: 'Retatrutida', aliases: ['triple G'], cls: 'Medicação', unitHint: 'mg/semana', impacto: IMPACTO_GLP1, art: 'caneta' },
  { name: 'Liraglutida', aliases: ['Saxenda', 'Victoza'], cls: 'Medicação', unitHint: 'mg/dia', impacto: IMPACTO_GLP1, art: 'caneta' },
  { name: 'Dulaglutida', aliases: ['Trulicity'], cls: 'Medicação', unitHint: 'mg/semana', impacto: IMPACTO_GLP1, art: 'caneta' },

  // ── Antiestrogênios / moduladores (uso declarado) — SERMs/AIs: lista C5 ──
  { name: 'Tamoxifeno', aliases: ['Nolvadex'], cls: 'Medicação', unitHint: 'mg/dia', impacto: IMPACTO_ANTIESTROGENO, anvisa: 'C5', art: 'comprimido' },
  { name: 'Clomifeno', aliases: ['Clomid', 'Indux'], cls: 'Medicação', unitHint: 'mg/dia', impacto: IMPACTO_ANTIESTROGENO, anvisa: 'C5', art: 'comprimido' },
  { name: 'Anastrozol', aliases: ['Arimidex'], cls: 'Medicação', unitHint: 'mg/semana', impacto: IMPACTO_ANTIESTROGENO, anvisa: 'C5', art: 'comprimido' },
  { name: 'Exemestano', aliases: ['Aromasin'], cls: 'Medicação', unitHint: 'mg/dia', impacto: IMPACTO_ANTIESTROGENO, anvisa: 'C5', art: 'comprimido' },

  // ── Termogênicos/estimulantes (uso declarado) ──
  { name: 'Clenbuterol', aliases: ['Clen'], cls: 'Medicação', unitHint: 'mcg/dia', impacto: IMPACTO_ESTIMULANTE, art: 'comprimido' },
  { name: 'ECA (efedrina+cafeína+aspirina)', aliases: ['Efedrina'], cls: 'Outro', unitHint: 'mg/dia', impacto: IMPACTO_ESTIMULANTE, art: 'comprimido' },

  // ── Suplementos ──
  { name: 'Creatina (monohidratada)', aliases: ['Creatina'], cls: 'Suplemento', unitHint: 'g/dia', impacto: 'Creatinina pode subir SEM perda renal (via massa muscular) — cistatina C é a via sem interferência; converse com seu médico.', art: 'frasco', popular: true },
  { name: 'Whey protein', aliases: ['Whey'], cls: 'Suplemento', unitHint: 'g/dia', impacto: 'Alto aporte proteico pode elevar ureia — contexto, não dano.', art: 'frasco' },
  { name: 'Pré-treino', aliases: ['Pré workout'], cls: 'Suplemento', unitHint: 'dose/dia', impacto: 'Estimulantes podem alterar frequência cardíaca e pressão na hora da coleta.', art: 'frasco' },
  { name: 'Beta-alanina', cls: 'Suplemento', unitHint: 'g/dia', art: 'frasco' },
  { name: 'Cafeína (suplemento)', cls: 'Suplemento', unitHint: 'mg/dia', impacto: 'Estimulantes podem alterar frequência cardíaca e pressão na hora da coleta.', art: 'comprimido' },
  { name: 'BCAA / EAA', aliases: ['BCAA'], cls: 'Suplemento', unitHint: 'g/dia', art: 'frasco' },
  { name: 'DHEA', cls: 'Suplemento', unitHint: 'mg/dia', impacto: 'Precursor hormonal — testosterona e DHEA-S podem subir.', art: 'comprimido' },
  { name: 'Termogênico', cls: 'Suplemento', unitHint: 'dose/dia', impacto: 'Estimulantes podem alterar frequência cardíaca e pressão na hora da coleta.', art: 'comprimido' },
  { name: 'Ômega-3', cls: 'Suplemento', unitHint: 'g/dia', art: 'comprimido' },
  { name: 'Vitamina D', cls: 'Suplemento', unitHint: 'UI/dia', art: 'comprimido' },
  { name: 'ZMA', cls: 'Suplemento', unitHint: 'dose/dia', art: 'comprimido' },
  { name: 'Tribulus terrestris', cls: 'Suplemento', unitHint: 'mg/dia', art: 'frasco' },
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

/** Linha de impacto nos exames de uma substância DECLARADA (match exato por nome/alias,
 *  case/acento-insensível). Sem match no catálogo → null (a UI mostra a linha genérica:
 *  "impacto depende da substância" — nunca inventa efeito). */
export function impactFor(declaredName: string): string | null {
  return catalogFindByToken(declaredName)?.impacto ?? null;
}

/** Match exato por nome OU alias, case/acento-insensível — CORRIGE A3/A4 (redesign v2):
 *  badge ANVISA/impacto/arte casam o que o usuário DIGITOU (alias de rua), não só o
 *  `name` canônico do catálogo. Reuso de impactFor + pill do sheet + StackCard. */
export function catalogFindByToken(tokenName: string): CatalogItem | null {
  const n = tokenName?.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() ?? '';
  if (!n) return null;
  return SUBSTANCE_CATALOG.find((c) =>
    c.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() === n
    || (c.aliases ?? []).some((a) => a.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() === n)) ?? null;
}

/** INN/químico termina em -ona/-ida/-ifeno/… → o primeiro alias CAPITALIZADO vira o
 *  comercial do label duplo; alias contido no próprio name não conta (ex.: 'Propionato'). */
const CHEM_NAME_RX = /(ona|olol|ifeno|ozol|estano|tida|terol|elina|relina|nato|ilato|tropina|idratada|creatina|insulina|efedrina|alanina)$/i;

/** Label duplo do sheet/stack (spec A3): "Masteron — Drostanolona" (comercial na frente,
 *  químico atrás). Item cujo name JÁ é comercial (Durateston) → chemical null. */
export function displayLabel(item: CatalogItem): { commercial: string; chemical: string | null } {
  const alias = (item.aliases ?? []).find((a) => /^[A-Z0-9À-Ý]/.test(a));
  const base = item.name.replace(/\s*\(.*\)$/, '').trim();
  const aliasInside = !!alias && item.name.toLowerCase().includes(alias.toLowerCase());
  if (alias && !aliasInside && CHEM_NAME_RX.test(base)) {
    return { commercial: alias, chemical: item.name };
  }
  return { commercial: item.name, chemical: null };
}

/** Ilustração por via: campo `art` do catálogo; ausente → default por classe (injetável
 *  sem arte específica cai no genérico). Fallback final = seringa. */
export function artFor(item?: CatalogItem | null): SubstanceArtKind {
  if (item?.art) return item.art;
  switch (item?.cls) {
    case 'Suplemento': return 'frasco';
    case 'Hormônio':
    case 'Medicação': return 'comprimido';
    default: return 'seringa';
  }
}

const byName = (n: string): CatalogItem => SUBSTANCE_CATALOG.find((c) => c.name === n)!;

/** Chips 1-tap do card de contexto (spec jornada: 6-7 mais buscadas, label curto de rua). */
export const POPULAR_SUBSTANCES: { label: string; item: CatalogItem }[] = [
  { label: 'Durateston', item: byName('Durateston') },
  { label: 'Deca', item: byName('Nandrolona (decanoato)') },
  { label: 'Masteron', item: byName('Drostanolona') },
  { label: 'Trembolona', item: byName('Trembolona') },
  { label: 'Testosterona', item: byName('Testosterona (enantato)') },
  { label: 'GH', item: byName('hGH (somatropina)') },
  { label: 'Creatina', item: byName('Creatina (monohidratada)') },
];
