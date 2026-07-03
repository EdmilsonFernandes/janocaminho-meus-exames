// Re-aplica reconcileScaleFlag nos exam_items JÁ EXISTENTES — corrige retroativamente os
// LOW/HIGH FALSOS causados por conflito de ESCALA de unidades (hemograma: valor em g/dL vs
// referência em g/L, valor em % vs absoluto /mm³, milhões vs milhares, pg vs ×10).
//
// reconcileScaleFlag foi adicionada ao pipeline de extração (mitiga pra próximas extrações /
// pacientes novos); ESTE backfill corrige o que JÁ está no banco (exames extraídos antes do fix).
//
// RODAR no container (após deploy que inclua o fix):
//   docker exec -w /app/packages/server meus-exames-app node dist/scripts/backfill-scale-flag.js            # dry-run (preview)
//   docker exec -w /app/packages/server meus-exames-app node dist/scripts/backfill-scale-flag.js --apply    # persiste
//
// Seguro: só reescreve flag/isAbnormal -> UNKNOWN/false quando há conflito de escala confirmado
// pela UNIDADE. Itens já corretos (NORMAL, ou LOW/HIGH real com unidade absoluta) NÃO mudam.
// Idempotente. Não toca em value/refLow/refHigh (originais preservados).
import { prisma } from '../src/prisma';
import { reconcileScaleFlag } from '../src/utils/normalize';

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '[backfill-scale] APLICANDO (--apply)' : '[backfill-scale] DRY-RUN (use --apply para persistir)');

  const items = await prisma.examItem.findMany({
    select: { id: true, name: true, nameCanonical: true, valueNumeric: true, unit: true, refLow: true, refHigh: true, flag: true, isAbnormal: true, exam: { select: { patient: { select: { fullName: true } } } } },
  });
  console.log(`[backfill-scale] ${items.length} itens lidos`);

  const changes: { id: string; name: string; patient: string; value: number | null; unit: string | null; ref: string; oldFlag: string }[] = [];
  for (const it of items) {
    const { flag, scaleConflict } = reconcileScaleFlag(it.valueNumeric, it.refLow, it.refHigh, it.unit);
    // só precisa mudar se ainda está marcado errado (não é UNKNOWN/false já)
    if (scaleConflict && (String(it.flag) !== 'UNKNOWN' || it.isAbnormal !== false)) {
      changes.push({
        id: it.id, name: it.name, patient: it.exam?.patient?.fullName ?? '?',
        value: it.valueNumeric, unit: it.unit, ref: `${it.refLow ?? '?'}-${it.refHigh ?? '?'}`,
        oldFlag: String(it.flag),
      });
      void flag;
    }
  }

  console.log(`[backfill-scale] ${changes.length} de ${items.length} itens mudariam de flag (conflito de escala confirmado pela unidade). Detalhe (paciente · analito: valor unit (ref) [antigo -> UNKNOWN]):`);
  for (const c of changes) console.log(`   ${c.patient} · ${c.name}: ${c.value} ${c.unit ?? ''} (ref ${c.ref})  [${c.oldFlag} -> UNKNOWN]`);

  if (!apply) {
    console.log('[backfill-scale] DRY-RUN: nada persistido.');
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  const BATCH = 200;
  for (let i = 0; i < changes.length; i += BATCH) {
    const slice = changes.slice(i, i + BATCH);
    await prisma.$transaction(
      slice.map((c) => prisma.examItem.update({ where: { id: c.id }, data: { flag: 'UNKNOWN', isAbnormal: false } })),
    );
    done += slice.length;
    console.log(`[backfill-scale] ${done}/${changes.length} atualizados...`);
  }
  console.log('[backfill-scale] concluído.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[backfill-scale] ERRO:', e);
  process.exit(1);
});
