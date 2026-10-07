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
 * `impacto` (E5 §2) = O QUE ESPERAR NOS EXAMES — educativo-descritivo, baseado no
 * monitoramento da literatura (HAARLEM/JCEM) e em diretrizes. PROIBIDO por contrato:
 * doses, "range seguro", recomendação de uso/ajuste. Sem texto validado → sem campo.
 */
export type SubstanceClass = 'Hormônio' | 'Suplemento' | 'Medicação' | 'Outro';

export interface CatalogItem { name: string; aliases?: string[]; cls: SubstanceClass; unitHint: string; impacto?: string }

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
  // ── Esteroides anabolizantes (androgênios) ──
  { name: 'Testosterona (enantato)', aliases: ['Deposteron', 'Testenat'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_TESTOSTERONA },
  { name: 'Testosterona (cypionato)', aliases: ['Depo-Testosterona', 'Cipionato'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_TESTOSTERONA },
  { name: 'Testosterona (propionato)', aliases: ['Propionato'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_TESTOSTERONA },
  { name: 'Testosterona (undecilato)', aliases: ['Nebido'], cls: 'Hormônio', unitHint: 'mg/mês', impacto: IMPACTO_TESTOSTERONA },
  { name: 'Testosterona (gel)', aliases: ['Androgel', 'Testavana'], cls: 'Hormônio', unitHint: 'g/dia', impacto: IMPACTO_TESTOSTERONA },
  { name: 'Durateston', aliases: ['Sustanon', 'fourtest'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_TESTOSTERONA },
  { name: 'Stanozolol', aliases: ['Winstrol', 'Estanozolol'], cls: 'Hormônio', unitHint: 'mg/dia', impacto: IMPACTO_ORAL_17AA },
  { name: 'Oxandrolona', aliases: ['Anavar', 'Lipidex'], cls: 'Hormônio', unitHint: 'mg/dia', impacto: IMPACTO_ORAL_17AA },
  { name: 'Nandrolona (decanoato)', aliases: ['Deca-Durabolin', 'Deca'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_ANDROGENO },
  { name: 'Trembolona', aliases: ['Tren', 'Trenbolona'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: 'HDL reduzido e possível aumento da pressão — acompanhamento cardiovascular merece atenção.' },
  { name: 'Drostanolona', aliases: ['Masteron', 'Drostanolona propionato'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_ANDROGENO },
  { name: 'Oximetolona', aliases: ['Hemogenin', 'Anadrol'], cls: 'Hormônio', unitHint: 'mg/dia', impacto: IMPACTO_ORAL_17AA },
  { name: 'Metenolona', aliases: ['Primobolan', 'Primo'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_ANDROGENO },
  { name: 'Boldenona', aliases: ['Equipoise', 'Undecilenato'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_ANDROGENO },
  { name: 'Mesterolona', aliases: ['Proviron'], cls: 'Hormônio', unitHint: 'mg/dia', impacto: IMPACTO_ANDROGENO },
  { name: 'Metandrostenolona', aliases: ['Dianabol', 'Dianabol'], cls: 'Hormônio', unitHint: 'mg/dia', impacto: IMPACTO_ORAL_17AA },
  { name: 'DHT (gel)', aliases: ['Andractim'], cls: 'Hormônio', unitHint: 'g/dia', impacto: IMPACTO_ANDROGENO },

  // ── Hormônio do crescimento e peptídeos ──
  { name: 'hGH (somatropina)', aliases: ['Genotropin', 'Norditropin', 'Jintropin', 'Hormônio do crescimento', 'GH'], cls: 'Hormônio', unitHint: 'UI/dia', impacto: IMPACTO_EIXO_GH },
  { name: 'IGF-1 LR3', aliases: ['IGF'], cls: 'Hormônio', unitHint: 'mcg/dia', impacto: IMPACTO_EIXO_GH },
  { name: 'CJC-1295', cls: 'Hormônio', unitHint: 'mcg/semana', impacto: IMPACTO_EIXO_GH },
  { name: 'Ipamorelina', cls: 'Hormônio', unitHint: 'mcg/dia', impacto: IMPACTO_EIXO_GH },
  { name: 'GHRP-2', aliases: ['GHRP'], cls: 'Hormônio', unitHint: 'mcg/dia', impacto: IMPACTO_EIXO_GH },
  { name: 'GHRP-6', cls: 'Hormônio', unitHint: 'mcg/dia', impacto: IMPACTO_EIXO_GH },
  { name: 'Sermorelina', cls: 'Hormônio', unitHint: 'mcg/dia', impacto: IMPACTO_EIXO_GH },
  { name: 'Insulina (uso declarado)', aliases: ['Insulina'], cls: 'Hormônio', unitHint: 'UI/dia', impacto: 'A glicemia da coleta depende do horário da dose — vale informar o laboratório.' },
  { name: 'BPC-157', cls: 'Outro', unitHint: 'mcg/dia' },
  { name: 'TB-500', aliases: ['Timosina beta 4'], cls: 'Outro', unitHint: 'mg/semana' },

  // ── GLP-1 / emagrecimento (uso declarado) ──
  { name: 'Semaglutida', aliases: ['Ozempic', 'Wegovy'], cls: 'Medicação', unitHint: 'mg/semana', impacto: IMPACTO_GLP1 },
  { name: 'Tirzepatida', aliases: ['Mounjaro', 'Zepbound'], cls: 'Medicação', unitHint: 'mg/semana', impacto: IMPACTO_GLP1 },
  { name: 'Retatrutida', aliases: ['triple G'], cls: 'Medicação', unitHint: 'mg/semana', impacto: IMPACTO_GLP1 },
  { name: 'Liraglutida', aliases: ['Saxenda', 'Victoza'], cls: 'Medicação', unitHint: 'mg/dia', impacto: IMPACTO_GLP1 },
  { name: 'Dulaglutida', aliases: ['Trulicity'], cls: 'Medicação', unitHint: 'mg/semana', impacto: IMPACTO_GLP1 },

  // ── Antiestrogênios / moduladores (uso declarado) ──
  { name: 'Tamoxifeno', aliases: ['Nolvadex'], cls: 'Medicação', unitHint: 'mg/dia', impacto: IMPACTO_ANTIESTROGENO },
  { name: 'Clomifeno', aliases: ['Clomid', 'Indux'], cls: 'Medicação', unitHint: 'mg/dia', impacto: IMPACTO_ANTIESTROGENO },
  { name: 'Anastrozol', aliases: ['Arimidex'], cls: 'Medicação', unitHint: 'mg/semana', impacto: IMPACTO_ANTIESTROGENO },
  { name: 'Exemestano', aliases: ['Aromasin'], cls: 'Medicação', unitHint: 'mg/dia', impacto: IMPACTO_ANTIESTROGENO },

  // ── Termogênicos/estimulantes (uso declarado) ──
  { name: 'Clenbuterol', aliases: ['Clen'], cls: 'Medicação', unitHint: 'mcg/dia', impacto: IMPACTO_ESTIMULANTE },
  { name: 'ECA (efedrina+cafeína+aspirina)', aliases: ['Efedrina'], cls: 'Outro', unitHint: 'mg/dia', impacto: IMPACTO_ESTIMULANTE },

  // ── Suplementos ──
  { name: 'Creatina (monohidratada)', aliases: ['Creatina'], cls: 'Suplemento', unitHint: 'g/dia', impacto: 'Creatinina pode subir SEM perda renal (via massa muscular) — cistatina C é a via sem interferência; converse com seu médico.' },
  { name: 'Whey protein', aliases: ['Whey'], cls: 'Suplemento', unitHint: 'g/dia', impacto: 'Alto aporte proteico pode elevar ureia — contexto, não dano.' },
  { name: 'Pré-treino', aliases: ['Pré workout'], cls: 'Suplemento', unitHint: 'dose/dia', impacto: 'Estimulantes podem alterar frequência cardíaca e pressão na hora da coleta.' },
  { name: 'Beta-alanina', cls: 'Suplemento', unitHint: 'g/dia' },
  { name: 'Cafeína (suplemento)', cls: 'Suplemento', unitHint: 'mg/dia', impacto: 'Estimulantes podem alterar frequência cardíaca e pressão na hora da coleta.' },
  { name: 'BCAA / EAA', aliases: ['BCAA'], cls: 'Suplemento', unitHint: 'g/dia' },
  { name: 'DHEA', cls: 'Suplemento', unitHint: 'mg/dia', impacto: 'Precursor hormonal — testosterona e DHEA-S podem subir.' },
  { name: 'Termogênico', cls: 'Suplemento', unitHint: 'dose/dia', impacto: 'Estimulantes podem alterar frequência cardíaca e pressão na hora da coleta.' },
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

/** Linha de impacto nos exames de uma substância DECLARADA (match exato por nome/alias,
 *  case/acento-insensível). Sem match no catálogo → null (a UI mostra a linha genérica:
 *  "impacto depende da substância" — nunca inventa efeito). */
export function impactFor(declaredName: string): string | null {
  const n = declaredName?.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() ?? '';
  if (!n) return null;
  const hit = SUBSTANCE_CATALOG.find((c) =>
    c.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() === n
    || (c.aliases ?? []).some((a) => a.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() === n));
  return hit?.impacto ?? null;
}
