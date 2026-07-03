// Re-aplica normalizeUnit (campo unit) + sanitizeUnitInText (campo valueText) nos exam_items
// JÁ EXISTENTES — corrige retroativamente unidades corrompidas pelo pdftotext/poppler
// (ex.: Plaquetas "/mm*" -> "/mm³", "10^3" -> "×10³", "g/dl" -> "g/dL").
//
// normalizeUnit/sanitizeUnitInText foram adicionados ao pipeline de extração (mitigam para
// próximas extrações); ESTE backfill corrige o que JÁ está no banco (exames antes do fix).
//
// RODAR no container (após deploy que inclua o fix):
//   docker exec -w /app/packages/server meus-exames-app node dist/scripts/backfill-unit-sanitize.js            # dry-run
//   docker exec -w /app/packages/server meus-exames-app node dist/scripts/backfill-unit-sanitize.js --apply    # persiste
//
// Seguro/idempotente: só reescreve unit/valueText quando o normalize altera de fato. Não toca
// em value/refLow/refHigh/flag (originais preservados).
import { prisma } from '../src/prisma';
import { normalizeUnit, sanitizeUnitInText } from '../src/utils/normalize';

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '[backfill-unit] APLICANDO (--apply)' : '[backfill-unit] DRY-RUN (use --apply para persistir)');

  const items = await prisma.examItem.findMany({
    select: { id: true, name: true, unit: true, valueText: true, exam: { select: { patient: { select: { fullName: true } } } } },
  });
  console.log(`[backfill-unit] ${items.length} itens lidos`);

  const changes: { id: string; name: string; patient: string; oldUnit: string | null; newUnit: string | null; oldValueText: string | null; newValueText: string | null }[] = [];
  for (const it of items) {
    const newUnit = normalizeUnit(it.unit);
    const newValueText = sanitizeUnitInText(it.valueText);
    if (newUnit !== it.unit || newValueText !== it.valueText) {
      changes.push({ id: it.id, name: it.name, patient: it.exam?.patient?.fullName ?? '?', oldUnit: it.unit, newUnit, oldValueText: it.valueText, newValueText });
    }
  }

  console.log(`[backfill-unit] ${changes.length} de ${items.length} itens mudariam de unit/valueText. Amostra (paciente · analito: unit [antigo -> novo]):`);
  for (const c of changes.slice(0, 40)) console.log(`   ${c.patient} · ${c.name}: unit "${c.oldUnit}" -> "${c.newUnit}"${c.oldValueText !== c.newValueText ? ` | valueText "${c.oldValueText}" -> "${c.newValueText}"` : ''}`);

  if (!changes.length) console.log('[backfill-unit] nada a fazer.');
  if (!apply) {
    console.log('[backfill-unit] DRY-RUN: nada persistido.');
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  const BATCH = 200;
  for (let i = 0; i < changes.length; i += BATCH) {
    const slice = changes.slice(i, i + BATCH);
    await prisma.$transaction(
      slice.map((c) => prisma.examItem.update({ where: { id: c.id }, data: { unit: c.newUnit, valueText: c.newValueText } })),
    );
    done += slice.length;
    console.log(`[backfill-unit] ${done}/${changes.length} atualizados...`);
  }
  console.log('[backfill-unit] concluído.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[backfill-unit] ERRO:', e);
  process.exit(1);
});
