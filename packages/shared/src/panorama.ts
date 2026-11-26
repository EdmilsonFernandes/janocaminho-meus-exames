/**
 * Panorama da saúde — contrato entre servidor (GET /patients/:id/panorama) e tela `/relatorio`.
 *
 * Princípio: o servidor devolve FATOS (valores, datas, séries, contagens e o estado de cada área);
 * as FRASES que a pessoa lê são compostas na tela (`utils/panoramaPresenter.ts` no web), para
 * poderem ser testadas e traduzidas fora do servidor.
 *
 * Nada aqui custa crédito nem chama IA: é tudo determinístico, a partir de resumos que o servidor
 * já calcula. Cada área diz DE QUANDO é o dado (`asOf`) e em que estado está (`status`).
 */

export type PanoramaKey =
  | 'exams' | 'heart' | 'weight' | 'bodyComp' | 'hormones'
  | 'mind' | 'diary' | 'vitality' | 'meds' | 'care' | 'vaccines' | 'emergency';

/**
 * - `ok`: há dado recente e nada pede atenção.
 * - `attention`: há algo que a pessoa deveria olhar (valor fora da faixa, interação, dose atrasada).
 * - `stale`: existe dado, mas antigo — nunca pode parecer atual.
 * - `missing`: a pessoa nunca registrou (é convite, não erro).
 * - `unavailable`: não dá para calcular agora (tabela ainda não criada, sem sincronização, falha).
 */
export type PanoramaStatus = 'ok' | 'attention' | 'stale' | 'missing' | 'unavailable';

export interface PanoramaArea<T> {
  key: PanoramaKey;
  status: PanoramaStatus;
  /** ISO da data do dado mais recente da área; null quando não há dado. */
  asOf: string | null;
  /** Null quando status é `missing` ou `unavailable` sem dado. */
  data: T | null;
}

export interface PanoramaSeriesPoint {
  /** ISO da data do ponto. */
  at: string;
  v: number;
}

export interface PanoramaRef {
  low: number | null;
  high: number | null;
  /** Faixa como o laboratório escreveu (ex.: "< 130"), quando não veio em números. */
  text: string | null;
}

// ── Exames e sangue ──────────────────────────────────────────────────────────
export interface PanoramaExamValue {
  id: string;
  name: string;
  nameCanonical: string | null;
  valueText: string | null;
  valueNumeric: number | null;
  unit: string | null;
  /** Flag do laboratório: HIGH | LOW | ABNORMAL | CRITICAL | NORMAL | UNKNOWN. */
  flag: string | null;
  ref: PanoramaRef;
  extractedPage: number | null;
}
export interface PanoramaExamsData {
  lastExam: { id: string; title: string; performedAt: string | null } | null;
  examCount: number;
  /** Resultados do último exame. */
  itemCount: number;
  abnormalCount: number;
  /** Até 6, os mais importantes primeiro (CRITICAL > ABNORMAL/HIGH/LOW). */
  abnormal: PanoramaExamValue[];
  /** Prazo de repetir (mesmo cálculo de GET /retest). */
  retest: { dueAt: string; months: number; status: string } | null;
  /** Resultados fora da faixa por exame, últimos 8 exames, do mais antigo para o mais recente. */
  abnormalPerExam: { at: string; count: number }[];
}

// ── Coração e pressão ────────────────────────────────────────────────────────
export interface PanoramaHeartData {
  bp: { systolic: number; diastolic: number; at: string } | null;
  /** Pressão sistólica (o primeiro número), últimos 6 meses, do mais antigo para o mais recente. */
  bpSeries: PanoramaSeriesPoint[];
  cardioRisk: { level: 'low' | 'moderate' | 'high' | 'unknown'; label: string } | null;
  /** Idade do corpo — é uma ESTIMATIVA; a tela precisa chamar assim. */
  bodyAge: { estimate: number; method: 'kdm' | 'phenoage'; chronologicalAge: number | null } | null;
}

// ── Peso e corpo ─────────────────────────────────────────────────────────────
export interface PanoramaWeightData {
  latest: { v: number; at: string } | null;
  /** Últimos 6 meses, do mais antigo para o mais recente, no máximo 12 pontos. */
  series: PanoramaSeriesPoint[];
  bmi: number | null;
}
export interface PanoramaBodyCompData {
  latest: {
    at: string;
    bodyFatPct: number | null;
    /** O aparelho guarda músculo em KG (não em %). Quando a avaliação tem os dois, o servidor
     *  deriva `skeletalMuscleKg / weightKg × 100`; senão fica null. O KG cru vem abaixo. */
    skeletalMusclePct: number | null;
    /** Opcional: massa muscular esquelética em kg, como o aparelho mediu. */
    skeletalMuscleKg?: number | null;
  } | null;
}

// ── Hormônios e vitaminas ────────────────────────────────────────────────────
export type PanoramaHormoneKey = 'TSH' | 'T4_FREE' | 'VITAMIN_D';
export interface PanoramaHormonesData {
  markers: {
    key: PanoramaHormoneKey;
    name: string;
    valueText: string;
    valueNumeric: number | null;
    unit: string | null;
    /** Pela régua do laboratório (ou alvo personalizado, quando houver). */
    status: 'in' | 'high' | 'low' | 'unknown';
    ref: PanoramaRef;
    at: string | null;
    /** Últimos 12 meses, do mais antigo para o mais recente, no máximo 12 pontos. */
    series: PanoramaSeriesPoint[];
  }[];
  /** Só marca se existir protocolo/doses cadastrados. */
  radarInUse: boolean;
}

