// Importa o cache ANTIGO de explicações (arquivo JSON exam-explanations.json) pra dentro da
// tabela exam_knowledge (novo cache em banco). As chaves do JSON já são nameKey() canônicas.
//
// RODAR no DEV (após `prisma db push` que criou a tabela):
//   npx tsx scripts/backfill-exam-knowledge.ts            # dry-run
//   npx tsx scripts/backfill-exam-knowledge.ts --apply    # persiste
//
// RODAR em PROD (após deploy; o volume /app/data/agent tem o JSON):
//   docker exec -w /app/packages/server meus-exames-app node dist/scripts/backfill-exam-knowledge.js --apply
//
// Seguro/idempotente: upsert por (nameKey, locale). Re-rodar não duplica. Se o JSON não existir,
// não faz nada (tabela começa vazia e é populada on-demand pelo /items/explain).
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/prisma';
import { EXPLAIN_PROMPT_VERSION, DEFAULT_LOCALE } from '../src/analysis/explain';

const AGENT_DIR = process.env.AGENT_DIR || './data/agent';
const FILE = path.join(AGENT_DIR, 'exam-explanations.json');

interface LegacyExplanation { titulo?: string; resumo?: string; analogia?: string; alterado?: string }

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '[backfill-exam-knowledge] APLICANDO (--apply)' : '[backfill-exam-knowledge] DRY-RUN (use --apply para persistir)');
  console.log('[backfill-exam-knowledge] lendo:', FILE);

  if (!fs.existsSync(FILE)) {
    console.log('[backfill-exam-knowledge] arquivo não encontrado — nada a importar (tabela começa vazia).');
    await prisma.$disconnect();
    return;
  }

  let map: Record<string, LegacyExplanation>;
  try {
    map = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e: any) {
    console.error('[backfill-exam-knowledge] JSON inválido:', e?.message);
    process.exit(1);
  }

  const entries = Object.entries(map).filter(([, v]) => v && (v as LegacyExplanation).resumo);
  console.log(`[backfill-exam-knowledge] ${entries.length} entradas válidas (com resumo) de ${Object.keys(map).length} chaves.`);

  if (!entries.length) { console.log('[backfill-exam-knowledge] nada a importar.'); await prisma.$disconnect(); return; }

  for (const [k, v] of entries.slice(0, apply ? entries.length : 10)) {
    console.log(`   ${k} → resumo: "${(v as LegacyExplanation).resumo?.slice(0, 60) ?? ''}…"`);
  }

  if (!apply) {
    console.log('[backfill-exam-knowledge] DRY-RUN: nada persistido.');
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  for (const [k, v] of entries) {
    const ex = v as LegacyExplanation;
    const data = {
      nameKey: k,
      locale: DEFAULT_LOCALE,
      promptVersion: EXPLAIN_PROMPT_VERSION,
      source: 'ai' as const,
      nameDisplay: k,
      titulo: ex.titulo ?? null,
      resumo: ex.resumo ?? null,
      analogia: ex.analogia ?? null,
      alterado: ex.alterado ?? null,
    };
    await prisma.examKnowledge.upsert({
      where: { nameKey_locale: { nameKey: k, locale: DEFAULT_LOCALE } },
      create: data,
      update: data,
    });
    done++;
    if (done % 50 === 0) console.log(`[backfill-exam-knowledge] ${done}/${entries.length}...`);
  }
  console.log(`[backfill-exam-knowledge] concluído: ${done} importadas.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[backfill-exam-knowledge] ERRO:', e);
  process.exit(1);
});
