/** Cria/reinicia um usuário de teste SEM exames (estado vazio p/ QA de onboarding/demo).
 *  Uso: cd packages/server && npx tsx scripts/mk-empty-user.ts [email] [senha] */
import { prisma } from '../src/prisma';
import bcrypt from 'bcryptjs';

(async () => {
  const email = process.argv[2] ?? 'qa-vazio@exemplo.com';
  const senha = process.argv[3] ?? 'troque123';
  const hash = bcrypt.hashSync(senha, 10);
  const u = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, emailVerified: true, blocked: false, credits: 60 },
    create: { email, passwordHash: hash, name: 'QA Vazio', emailVerified: true },
  });
  // Zera exames/pacientes: o QA precisa do estado "conta nova".
  await prisma.patient.deleteMany({ where: { ownerId: u.id } });
  await prisma.patient.create({ data: { fullName: 'QA Vazio', ownerId: u.id, relationship: 'Titular' } });
  console.log(`OK: ${email} / ${senha} (userId ${u.id}) — sem exames`);
  await prisma.$disconnect();
})();
