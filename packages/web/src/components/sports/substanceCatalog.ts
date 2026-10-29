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
 * `anvisa` (P0.2): lista de controle da Anvisa (Portaria SVS/MS 344/98). C5 = anabolizantes
 * — a lista inclui somatropina (GH) e prasterona (DHEA). Alimenta um BADGE educativo na UI:
 * informativo, SEM julgamento e SEM número de resolução (conferir DOU/AnvisaLegis antes de
 * citar RDC em texto público — blueprint AAS §9 P2). Sem classificação → sem campo.
 *
 * `impacto` (E5 §2) = O QUE ESPERAR NOS EXAMES — educativo-descritivo, baseado no
 * monitoramento da literatura (HAARLEM/JCEM) e em diretrizes. PROIBIDO por contrato:
 * doses, "range seguro", recomendação de uso/ajuste. Sem texto validado → sem campo.
 *
 * `sobre` = O QUE É (classe/éster/via), factual e curto — a lista mostra junto do nome
 * químico, então não repete o princípio ativo. Nunca efeito, dose ou benefício.
 *
 * `aliases`: o PRIMEIRO capitalizado vira o nome comercial do label duplo (displayLabel) —
 * apelido de rua ("tren", "clen") fica minúsculo p/ nunca aparecer como marca.
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
  /** "O que é" em 1 linha — FACTUAL (classe/éster/via). Nunca efeito, dose ou benefício. */
  sobre?: string;
  /** Desenvolvida p/ uso veterinário — sem registro p/ uso humano (selo informativo). */
  origem?: 'veterinario';
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
/** Trembolona (sal/éster qualquer). */
const IMPACTO_TREMBOLONA = 'HDL reduzido e possível aumento da pressão — acompanhamento cardiovascular merece atenção.';

