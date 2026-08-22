/**
 * Backfill FAIXAS PEDIÁTRICAS (Lote 2) — recalcula flag/ref de itens de exames de
 * PACIENTES < 18 anos na data de coleta, aplicando a mesma régua do pipeline
 * (analysis/pediatric-ranges). Laudo próprio continua vencendo.
 *
 * DRY-RUN por padrão (só relatório). Aplicar de verdade: --apply
 *   npx tsx scripts/backfill-pediatric-flags.ts            → relatório
 *   npx tsx scripts/backfill-pediatric-flags.ts --apply    → grava + invalida cache
 */
import { PrismaClient } from '@prisma/client';
import { computeFlag } from '../src/utils/normalize';
import { ageBandAt, applyPediatricRange } from '../src/analysis/pediatric-ranges';
import { loadSettings } from '../src/utils/settings';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function main() {
  await loadSettings();
  const patients = await prisma.patient.findMany({ where: { dateOfBirth: { not: null } }, select: { id: true, fullName: true, dateOfBirth: true } });
  let exams = 0; let itemsSeen = 0; let itemsChanged = 0; let itemsUnflagged = 0; let itemsFlagged = 0;
  const rows: string[] = [];

  for (const p of patients) {
    const pExams = await prisma.exam.findMany({ where: { patientId: p.id, status: 'EXTRACTED' }, select: { id: true, title: true, performedAt: true } });
    for (const ex of pExams) {
      const band = ageBandAt(p.dateOfBirth, ex.performedAt);
      if (!band) continue; // adulto na data → nada a fazer
      exams++;
      const items = await prisma.examItem.findMany({ where: { examId: ex.id }, select: { id: true, name: true, nameCanonical: true, valueNumeric: true, unit: true, refLow: true, refHigh: true, flag: true, isAbnormal: true } });
      for (const it of items) {
        itemsSeen++;
        const ped = applyPediatricRange(it.nameCanonical, it.refLow, it.refHigh, band);
        if (!ped) continue;
        const { flag, isAbnormal } = computeFlag(it.valueNumeric, ped.low, ped.high);
        if (it.flag === flag && it.isAbnormal === isAbnormal && it.refLow === ped.low && it.refHigh === ped.high) continue;
        itemsChanged++;
        if (it.isAbnormal && !isAbnormal) itemsUnflagged++;
        if (!it.isAbnormal && isAbnormal) itemsFlagged++;
        rows.push(`${APPLY ? 'APLICADO' : 'DRY-RUN'} | ${p.fullName} · ${ex.title} (${(ex.performedAt as Date)?.toISOString().slice(0, 10)}) · ${it.name}: ${it.valueNumeric} ${it.unit ?? ''} | ref ${it.refLow}–${it.refHigh} [${it.flag}] → ${ped.low}–${ped.high} [${flag}] (${ped.appliesTo})`);
        if (APPLY) {
          await prisma.examItem.update({ where: { id: it.id }, data: { refLow: ped.low, refHigh: ped.high, refAppliesTo: ped.appliesTo, flag, isAbnormal } });
        }
      }
    }
    if (APPLY) {
      // score/"o que mudou" do paciente mudou → invalida cache do health-summary
      try { const { invalidateHealthSummary } = await import('../src/analysis/hs-cache'); invalidateHealthSummary(p.id); } catch { /* opcional */ }
    }
  }

  console.log(`\n═══ BACKFILL PEDIÁTRICO (${APPLY ? 'APLICADO' : 'DRY-RUN'}) ═══`);
  console.log(`pacientes c/ nascimento: ${patients.length} · exames de menores: ${exams}`);
  console.log(`itens avaliados: ${itemsSeen} · ALTERADOS: ${itemsChanged} (⚠️→✅ ${itemsUnflagged} falsos-alarmes desfeitos · ✅→⚠️ ${itemsFlagged})`);
  for (const r of rows) console.log('  ' + r);
  if (!APPLY && rows.length) console.log('\nRode com --apply para gravar as mudanças acima.');
  if (!rows.length) console.log('Nada a mudar — nenhum item de menor caiu na régua pediátrica.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
