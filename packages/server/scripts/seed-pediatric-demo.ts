/**
 * Seed de demo do MODO CUIDADOR (dev only): cria dependente "Theo Teste" (4 anos) com exame
 * avaliado na régua pediátrica + item de adulto intocado, pro QA visual da faixa do Dashboard
 * e do badge no ExamShow. Idempotente: remove o Theo anterior antes de criar.
 *   npx tsx scripts/seed-pediatric-demo.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_EMAIL || 'edmilson@exemplo.com';
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) { console.error(`Usuário seed ${email} não encontrado (rode contra o DB dev com o app seedado).`); process.exit(1); }

  const old = await prisma.patient.findFirst({ where: { ownerId: user.id, fullName: 'Theo Teste' }, select: { id: true } });
  if (old) { await prisma.patient.delete({ where: { id: old.id } }); console.log('Theo anterior removido'); }

  const dep = await prisma.patient.create({
    data: {
      ownerId: user.id, fullName: 'Theo Teste', relationship: 'Filho',
      dateOfBirth: new Date('2022-06-15T00:00:00Z'), identityLockedAt: new Date(),
    },
  });
  const exam = await prisma.exam.create({
    data: {
      patientId: dep.id, title: 'Hemograma + Bioquímica', kind: 'LAB_PANEL', status: 'EXTRACTED',
      performedAt: new Date('2026-08-01T00:00:00Z'),
      filePath: 'seed-theo.pdf', fileSha256: `seed-theo-${Date.now()}`, fileSizeBytes: 100,
    },
  });
  const mk = (name: string, canon: string, value: number, unit: string, low: number | null, high: number | null, flag: string, abnormal: boolean, appliesTo?: string) =>
    prisma.examItem.create({ data: { examId: exam.id, panel: 'Ped demo', name, nameCanonical: canon, valueNumeric: value, valueText: String(value), unit, refLow: low, refHigh: high, ...(appliesTo ? { refAppliesTo: appliesTo } : {}), flag: flag as any, isAbnormal: abnormal, extractedPage: 1 } });

  // Os 2 contos do UC1: fosfatase na régua da idade (✅) e leucócitos normal pra idade
  await mk('Fosfatase Alcalina', 'FOSFATASE', 300, 'UI/L', 105, 420, 'NORMAL', false, 'Pediátrico · 2–6 anos (Harriet Lane aprox.)');
  await mk('Leucócitos', 'LEUCOCITOS', 9800, '/mm³', 5000, 15000, 'NORMAL', false, 'Pediátrico · 2–6 anos (Harriet Lane aprox.)');
  await mk('Hemoglobina', 'HEMOGLOBINA', 12.8, 'g/dL', 11.5, 13.5, 'NORMAL', false, 'Pediátrico · 2–6 anos (Harriet Lane aprox.)');
  // Item FORA da tabela pediátrica: régua do laudo adulta, intocada (controle visual)
  await mk('Glicose', 'GLICOSE', 92, 'mg/dL', 70, 99, 'NORMAL', false);

  console.log(`OK: Theo Teste (4a) criado p/ ${email} — exam ${exam.id}, 4 itens (3 pediátricos + 1 controle adulto)`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
