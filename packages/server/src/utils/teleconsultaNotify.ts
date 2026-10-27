// TELECONSULTA NÃO REALIZADA/CANCELADA — notificação dupla com motivo (dono 26/10):
// quando a consulta não acontece (no_show / technical / cancelada), PACIENTE e MÉDICO
// ficam sabendo pelo canal que usam, com o MOTIVO claro:
//   • Paciente — push (app Android) + e-mail (web/backup);
//   • Médico   — e-mail (o portal é web; médico não tem device token do app).
// Chamado por: rota /end (outcome ≠ completed), auto-end do job (no_show) e
// DELETE /doctor/patients/:pid/teleconsulta/:rid (cancelamento manual → 'cancelled').
import { prisma } from '../prisma';
import { sendPushToUser } from './push';
import { sendEmail } from './mailer';
import { emailTemplate } from './emailTemplate';

export interface NotHeldInfo {
  outcome: 'no_show' | 'technical' | 'cancelled';
  noShowBy?: 'patient' | 'doctor' | 'none' | null;
  /** Quem cancelou (nome) — cancelamento manual. */
  byName?: string | null;
  /** Motivo livre digitado por quem cancelou. */
  reason?: string | null;
}

/** Frase honesta do motivo (a MESMA vai pro push, pro e-mail e ao histórico). */
export function notHeldReason(info: NotHeldInfo): string {
  if (info.outcome === 'cancelled') {
    const who = info.byName ? `por ${info.byName}` : 'pelo médico';
    const why = info.reason?.trim() ? ` — motivo: ${info.reason.trim()}` : '';
    return `Consulta cancelada ${who}${why}.`;
  }
  if (info.outcome === 'technical') {
    return 'A consulta foi encerrada por problema técnico antes de ser realizada.';
  }
  switch (info.noShowBy) {
    case 'patient': return 'O paciente não compareceu à teleconsulta na janela de tolerância.';
    case 'doctor': return 'O médico não compareceu à teleconsulta na janela de tolerância.';
    default: return 'Ninguém entrou na sala na janela da consulta.';
  }
}

const fmtDate = (d: Date) =>
  new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const fmtBrl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * ESTORNO EXECUTADO (onda 4, dono 26/10): o dinheiro voltou pro paciente — aviso
 * duplo (push + e-mail) com o valor e o prazo do PSP, e e-mail pro médico (a
 * consulta sai do "previsto" dele). Quando o estorno é PARCIAL (degrau automático:
 * tarifa do PIX não é devolvida pelo Asaas), a tarifa vem EXPLÍCITA — transparência
 * total sobre por que voltou menos do que foi pago. Best-effort, igual ao notHeld.
 */
export async function notifyTeleconsultaRefunded(
  reminder: { id: string; ownerId: string; patientId: string | null; createdByDoctorId?: string | null; dueDate: Date; title?: string | null },
  refundCents: number,
  feeCents = 0,
): Promise<void> {
  const when = fmtDate(reminder.dueDate);
  const title = reminder.title || 'Teleconsulta';
  const value = fmtBrl(refundCents);
  const partial = feeCents > 0;
  const feeNote = partial
    ? ` (tarifa de ${fmtBrl(feeCents)} do provedor de pagamento não é devolvida — já descontada do estorno)`
    : '';

  const [patient, user, doctor] = await Promise.all([
    reminder.patientId
      ? prisma.patient.findUnique({ where: { id: reminder.patientId }, select: { fullName: true } }).catch(() => null)
      : Promise.resolve(null),
    prisma.user.findUnique({ where: { id: reminder.ownerId }, select: { email: true, name: true } }).catch(() => null),
    reminder.createdByDoctorId
      ? prisma.doctor.findUnique({ where: { id: reminder.createdByDoctorId }, select: { name: true, email: true } }).catch(() => null)
      : Promise.resolve(null),
  ]);
  const patientName = patient?.fullName || user?.name || 'paciente';
  const doctorName = doctor?.name || null;

  await sendPushToUser(
    reminder.ownerId,
    '💸 Estorno realizado',
    `${value} da sua consulta de ${when} voltou pro PIX${feeNote} — pode levar até 2 dias úteis conforme seu banco.`,
    { type: 'teleconsulta', reminderId: reminder.id },
  ).catch((e: unknown) => console.error('[teleconsulta-notify] push estorno falhou:', (e as Error)?.message));

  const mailHtml = (toName: string, roleNote: string) => emailTemplate({
    title: 'Estorno da teleconsulta',
    content: `
      <p>Olá, ${toName}.</p>
      <p><strong>${title}</strong> — agendada para <strong>${when}</strong> — foi <strong>estornada</strong>.</p>
      <p style="padding:12px 16px;border-radius:12px;background:rgba(32,178,170,.10);border-left:4px solid #20b2aa;font-size:15px;">
        ${value} devolvidos ao paciente${partial ? feeNote : ''}.
      </p>
      <p>${roleNote}</p>
    `,
  });

  if (user?.email) {
    const note = `O valor volta para a conta PIX usada no pagamento — o prazo depende do seu banco (até 2 dias úteis).${partial ? ' A tarifa do provedor de pagamento não é devolvida a ninguém (regra do Asaas) — por isso o estorno veio menor que o pago.' : ''}`;
    await sendEmail({ to: user.email, subject: 'Estorno da teleconsulta confirmado', html: mailHtml(patientName, note) })
      .catch((e: unknown) => console.error('[teleconsulta-notify] e-mail estorno paciente falhou:', (e as Error)?.message));
  }
  if (doctor?.email) {
    const note = 'A consulta sai do seu "previsto" no financeiro — nenhum valor foi atribuído a ela.';
    await sendEmail({ to: doctor.email, subject: `[${patientName}] Teleconsulta estornada`, html: mailHtml(`Dr. ${doctorName?.replace(/^Dr\.?\s*/i, '') || 'médico'}`, note) })
      .catch((e: unknown) => console.error('[teleconsulta-notify] e-mail estorno médico falhou:', (e as Error)?.message));
  }
}

