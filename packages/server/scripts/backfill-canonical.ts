// Re-normaliza exam_items.nameCanonical com a canonicalName() CORRIGIDA — lida com
// sufixos/qualificadores de laboratório: "TGO (AST)" → "TGO",
// "TRANSAMINASE OXALACETICA TGO (AST)" → "TGO", "HEMOGLOBINA" dentro de painel, etc.
//
// POR QUÊ: cada laboratório gerava um nameCanonical DIFERENTE para o MESMO analito
// (TGO ficava rachado em "TGO (AST)" + "TRANSAMINASE OXALACETICA TGO (AST)"). Isso
// quebrava evolução/tendência (viravam 2 séries do mesmo analito → "duplicado") e o
// roteador do chat, que busca nameCanonical='TGO' e não achava o item → a IA dizia
// "não encontrei TGO" mesmo o dado existindo.
//
// RODAR no container (após deploy que inclua este fix + a canonicalName nova):
//   docker exec -w /app/packages/server meus-exames-app node dist/scripts/backfill-canonical.js            # preview (dry-run)
//   docker exec -w /app/packages/server meus-exames-app node dist/scripts/backfill-canonical.js --apply    # persiste
//
// Seguro: só reescreve nameCanonical; o valor original fica em `name`. Itens que já
// casavam exatamente (HEMOGLOBINA, TSH...) não mudam. É idempotente.
import { prisma } from '../src/prisma';
import { canonicalName } from '../src/utils/normalize';

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '[backfill] APLICANDO (--apply)' : '[backfill] DRY-RUN (use --apply para persistir)');

  const items = await prisma.examItem.findMany({ select: { id: true, name: true, nameCanonical: true } });
  console.log(`[backfill] ${items.length} itens lidos`);

  const changes: { id: string; old: string; neu: string; name: string }[] = [];
  for (const it of items) {
    const neu = canonicalName(it.name);
    if (neu !== it.nameCanonical) changes.push({ id: it.id, old: it.nameCanonical, neu, name: it.name });
  }

  // Resumo transparente: agrupa (antigo → novo) por contagem.
  const groups = new Map<string, number>();
  for (const c of changes) {
    const k = `${c.old}  ->  ${c.neu}`;
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  console.log(`[backfill] ${changes.length} de ${items.length} itens mudariam de nameCanonical. TODAS as alterações (antigo -> novo):`);
  [...groups.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`   ${String(n).padStart(4)}  ${k}`));

  if (!apply) {
    console.log('[backfill] DRY-RUN: nada persistido.');
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
    console.log(`[backfill] ${done}/${changes.length} atualizados...`);
  }
  console.log('[backfill] concluído.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[backfill] ERRO:', e);
  process.exit(1);
});
