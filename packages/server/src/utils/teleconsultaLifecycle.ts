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

// ─────────────────────────────────────────────────────────────────────────────
// §5 do dono (26/10/26) — ESTRATÉGIA DE AUSÊNCIA DIFERENCIADA (tolerância 10min).
//
// DUAS JANELAS, PROPÓSITOS DIFERENTES (não unificar):
//   • TOLERÂNCIA de ausência (noShowToleranceMin, AppSetting 'teleconsulta', default
//     10min): corre do DUE DATE. Decide quando uma consulta SEM a contraparte vira
//     'no_show' — e REGISTRA quem faltou (noShowBy) p/ o card "não realizada" e a
//     triagem financeira.
//   • GRACE de reconexão (5min, client Teleconsulta.tsx): vale quando AMBOS já
//     entraram e um CAIU (rede/kill do app) — desconexão NÃO é ausência; quem já
//     apareceu tem direito de voltar. Caso dos dois: encerramento é HUMANO (/end com
//     critério jointMs), o job não toca.
// ─────────────────────────────────────────────────────────────────────────────

/** Quem faltou na consulta não realizada (gravado em Reminder.noShowBy). */
export type NoShowBy = 'patient' | 'doctor' | 'none';

/** Fatos de presença + relógio (puros — testáveis sem DB). */
export interface NoShowFacts {
  dueMs: number;           // horário marcado (epoch ms)
  now: number;             // "agora" (epoch ms) — job injeta o relógio controlado
  toleranceMin: number;    // tolerância de ausência (AppSetting teleconsulta.noShowToleranceMin)
  patientJoined: boolean;  // paciente apareceu em ALGUM momento (join auditLog/carimbo)
  doctorJoined: boolean;   // médico apareceu em ALGUM momento
}

/** Decisão da tolerância de ausência: outcome≠null só quando venceu E não foi caso dos dois. */
export interface NoShowDecision {
  expired: boolean;             // tolerância venceu (now ≥ dueDate + tolerância)
  deadlineMs: number;           // dueDate + tolerância (p/ countdown do client)
  outcome: 'no_show' | null;    // 'no_show' = encerra como ausência (job/auto-end)
  noShowBy: NoShowBy | null;    // quem faltou — só preenchido com outcome='no_show'
}

/**
 * Decide a ausência pela presença + relógio:
 *   ninguém apareceu ............ no_show / none   (consulta "não realizada")
 *   só o médico apareceu ........ no_show / patient (paciente faltou; estorno já é
 *                                 o comportamento do ledger p/ no_show)
 *   só o paciente apareceu ...... no_show / doctor  (médico faltou; ExceptionQueue
 *                                 'doctor_no_show' p/ triagem — política financeira
 *                                 do estorno é decisão do dono)
 *   ambos apareceram ............ outcome null (queda de conexão = grace/5min no
 *                                 client; encerramento é humano no /end com critério)
 * tolerância NÃO vencida ....... outcome null (countdown segue no client).
 * PURA: nenhum acesso a DB/prisma — testes injetam relógio (dueMs/now) à vontade.
 */
export function resolveNoShow(f: NoShowFacts): NoShowDecision {
  const deadlineMs = f.dueMs + Math.max(0, f.toleranceMin) * 60_000;
  const expired = f.now >= deadlineMs;
  if (f.patientJoined && f.doctorJoined) return { expired, deadlineMs, outcome: null, noShowBy: null };
  if (!expired) return { expired: false, deadlineMs, outcome: null, noShowBy: null };
  const noShowBy: NoShowBy = f.patientJoined ? 'doctor' : f.doctorJoined ? 'patient' : 'none';
  return { expired, deadlineMs, outcome: 'no_show', noShowBy };
}

/**
 * Versão p/ o encerramento HUMANO (POST /end e feedback): dado outcome='no_show',
 * registra quem faltou pela presença de cada papel. Ambos presentes → null
 * (no_show explícito após chamada parcial é decisão humana, sem acusar ninguém).
 */
export function resolveNoShowBy(patientJoined: boolean, doctorJoined: boolean): NoShowBy | null {
  if (patientJoined && doctorJoined) return null;
  if (!patientJoined && !doctorJoined) return 'none';
  return patientJoined ? 'doctor' : 'patient';
}
