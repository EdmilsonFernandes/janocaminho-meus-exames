// Re-aplica toCanonicalUnit() nos exam_items JÁ EXISTENTES — converte valores/refs/unidades à
// escala-padrão do analito (Frente 1B/1C). Resolve retroativamente o bug da Testosterona do
// Edmilson (itens em nmol/L+pg/mL cruzando escalas na evolução).
//
// RODAR no container (após deploy que inclua o units.ts):
//   docker exec -w /app/packages/server meus-exames-app node dist/scripts/backfill-canonical-units.js            # dry-run
//   docker exec -w /app/packages/server meus-exames-app node dist/scripts/backfill-canonical-units.js --apply    # persiste
//
// Seguro/idempotente: só reescreve quando há conversão definida (toCanonicalUnit != null e diferente).
// Converte valor + refLow + refHigh (mesmo fator). Não toca em flag/isAbnormal (já reconciliado).
import { prisma } from '../src/prisma';
import { toCanonicalUnit } from '../src/utils/units';
import { canonicalName } from '../src/utils/normalize';

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '[backfill-units] APLICANDO (--apply)' : '[backfill-units] DRY-RUN (use --apply)');

  const items = await prisma.examItem.findMany({
    select: { id: true, name: true, nameCanonical: true, valueNumeric: true, unit: true, refLow: true, refHigh: true, exam: { select: { patient: { select: { fullName: true } } } } },
  });
  console.log(`[backfill-units] ${items.length} itens lidos`);

  const changes: { id: string; name: string; patient: string; oldV: number | null; newV: number | null; oldU: string | null; newU: string | null }[] = [];
  for (const it of items) {
    if (it.valueNumeric == null) continue;
    const canonical = it.nameCanonical || canonicalName(it.name);
    const conv = toCanonicalUnit(canonical, it.valueNumeric, it.unit);
    if (!conv || (conv.value === it.valueNumeric && conv.unit === (it.unit ?? ''))) continue;
    changes.push({ id: it.id, name: it.name, patient: it.exam?.patient?.fullName ?? '?', oldV: it.valueNumeric, newV: conv.value, oldU: it.unit, newU: conv.unit });
  }

  // Resumo por analito
  const byAnal = new Map<string, number>();
  for (const c of changes) byAnal.set(c.name, (byAnal.get(c.name) ?? 0) + 1);
  console.log(`[backfill-units] ${changes.length} de ${items.length} itens mudariam. Amostra:`);
  for (const c of changes.slice(0, 15)) console.log(`   ${c.patient} · ${c.name}: ${c.oldV} ${c.oldU} → ${c.newV} ${c.newU}`);

  if (!changes.length) console.log('[backfill-units] nada a fazer.');
  if (!apply) {
    console.log('[backfill-units] DRY-RUN: nada persistido.');
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  const BATCH = 200;
  for (let i = 0; i < changes.length; i += BATCH) {
    const slice = changes.slice(i, i + BATCH);
    await prisma.$transaction(async (tx) => {
      for (const c of slice) {
        const orig = items.find((it) => it.id === c.id);
        if (!orig) continue;
        const factor = c.newV && orig.valueNumeric ? c.newV / orig.valueNumeric : 1;
        await tx.examItem.update({
          where: { id: c.id },
          data: {
            valueNumeric: c.newV,
            unit: c.newU,
            refLow: orig.refLow != null ? Number((orig.refLow * factor).toFixed(4)) : orig.refLow,
            refHigh: orig.refHigh != null ? Number((orig.refHigh * factor).toFixed(4)) : orig.refHigh,
          },
        });
      }
    });
    done += slice.length;
    console.log(`[backfill-units] ${done}/${changes.length} atualizados...`);
  }
  console.log('[backfill-units] concluído.');
  await prisma.$disconnect();
}

main().catch((e) => { console.error('[backfill-units] ERRO:', e); process.exit(1); });