const subjectFor = (outcome: NotHeldInfo['outcome']) =>
  outcome === 'cancelled' ? 'Teleconsulta cancelada'
    : outcome === 'technical' ? 'Teleconsulta não realizada (problema técnico)'
      : 'Teleconsulta não realizada (ausência)';

/**
 * Dispara push + e-mail pro paciente e e-mail pro médico. Best-effort: falha de
 * canal NUNCA derruba o encerramento/cancelamento (a linha da consulta é a fonte
 * da verdade; a notificação é consequência).
 */
export async function notifyTeleconsultaNotHeld(
  reminder: { id: string; ownerId: string; patientId: string | null; createdByDoctorId?: string | null; dueDate: Date; title?: string | null },
  info: NotHeldInfo,
): Promise<void> {
  const reason = notHeldReason(info);
  const when = fmtDate(reminder.dueDate);
  const title = reminder.title || 'Teleconsulta';

  const [patient, user, doctor] = await Promise.all([
    reminder.patientId
      ? prisma.patient.findUnique({ where: { id: reminder.patientId }, select: { fullName: true } }).catch(() => null)
      : Promise.resolve(null),
    prisma.user.findUnique({ where: { id: reminder.ownerId }, select: { email: true, name: true } }).catch(() => null),
    reminder.createdByDoctorId
      ? prisma.doctor.findUnique({ where: { id: reminder.createdByDoctorId }, select: { name: true, email: true } }).catch(() => null)
      : Promise.resolve(null),
  ]);
  const patientName = patient?.fullName || user?.name || 'paciente';
  const doctorName = doctor?.name || null;

  // ── Push (paciente — Android) ───────────────────────────────────────────────
  await sendPushToUser(
    reminder.ownerId,
    subjectFor(info.outcome),
    `${reason} Agendada p/ ${when}. Fale com ${doctorName ? `Dr. ${doctorName.replace(/^Dr\.?\s*/i, '')}` : 'seu médico'} para reagendar.`,
    { type: 'teleconsulta', reminderId: reminder.id },
  ).catch((e: unknown) => console.error('[teleconsulta-notify] push falhou:', (e as Error)?.message));

  // ── E-mail (ambos — web é o canal do portal médico) ─────────────────────────
  const mailHtml = (toName: string, roleNote: string) => emailTemplate({
    title: subjectFor(info.outcome),
    content: `
      <p>Olá, ${toName}.</p>
      <p><strong>${title}</strong> — agendada para <strong>${when}</strong> — não foi realizada.</p>
      <p style="padding:12px 16px;border-radius:12px;background:rgba(245,158,11,.12);border-left:4px solid #f59e0b;font-size:15px;">
        ${reason}
      </p>
      <p>${roleNote}</p>
      <p>Em caso de dúvida, responda este e-mail ou fale com o suporte no app.</p>
    `,
  });

  if (user?.email) {
    const note = info.noShowBy === 'patient'
      ? 'Se algo impediu sua presença, você pode reagendar diretamente com seu médico pelo app.'
      : info.noShowBy === 'doctor'
        ? 'Seu pagamento fica reservado para estorno — a equipe Dr. Exame fará a tratativa.'
        : info.outcome === 'cancelled'
          ? 'Você pode agendar uma nova consulta quando quiser pelo app.'
          : 'A equipe Dr. Exame já foi avisada e ajudará no reagendamento.';
    await sendEmail({ to: user.email, subject: subjectFor(info.outcome), html: mailHtml(patientName, note) })
      .catch((e: unknown) => console.error('[teleconsulta-notify] e-mail paciente falhou:', (e as Error)?.message));
  }

  if (doctor?.email) {
    const note = info.noShowBy === 'doctor'
      ? 'A ausência foi registrada para triagem interna. O valor pago pelo paciente segue reservado para estorno.'
      : 'O registro completo (presença, duração e desfecho) está no histórico do paciente no seu portal.';
    await sendEmail({ to: doctor.email, subject: `[${patientName}] ${subjectFor(info.outcome)}`, html: mailHtml(`Dr. ${doctorName?.replace(/^Dr\.?\s*/i, '') || 'médico'}`, note) })
      .catch((e: unknown) => console.error('[teleconsulta-notify] e-mail médico falhou:', (e as Error)?.message));
  }
}
