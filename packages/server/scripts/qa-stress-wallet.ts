// QA: dados de estresse para a Carteira (saldo + lançamentos grandes). Dev only.
import { prisma } from '../src/prisma';

(async () => {
  const u = await prisma.user.findUnique({ where: { email: 'edmilson@exemplo.com' }, select: { id: true } });
  if (!u) { console.log('sem user'); process.exit(1); }
  await prisma.user.update({ where: { id: u.id }, data: { credits: 1234567 } });
  await prisma.creditTransaction.createMany({
    data: [
      { userId: u.id, delta: 987654, kind: 'purchase', label: 'Pacote Bônus — pagamento aprovado via PIX' },
      { userId: u.id, delta: -123456, kind: 'ai_summary', label: 'Resumo com IA — Hemograma Completo de longuíssimo nome que não deve quebrar o layout da carteira' },
      { userId: u.id, delta: 60, kind: 'signup', label: 'Bônus de boas-vindas' },
    ],
  });
  console.log('OK: credits=1234567 + 3 lançamentos grandes');
  await prisma.$disconnect();
})();
