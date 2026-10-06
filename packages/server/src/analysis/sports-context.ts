/**
 * sports-context.ts — gate do CONTEXTO ESPORTIVO nos prompts de IA (E3.2).
 *
 * Único ponto de integração usado por chat.routes.ts e health-summary.ts. Contrato:
 *  - flag `sportsMode.enabled` DESLIGADA → retorna TUDO vazio ANTES de qualquer query
 *    (o caller concatena '' → prompt final BYTE-IDÊTICO ao atual; teste de não-regressão);
 *  - flag ligada mas paciente SEM SportsProfile (paciente normal) → idem, tudo vazio;
 *  - flag + perfil ativo → addendum declarativo (SPORTS_ADDENDUM) + knowledge esportivo
 *    POR ANALITO dos exames do paciente (nunca wholesale).
 *
 * Substâncias declaradas vêm de DUAS fontes (E1.4): coluna `declaredSubstances` do
 * SportsProfile e Medications ativas com prefixo de classe ("[Hormônio] X"). SÓ O NOME —
 * dose/período guardados em Medication NÃO entram no prompt (menos dado sensível, e a
 * regra nº 2 do addendum proíbe a IA de tocar em dose mesmo assim).
 */
import { prisma } from '../prisma';
import { sportsModeEnabled } from '../utils/settings';
import { SPORTS_ADDENDUM } from './system';
import { sportsKnowledgeContext } from './sports-knowledge';

/** Medication criada pelo form esportivo tem name "[Classe] Substância". */
const DECLARED_MED_RX = /^\[[^\]]+\]/;

/** Jsonb declarado → lista de nomes (string crua ou {name}). */
function declaredFromJson(v: unknown): string[] {
  if (!Array.isArray(v)) return typeof v === 'string' && v.trim() ? [v.trim()] : [];
  const out: string[] = [];
  for (const it of v) {
    if (typeof it === 'string' && it.trim()) out.push(it.trim());
    else if (it && typeof it === 'object' && typeof (it as any).name === 'string' && (it as any).name.trim()) {
      out.push(String((it as any).name).trim());
    }
  }
  return out;
}

export interface SportsContextBlocks {
  /** SPORTS_ADDENDUM pronto p/ concatenar; '' = nada (modo off / sem perfil / perfil vazio). */
  addendum: string;
  /** Bloco de knowledge/sports/*.md por analito; '' = nada. */
  knowledge: string;
  /** Topics dos cards que entraram (p/ extractSources mapear [FONTE ANO] → tema). */
  topics: string[];
}

/**
 * Monta addendum + knowledge esportivo do paciente. `enabled` injetável p/ teste
 * (default = sportsModeEnabled()); callers não passam.
 */
export async function sportsContextBlocks(
  patientId: string,
  canonicals: Iterable<string | null | undefined>,
  enabled: boolean = sportsModeEnabled(),
  text?: string,
): Promise<SportsContextBlocks> {
  const EMPTY: SportsContextBlocks = { addendum: '', knowledge: '', topics: [] };
  if (!enabled) return EMPTY; // kill-switch: zero query, zero prompt

  // Query leve + null-safe (tabela aditiva E1; erro de rede/drift → degrada p/ vazio).
  const profile = await prisma.sportsProfile
    .findUnique({
      where: { patientId },
      select: { modality: true, trainingFreq: true, goals: true, collectionContext: true, declaredSubstances: true, active: true },
    })
    .catch(() => null);
  if (!profile) return EMPTY; // paciente normal: sem perfil declarado
  if (profile.active === false) return EMPTY; // toggle do paciente DESLIGADO no servidor — coerência client↔server

  const [meds, knowledge] = await Promise.all([
    prisma.medication
      .findMany({ where: { patientId, active: true }, select: { name: true } })
      .catch(() => [] as { name: string }[]),
    Promise.resolve(sportsKnowledgeContext(canonicals, true, text)),
  ]);

  // Substâncias: perfil declarado + medications com prefixo [Classe] — nomes apenas, dedup.
  const subs: string[] = [];
  for (const s of [...declaredFromJson(profile.declaredSubstances), ...meds.map((m) => m.name).filter((n) => DECLARED_MED_RX.test(String(n ?? '')))]) {
    const t = String(s).trim();
    if (t && !subs.some((x) => x.toLowerCase() === t.toLowerCase())) subs.push(t);
  }
  // Teto de tokens: além de 12 nomes o bloco não agrega (lista declarativa, não prontuário).
  const substances = subs.slice(0, 12);

  const addendum = SPORTS_ADDENDUM(null, profile, substances) ?? '';
  return { addendum, knowledge: knowledge.block ?? '', topics: knowledge.topics };
}
