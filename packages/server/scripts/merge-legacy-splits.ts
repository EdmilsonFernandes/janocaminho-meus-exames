/**
 * Backfill: junta SPLITS legados do MESMO DIA num único exame (o "split-falso").
 *
 * Contexto: antes do mergeLabsByDate (2026-08), um PDF de data de coleta ÚNICA era fatiado em
 * N exames (um por painel: "Ácido Úrico", "Creatinina"…), inflando histórico/contadores e
 * deixando a lista com uma torre de cards repetidos. O pipeline novo não cria mais isso; este
 * script corrige o legado.
 *
 * Regra (conservadora):
 *  - Exame SPLIT = fileSha256 com sufixo "#split-N"; PRIMÁRIO = exame do mesmo paciente com a
 *    base-sha idêntica (sem sufixo). Garantido único pelo @@unique([patientId, fileSha256]).
 *  - Só merge se a DATA DE COLETA do split for IGUAL à do primário (null==null conta como igual:
 *    sem data → mesmo documento). Splits de outra data = multi-exame genuíno → INTOCADO.
 *  - Move TODOS os exam_items pro primário (cascade os apagaria junto com o split — por isso a
 *    ordem: mover, dedupar, só então deletar o split). AiAnalysis do split cai com ele (cascade;
 *    resumo regenerável). Splits ÓRFÃOS (sem primário) ficam e são reportados.
 *  - Após mover, remove duplicatas exatas no primário (nameCanonical+valueText+unit iguais).
 *
 * Uso: npx tsx scripts/merge-legacy-splits.ts           → DRY-RUN (só relata)
 *      npx tsx scripts/merge-legacy-splits.ts --apply   → aplica em TRANSAÇÃO por grupo
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const SPLIT_RX = /#split-\d+$/;

const dayOf = (d: Date | null) => (d == null ? null : d.toISOString().slice(0, 10));

async function main() {
  const splits = await prisma.exam.findMany({
    where: { fileSha256: { contains: '#split-' } },
    select: { id: true, patientId: true, title: true, fileSha256: true, performedAt: true, _count: { select: { items: true } } },
  });
  console.log(`[merge-splits] ${splits.length} exames split encontrados (modo: ${APPLY ? 'APPLY' : 'DRY-RUN'})`);

  // Índice de primários por (patientId, baseSha)
  const primaries = await prisma.exam.findMany({
    where: { fileSha256: { not: { contains: '#split-' } } },
    select: { id: true, patientId: true, fileSha256: true, performedAt: true },
  });
  const primIdx = new Map(primaries.map((p) => [`${p.patientId}|${p.fileSha256}`, p]));

  // Agrupa por primário (merge = 1 transação por grupo → falha isolada não derruba o resto)
  const groups = new Map<string, { primary: typeof primaries[number]; splits: typeof splits }>();
  const orphans: typeof splits = [];
  const differentDay: typeof splits = [];
  for (const s of splits) {
    const baseSha = s.fileSha256.replace(SPLIT_RX, '');
    const primary = primIdx.get(`${s.patientId}|${baseSha}`);
    if (!primary) { orphans.push(s); continue; }
    if (dayOf(s.performedAt) !== dayOf(primary.performedAt)) { differentDay.push(s); continue; }
    const key = primary.id;
    if (!groups.has(key)) groups.set(key, { primary, splits: [] });
    groups.get(key)!.splits.push(s);
  }

  let totalMerged = 0, totalItemsMoved = 0, totalDupesDeleted = 0, totalSplitsDeleted = 0;

  for (const [primaryId, g] of groups) {
    const splitIds = g.splits.map((s) => s.id);
    const itemsToMove = g.splits.reduce((n, s) => n + s._count.items, 0);
    const pDay = dayOf(g.primary.performedAt) ?? 's/data';
    console.log(`- primário ${primaryId} (${pDay}): ${g.splits.length} splits same-day, ${itemsToMove} itens p/ mover | títulos: ${g.splits.map((s) => s.title.slice(0, 22)).join(', ').slice(0, 110)}`);

    if (!APPLY) { totalMerged += g.splits.length; totalItemsMoved += itemsToMove; continue; }

    try {
      const res = await prisma.$transaction(async (tx) => {
        // 1) move itens ANTES do delete (cascade)
        await tx.examItem.updateMany({ where: { examId: { in: splitIds } }, data: { examId: primaryId } });
        // 2) dedup exato dentro do primário (analito repetido entre painéis do mesmo dia)
        const items = await tx.examItem.findMany({
          where: { examId: primaryId },
          select: { id: true, nameCanonical: true, valueText: true, unit: true },
          orderBy: { id: 'asc' },
        });
        const seen = new Set<string>();
        const dupeIds: string[] = [];
        for (const it of items) {
          const k = `${it.nameCanonical}§${it.valueText ?? ''}§${it.unit ?? ''}`;
          if (seen.has(k)) dupeIds.push(it.id); else seen.add(k);
        }
        if (dupeIds.length) await tx.examItem.deleteMany({ where: { id: { in: dupeIds } } });
        // 3) apaga os splits (itens já movidos; AiAnalysis cai no cascade — regenerável)
        await tx.exam.deleteMany({ where: { id: { in: splitIds } } });
        return { moved: itemsToMove, dupes: dupeIds.length, deleted: splitIds.length };
      });
      totalMerged += res.deleted; totalItemsMoved += res.moved; totalDupesDeleted += res.dupes; totalSplitsDeleted += res.deleted;
    } catch (e) {
      console.error(`  ✗ grupo ${primaryId} FALHOU (isolado, sem efeito):`, (e as Error).message);
    }
  }

  if (orphans.length) console.log(`⚠ ${orphans.length} splits ÓRFÃOS (sem primário) — intocados: ${orphans.map((o) => o.id.slice(-6)).join(', ')}`);
  if (differentDay.length) console.log(`ℹ ${differentDay.length} splits de OUTRA data (multi-exame genuíno) — intocados`);

  console.log(`\n[merge-splits] ${APPLY ? 'APLICADO' : 'DRY-RUN'}: ${totalMerged} splits ${APPLY ? 'mesclados' : 'a mesclar'}, ${totalItemsMoved} itens movidos, ${totalDupesDeleted} duplicatas removidas`);
  if (APPLY) console.log('[merge-splits] ⚠ health-summary cacheado (5min/TTL) — restart do container ou aguarde p/ o dashboard refletir');
}

main().finally(() => prisma.$disconnect());
