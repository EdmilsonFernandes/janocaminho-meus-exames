// TELECONSULTA — presença conjunta + outcome honesto (24/10/26).
// Spec: docs/design/2026-10-24-teleconsulta-gaps-spec.md §1-§2. Compartilhado entre
// routes/teleconsulta.routes.ts (/end, /feedback) e jobs/reminderEmails.ts (auto-end).
import { prisma } from '../prisma';

/** Evento de presença de um papel na sala (auditLog TELECONSULTA_JOIN/TELECONSULTA_LEAVE). */
export interface PresenceEvent {
  action: 'TELECONSULTA_JOIN' | 'TELECONSULTA_LEAVE';
  role: 'patient' | 'doctor';
  at: number; // epoch ms
}

/** Carimba os eventos de presença auditados da consulta (JOIN + LEAVE, os dois papéis). */
export async function loadPresenceEvents(reminderId: string): Promise<PresenceEvent[]> {
  const logs = await prisma.auditLog.findMany({
    where: { action: { in: ['TELECONSULTA_JOIN', 'TELECONSULTA_LEAVE'] }, targetId: reminderId },
    orderBy: { createdAt: 'asc' },
    select: { action: true, createdAt: true, after: true },
  });
  const out: PresenceEvent[] = [];
  for (const l of logs as any[]) {
    const role = l.after?.role;
    if (role !== 'patient' && role !== 'doctor') continue;
    if (l.action !== 'TELECONSULTA_JOIN' && l.action !== 'TELECONSULTA_LEAVE') continue;
    out.push({ action: l.action, role, at: new Date(l.createdAt).getTime() });
  }
  return out;
}

/**
 * Tempo CONJUNTO (ms): soma dos intervalos em que AMBOS os papéis estavam presentes
 * (interseção paciente ∩ médico, merge sem sobreposição dupla).
 *
 * DEGRADAÇÃO HONESTA (v1, sem webhook do LiveKit): a fonte são os eventos REPORTADOS
 * e auditados — TELECONSULTA_JOIN (server, a cada (re)entrada) e TELECONSULTA_LEAVE
 * (POST /leave, chamado pelo client ao desconectar). Regras:
 *   - JOIN repetido com o papel já "aberto" é idempotente (reconexão/2 abas não
 *     duplicam tempo — só existe 1 intervalo aberto por papel);
 *   - LEAVE fecha o intervalo aberto daquele papel (o próximo JOIN reabre);
 *   - SEM LEAVE (client antigo, kill do app, queda de rede sem callback) o join aberto
 *     conta até o encerramento → jointMs é TETO do tempo conjunto, NÃO prova de que
 *     ambos ficaram conectados o tempo todo. Eventos após endMs são ignorados.
 * Quem precisa de precisão per-pausa precisa do webhook participant-left do LiveKit (F2+).
 */
export function computeJointMs(events: PresenceEvent[], endMs: number): number {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const open: Partial<Record<'patient' | 'doctor', number>> = {};
  const intervals: Record<'patient' | 'doctor', Array<[number, number]>> = { patient: [], doctor: [] };
  for (const e of sorted) {
    if (e.at > endMs) break; // leave tardio de client não estica o passado
    if (e.action === 'TELECONSULTA_JOIN') {
      if (open[e.role] == null) open[e.role] = e.at; // idempotente: já aberto não reabre
    } else if (open[e.role] != null) {
      intervals[e.role].push([open[e.role]!, e.at]);
      open[e.role] = undefined;
    }
  }
  for (const role of ['patient', 'doctor'] as const) {
    if (open[role] != null && open[role]! < endMs) intervals[role].push([open[role]!, endMs]);
  }
  // Interseção dos intervalos (disjuntos por papel) = janelas com AMBOS presentes.
  let joint = 0;
  let i = 0;
  let j = 0;
  while (i < intervals.patient.length && j < intervals.doctor.length) {
    const [ps, pe] = intervals.patient[i];
    const [ds, de] = intervals.doctor[j];
    const s = Math.max(ps, ds);
    const e = Math.min(pe, de);
    if (e > s) joint += e - s;
    if (pe < de) i++; else j++;
  }
  return Math.max(0, Math.round(joint));
}

/**
 * Outcome automático HONESTO (auto-end job e feedback 1-toque): JAMAIS 'completed'
 * sem critério (ambos + tempo conjunto ≥ mínimo — isso é decisão do /end humano).
 * Paciente nunca entrou → 'no_show'; entrou mas não houve atendimento conjunto →
 * 'technical' (sem webhook não distinguimos queda de conexão de ausência do médico —
 * vocabulário centrado no paciente, spec §2).
 */
export function resolveAutoOutcome(patientJoined: boolean): 'no_show' | 'technical' {
  return patientJoined ? 'technical' : 'no_show';
}
