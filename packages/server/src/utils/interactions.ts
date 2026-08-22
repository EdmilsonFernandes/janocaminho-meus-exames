import { prisma } from '../prisma';

/**
 * Interações fármaco-fármaco — camada DETERMINÍSTICA (base curada, offline, confiável).
 * Severidade A–X (padrão internacional): A desprezível · B menor · C moderada · D maior ·
 * X contraindicação absoluta. Linguagem EDUCATIVA: nunca dose, nunca prescrição —
 * a conduta é "converse com médico/farmacêutico".
 *
 * A camada contextual (GLM, considera os exames do paciente) mora em
 * medication.routes.ts /check/full e usa esta base como chão de verdade.
 */

export type Severity = 'A' | 'B' | 'C' | 'D' | 'X';
export const SEVERITY_ORDER: Record<Severity, number> = { X: 5, D: 4, C: 3, B: 2, A: 1 };
export const SEVERITY_LABEL: Record<Severity, string> = {
  A: 'Desprezível', B: 'Menor', C: 'Moderada', D: 'Maior', X: 'Contraindicação absoluta',
};
/** Crítico = o que mostramos SEMPRE, mesmo no nível grátis (segurança não se cobra). */
export const isCritical = (s: string) => s === 'D' || s === 'X';

/** Normaliza nome de remédio: uppercase, sem acento, espaços únicos. */
export const normDrug = (name: string): string =>
  (name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/** Apelidos e MARCAS comuns → nome canônico (as regras usam o canônico).
 *  Marcas dos remédios crônicos mais vendidos no Brasil — o usuário lembra da marca,
 *  não do genérico. O autocomplete do app resolve a maioria; isto cobre quem digita direto. */
const ALIASES: Record<string, string> = {
  ASPIRINA: 'ACIDO ACETILSALICILICO', AAS: 'ACIDO ACETILSALICILICO', CARDIOASPIRINA: 'ACIDO ACETILSALICILICO',
  ENALAPRILA: 'ENALAPRIL', RENITEC: 'ENALAPRIL', VASOTEC: 'ENALAPRIL',
  'LOSARTANA POTASSICA': 'LOSARTAN', LOSARTANA: 'LOSARTAN', 'COZAAR': 'LOSARTAN',
  'VARFARINA SODICA': 'VARFARINA', MAREVAN: 'VARFARINA',
  FERRO: 'SULFATO FERROSO', FERROSSO: 'SULFATO FERROSO',
  NOVALGINA: 'DIPIRONA', LISADOR: 'DIPIRONA', ANADOR: 'DIPIRONA',
  ADVIL: 'IBUPROFENO', ALIVIUM: 'IBUPROFENO', MOMENT: 'IBUPROFENO', NUPRIN: 'IBUPROFENO',
  TYLENOL: 'PARACETAMOL', 'TYLENOL DC': 'PARACETAMOL',
  VOLTAREN: 'DICLOFENACO', CATAFLAM: 'DICLOFENACO',
  GLIFAGE: 'METFORMINA', METFORM: 'METFORMINA', GLUCOPHAGE: 'METFORMINA',
  DAONIL: 'GLIBENCLAMIDA', GLIBEN: 'GLIBENCLAMIDA',
  LEVOID: 'LEVOTIROXINA', SYNTHROID: 'LEVOTIROXINA', 'PURAN T4': 'LEVOTIROXINA', EUTHYROX: 'LEVOTIROXINA',
  SINVACOR: 'SINVASTATINA', LIPEX: 'SINVASTATINA', CITALOR: 'ATORVASTATINA', LIPIATOR: 'ATORVASTATINA',
  LOSEC: 'OMEPRAZOL', PEPRAZOL: 'OMEPRAZOL',
  LASIX: 'FUROSEMIDA', NEOFLUXINA: 'FUROSEMIDA',
  ALDACTONE: 'ESPIRONOLACTONA',
  CORALDIN: 'AMIODARONA', ATAURANCE: 'AMIODARONA',
  LANOXIN: 'DIGOXINA',
  TRAMAL: 'TRAMADOL', 'TRAMADOL CLORIDRATO': 'TRAMADOL',
  ZOLOFT: 'SERTRALINA', ASSERT: 'SERTRALINA', SONRISE: 'SERTRALINA',
  PROZAC: 'FLUOXETINA', VEROTIN: 'FLUOXETINA', LUSTRAL: 'FLUOXETINA',
  RIVOTRIL: 'CLONAZEPAM', CLONOTRIL: 'CLONAZEPAM', 'RIVOTRIL GOTAS': 'CLONAZEPAM',
  FRONTAL: 'ALPRAZOLAM', APRAZ: 'ALPRAZOLAM',
  PLAVIX: 'CLOPIDOGREL', CLOREL: 'CLOPIDOGREL', ARETOR: 'CLOPIDOGREL',
  AMOXIL: 'AMOXICILINA', NOVAMOX: 'AMOXICILINA',
  FLUCONAZ: 'FLUCONAZOL', 'FLUCONAZOL 150': 'FLUCONAZOL',
};
const canon = (n: string): string => { const x = normDrug(n); return ALIASES[x] ?? x; };

/** O remédio do usuário casa com a droga da regra? (exato, ou contém como palavra inteira —
 *  "VARFARINA SODICA" casa com a regra "VARFARINA"). */
const drugMatches = (medNorm: string, ruleDrug: string): boolean => {
  if (medNorm === ruleDrug) return true;
  try { return new RegExp(`\\b${ruleDrug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(medNorm); } catch { return false; }
};

export interface InteractionHit {
  drugA: string; drugB: string; severity: Severity; effect: string; recommendation: string;
  matchedA: string; matchedB: string; // nomes como o usuário cadastrou
}

/** Cruza os remédios ativos contra as regras — pares únicos, ordenados do pior pro melhor. */
export function matchInteractions(
  meds: { name: string }[],
  rules: { drugA: string; drugB: string; severity: string; effect: string; recommendation: string }[],
): InteractionHit[] {
  const hits: InteractionHit[] = [];
  for (let i = 0; i < meds.length; i++) {
    for (let j = i + 1; j < meds.length; j++) {
      const a = canon(meds[i].name), b = canon(meds[j].name);
      if (!a || !b || a === b) continue;
      for (const r of rules) {
        const ra = normDrug(r.drugA), rb = normDrug(r.drugB);
        const okAB = drugMatches(a, ra) && drugMatches(b, rb);
        const okBA = drugMatches(a, rb) && drugMatches(b, ra);
        if (okAB || okBA) {
          hits.push({
            drugA: r.drugA, drugB: r.drugB, severity: r.severity as Severity, effect: r.effect, recommendation: r.recommendation,
            matchedA: meds[i].name, matchedB: meds[j].name,
          });
          break; // 1 regra por par de remédios (a mais específica curada vence)
        }
      }
    }
  }
  return hits.sort((x, y) => SEVERITY_ORDER[y.severity] - SEVERITY_ORDER[x.severity]);
}

/** Remédios que a base NÃO conhece (não casam com droga nenhuma de regra nenhuma).
 *  Honestidade: melhor avisar "não conhecemos X" do que exibir ✅ verde falso. */
export function findUnmatched(
  meds: { name: string }[],
  rules: { drugA: string; drugB: string }[],
): string[] {
  const ruleDrugs = new Set<string>();
  for (const r of rules) { ruleDrugs.add(normDrug(r.drugA)); ruleDrugs.add(normDrug(r.drugB)); }
  const out: string[] = [];
  for (const m of meds) {
    const c = canon(m.name);
    const known = [...ruleDrugs].some((d) => drugMatches(c, d));
    if (!known) out.push(m.name);
  }
  return out;
}

/**
 * Base curada inicial — interações bem estabelecidas entre remédios comuns no Brasil.
 * Fontes: bulas/anvisa + referências clínicas padrão. Admin edita/estende live no banco
 * (o seed só roda quando a tabela está vazia — nunca sobrescreve edição manual).
 */
const SEED_RULES: { drugA: string; drugB: string; severity: Severity; effect: string; recommendation: string }[] = [
  { drugA: 'VARFARINA', drugB: 'ACIDO ACETILSALICILICO', severity: 'D', effect: 'Uso junto aumenta muito o risco de sangramento (gengiva, estômago, feridas que não param).', recommendation: 'Não comece, pare ou mude dose de nenhum dos dois por conta. Avise o médico que faz seu controle do sangue (INR).' },
  { drugA: 'VARFARINA', drugB: 'IBUPROFENO', severity: 'D', effect: 'Anti-inflamatório + anticoagulante: risco elevado de sangramento digestivo.', recommendation: 'Para dor ou febre, prefira paracetamol/dipirona — e confirme com seu médico ou farmacêutico.' },
  { drugA: 'VARFARINA', drugB: 'DIPIRONA', severity: 'C', effect: 'Pode somar efeito no risco de sangramento, em menor grau que AINEs.', recommendation: 'Use a menor dose pelo menor tempo e mantenha o acompanhamento do INR.' },
  { drugA: 'VARFARINA', drugB: 'AMOXICILINA', severity: 'C', effect: 'Alguns antibióticos potencializam o efeito da varfarina (sangra mais fácil).', recommendation: 'Se o antibiótico foi prescrito, avise quem acompanha seu INR — pode precisar de reajuste.' },
  { drugA: 'VARFARINA', drugB: 'AMIODARONA', severity: 'D', effect: 'A amiodarona aumenta a concentração de varfarina (risco de sangramento).', recommendation: 'Combinação possível só com monitoramento próximo; pergunte ao médico sobre reajuste de dose.' },
  { drugA: 'VARFARINA', drugB: 'SERTRALINA', severity: 'C', effect: 'Antidepressivo ISRS pode aumentar risco de sangramento com anticoagulante.', recommendation: 'Informe os dois médicos; observe sangramentos incomuns (equimoses, gengiva, fezes escuras).' },
  { drugA: 'SINVASTATINA', drugB: 'CLARITROMICINA', severity: 'X', effect: 'Antibiótico bloqueia a degradação da sinvastatina: dores musculares intensas e risco de dano renal (rabdomiólise).', recommendation: 'Contraindicado usar juntos. O médico escolhe alternativa ao antibiótico ou pausa a estatina durante o tratamento.' },
  { drugA: 'SINVASTATINA', drugB: 'CICLOSPORINA', severity: 'X', effect: 'Aumenta muito o nível da estatina — risco muscular grave.', recommendation: 'Combinação contraindicada; exige troca de estatina sob orientação médica.' },
  { drugA: 'SINVASTATINA', drugB: 'AMLODIPINA', severity: 'C', effect: 'A amlodipina eleva o nível da sinvastatina (risco de dor muscular).', recommendation: 'Existe limite de dose para uso junto — confirme o seu com o médico.' },
  { drugA: 'ATORVASTATINA', drugB: 'CLARITROMICINA', severity: 'D', effect: 'Aumenta o nível da estatina com risco de dano muscular.', recommendation: 'Avise o médico antes de usar o antibiótico; pode pausar a estatina no período.' },
  { drugA: 'ENALAPRIL', drugB: 'ESPIRONOLACTONA', severity: 'D', effect: 'Os dois juntos podem elestrar o potássio perigosamente (arritmia).', recommendation: 'Peça exame de potássio depois de começar/ajustar; não use sal light com cloreto de potássio sem avisar o médico.' },
  { drugA: 'LOSARTAN', drugB: 'ESPIRONOLACTONA', severity: 'D', effect: 'Risco de potássio alto (hipercalemia).', recommendation: 'Monitorar potássio; sintomas como formigamento ou fraqueza merecem exame rápido.' },
  { drugA: 'ENALAPRIL', drugB: 'IBUPROFENO', severity: 'C', effect: 'Anti-inflamatório reduz o efeito do anti-hipertensivo e pode agredir os rins.', recommendation: 'Evite uso prolongado; para dor crônica, combine com o médico uma estratégia segura.' },
  { drugA: 'LOSARTAN', drugB: 'IBUPROFENO', severity: 'C', effect: 'Reduz controle da pressão e soma risco renal.', recommendation: 'Uso eventual costuma ser tolerado; rotina não — converse com o médico.' },
  { drugA: 'HIDROCLOROTIAZIDA', drugB: 'IBUPROFENO', severity: 'C', effect: 'Pode reduzir o efeito diurético e elevar a pressão.', recommendation: 'Monitore a pressão em dias de uso do anti-inflamatório.' },
  { drugA: 'GLIBENCLAMIDA', drugB: 'FLUCONAZOL', severity: 'D', effect: 'Antifúngico aumenta o efeito do antidiabético — hipoglicemia (suor frio, tremor, confusão).', recommendation: 'Avise o médico; podem ajustar dose e orientar checagens extras de glicemia.' },
  { drugA: 'METFORMINA', drugB: 'FUROSEMIDA', severity: 'C', effect: 'O diurético pode alterar o nível de metformina no sangue.', recommendation: 'Monitorar função renal periodicamente; reporte mal-estar incomum.' },
  { drugA: 'OMEPRAZOL', drugB: 'CLOPIDOGREL', severity: 'C', effect: 'O omeprazol reduz a ativação do clopidogrel (proteção menor contra infarto/AVC).', recommendation: 'Pergunte sobre pantoprazol (interage menos) — não troque por conta própria.' },
  { drugA: 'LEVOTIROXINA', drugB: 'SULFATO FERROSO', severity: 'C', effect: 'O ferro reduz a absorção da levotiroxina (hipotireoidismo mal controlado).', recommendation: 'Separar os horários (geralmente 4h ou mais) — confirme o esquema com o médico.' },
  { drugA: 'LEVOTIROXINA', drugB: 'OMEPRAZOL', severity: 'C', effect: 'Reduz a absorção do hormônio da tireoide.', recommendation: 'Se o TSH mudou depois de começar o omeprazol, relate ao médico.' },
  { drugA: 'LEVOTIROXINA', drugB: 'VARFARINA', severity: 'C', effect: 'Ajustes de tireoide alteram a sensibilidade à varfarina.', recommendation: 'Mudou dose da levotiroxina? Avise quem controla seu INR.' },
  { drugA: 'FLUOXETINA', drugB: 'TRAMADOL', severity: 'D', effect: 'Risco de síndrome serotoninérgica (agitação, febre, tremores, batimentos acelerados).', recommendation: 'Combinar exige acompanhamento; procure atendimento imediato se os sintomas aparecerem.' },
  { drugA: 'SERTRALINA', drugB: 'TRAMADOL', severity: 'D', effect: 'Risco de síndrome serotoninérgica e convulsão.', recommendation: 'Avise os dois prescritores; há analgésicos alternativos.' },
  { drugA: 'PAROXETINA', drugB: 'TRAMADOL', severity: 'D', effect: 'Risco de síndrome serotoninérgica.', recommendation: 'Não use tramadol por conta enquanto em ISRS; combine alternativa com o médico.' },
  { drugA: 'CLONAZEPAM', drugB: 'TRAMADOL', severity: 'D', effect: 'Sedação forte e risco de depressão respiratória (principalmente em idosos).', recommendation: 'Nunca ajuste dose sozinho; evite álcool; avise o médico sobre os dois juntos.' },
  { drugA: 'ALPRAZOLAM', drugB: 'TRAMADOL', severity: 'D', effect: 'Sedação e risco respiratório somados.', recommendation: 'Informe o médico; monitorar sonolência excessiva.' },
  { drugA: 'CLONAZEPAM', drugB: 'CODEINA', severity: 'D', effect: 'Opioide + benzodiazepínico: combinação de risco respiratório (alerta FDA).', recommendation: 'Uso conjunto só com decisão médica clara e dose mínima.' },
  { drugA: 'DIGOXINA', drugB: 'FUROSEMIDA', severity: 'C', effect: 'O diurético baixa o potássio e isso AUMENTA a toxicidade da digoxina (náusea, visão amarelada, palpitação).', recommendation: 'Peça potássio e digoxina sérica se os sintomas aparecerem.' },
  { drugA: 'DIGOXINA', drugB: 'AMIODARONA', severity: 'D', effect: 'Aumenta o nível de digoxina (intoxicação).', recommendation: 'Geralmente exige reduzir a digoxina — decisão do médico com exames.' },
  { drugA: 'PREDNISONA', drugB: 'IBUPROFENO', severity: 'C', effect: 'Soma risco de úlcera/sangramento no estômago.', recommendation: 'Pergunte sobre proteção gástrica se o uso for frequente.' },
  { drugA: 'DICLOFENACO', drugB: 'IBUPROFENO', severity: 'C', effect: 'Dois anti-inflamatórios do mesmo tipo não somam alívio — somam risco renal e gástrico.', recommendation: 'Use um só, na menor dose eficaz, sempre com orientação.' },
  { drugA: 'PARACETAMOL', drugB: 'VARFARINA', severity: 'C', effect: 'Uso prolongado de paracetamol pode aumentar o efeito da varfarina (sangramento).', recommendation: 'Doses ocasionais costumam ser seguras; uso contínuo merece monitorar INR.' },
  { drugA: 'PARACETAMOL', drugB: 'METOTREXATO', severity: 'C', effect: 'Soma risco de toxicidade hepática.', recommendation: 'Informe seu reumatologista se usar paracetamol com frequência.' },
  { drugA: 'PARACETAMOL', drugB: 'CARBAMAZEPINA', severity: 'C', effect: 'Aumenta o risco de dano ao fígado.', recommendation: 'Evite uso prolongado sem orientação médica.' },
  { drugA: 'NAPROXENO', drugB: 'IBUPROFENO', severity: 'C', effect: 'Anti-inflamatórios duplicados (mesmo mecanismo).', recommendation: 'Escolha um com o farmacêutico/médico.' },
  { drugA: 'DICLOFENACO', drugB: 'VARFARINA', severity: 'D', effect: 'Risco alto de sangramento digestivo.', recommendation: 'Comunique o médico responsável pelo anticoagulante antes de usar.' },
  { drugA: 'LITIO', drugB: 'IBUPROFENO', severity: 'D', effect: 'Anti-inflamatórios elevam o nível de lítio (tremor, confusão, intoxicação).', recommendation: 'Se precisar de AINE por mais de alguns dias, o médico acompanha litemia.' },
  { drugA: 'LITIO', drugB: 'HIDROCLOROTIAZIDA', severity: 'D', effect: 'Diurético tiazídico eleva o lítio.', recommendation: 'Ajuste de dose geralmente necessário — exames de acompanhamento.' },
  { drugA: 'METOTREXATO', drugB: 'IBUPROFENO', severity: 'D', effect: 'Reduz a eliminação do metotrexato (toxicidade).', recommendation: 'Doses baixas semanais costumam tolerar AINEs, mas é decisão do reumatologista.' },
  { drugA: 'OMEPRAZOL', drugB: 'METOTREXATO', severity: 'D', effect: 'Pode elevar o nível de metotrexato.', recommendation: 'Informe o médico que acompanha o metotrexato sobre o uso de omeprazol.' },
  { drugA: 'AMIODARONA', drugB: 'SINVASTATINA', severity: 'D', effect: 'Aumenta o risco de dano muscular da estatina.', recommendation: 'Existe limite de dose ao usar juntos — confirme com o médico.' },
  { drugA: 'SERTRALINA', drugB: 'IBUPROFENO', severity: 'C', effect: 'ISRS + AINE: risco de sangramento gástrico somado.', recommendation: 'Uso eventual ok; rotina merece conversa sobre proteção gástrica.' },
  { drugA: 'PREGABALINA', drugB: 'TRAMADOL', severity: 'C', effect: 'Sedação e tontura somadas (quedas em idosos).', recommendation: 'Levantar devagar, evitar dirigir no início; avise o médico.' },
];

/** Popula a base se (e só se) a tabela estiver vazia — idempotente no boot, não pisa em
 *  edições do admin. Roda em background (não atrasa o startup). */
export async function ensureInteractionSeed(): Promise<void> {
  try {
    const count = await prisma.interactionRule.count();
    if (count > 0) return;
    // Par canônico em ordem alfabética (match bidirecional na consulta).
    const rows = SEED_RULES.map((r) => {
      const [a, b] = [normDrug(r.drugA), normDrug(r.drugB)].sort();
      return { drugA: a, drugB: b, severity: r.severity, effect: r.effect, recommendation: r.recommendation, source: 'seed-curado-2026-08' };
    });
    await prisma.interactionRule.createMany({ data: rows, skipDuplicates: true });
    console.log(`[interactions] base curada semeada: ${rows.length} regras`);
  } catch (e) {
    console.warn('[interactions] seed falhou (tabela existe?):', (e as Error).message?.slice(0, 120));
  }
}
