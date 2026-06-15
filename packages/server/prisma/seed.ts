// Seed: cria o 1º usuário + paciente (o Edmilson) a partir das variáveis de ambiente.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_EMAIL || 'edmilson@exemplo.com').toLowerCase();
  const password = process.env.SEED_PASSWORD || 'troque123';
  const name = process.env.SEED_NAME || 'Edmilson Lopes Fernandes dos Santos';

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, name, role: 'OWNER' },
  });

  // garante 1 paciente default vinculado ao usuário
  const existing = await prisma.patient.findFirst({ where: { ownerId: user.id } });
  const patient = existing ?? await prisma.patient.create({
    data: { ownerId: user.id, fullName: name },
  });

  console.log('✓ Seed concluído');
  console.log('  usuário :', user.email, '(senha do .env)');
  console.log('  paciente:', patient.fullName, '— id:', patient.id);
}

main()
  .catch((e) => {
    console.error('Seed falhou:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
