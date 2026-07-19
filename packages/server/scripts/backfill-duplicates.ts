/**
 * Backfill — detecta e marca exames duplicados como DUPLICATE (não apaga, só desativa).
 * Rodar: npx tsx scripts/backfill-duplicates.ts
 *
 * Critério: mesmo patientId + mesma data (performedAt) + título similar → o MAIS RECENTE
 * (createdAt maior) fica, o mais antigo é marcado como DUPLICATE + reviewRequired=true.
 */
import { prisma } from '../src/prisma';

async function main() {
  console.log('🔍 Procurando exames duplicados...');
  const exams = await prisma.exam.findMany({
    where: { status: 'EXTRACTED' },
    select: { id: true, patientId: true, title: true, performedAt: true, sourceLab: true, createdAt: true, _count: { select: { items: true } } },
    orderBy: { createdAt: 'desc' },
  });

  // Agrupa por (patientId, performedAt, title normalizado)
  const groups = new Map<string, typeof exams>();
  for (const e of exams) {
    const dateKey = e.performedAt ? new Date(e.performedAt).toISOString().slice(0, 10) : 'no-date';
    const titleKey = e.title.toLowerCase().replace(/[^a-z0-9]/gi, '').slice(0, 30);
    const key = `${e.patientId}|${dateKey}|${titleKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  let marked = 0;
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    // Ordena por createdAt desc (mais recente primeiro) — mantém o 1º, marca o resto
    group.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const keep = group[0];
    const dups = group.slice(1);
    console.log(`  ⚠️  Duplicata: "${keep.title}" ${keep.performedAt?.toISOString().slice(0,10)} — mantendo ${keep.id.slice(-6)}, marcando ${dups.length} como DUPLICATE`);
    for (const d of dups) {
      await prisma.exam.update({ where: { id: d.id }, data: { status: 'DUPLICATE', reviewRequired: true } });
      marked++;
    }
  }

  console.log(`\n✅ ${marked} exame(s) marcado(s) como DUPLICATE (não apagados — admin pode revisar).`);
  console.log(`   ${groups.size - marked} grupo(s) único(s) (sem duplicata).`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error('ERRO:', e); process.exit(1); });