export const SUBSTANCE_CATALOG: CatalogItem[] = [
  // ── Esteroides anabolizantes (androgênios) — lista C5 ──
  // (27/10/26) Deposteron é CIPIONATO (estava no enantato); grafia antiga "cypionato" fica
  // como alias p/ declarações já gravadas continuarem casando.
  { name: 'Testosterona (enantato)', aliases: ['testenat', 'enantato'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_TESTOSTERONA, anvisa: 'C5', art: 'frasco', popular: true, sobre: 'Éster de testosterona, injetável.' },
  { name: 'Testosterona (cipionato)', aliases: ['Deposteron', 'Depo-Testosterona', 'Cipionato', 'Testosterona (cypionato)'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_TESTOSTERONA, anvisa: 'C5', art: 'frasco', popular: true, sobre: 'Éster de testosterona, injetável.' },
  { name: 'Testosterona (propionato)', aliases: ['Propionato'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_TESTOSTERONA, anvisa: 'C5', art: 'frasco', sobre: 'Éster de testosterona de ação curta, injetável.' },
  { name: 'Testosterona (undecilato)', aliases: ['Nebido', 'Hormus'], cls: 'Hormônio', unitHint: 'mg/mês', impacto: IMPACTO_TESTOSTERONA, anvisa: 'C5', art: 'frasco', sobre: 'Éster de testosterona de ação longa, injetável.' },
  { name: 'Testosterona (gel)', aliases: ['Androgel', 'Testavana'], cls: 'Hormônio', unitHint: 'g/dia', impacto: IMPACTO_TESTOSTERONA, anvisa: 'C5', art: 'gel', sobre: 'Aplicada na pele.' },
  { name: 'Durateston', aliases: ['Sustanon', 'fourtest'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_TESTOSTERONA, anvisa: 'C5', art: 'frasco', popular: true, sobre: 'Mistura de 4 ésteres de testosterona, injetável.' },
  { name: 'Stanozolol', aliases: ['Winstrol', 'Estanozolol', 'Stano'], cls: 'Hormônio', unitHint: 'mg/dia', impacto: IMPACTO_ORAL_17AA, anvisa: 'C5', art: 'comprimido', popular: true, sobre: 'Anabolizante derivado da DHT, oral ou injetável.' },
  { name: 'Oxandrolona', aliases: ['Anavar', 'Lipidex'], cls: 'Hormônio', unitHint: 'mg/dia', impacto: IMPACTO_ORAL_17AA, anvisa: 'C5', art: 'comprimido', popular: true, sobre: 'Anabolizante oral derivado da DHT.' },
  { name: 'Nandrolona (decanoato)', aliases: ['Deca-Durabolin', 'Deca', 'Nandrolona'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_ANDROGENO, anvisa: 'C5', art: 'frasco', popular: true, sobre: 'Anabolizante injetável.' },
  { name: 'Trembolona', aliases: ['tren', 'trenbolona', 'trembo', 'fina', 'finaplix', 'parabolan'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_TREMBOLONA, anvisa: 'C5', art: 'ampola', popular: true, origem: 'veterinario', sobre: 'Anabolizante injetável derivado da nandrolona, de uso veterinário.' },
  { name: 'Trembolona (acetato)', aliases: ['trembo', 'fina', 'trena', 'acetato'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_TREMBOLONA, anvisa: 'C5', art: 'ampola', origem: 'veterinario', sobre: 'Éster de ação curta, injetável, de uso veterinário.' },
  { name: 'Drostanolona', aliases: ['Masteron', 'Drostanolona propionato'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_ANDROGENO, anvisa: 'C5', art: 'ampola', popular: true, sobre: 'Anabolizante injetável derivado da DHT.' },
  { name: 'Oximetolona', aliases: ['Hemogenin', 'Anadrol'], cls: 'Hormônio', unitHint: 'mg/dia', impacto: IMPACTO_ORAL_17AA, anvisa: 'C5', art: 'comprimido', sobre: 'Anabolizante oral.' },
  { name: 'Metenolona', aliases: ['Primobolan', 'Primo'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_ANDROGENO, anvisa: 'C5', art: 'frasco', sobre: 'Anabolizante oral ou injetável.' },
  { name: 'Boldenona', aliases: ['Equipoise', 'EQ', 'undecilenato'], cls: 'Hormônio', unitHint: 'mg/semana', impacto: IMPACTO_ANDROGENO, anvisa: 'C5', art: 'frasco', origem: 'veterinario', sobre: 'Anabolizante injetável de uso veterinário.' },
  { name: 'Mesterolona', aliases: ['Proviron'], cls: 'Hormônio', unitHint: 'mg/dia', impacto: IMPACTO_ANDROGENO, anvisa: 'C5', art: 'comprimido', sobre: 'Androgênio oral.' },
  { name: 'Metandrostenolona', aliases: ['Dianabol', 'DBol', 'metandienona'], cls: 'Hormônio', unitHint: 'mg/dia', impacto: IMPACTO_ORAL_17AA, anvisa: 'C5', art: 'comprimido', sobre: 'Anabolizante oral (metandienona).' },
  { name: 'DHT (gel)', aliases: ['Andractim', 'Androstanolona', 'Estanolona', 'Di-hidrotestosterona'], cls: 'Hormônio', unitHint: 'g/dia', impacto: IMPACTO_ANDROGENO, anvisa: 'C5', art: 'gel', popular: true, sobre: 'Di-hidrotestosterona aplicada na pele.' },

  // ── Demais substâncias da lista C5 — p/ a busca reconhecer o nome oficial.
  //    Sem texto de exame validado → sem `impacto` (contrato do catálogo: nunca inventa efeito).
  { name: 'Metiltestosterona', cls: 'Hormônio', unitHint: 'mg/dia', anvisa: 'C5', art: 'comprimido', sobre: 'Androgênio oral.' },
  { name: 'Fluoximesterona', aliases: ['Halotestin', 'Fluoximetiltestosterona'], cls: 'Hormônio', unitHint: 'mg/dia', anvisa: 'C5', art: 'comprimido', sobre: 'Androgênio oral.' },
  { name: 'Clorodehidrometiltestosterona', aliases: ['Turinabol', 'Deidroclormetiltestosterona'], cls: 'Hormônio', unitHint: 'mg/dia', anvisa: 'C5', art: 'comprimido', sobre: 'Anabolizante oral.' },
  { name: 'Clostebol', aliases: ['Trofodermin'], cls: 'Hormônio', unitHint: 'aplicação/dia', anvisa: 'C5', art: 'gel', sobre: 'Anabolizante de uso tópico (creme).' },
  { name: 'Mibolerona', cls: 'Hormônio', unitHint: 'mcg/dia', anvisa: 'C5', origem: 'veterinario', sobre: 'Anabolizante de uso veterinário.' },
  { name: 'Bolasterona', cls: 'Hormônio', unitHint: 'mg/dia', anvisa: 'C5', sobre: 'Anabolizante da lista C5.' },
  { name: 'Cloroxomesterona', cls: 'Hormônio', unitHint: 'mg/dia', anvisa: 'C5', sobre: 'Anabolizante da lista C5.' },
  { name: 'Etilestrenol', cls: 'Hormônio', unitHint: 'mg/dia', anvisa: 'C5', sobre: 'Anabolizante da lista C5.' },
  { name: 'Formebolona', cls: 'Hormônio', unitHint: 'mg/semana', anvisa: 'C5', sobre: 'Anabolizante da lista C5.' },
  { name: 'Metandranona', cls: 'Hormônio', unitHint: 'mg/dia', anvisa: 'C5', sobre: 'Anabolizante da lista C5.' },
  { name: 'Metandriol', cls: 'Hormônio', unitHint: 'mg/semana', anvisa: 'C5', sobre: 'Anabolizante da lista C5.' },
  { name: 'Noretandrolona', cls: 'Hormônio', unitHint: 'mg/dia', anvisa: 'C5', sobre: 'Anabolizante da lista C5.' },
  { name: 'Oximesterona', cls: 'Hormônio', unitHint: 'mg/dia', anvisa: 'C5', sobre: 'Anabolizante da lista C5.' },

  // ── Hormônio do crescimento e peptídeos (somatropina também é lista C5) ──
  { name: 'hGH (somatropina)', aliases: ['Genotropin', 'Norditropin', 'Jintropin', 'Hormônio do crescimento', 'GH'], cls: 'Hormônio', unitHint: 'UI/dia', impacto: IMPACTO_EIXO_GH, anvisa: 'C5', art: 'frasco', popular: true, sobre: 'Hormônio do crescimento, injetável.' },
  { name: 'IGF-1 LR3', aliases: ['IGF'], cls: 'Hormônio', unitHint: 'mcg/dia', impacto: IMPACTO_EIXO_GH, art: 'frasco', sobre: 'Análogo sintético do IGF-1, injetável.' },
  { name: 'CJC-1295', cls: 'Hormônio', unitHint: 'mcg/semana', impacto: IMPACTO_EIXO_GH, art: 'frasco', sobre: 'Peptídeo análogo do GHRH, injetável.' },
  { name: 'Ipamorelina', cls: 'Hormônio', unitHint: 'mcg/dia', impacto: IMPACTO_EIXO_GH, art: 'frasco', sobre: 'Peptídeo secretagogo de GH, injetável.' },
  { name: 'GHRP-2', aliases: ['GHRP'], cls: 'Hormônio', unitHint: 'mcg/dia', impacto: IMPACTO_EIXO_GH, art: 'frasco', sobre: 'Peptídeo secretagogo de GH, injetável.' },
  { name: 'GHRP-6', cls: 'Hormônio', unitHint: 'mcg/dia', impacto: IMPACTO_EIXO_GH, art: 'frasco', sobre: 'Peptídeo secretagogo de GH, injetável.' },
  { name: 'Sermorelina', cls: 'Hormônio', unitHint: 'mcg/dia', impacto: IMPACTO_EIXO_GH, art: 'frasco', sobre: 'Peptídeo análogo do GHRH, injetável.' },
  { name: 'Insulina (uso declarado)', aliases: ['Insulina'], cls: 'Hormônio', unitHint: 'UI/dia', impacto: 'A glicemia da coleta depende do horário da dose — vale informar o laboratório.', art: 'caneta', sobre: 'Hormônio que regula a glicose, injetável.' },
  { name: 'BPC-157', cls: 'Outro', unitHint: 'mcg/dia', art: 'frasco', sobre: 'Peptídeo sintético sem registro para uso humano.' },
  { name: 'TB-500', aliases: ['Timosina beta 4'], cls: 'Outro', unitHint: 'mg/semana', art: 'frasco', sobre: 'Peptídeo sintético sem registro para uso humano.' },

  // ── GLP-1 / emagrecimento (uso declarado) ──
  { name: 'Semaglutida', aliases: ['Ozempic', 'Wegovy'], cls: 'Medicação', unitHint: 'mg/semana', impacto: IMPACTO_GLP1, art: 'caneta', popular: true, sobre: 'Análogo de GLP-1, injetável (caneta).' },
  { name: 'Tirzepatida', aliases: ['Mounjaro', 'Zepbound'], cls: 'Medicação', unitHint: 'mg/semana', impacto: IMPACTO_GLP1, art: 'caneta', sobre: 'Agonista de GIP e GLP-1, injetável (caneta).' },
  { name: 'Retatrutida', aliases: ['triple G'], cls: 'Medicação', unitHint: 'mg/semana', impacto: IMPACTO_GLP1, art: 'caneta', sobre: 'Agonista de GIP, GLP-1 e glucagon, injetável.' },
  { name: 'Liraglutida', aliases: ['Saxenda', 'Victoza'], cls: 'Medicação', unitHint: 'mg/dia', impacto: IMPACTO_GLP1, art: 'caneta', sobre: 'Análogo de GLP-1, injetável (caneta).' },
  { name: 'Dulaglutida', aliases: ['Trulicity'], cls: 'Medicação', unitHint: 'mg/semana', impacto: IMPACTO_GLP1, art: 'caneta', sobre: 'Análogo de GLP-1, injetável (caneta).' },

  // ── Antiestrogênios / moduladores (uso declarado) — fora da Portaria 344: sem selo ──
  { name: 'Tamoxifeno', aliases: ['Nolvadex'], cls: 'Medicação', unitHint: 'mg/dia', impacto: IMPACTO_ANTIESTROGENO, art: 'comprimido', sobre: 'Modulador do receptor de estrogênio (SERM), oral.' },
  { name: 'Clomifeno', aliases: ['Clomid', 'Indux'], cls: 'Medicação', unitHint: 'mg/dia', impacto: IMPACTO_ANTIESTROGENO, art: 'comprimido', sobre: 'Modulador do receptor de estrogênio (SERM), oral.' },
  { name: 'Anastrozol', aliases: ['Arimidex'], cls: 'Medicação', unitHint: 'mg/semana', impacto: IMPACTO_ANTIESTROGENO, art: 'comprimido', sobre: 'Inibidor da aromatase, oral.' },
  { name: 'Exemestano', aliases: ['Aromasin'], cls: 'Medicação', unitHint: 'mg/dia', impacto: IMPACTO_ANTIESTROGENO, art: 'comprimido', sobre: 'Inibidor da aromatase, oral.' },

  // ── Termogênicos/estimulantes (uso declarado) ──
  { name: 'Clenbuterol', aliases: ['clen'], cls: 'Medicação', unitHint: 'mcg/dia', impacto: IMPACTO_ESTIMULANTE, art: 'comprimido', sobre: 'Broncodilatador (agonista beta-2).' },
  { name: 'ECA (efedrina+cafeína+aspirina)', aliases: ['Efedrina'], cls: 'Outro', unitHint: 'mg/dia', impacto: IMPACTO_ESTIMULANTE, art: 'comprimido', sobre: 'Combinação de estimulantes com aspirina.' },

  // ── Suplementos ──
  { name: 'Creatina (monohidratada)', aliases: ['Creatina'], cls: 'Suplemento', unitHint: 'g/dia', impacto: 'Creatinina pode subir SEM perda renal (via massa muscular) — cistatina C é a via sem interferência; converse com seu médico.', art: 'frasco', popular: true, sobre: 'Composto presente nos músculos, em pó.' },
  { name: 'Whey protein', aliases: ['Whey'], cls: 'Suplemento', unitHint: 'g/dia', impacto: 'Alto aporte proteico pode elevar ureia — contexto, não dano.', art: 'frasco', sobre: 'Proteína do soro do leite.' },
  { name: 'Pré-treino', aliases: ['Pré workout'], cls: 'Suplemento', unitHint: 'dose/dia', impacto: 'Estimulantes podem alterar frequência cardíaca e pressão na hora da coleta.', art: 'frasco', sobre: 'Mistura de estimulantes e aminoácidos.' },
  { name: 'Beta-alanina', cls: 'Suplemento', unitHint: 'g/dia', art: 'frasco', sobre: 'Aminoácido em pó ou cápsula.' },
  { name: 'Cafeína (suplemento)', cls: 'Suplemento', unitHint: 'mg/dia', impacto: 'Estimulantes podem alterar frequência cardíaca e pressão na hora da coleta.', art: 'comprimido', sobre: 'Estimulante em cápsula ou pó.' },
  { name: 'BCAA / EAA', aliases: ['BCAA'], cls: 'Suplemento', unitHint: 'g/dia', art: 'frasco', sobre: 'Aminoácidos essenciais.' },
  { name: 'DHEA', aliases: ['Prasterona'], cls: 'Suplemento', unitHint: 'mg/dia', impacto: 'Precursor hormonal — testosterona e DHEA-S podem subir.', anvisa: 'C5', art: 'comprimido', sobre: 'Precursor hormonal; no Brasil, de venda controlada.' },
  { name: 'Termogênico', cls: 'Suplemento', unitHint: 'dose/dia', impacto: 'Estimulantes podem alterar frequência cardíaca e pressão na hora da coleta.', art: 'comprimido', sobre: 'Mistura de estimulantes, em geral com cafeína.' },
  { name: 'Ômega-3', cls: 'Suplemento', unitHint: 'g/dia', art: 'comprimido', sobre: 'Ácidos graxos EPA e DHA (óleo de peixe).' },
  { name: 'Vitamina D', cls: 'Suplemento', unitHint: 'UI/dia', art: 'comprimido', sobre: 'Em geral vitamina D3 (colecalciferol).' },
  { name: 'ZMA', cls: 'Suplemento', unitHint: 'dose/dia', art: 'comprimido', sobre: 'Zinco, magnésio e vitamina B6.' },
  { name: 'Tribulus terrestris', cls: 'Suplemento', unitHint: 'mg/dia', art: 'frasco', sobre: 'Extrato vegetal.' },
];

/** Normalização de busca/match: sem acento e caixa; pontuação vira espaço
 *  ("Deca-Durabolin" ≡ "deca durabolin", "DHT (gel)" ≡ "dht gel"). */
const norm = (s: string): string => (s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** Distância de edição com transposição (Damerau/OSA) — tolera "winstrool", "durasteston". */
const editDistance = (a: string, b: string): number => {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
};

/** Relevância de um item p/ o termo JÁ normalizado: exato > início do nome > início do
 *  alias > início de palavra > contém. 0 = sem match textual. */
const textScore = (c: CatalogItem, nq: string): number => {
  const nn = norm(c.name);
  const na = (c.aliases ?? []).map(norm);
  if (nn === nq || na.includes(nq)) return 6;
  if (nn.startsWith(nq)) return 5;
  if (na.some((a) => a.startsWith(nq))) return 4;
  if ([nn, ...na].some((s) => s.split(' ').some((w) => w.startsWith(nq)))) return 3;
  if (nn.includes(nq)) return 2;
  if (na.some((a) => a.includes(nq))) return 1;
  return 0;
};

/** Erro de digitação: o termo fica a 1 edição (≥4 letras) ou 2 (≥7) de alguma palavra do
 *  nome/alias — inteira ou do mesmo tamanho do termo (busca enquanto digita). */
const fuzzyHit = (c: CatalogItem, nq: string): boolean => {
  if (nq.length < 4) return false;
  const max = nq.length >= 7 ? 2 : 1;
  const words = [c.name, ...(c.aliases ?? [])].flatMap((s) => norm(s).split(' ')).filter((w) => w.length >= 3);
  return words.some((w) => editDistance(nq, w) <= max || (w.length > nq.length && editDistance(nq, w.slice(0, nq.length)) <= max));
};

/** Busca case/acento/pontuação-insensível por nome OU alias — devolve itens p/ autocomplete.
 *  Ordem: relevância textual (popular desempata); NENHUM acerto → "parecidos" (erro de
 *  digitação — só nesse caso, senão "deca" puxaria "declarado"). Termo com número/
 *  apresentação ("deca 300") casa pelas palavras. */
export function searchSubstances(q: string, limit = 8): CatalogItem[] {
  const nq = norm(q);
  if (!nq) {
    // vazio: amostra representativa (1 por classe nos mais comuns)
    const seed = ['Testosterona (enantato)', 'Durateston', 'hGH (somatropina)', 'Tirzepatida', 'Creatina (monohidratada)', 'Stanozolol', 'Semaglutida', 'Whey protein'];
    return seed.map((s) => SUBSTANCE_CATALOG.find((c) => c.name === s)!).filter(Boolean);
  }
  const words = nq.split(' ').filter((w) => w.length >= 3 && !/^\d+$/.test(w));
  const scored = SUBSTANCE_CATALOG
    .map((c) => {
      let score = textScore(c, nq);
      if (!score && nq.includes(' ') && words.length) score = Math.max(...words.map((w) => textScore(c, w))) / 2;
      return { c, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || Number(!!b.c.popular) - Number(!!a.c.popular));
  if (!scored.length) {
    const terms = words.length ? words : [nq];
    for (const c of SUBSTANCE_CATALOG) {
      if (terms.some((t) => fuzzyHit(c, t))) scored.push({ c, score: 0 });
    }
  }
  return scored.slice(0, limit).map((s) => s.c);
}

/** Linha de impacto nos exames de uma substância DECLARADA (match exato por nome/alias,
 *  case/acento-insensível). Sem match no catálogo → null (a UI mostra a linha genérica:
 *  "impacto depende da substância" — nunca inventa efeito). */
export function impactFor(declaredName: string): string | null {
  return catalogFindByToken(declaredName)?.impacto ?? null;
}

/** Match exato por nome OU alias, case/acento/pontuação-insensível — CORRIGE A3/A4 (redesign
 *  v2): badge ANVISA/impacto/arte casam o que o usuário DIGITOU (alias de rua), não só o
 *  `name` canônico do catálogo. Reuso de impactFor + pill do sheet + StackCard. */
export function catalogFindByToken(tokenName: string): CatalogItem | null {
  const n = norm(tokenName ?? '');
  if (!n) return null;
  return SUBSTANCE_CATALOG.find((c) => norm(c.name) === n || (c.aliases ?? []).some((a) => norm(a) === n)) ?? null;
}

/** Mesma substância? Nome igual (normalizado) OU os dois resolvem p/ o MESMO item do
 *  catálogo ("Deca" ≡ "Deca-Durabolin" ≡ "Nandrolona (decanoato)"). Base do aviso de
 *  duplicata do sheet e do dedup das listas do perfil. */
export function sameSubstance(a: string, b: string): boolean {
  const na = norm(a ?? '');
  const nb = norm(b ?? '');
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ca = catalogFindByToken(a);
  return !!ca && ca === catalogFindByToken(b);
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
