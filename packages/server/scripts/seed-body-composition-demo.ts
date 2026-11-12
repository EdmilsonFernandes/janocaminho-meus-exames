/**
 * Seed de demonstração da COMPOSIÇÃO CORPORAL (dev only): grava um cenário SINTÉTICO de
 * avaliações para ver a tela /composicao com cara de vida real.
 *
 *   npx tsx scripts/seed-body-composition-demo.ts                 # cenário "emagrecimento"
 *   npx tsx scripts/seed-body-composition-demo.ts densa           # outro cenário
 *   npx tsx scripts/seed-body-composition-demo.ts --list          # lista os cenários
 *   npx tsx scripts/seed-body-composition-demo.ts --clear         # remove só o que o seed criou
 *   SEED_EMAIL=audit-vazio@exemplo.com npx tsx scripts/seed-body-composition-demo.ts unica
 *
 * Idempotente: cada execução remove as avaliações de demonstração anteriores do paciente
 * (marcadas na nota) antes de gravar. Avaliações reais do usuário NUNCA são tocadas.
 * Recusa rodar fora de banco local.
 */
import { PrismaClient } from '@prisma/client';
import { DEMO_SCENARIOS, buildDemoScenario, type DemoScenarioKey } from '../src/bodycomp/demo-scenarios';

const MARK = '[demo]';
const prisma = new PrismaClient();

function assertLocalDb() {
  const url = process.env.DATABASE_URL || '';
  let host = '';
  try { host = new URL(url).hostname; } catch { /* URL inválida → recusa abaixo */ }
  if (!['localhost', '127.0.0.1', 'host.docker.internal', 'db', 'postgres'].includes(host)) {
    console.error(`Recusado: DATABASE_URL aponta para "${host || 'desconhecido'}". Este seed só roda em banco local.`);
    process.exit(1);
  }
}

async function main() {
  const arg = process.argv[2] || 'emagrecimento';
  if (arg === '--list') {
    for (const [key, about] of Object.entries(DEMO_SCENARIOS)) console.log(`${key.padEnd(20)} ${about}`);
    return;
  }
  assertLocalDb();

  const email = process.env.SEED_EMAIL || 'edmilson@exemplo.com';
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) { console.error(`Usuário ${email} não encontrado (rode contra o DB dev com o app seedado).`); process.exit(1); }
  const patient = await prisma.patient.findFirst({ where: { ownerId: user.id }, orderBy: { createdAt: 'asc' }, select: { id: true, fullName: true } });
  if (!patient) { console.error(`Usuário ${email} não tem paciente.`); process.exit(1); }

  const removed = await prisma.bodyComposition.deleteMany({ where: { patientId: patient.id, note: { startsWith: MARK } } });
  if (arg === '--clear') { console.log(`OK: ${removed.count} avaliações de demonstração removidas de ${patient.fullName}.`); return; }

  if (!(arg in DEMO_SCENARIOS)) {
    console.error(`Cenário "${arg}" não existe. Use --list.`);
    process.exit(1);
  }
  const key = arg as DemoScenarioKey;
  const rows = buildDemoScenario(key);
  await prisma.bodyComposition.createMany({
    data: rows.map((row) => ({ ...row, ranges: row.ranges ?? undefined, patientId: patient.id, note: `${MARK} ${key}` })),
  });
  console.log(`OK: cenário "${key}" — ${rows.length} avaliações gravadas para ${patient.fullName} (${email}); ${removed.count} de demonstração anteriores removidas.`);
  console.log(`    ${DEMO_SCENARIOS[key]}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
