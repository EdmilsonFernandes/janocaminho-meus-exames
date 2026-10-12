/**
 * urgency.ts — TRIAGEM DE URGÊNCIA determinística (camada 1 da interpretação).
 *
 * Regras HARDCODED baseadas em limiares consagrados (não decididos por IA): a IA
 * interpreta e educa, mas "procure atendimento urgente" NÃO pode depender de um
 * modelo — é um aviso de segurança que precisa ser reproduzível e auditável.
 *
 * Princípios:
 *  - SÓ dispara com valor NUMÉRICO (valueNumeric) — item sem número é ignorado;
 *  - limiares assumem as unidades usuais dos laboratórios brasileiros
 *    (K mEq/L, Hb g/dL, Hct %, glicemia mg/dL, TSH µUI/mL, PSA ng/mL, PCR mg/L);
 *  - mensagem EDUCATIVA com conduta ("procure atendimento", "agende consulta"),
 *    nunca diagnóstico;
 *  - casamento por canônico EXATO (canonicalName) — sem substring, para não
 *    colapsar analitos distintos (ex.: HEMOGLOBINA_GLICADA ≠ HEMOGLOBINA).
 *
 * Módulo PURO (sem prisma/IA) — testável isoladamente (test/urgency.test.ts).
 */
import { canonicalName } from '../utils/normalize';

export type UrgencyLevel = 'CRITICO' | 'ATENCAO' | 'ACOMPANHAR' | 'NORMAL';

export interface UrgencyRule {
  /** Chave canônica (saída de canonicalName) do analito. */
  canonical: string;
  /** Variantes canônicas extras aceitas (match EXATO, sem substring). */
  aliases?: string[];
  level: UrgencyLevel;
  condition: (value: number, refLow?: number, refHigh?: number) => boolean;
  /** Mensagem educativa específica (com conduta), exibida no banner. */
  message: string;
}

/**
 * Item avaliável pelas regras. Estruturalmente compatível com o ExamItem do
 * Prisma e com o MarkerState do health-state (latest) — quem chama adapta.
 */
export interface UrgencyItem {
  nameCanonical: string;
  name?: string | null;
  valueNumeric?: number | null;
  refLow?: number | null;
  refHigh?: number | null;
}

/** Hierarquia de severidade (maior = mais urgente). */
const LEVEL_RANK: Record<UrgencyLevel, number> = { NORMAL: 0, ACOMPANHAR: 1, ATENCAO: 2, CRITICO: 3 };

/**
 * Regras de urgência (limiares de diretrizes/consenso — NÃO inventar):
 *  - K > 6,0 mEq/L: risco de arritmia (hipercalemia) — emergência;
 *  - Troponina > 2× o limite superior do laudo: dano cardíaco agudo — emergência;
 *  - Hb < 7,0 g/dL: anemia grave (transfusão é considerada abaixo de 7);
 *  - Hct > 54%: hemoconcentração merecendo avaliação (diretrizes de eritrocitose);
 *  - Glicemia > 300 mg/dL: descontrole importante; < 50 mg/dL: hipoglicemia;
 *  - TSH > 10 ou < 0,1: disfunção tireoidiana franco;
 *  - Creatinina > 3,0: função renal bastante reduzida;
 *  - PSA > 10 ng/mL: avaliação urológica recomendada;
 *  - PCR > 100 mg/L: processo inflamatório ativo importante.
 */
