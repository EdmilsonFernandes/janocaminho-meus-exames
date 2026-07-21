// Recomputa flag/isAbnormal de TODOS os exam_items usando reconcileScaleFlag ATUAL.
// Resolve flags STALE — computados numa versão antiga do reconcileScaleFlag que rebaixava
// errado (ex.: ESTRADIOL 103 pg/mL, ref 30.9–90.4, marcado UNKNOWN mas deveria HIGH).
// Garante que a classificação (acima/abaixo/normal) segue rigorosamente as referências atuais.
//
// RODAR no container:
//   docker exec -w /app/packages/server meus-exames-app node dist/scripts/backfill-recompute-flags.js            # dry-run
//   docker exec -w /app/packages/server meus-exames-app node dist/scripts/backfill-recompute-flags.js --apply    # persiste
//
// Conservador: só atualiza itens cujo flag/isAbnormal MUDA. Idempotente. Não toca em
// value/refLow/refHigh (usa os atuais pra recomputar). Itens sem ref continuam UNKNOWN.
import { prisma } from '../src/prisma';
import { reconcileScaleFlag } from '../src/utils/normalize';

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '[recompute-flags] APLICANDO (--apply)' : '[recompute-flags] DRY-RUN (use --apply para persistir)');

  const items = await prisma.examItem.findMany({
    select: { id: true, name: true, nameCanonical: true, valueNumeric: true, unit: true, refLow: true, refHigh: true, flag: true, isAbnormal: true, exam: { select: { patient: { select: { fullName: true } } } } },
  });
  console.log(`[recompute-flags] ${items.length} itens lidos`);

  const changes: { id: string; name: string; patient: string; value: number | null; unit: string | null; ref: string; oldFlag: string; oldAbn: boolean; newFlag: string; newAbn: boolean }[] = [];
  for (const it of items) {
    const { flag, isAbnormal } = reconcileScaleFlag(it.valueNumeric, it.refLow, it.refHigh, it.unit);
    if (String(flag) !== String(it.flag) || isAbnormal !== it.isAbnormal) {
      changes.push({ id: it.id, name: it.name, patient: it.exam?.patient?.fullName ?? '?', value: it.valueNumeric, unit: it.unit, ref: `${it.refLow ?? '?'}-${it.refHigh ?? '?'}`, oldFlag: String(it.flag), oldAbn: it.isAbnormal, newFlag: String(flag), newAbn: isAbnormal });
    }
  }

  console.log(`[recompute-flags] ${changes.length} de ${items.length} itens mudariam de flag/isAbnormal.`);
  for (const c of changes.slice(0, 80)) console.log(`   ${c.patient} · ${c.name}: ${c.value} ${c.unit ?? ''} (ref ${c.ref})  [${c.oldFlag}/${c.oldAbn} -> ${c.newFlag}/${c.newAbn}]`);
  if (changes.length > 80) console.log(`   ... e mais ${changes.length - 80}.`);

  if (!apply) {
    console.log('[recompute-flags] DRY-RUN: nada persistido.');
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  for (const c of changes) {
    await prisma.examItem.update({ where: { id: c.id }, data: { flag: c.newFlag as any, isAbnormal: c.newAbn } });
    done++;
    if (done % 200 === 0) console.log(`[recompute-flags] ${done}/${changes.length}...`);
  }
  console.log(`[recompute-flags] ${done} itens atualizados.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