// ── Mente e humor (rastreio — nunca diagnóstico) ─────────────────────────────
export interface PanoramaScreening {
  at: string;
  /** Null quando a pessoa nunca respondeu ESSE questionário (nunca 0: zero diria "sem sintomas"). */
  phq9: number | null;
  gad7: number | null;
  /** Faixa pelo total; "não realizado" quando o total é null. */
  phq9Band: string;
  gad7Band: string;
}
export interface PanoramaMindData {
  latest: (PanoramaScreening & {
    suicidalIdeation: boolean;
    /** Opcional: data da última resposta de CADA instrumento (podem ser dias diferentes).
     *  null = a pessoa nunca respondeu esse questionário — nesse caso o total vem null e a
     *  banda vem "não realizado" (nunca 0: zero significaria "sem sintomas"). */
    phq9At?: string | null;
    gad7At?: string | null;
  }) | null;
  previous: PanoramaScreening | null;
  /** Últimas 8 respostas, da mais antiga para a mais recente. */
  history: PanoramaScreening[];
}

// ── Diário de saúde ──────────────────────────────────────────────────────────
export interface PanoramaDiaryData {
  streak: number;
  daysLogged90: number;
  /** Últimos 7 dias; `symptoms` traz o rótulo de cada sintoma marcado no dia. */
  last7: { date: string; mood: number | null; energy: number | null; symptoms: string[] }[];
  moodAvg7: number | null;
  energyAvg7: number | null;
  /** Até 3, dos mais frequentes nos últimos 7 dias. */
  topSymptoms: { name: string; days: number }[];
}

// ── Sono e atividade (Health Connect) ────────────────────────────────────────
export interface PanoramaMetric {
  latest: number | null;
  avg7: number | null;
  avg30: number | null;
  /** Últimos 7 pontos. */
  series7: PanoramaSeriesPoint[];
}
export interface PanoramaVitalityData {
  lastSyncAt: string | null;
  /** Minutos de sono por noite. */
  sleepMinutes: PanoramaMetric | null;
  steps: PanoramaMetric | null;
  heartRate: PanoramaMetric | null;
  exerciseMinutes: PanoramaMetric | null;
}

// ── Remédios ─────────────────────────────────────────────────────────────────
export interface PanoramaMedsData {
  active: { id: string; name: string; dose: string | null }[];
  /** Interações críticas (D/X) entre os remédios em uso; null se não foi possível checar. */
  criticalInteractions: number | null;
}

// ── Consultas e perguntas ────────────────────────────────────────────────────
export interface PanoramaCareData {
  /** Opcional `title`: o nome do compromisso como a pessoa/médico escreveu (lembrete) ou o motivo
   *  da consulta — é o único nome quando não há médico vinculado. */
  nextAppointment: { at: string; doctor: string | null; specialty: string | null; title?: string | null } | null;
  pendingQuestions: number;
  overdueReminders: number;
}

// ── Vacinas ──────────────────────────────────────────────────────────────────
export interface PanoramaVaccinesData {
  count: number;
  overdue: number;
  nextDue: { name: string; date: string } | null;
}

// ── Cartão de emergência ─────────────────────────────────────────────────────
export interface PanoramaEmergencyData {
  /** True quando há alergia, condição ou alguma informação de saúde preenchida. */
  configured: boolean;
}

// ── O que mudou ──────────────────────────────────────────────────────────────
export type PanoramaChangeKind =
  | 'entered_range'   // saiu de fora da faixa para dentro
  | 'left_range'      // saiu de dentro para fora da faixa
  | 'improved'        // aproximação da faixa em valor que segue fora
  | 'worsened'        // afastamento da faixa
  | 'screening'       // mudança de total em PHQ-9/GAD-7 entre duas respostas
  | 'habit';          // mudança em sono/passos/peso entre a média de 7 e de 30 dias

export interface PanoramaChange {
  area: PanoramaKey;
  kind: PanoramaChangeKind;
  /** Nome do marcador, questionário ou hábito (ex.: "Vitamina D", "PHQ-9", "Sono"). */
  subject: string;
  before: number | null;
  after: number | null;
  unit: string | null;
  /** Data do dado novo (o que causou a mudança). */
  at: string;
}

export interface PanoramaResponse {
  patientId: string;
  generatedAt: string;
  /** Até 6, do mais recente para o mais antigo. A tela escolhe os 3 primeiros que tiverem cópia. */
  changed: PanoramaChange[];
  exams: PanoramaArea<PanoramaExamsData>;
  heart: PanoramaArea<PanoramaHeartData>;
  weight: PanoramaArea<PanoramaWeightData>;
  bodyComp: PanoramaArea<PanoramaBodyCompData>;
  hormones: PanoramaArea<PanoramaHormonesData>;
  mind: PanoramaArea<PanoramaMindData>;
  diary: PanoramaArea<PanoramaDiaryData>;
  vitality: PanoramaArea<PanoramaVitalityData>;
  meds: PanoramaArea<PanoramaMedsData>;
  care: PanoramaArea<PanoramaCareData>;
  vaccines: PanoramaArea<PanoramaVaccinesData>;
  emergency: PanoramaArea<PanoramaEmergencyData>;
}
