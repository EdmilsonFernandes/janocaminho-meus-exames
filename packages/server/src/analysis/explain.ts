/**
 * explain.ts — Cache em BANCO + geração por IA das explicações (leigo) de exames/analitos.
 *
 * Substitui o antigo `utils/explanationsCache.ts` (arquivo JSON único: read/rewrite integrais
 * + race condition + sem versionamento). Agora cada explicação é uma linha em `exam_knowledge`,
 * lookup O(1) indexado, upsert atômico (fim da race) e versionado por `promptVersion`.
 *
 * Padrão cache-ou-gera: getOrCreateExplanation() consulta o banco (filtrando a versão atual
 * do prompt); só chama a IA se faltar (miss) — e então faz upsert pra reaproveitar.
 * O 2º usuário que clicar no mesmo exame pega do banco, sem chamar a IA.
 *
 * EXPLAIN_PROMPT_VERSION: bump aqui quando o prompt mudar → linhas antigas viram "miss"
 * (promptVersion diferente) e são regeneradas + sobrescritas no próximo acesso.
 */
import { getLlm, getModel } from '../llm';
import { JSON_SUFFIX, extractJsonObject } from '../utils/json';
import { prisma } from '../prisma';
import { HEALTH_SYSTEM, diagnosticGuard } from './system';

/** Versão do prompt de explicação. Bump = invalida o cache (força regenerar). */
export const EXPLAIN_PROMPT_VERSION = 'v2';

export const DEFAULT_LOCALE = 'pt-BR';

export interface Explanation {
  titulo?: string;
  resumo?: string;
  analogia?: string;
  alterado?: string;
}

/** Chave canônica: maiúscula, sem acento, só letras/números/_. (igual ao antigo explanationsCache) */
export function nameKey(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira acento
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Lookup no banco. Só é HIT se a versão do prompt bater (miss em versão velha = regenera). */
export async function getExplanation(name: string, locale: string = DEFAULT_LOCALE): Promise<Explanation | null> {
  const row = await prisma.examKnowledge.findFirst({
    where: { nameKey: nameKey(name), locale, promptVersion: EXPLAIN_PROMPT_VERSION },
  });
  if (!row) return null;
  return { titulo: row.titulo ?? undefined, resumo: row.resumo ?? undefined, analogia: row.analogia ?? undefined, alterado: row.alterado ?? undefined };
}

/** Gera via IA (GLM) e faz upsert no banco (source='ai'). Devolve o JSON parseado. */
export async function generateExplanation(name: string, locale: string = DEFAULT_LOCALE): Promise<Explanation> {
  const s = await getLlm().stream({
    model: getModel(),
    maxTokens: 700,
    // SEGURANÇA (revisão clínica 2026-07): esta saída é cacheada e exibida a TODOS os pacientes.
    // Antes a explicação era gerada SEM system prompt e SEM diagnosticGuard — único caminho de IA
    // → paciente sem defesa. Agora usa o mesmo HEALTH_SYSTEM das demais saídas.
    system: HEALTH_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Explique de forma SIMPLES e CURTA (português, leigo) o exame/analito "${name}". Devolva APENAS JSON: {"titulo":"nome amigável","resumo":"1 frase: o que mede","analogia":"analogia do dia a dia","alterado":"o que pode significar se alto/baixo (sem diagnosticar)"}${JSON_SUFFIX}`,
      },
    ],
  });
  const resp = await s.final();
  const raw = extractJsonObject(resp.text) as Explanation | null;
  // Defense-in-depth sobre o campo 'alterado' — onde o modelo naturalmente tenta concluir doença.
  // HEALTH_SYSTEM já proíbe no prompt; diagnosticGuard reforça pós-geração (mesma defesa do chat).
  const parsed: Explanation | null =
    raw && raw.alterado ? { ...raw, alterado: diagnosticGuard(raw.alterado).text } : raw;
  // Só persiste se veio resumo (sinal de JSON válido). Sem resumo, não cacheia — próxima chamada regenera.
  if (parsed?.resumo) {
    const k = nameKey(name);
    const data = {
      nameKey: k,
      locale,
      promptVersion: EXPLAIN_PROMPT_VERSION,
      source: 'ai' as const,
      nameDisplay: name,
      titulo: parsed.titulo ?? null,
      resumo: parsed.resumo ?? null,
      analogia: parsed.analogia ?? null,
      alterado: parsed.alterado ?? null,
    };
    await prisma.examKnowledge.upsert({
      where: { nameKey_locale: { nameKey: k, locale } },
      create: data,
      update: data,
    });
  }
  return parsed ?? {};
}

/** Cache-ou-gera: pega do banco; se faltar (ou versão velha), gera via IA e persiste. */
export async function getOrCreateExplanation(name: string, locale: string = DEFAULT_LOCALE): Promise<Explanation> {
  const cached = await getExplanation(name, locale);
  if (cached) return cached;
  return generateExplanation(name, locale);
}
