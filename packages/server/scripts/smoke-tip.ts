/** Smoke test do motor de dicas inteligentes — valida o fluxo REAL com dado do banco local:
 *  health-summary + atividade Health Connect + medicações + dicas recentes → tema → GLM.
 *  Uso: cd packages/server && npx tsx scripts/smoke-tip.ts [emailDoOwner] */
import { prisma } from '../src/prisma';
import { buildSmartTip } from '../src/jobs/healthNudges';

(async () => {
  const email = process.argv[2];
  const owner = email
    ? await prisma.user.findUnique({ where: { email } })
    : await prisma.user.findFirst({ where: { patients: { some: { exams: { some: { status: 'EXTRACTED' } } } } } });
  if (!owner) { console.log('owner não encontrado'); process.exit(1); }
  const p = await prisma.patient.findFirst({ where: { ownerId: owner.id, exams: { some: { status: 'EXTRACTED' } } } });
  if (!p) { console.log('paciente com exames não encontrado'); process.exit(1); }
  console.log(`paciente: ${p.fullName} (owner ${owner.email})`);
  const tip = await buildSmartTip(p.id, owner.id, (p.fullName || '').split(' ')[0]);
  console.log(`tema: ${tip?.theme}`);
  console.log(`dica: ${tip?.body}`);
  await prisma.$disconnect();
})();
