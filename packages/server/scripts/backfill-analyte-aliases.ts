/**
 * Backfill de nameCanonical — recanonicaliza TODOS os exam_items com o dicionário ATUAL
 * de sinônimos (utils/normalize.ts). Invariant restaurado: nameCanonical armazenado ==
 * canonicalName(name). Uso: novas siglas/expansões entraram no dicionário (ex.: FSH/LH,
 * bug 2026-08-16: "Fsh - Hormonio Foliculo Estimulante" era série separada de "FSH").
 *
 * Idempotente: rodar de novo = 0 updates. Seguro: só reescreve a CHAVE de agrupamento
 * (valor/faixa/flag intactos) — efeitos: séries de tendência se mesclam, distinct-names
 * agrupa, health-summary re-scoreia no próximo refresh (cache morre no restart do deploy).
 *
 * Uso: DATABASE_URL=... npx tsx scripts/backfill-analyte-aliases.ts [--dry]
 */
import { PrismaClient } from '@prisma/client';
import { canonicalName } from '../src/utils/normalize';

const prisma = new PrismaClient();
const dry = process.argv.includes('--dry');

async function main() {
  const items = await prisma.examItem.findMany({ select: { id: true, name: true, nameCanonical: true } });
  console.log(`[backfill-aliases] ${items.length} itens — recanonicalizando (dry=${dry})`);
  let changed = 0;
  const byPair = new Map<string, number>();
  for (const it of items) {
    const want = canonicalName(it.name || '') || it.nameCanonical;
    if (want && want !== it.nameCanonical) {
      changed++;
      const k = `${it.nameCanonical} → ${want}`;
      byPair.set(k, (byPair.get(k) ?? 0) + 1);
      if (!dry) await prisma.examItem.update({ where: { id: it.id }, data: { nameCanonical: want } });
    }
  }
  console.log(`[backfill-aliases] ${changed} itens ${dry ? 'SERIAM atualizados' : 'atualizados'}. Pares:`);
  for (const [k, n] of [...byPair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${n}×  ${k}`);
}

main().finally(() => prisma.$disconnect());
