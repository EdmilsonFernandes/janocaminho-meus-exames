// declarationMatch — lógica PURA do "cadastro inteligente" do DeclareSubstanceSheet
// (testável sem DOM, padrão sportsDomains): o que o paciente já declarou e o que fazer
// quando ele declara a mesma substância de novo.
import { sameSubstance } from './substanceCatalog';

export type EndStatus = 'em_uso' | 'interrompi' | 'nao_sei';

export interface SheetEditTarget {
  id: string;
  /** Item só do SportsProfile (id "sp-*", sem Medication) → salvar CRIA o Medication. */
  profileOnly?: boolean;
  endStatus?: EndStatus | null;
  startedAt?: string | null;
  endedAt?: string | null;
  dosage?: string | null;
  prescriberName?: string | null;
}

/** Declaração que o paciente JÁ tem. */
export interface ExistingDecl {
  name: string;
  kind: 'med' | 'supp';
  /** Medication → alvo de PATCH/replace (mesmo contrato do ✏️ do StackCard). */
  target?: SheetEditTarget;
}

/** Medication "[Classe] Nome" → classe + nome (mesma regex do SportsDashboard). */
const DECLARED_MED_RX = /^\[([^\]]+)\]\s*(.*)$/;

const END_STATUSES: readonly EndStatus[] = ['em_uso', 'interrompi', 'nao_sei'];

/** Resposta do GET /medications → declarações DESTE paciente. Remédio comum (sem o
 *  prefixo "[Classe]" do fluxo de declaração) e registro de outro perfil não contam. */
export function declaredFromMeds(list: unknown, pid: string): ExistingDecl[] {
  if (!Array.isArray(list) || !pid) return [];
  const out: ExistingDecl[] = [];
  for (const m of list as Record<string, unknown>[]) {
    if (m?.patientId !== pid || typeof m.name !== 'string') continue;
    const mm = DECLARED_MED_RX.exec(m.name);
    if (!mm || !mm[2].trim()) continue;
    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    out.push({
      name: mm[2].trim(),
      kind: 'med',
      target: {
        id: String(m.id),
        endStatus: END_STATUSES.includes(m.endStatus as EndStatus) ? (m.endStatus as EndStatus) : null,
        startedAt: str(m.startedAt),
        endedAt: str(m.endedAt),
        dosage: str(m.dosage),
        prescriberName: str(m.prescriberName),
      },
    });
  }
  return out;
}

/** Registro em uso (ou status desconhecido) → declarar de novo = ATUALIZAR. Quem já parou
 *  e volta a usar ganha registro novo (o período anterior fica no histórico). */
export const isOngoing = (t?: SheetEditTarget | null): t is SheetEditTarget => !!t && t.endStatus !== 'interrompi';

/** A mesma substância já declarada, na mesma "gaveta" (suplemento × medicação) — alias e
 *  princípio ativo contam como iguais ("Deca" ≡ "Nandrolona (decanoato)"). */
export function findDuplicate(existing: ExistingDecl[], name: string, isSupplement: boolean): ExistingDecl | null {
  if (!name.trim()) return null;
  return existing.find((e) => (e.kind === 'supp') === isSupplement && sameSubstance(e.name, name)) ?? null;
}
