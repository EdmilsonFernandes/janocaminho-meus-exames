// QA: resetar o schema do DB de TESTE (simula o postgres efêmero do CI). NUNCA em prod.
import { prisma } from '../src/prisma';

(async () => {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('meus_exames_test')) {
    throw new Error(`RECUSEI: DATABASE_URL não é o DB de teste ("${url}")`);
  }
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  console.log('schema public do meus_exames_test resetado');
  await prisma.$disconnect();
})();