export const URGENCY_RULES: UrgencyRule[] = [
  {
    canonical: 'POTASSIO',
    level: 'CRITICO',
    condition: (v) => v > 6.0,
    message: 'Potássio muito elevado pode causar arritmia cardíaca — procure atendimento médico URGENTE.',
  },
  {
    // Troponina não tem chave única no dicionário (I, T, ultrasensível...) — casamento exato por aliases.
    canonical: 'TROPONINA',
    aliases: ['TROPONINA I', 'TROPONINA T', 'TROPONINA ULTRASSENSIVEL', 'TROPONINA I ULTRASSENSIVEL', 'TROPONINA T ULTRASSENSIVEL', 'TROPONINA ULTRASSENSIVEL I', 'TROPONINA ULTRASSENSIVEL T', 'TROPO I', 'TROPO T'],
    level: 'CRITICO',
    condition: (v, _lo, hi) => hi != null && v > hi * 2,
    message: 'Elevação de troponina pode indicar dano cardíaco — procure emergência.',
  },
  {
    canonical: 'HEMOGLOBINA',
    level: 'CRITICO',
    condition: (v) => v < 7.0,
    message: 'Hemoglobina muito baixa (anemia grave) — procure atendimento médico urgente.',
  },
  {
    canonical: 'GLICEMIA',
    level: 'CRITICO',
    condition: (v) => v < 50,
    message: 'Glicemia muito baixa (hipoglicemia) — se estiver com sintomas (tremor, suor, confusão), procure atendimento agora.',
  },
  {
    canonical: 'HEMATOCRITO',
    level: 'ATENCAO',
    condition: (v) => v > 54,
    message: 'Hematócrito acima de 54% merece avaliação médica em breve.',
  },
  {
    canonical: 'GLICEMIA',
    level: 'ATENCAO',
    condition: (v) => v > 300,
    message: 'Glicemia muito elevada — agende consulta médica em breve.',
  },
  {
    canonical: 'TSH',
    level: 'ATENCAO',
    condition: (v) => v > 10 || v < 0.1,
    message: 'TSH muito alterado — agende consulta com endocrinologista.',
  },
  {
    canonical: 'CREATININA',
    level: 'ATENCAO',
    condition: (v) => v > 3.0,
    message: 'Creatinina elevada sugere função renal alterada — consulte seu médico.',
  },
  {
    canonical: 'PSA',
    aliases: ['PSA TOTAL'],
    level: 'ATENCAO',
    condition: (v) => v > 10,
    message: 'PSA elevado merece avaliação urológica — agende consulta.',
  },
  {
    canonical: 'PCR',
    level: 'ATENCAO',
    condition: (v) => v > 100,
    message: 'PCR muito elevado sugere processo inflamatório ativo — consulte médico.',
  },
];

/** Canônico do item (fallback: nome de exibição normalizado). */
function canonOf(item: UrgencyItem): string {
  return canonicalName(item.nameCanonical || String(item.name ?? ''));
}

/** Regras que se aplicam ao item (match exato por canônico/aliases). */
function rulesFor(canon: string): UrgencyRule[] {
  if (!canon) return [];
  return URGENCY_RULES.filter((r) => r.canonical === canon || (r.aliases?.includes(canon) ?? false));
}

/** Máximo nível entre todos os itens (NORMAL quando nada dispara). */
export function getUrgency(items: readonly UrgencyItem[]): UrgencyLevel {
  let best: UrgencyLevel = 'NORMAL';
  for (const it of items) {
    if (it.valueNumeric == null) continue;
    for (const r of rulesFor(canonOf(it))) {
      if (r.condition(it.valueNumeric, it.refLow ?? undefined, it.refHigh ?? undefined) && LEVEL_RANK[r.level] > LEVEL_RANK[best]) {
        best = r.level;
      }
    }
  }
  return best;
}

/** Nível máximo + mensagem da 1ª regra disparada nesse nível (p/ o campo `urgency` do resumo). */
export function getUrgencyDetail(items: readonly UrgencyItem[]): { level: UrgencyLevel; message: string | null } {
  let best: UrgencyRule | null = null;
  for (const it of items) {
    if (it.valueNumeric == null) continue;
    for (const r of rulesFor(canonOf(it))) {
      if (r.condition(it.valueNumeric, it.refLow ?? undefined, it.refHigh ?? undefined)) {
        if (!best || LEVEL_RANK[r.level] > LEVEL_RANK[best.level]) best = r;
      }
    }
  }
  return best ? { level: best.level, message: best.message } : { level: 'NORMAL', message: null };
}
