// Re-aplica canonicalName() nos exam_items JÁ EXISTENTES. Necessário porque SYNONYMS mudou
// (separou TESTOSTERONA_TOTAL de TESTOSTERONA_LIVRE — antes cruzavam escalas pg/mL vs ng/dL
// no mesmo canonical na evolução). Só novas extrações usavam o SYNONYMS novo; este backfill
// corrige o que JÁ está no banco.
//
// RODAR no container (após deploy que inclua o SYNONYMS novo):
//   docker exec -w /app/packages/server meus-exames-app node dist/scripts/backfill-name-canonical.js            # dry-run
//   docker exec -w /app/packages/server meus-exames-app node dist/scripts/backfill-name-canonical.js --apply    # persiste
//
// Seguro/idempotente: só reescreve nameCanonical quando o novo valor difere. Pra marcadores
// cujo SYNONYMS não mudou, canonicalName() devolve o mesmo (não altera). Pra testosterona,
// separa Total/Livre (vira 2 séries distintas em vez de 1 cruzada).
import { prisma } from '../src/prisma';
import { canonicalName } from '../src/utils/normalize';

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '[backfill-canonical] APLICANDO (--apply)' : '[backfill-canonical] DRY-RUN (use --apply para persistir)');

  const items = await prisma.examItem.findMany({
    select: { id: true, name: true, nameCanonical: true, exam: { select: { patient: { select: { fullName: true } } } } },
  });
  console.log(`[backfill-canonical] ${items.length} itens lidos`);

  const changes: { id: string; name: string; patient: string; old: string; neu: string }[] = [];
  for (const it of items) {
    const neu = canonicalName(it.name);
    if (neu && neu !== it.nameCanonical) {
      changes.push({ id: it.id, name: it.name, patient: it.exam?.patient?.fullName ?? '?', old: it.nameCanonical, neu });
    }
  }

  // Agrupa por (old → neu) pra mostrar o impacto (ex.: quantos TESTOSTERONA viraram TESTOSTERONA_TOTAL/LIVRE)
  const byChange = new Map<string, number>();
  for (const c of changes) { const k = `${c.old} → ${c.neu}`; byChange.set(k, (byChange.get(k) ?? 0) + 1); }
  console.log(`[backfill-canonical] ${changes.length} de ${items.length} itens mudariam de nameCanonical. Resumo (antigo → novo):`);
  for (const [k, n] of [...byChange.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`   ${n}×  ${k}`);

  if (!changes.length) console.log('[backfill-canonical] nada a fazer.');
  if (!apply) {
    console.log('[backfill-canonical] DRY-RUN: nada persistido.');
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  const BATCH = 200;
  for (let i = 0; i < changes.length; i += BATCH) {
    const slice = changes.slice(i, i + BATCH);
    await prisma.$transaction(
      slice.map((c) => prisma.examItem.update({ where: { id: c.id }, data: { nameCanonical: c.neu } })),
    );
    done += slice.length;
    console.log(`[backfill-canonical] ${done}/${changes.length} atualizados...`);
  }
  console.log('[backfill-canonical] concluído.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[backfill-canonical] ERRO:', e);
  process.exit(1);
});
