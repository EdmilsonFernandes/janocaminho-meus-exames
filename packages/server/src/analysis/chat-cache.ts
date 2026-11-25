// Cache de respostas do chat — a MESMA pergunta sobre os MESMOS dados reaproveita a resposta
// que a IA já deu a este paciente (token zero).
//
// Por quê (medido em produção, 24/11/26): de 263 perguntas à IA em 90 dias, só 107 eram
// diferentes — ~60% do gasto era o mesmo botão de sugestão ("Faça um resumo geral dos meus
// exames…") tocado de novo sem nenhum exame novo no meio.
//
// Regras de segurança:
//  - nunca cruza pacientes (a busca é por patientId);
//  - só vale enquanto os DADOS são os mesmos: a impressão digital (fp) cobre exames, valores,
//    medicações ativas, alvos e perfil clínico — mudou qualquer um, não casa;
//  - só perguntas AUTOCONTIDAS: nada de "e isso?", nem pergunta que depende do dia
//    (atividade, sono, "hoje"), nem pergunta curta demais;
//  - validade máxima de 7 dias (rótulos de exame "desatualizado" envelhecem);
//  - a origem é sempre uma resposta REAL da IA — resposta local, sem IA ou já reaproveitada
//    não vira fonte (senão a validade se renovaria sozinha para sempre).
import { createHash } from 'node:crypto';
import { prisma } from '../prisma';
import { normalizeKey } from '../utils/normalize';

export const CACHE_TTL_MS = 7 * 86_400_000;
/** Respostas que NÃO servem de fonte para o cache. */
const NON_AI_MODELS = ['local-router', 'offline', 'cache'];

// normalizeKey tira acentos e põe em maiúsculas → listas SEM acento.
const STOPWORDS = new Set(
  ('A O AS OS UM UMA UNS UMAS DE DO DA DOS DAS E EM NO NA NOS NAS POR PARA PRA PRO COM SEM QUE SE AO AOS ' +
    'ME MEU MEUS MINHA MINHAS EU VOCE PODE PODERIA FAVOR OLA OI BOM DIA TARDE NOITE OBRIGADO OBRIGADA')
    .split(' '),
);
/** Refere-se a algo dito antes na conversa → a resposta depende do histórico, não cacheia. */
const ANAPHORA = /\b(ISSO|ISTO|ESSE|ESSA|ESSES|ESSAS|AQUELE|AQUELA|AQUILO|DISSO|NISSO|DESSE|DESSA|DELE|DELA|ANTERIOR|CONTINUE|CONTINUA|ENTAO)\b/;
/** Depende do dia (Health Connect, agenda) → muda sem os exames mudarem, não cacheia. */
const VOLATILE = /\b(HOJE|AGORA|ONTEM|AMANHA|SEMANA|PASSOS|SONO|DORMI|ATIVIDADE|TREINO|EXERCICIO|CALORIAS?|PESO|LEMBRETE|CONSULTA)\b/;

/**
 * Chave da pergunta: conjunto ordenado das palavras que carregam sentido. `null` = não cacheável.
 * Ordem e palavras de ligação não importam ("meu TSH está alto?" = "o TSH meu esta alto").
 * Qualquer palavra de sentido diferente muda a chave ("alto" ≠ "baixo") — é igualdade de
 * conjunto, NÃO semelhança: preferimos errar para o lado de chamar a IA.
 */
export function questionKey(message: string): string | null {
  const norm = normalizeKey(message);
  if (!norm || norm.length > 400) return null;
  if (ANAPHORA.test(norm) || VOLATILE.test(norm)) return null;
  const tokens = [...new Set(norm.split(/[^A-Z0-9]+/).filter((t) => t.length > 1 && !STOPWORDS.has(t)))];
  if (tokens.length < 4) return null;
  return tokens.sort().join(' ');
}

/** Impressão digital dos dados que entram na resposta. Mudou um valor → outra fp → sem cache. */
export function dataFingerprint(parts: (string | null | undefined)[]): string {
  return createHash('sha1').update(parts.map((p) => p ?? '').join('\u0001')).digest('hex').slice(0, 16);
}

export interface CachedAnswer {
  text: string;
  sources: { label: string; topic: string }[];
}

/** Resposta anterior da IA para a mesma pergunta + mesmos dados deste paciente, ou null. */
export async function findCachedAnswer(opts: { patientId: string; message: string; fp: string; now?: number }): Promise<CachedAnswer | null> {
  const key = questionKey(opts.message);
  if (!key) return null;
  const since = new Date((opts.now ?? Date.now()) - CACHE_TTL_MS);
  const rows = await prisma.aiAnalysis.findMany({
    where: { patientId: opts.patientId, type: 'CHAT', createdAt: { gt: since }, modelUsed: { notIn: NON_AI_MODELS } },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: { userMessage: true, contentMd: true, structured: true },
  });
  for (const r of rows) {
    const s = (r.structured ?? {}) as { fp?: string; sources?: { label: string; topic: string }[] };
    if (s.fp !== opts.fp || !r.contentMd?.trim() || !r.userMessage) continue;
    if (questionKey(r.userMessage) === key) return { text: r.contentMd, sources: Array.isArray(s.sources) ? s.sources : [] };
  }
  return null;
}
