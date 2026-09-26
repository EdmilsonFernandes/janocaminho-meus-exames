/** Cria/reinicia um médico de QA + share com o paciente do usuário QA (p/ testar o portal).
 *  Requer: mk-empty-user.ts já rodado (cria qa-vazio@exemplo.com com paciente).
 *  Uso: cd packages/server && npx tsx scripts/mk-qa-doctor.ts [email] [senha] */
import { prisma } from '../src/prisma';
import bcrypt from 'bcryptjs';

(async () => {
  const email = process.argv[2] ?? 'qa-medico@exemplo.com';
  const senha = process.argv[3] ?? 'troque123';
  const hash = bcrypt.hashSync(senha, 10);
  const crm = '999999-QA';
  const doc = await prisma.doctor.upsert({
    where: { crm },
    update: { passwordHash: hash, emailVerified: true },
    create: { name: 'Dra. QA Teste', crm, crmUf: 'SP', specialty: 'Clínica Médica', email, passwordHash: hash, emailVerified: true },
  });
  // Share com o paciente do qa-vazio (todos os escopos)
  const owner = await prisma.user.findUnique({ where: { email: 'qa-vazio@exemplo.com' }, include: { patients: true } });
  if (!owner || owner.patients.length === 0) { console.log('ERRO: rode mk-empty-user.ts primeiro'); process.exit(1); }
  const pid = owner.patients[0].id;
  const share = await prisma.doctorShare.upsert({
    where: { patientId_doctorId: { patientId: pid, doctorId: doc.id } },
    update: { active: true },
    create: { patientId: pid, doctorId: doc.id, scopes: ['exams', 'evolution', 'alerts', 'summary'] },
  });
  console.log(`OK: ${email} / ${senha} (crm ${crm}) — share ${share.id} com paciente ${pid}`);
  await prisma.$disconnect();
})();
