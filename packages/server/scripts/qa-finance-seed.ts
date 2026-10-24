// QA Onda 3 (§18.11.8) — popula o DB de DEV com um médico + consultas em cada
// situação financeira p/ validação visual do PortalFinanceiro e do admin
// TeleFinanceTab. Idempotente: se o médico QA já existe, limpa SÓ os dados dele
// (reminders + ledger + payouts) e recria. NUNCA toca em dados de outros usuários.
// Uso: cd packages/server && npx tsx scripts/qa-finance-seed.ts
import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma';
import { recordTeleconsultaPayment, recordTeleconsultaEnded } from '../src/finance/ledger';
import { encryptPII } from '../src/utils/crypto';

const QA_EMAIL = 'fin.qa@exemplo.com';
const QA_PWD = 'troque123';
const DAY = 86_400_000;
const SNAP = { ruleId: null, platformBps: 2000, feeBearer: 'platform', releaseDelayDays: 3, minPayoutCents: 2000 } as const;

async function main() {
  const now = Date.now();

  // Limpeza seletiva (só do médico QA)
  const old = await prisma.doctor.findUnique({ where: { email: QA_EMAIL }, select: { id: true } });
  if (old) {
    const remIds = await prisma.reminder.findMany({ where: { createdByDoctorId: old.id }, select: { id: true } });
    const ids = remIds.map((r) => r.id);
    if (ids.length) {
      await prisma.ledgerEntry.deleteMany({ where: { reminderId: { in: ids } } }).catch(() => {});
      await prisma.payout.deleteMany({ where: { reminderId: { in: ids } } }).catch(() => {});
      await prisma.reminder.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
    }
    await prisma.doctor.delete({ where: { id: old.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: 'fin.paciente.qa@exemplo.com' } }).catch(() => {});
  }

  // Médico QA (CRM único, senha conhecida, e-mail já verificado, PIX cadastrado mascarado)
  const enc = encryptPII('fin.qa@exemplo.com')!;
  const doc = await prisma.doctor.create({
    data: {
      name: 'Dra. Helena Fin', crm: `99${String(Date.now()).slice(-4)}-SP`, crmUf: 'SP', specialty: 'Cardiologia',
      email: QA_EMAIL, emailVerified: true, passwordHash: await bcrypt.hash(QA_PWD, 10),
      payoutPixKeyEnc: enc.enc, payoutPixKeyIv: enc.iv, payoutPixKeyType: 'email',
    },
  });

  // Paciente QA (user OWNER + titular)
  const user = await prisma.user.create({
    data: { email: 'fin.paciente.qa@exemplo.com', name: 'Paciente QA', passwordHash: await bcrypt.hash(QA_PWD, 10), credits: 60, emailVerified: true, role: 'OWNER' },
  });
  const patient = await prisma.patient.create({
    data: { ownerId: user.id, fullName: 'Paciente QA', relationship: 'Titular', identityLockedAt: new Date() },
  });

  // dueDate SEMPRE no futuro (hoje + horas): o job de auto-end do dev server marca
  // no_show teleconsultas vencidas sem endedAt — seed com data passada era reescrito.
  // Consultas ENCERRADAS ganham endedAt explícito (o job só age em chamada aberta).
  const mk = async (o: { title: string; priceCents: number; dueInHours: number; paidIn: number; teleStatus?: string; releaseIn?: number }) => {
    const r = await prisma.reminder.create({
      data: {
        patientId: patient.id, ownerId: user.id, title: o.title, type: 'teleconsulta',
        dueDate: new Date(now + o.dueInHours * 3_600_000), createdByDoctorId: doc.id,
        consultPriceCents: o.priceCents, paidAt: new Date(now - o.paidIn * DAY),
        paymentRef: `qa_${Math.random().toString(36).slice(2, 8)}`,
        teleStatus: o.teleStatus ?? null, commissionSnapshot: SNAP as any,
        ...(o.teleStatus ? { endedAt: new Date(now - 30 * 60_000), patientJoinedAt: new Date(now - 90 * 60_000), jointMs: 600_000 } : {}),
        ...(o.releaseIn !== undefined ? { releaseEligibleAt: new Date(now + o.releaseIn * DAY) } : {}),
      },
      select: { id: true },
    });
    await recordTeleconsultaPayment(r.id);
    if (o.teleStatus) await recordTeleconsultaEnded(r.id, o.teleStatus);
    return r.id;
  };

  // Cenário: 6 consultas cobrindo TODAS as situações (visíveis no 30d) + 1 fora (90d)
  await mk({ title: 'Retorno cardiológico', priceCents: 25_000, dueInHours: 1, paidIn: 4, teleStatus: 'completed', releaseIn: -1 });   // liberado R$200
  await mk({ title: 'Primeira consulta', priceCents: 30_000, dueInHours: 2, paidIn: 6, teleStatus: 'completed', releaseIn: 2 });       // em validação R$240
  await mk({ title: 'Consulta de rotina', priceCents: 20_000, dueInHours: 3, paidIn: 3 });                                              // previsto R$160
  await mk({ title: 'Avaliação de exames', priceCents: 18_000, dueInHours: 4, paidIn: 11, teleStatus: 'completed', releaseIn: -8 });    // liberado R$144
  await mk({ title: 'Urgência — paciente ausente', priceCents: 15_000, dueInHours: 5, paidIn: 8, teleStatus: 'no_show' });              // estornado (reserva)
  await mk({ title: 'Segunda opinião', priceCents: 22_000, dueInHours: 6, paidIn: 15, teleStatus: 'completed', releaseIn: -12 });      // repassável R$176
  await mk({ title: 'Consulta antiga', priceCents: 40_000, dueInHours: 7, paidIn: 76, teleStatus: 'completed', releaseIn: -73 });      // fora do 30d? NÃO: due hoje → dentro do 30d

  // Admin QA (garante 1 ADMIN p/ login no backoffice)
  const adminEmail = 'fin.admin.qa@exemplo.com';
  const admin = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } });
  if (!admin) {
    await prisma.user.create({ data: { email: adminEmail, name: 'Admin QA Fin', passwordHash: await bcrypt.hash(QA_PWD, 10), credits: 0, emailVerified: true, role: 'ADMIN' } });
  }

  console.log('QA SEED OK — médico: fin.qa@exemplo.com / troque123 · admin: fin.admin.qa@exemplo.com / troque123');
  console.log('Consultas: 2 liberadas (R$ 200 + R$ 144) · 1 validação (R$ 240) · 1 prevista (R$ 160) · 1 estorno (R$ 150) · 1 fora do 30d.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
