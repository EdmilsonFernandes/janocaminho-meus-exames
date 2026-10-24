// §15.1 — DIAGNÓSTICO de consultas legadas inconsistentes (spec gaps da teleconsulta,
// docs/design/2026-10-24-teleconsulta-gaps-spec.md §15.1). Varre reminders type=
// teleconsulta e REPORTA estados contraditórios; correção só quando SEGURO.
//
// Uso (rodar de packages/server):
//   npx tsx scripts/teleconsulta-diagnose.ts              → só diagnostica (DRY-RUN, default SEMPRE)
//   npx tsx scripts/teleconsulta-diagnose.ts --json       → saída máquina (stdout)
//   npx tsx scripts/teleconsulta-diagnose.ts --repair     → PLANEJA reparos seguros + before/after (NÃO escreve)
//   npx tsx scripts/teleconsulta-diagnose.ts --repair --apply → executa reparos seguros + enfileira revisão humana
//
// REPAROS SEGUROS (nunca financeiro/clinico — paidAt/valores/histórico INTOCAVEL):
//   (a) coerência done×endedAt (updateMany condicional, race-safe);
//   (b) classificação de teleStatus legado (pré-lifecycle, teleStatus=null):
//       JOIN ambos  → completed (se tempo conjunto ≥ mínimo) senão technical
//       JOIN médico → no_show (paciente nunca entrou)
//       JOIN paciente → technical (sem atendimento conjunto)
//       sem JOIN + vencida → no_show
// "Paga sem atendimento" NUNCA é reparada — só REPORTADA + enfileirada p/ revisão
// humana (ExceptionQueue, base da central §14.5): decidir estorno é política (§14.4).
import 'dotenv/config';
import { prisma } from '../src/prisma';
import { computeJointMs, loadPresenceEvents } from '../src/utils/teleconsultaLifecycle';
import { getTeleconsultaConfig, loadSettings } from '../src/utils/settings';
import { enqueueException } from '../src/jobs/reconciliation';

const MS_MIN = 60_000;

export interface TeleRow {
  id: string;
  title: string;
  dueDate: Date;
  done: boolean;
  endedAt: Date | null;
  teleStatus: string | null;
  patientJoinedAt: Date | null;
  jointMs: number;
  paidAt: Date | null;
  consultPriceCents: number | null;
  doctorNote: string | null;
  createdByDoctorId: string | null;
  patientName: string;
}

export interface Finding {
  id: string;
  patient: string;
  doctor: string;
  dueDate: string;
  endedAt: string;
  teleStatus: string;
  done: boolean;
  paidAt: string;
  problems: string[];
}

export interface RepairPlan {
  id: string;
  field: string;          // 'done' | 'endedAt' | 'teleStatus' | 'teleStatus+jointMs'
  before: string;
  after: string;
  reason: string;
  data: Record<string, unknown>;  // payload do updateMany (execução)
}

export interface DiagnoseResult {
  total: number;
  inconsistent: number;
  counts: Record<string, number>;
  findings: Finding[];
  repairs: RepairPlan[];
  enqueued: number;   // exceções criadas (só com --apply)
  applied: number;    // reparos executados (só com --apply)
}

/** Presença por consulta: papéis que entraram + último join (auditLog). */
async function loadJoins(ids: string[]): Promise<Map<string, { roles: Set<string>; lastJoinMs: number }>> {
  const map = new Map<string, { roles: Set<string>; lastJoinMs: number }>();
  if (!ids.length) return map;
  const logs = await prisma.auditLog.findMany({
    where: { action: 'TELECONSULTA_JOIN', targetId: { in: ids } },
    orderBy: { createdAt: 'asc' },
    select: { targetId: true, createdAt: true, after: true },
  });
  for (const l of logs as any[]) {
    const role = l.after?.role;
    if (role !== 'patient' && role !== 'doctor') continue;
    const cur = map.get(l.targetId) ?? { roles: new Set<string>(), lastJoinMs: 0 };
    cur.roles.add(role);
    cur.lastJoinMs = Math.max(cur.lastJoinMs, new Date(l.createdAt).getTime());
    map.set(l.targetId, cur);
  }
  return map;
}

/**
 * Classifica uma teleconsulta LEGADA (teleStatus=null com endedAt) pelo que os
 * eventos auditados provam — a mesma semântica do auto-end/§1-§2: paciente nunca
 * entrou → no_show; entrou sem atendimento conjunto → technical; ambos + tempo
 * conjunto ≥ mínimo → completed (abaixo do mínimo → technical; NUNCA completed sem
 * critério). Sem JOIN e vencida → no_show. Retorna null quando NÃO dá pra classificar
 * com segurança (fica pro relatório, não pro reparo).
 */
export function classifyLegacy(
  row: Pick<TeleRow, 'dueDate' | 'endedAt'>,
  roles: Set<string>,
  jointMs: number,
  cfg: { minJointSeconds: number },
  now: number,
): { teleStatus: string; reason: string } | null {
  const endMs = new Date(row.endedAt as Date).getTime();
  const both = roles.has('patient') && roles.has('doctor');
  if (both) {
    return jointMs >= cfg.minJointSeconds * 1000
      ? { teleStatus: 'completed', reason: 'ambos entraram + tempo conjunto ≥ mínimo' }
      : { teleStatus: 'technical', reason: 'ambos entraram mas tempo conjunto < mínimo' };
  }
  if (roles.has('doctor')) return { teleStatus: 'no_show', reason: 'só o médico entrou (paciente ausente)' };
  if (roles.has('patient')) return { teleStatus: 'technical', reason: 'só o paciente entrou (sem atendimento conjunto)' };
  // Sem JOIN: só classifica VENCIDA (a janela de entrada já fechou há tempo).
  return new Date(row.dueDate).getTime() + 30 * MS_MIN <= now
    ? { teleStatus: 'no_show', reason: 'ninguém entrou e a consulta venceu' }
    : null;
}

/**
 * PASS principal (exportado p/ testes): diagnostica (sempre), planeja reparos
 * (--repair), executa (--apply — implica --repair). NUNCA toca paidAt/valores/
 * histórico clínico em nenhum modo.
 */
export async function runDiagnose(
  now: number,
  opts: { repair?: boolean; apply?: boolean; log?: (line: string) => void } = {},
): Promise<DiagnoseResult> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const cfg = getTeleconsultaConfig();
  const rows = (await prisma.reminder.findMany({
    where: { type: 'teleconsulta' },
    select: {
      id: true, title: true, dueDate: true, done: true, endedAt: true, teleStatus: true,
      patientJoinedAt: true, jointMs: true, paidAt: true, consultPriceCents: true,
      doctorNote: true, createdByDoctorId: true,
      patient: { select: { fullName: true } },
    },
    orderBy: { dueDate: 'asc' },
  })) as unknown as TeleRow[];
  for (const r of rows) r.patientName = (r as any).patient?.fullName ?? '';

  // Nomes dos médicos (createdByDoctorId é scalar) — em lote, p/ coluna da tabela.
  const docIds = Array.from(new Set(rows.map((r) => r.createdByDoctorId).filter(Boolean))) as string[];
  const doctorNames = new Map<string, string>();
  if (docIds.length) {
    (await prisma.doctor.findMany({ where: { id: { in: docIds } }, select: { id: true, name: true } }))
      .forEach((d) => doctorNames.set(d.id, d.name));
  }

  const joins = await loadJoins(rows.map((r) => r.id));
  const counts: Record<string, number> = {};
  const findings: Finding[] = [];
  const repairs: RepairPlan[] = [];
  let enqueued = 0;
  let applied = 0;
  const bump = (p: string) => { counts[p] = (counts[p] ?? 0) + 1; };

  for (const r of rows) {
    const problems: string[] = [];
    const j = joins.get(r.id) ?? { roles: new Set<string>(), lastJoinMs: 0 };
    const dueMs = new Date(r.dueDate).getTime();
    const vencida = dueMs + 30 * MS_MIN < now;

    // 1. Encerrada que ainda pareceria "entrável" (payload das listas: done×endedAt).
    if (r.endedAt && !r.done) problems.push('ended_sem_done');
    if (r.done && !r.endedAt) problems.push('done_sem_ended');
    // 2. Paga SEM atendimento (janela encerrada/vencida e não completed) — SÓ RELATÓRIO:
    //    decidir estorno/reembolso é política humana (§14.4), nunca reparo automático.
    if (r.paidAt && r.teleStatus !== 'completed' && (r.endedAt != null || vencida)) {
      problems.push('paga_sem_atendimento');
    }
    // 3. Presença incompleta auditada: encerrada, legada, com JOIN de 1 papel só.
    if (r.endedAt && r.teleStatus == null && j.roles.size === 1) problems.push('presenca_incompleta');
    // 4. Legado pré-lifecycle: encerrada sem teleStatus — candidata a classificação.
    if (r.endedAt && r.teleStatus == null) problems.push('telestatus_legado');
    // 5. 402-eterna do CORE: cobrança vencida sem paidAt (join bloqueado p/ sempre).
    if ((r.consultPriceCents ?? 0) > 0 && !r.paidAt && vencida) problems.push('pix_vencida_sem_pagamento');

    if (!problems.length) continue;
    problems.forEach(bump);
    findings.push({
      id: r.id, patient: r.patientName || '?',
      doctor: r.createdByDoctorId ? (doctorNames.get(r.createdByDoctorId) ?? '?') : '—',
      dueDate: new Date(r.dueDate).toISOString(),
      endedAt: r.endedAt ? new Date(r.endedAt).toISOString() : '—',
      teleStatus: r.teleStatus ?? 'null(legado)',
      done: r.done,
      paidAt: r.paidAt ? new Date(r.paidAt).toISOString() : '—',
      problems,
    });

    // ── Reparos SEGUROS (planejados sempre que --repair; executados só com --apply) ──
    if (!opts.repair) continue;

    // (a1) encerrada sem done → done=true (lista deixa de oferecer entrada).
    if (r.endedAt && !r.done) {
      repairs.push({
        id: r.id, field: 'done', before: 'false', after: 'true',
        reason: 'endedAt sem done — coerência de encerrada',
        data: { done: true },
      });
    }
    // (a2) done sem endedAt → carimba endedAt com a MESMA régua do auto-end
    // (último join + 30min; sem join → dueDate + 30min). Só se esse instante JÁ
    // passou — consulta futura marcada done é caso estranho → fica no relatório.
    if (r.done && !r.endedAt) {
      const base = j.lastJoinMs || dueMs;
      const endAt = new Date(base + 30 * MS_MIN);
      if (endAt.getTime() <= now) {
        repairs.push({
          id: r.id, field: 'endedAt', before: 'null', after: endAt.toISOString(),
          reason: j.lastJoinMs ? 'done sem endedAt — último JOIN + 30min (régua do auto-end)' : 'done sem endedAt — dueDate + 30min (régua do auto-end)',
          data: { endedAt: endAt },
        });
      } else {
        log(`[diag] ${r.id}: done sem endedAt mas marca sintética seria FUTURA — só reporta (reparo inseguro)`);
      }
    }
    // (b) classificação do legado pré-lifecycle (teleStatus=null com endedAt).
    if (r.endedAt && r.teleStatus == null) {
      const events = await loadPresenceEvents(r.id);
      const jointMs = computeJointMs(events, new Date(r.endedAt).getTime());
      const cls = classifyLegacy(r, j.roles, jointMs, cfg, now);
      if (cls) {
        const field = j.roles.has('patient') && j.roles.has('doctor') ? 'teleStatus+jointMs' : 'teleStatus';
        repairs.push({
          id: r.id, field,
          before: `teleStatus=null, jointMs=${r.jointMs}`,
          after: `teleStatus=${cls.teleStatus}${field === 'teleStatus+jointMs' ? `, jointMs=${jointMs}` : ''}`,
          reason: `legado pré-lifecycle — ${cls.reason}`,
          data: field === 'teleStatus+jointMs'
            ? { teleStatus: cls.teleStatus, jointMs }
            : { teleStatus: cls.teleStatus },
        });
      } else {
        log(`[diag] ${r.id}: legado sem JOIN e ainda não vencida — só reporta`);
      }
    }
  }

  // ── EXECUÇÃO (--apply): cada reparo é um updateMany CONDICIONAL (race-safe:
  //    só escreve se o estado AINDA bate com o diagnosticado) + log before/after. ──
  if (opts.apply) {
    for (const rep of repairs) {
      try {
        let res: { count: number };
        if (rep.field === 'done') {
          res = await prisma.reminder.updateMany({ where: { id: rep.id, endedAt: { not: null }, done: false }, data: rep.data });
        } else if (rep.field === 'endedAt') {
          res = await prisma.reminder.updateMany({ where: { id: rep.id, done: true, endedAt: null }, data: rep.data });
        } else if (rep.field === 'teleStatus+jointMs') {
          res = await prisma.reminder.updateMany({ where: { id: rep.id, teleStatus: null, endedAt: { not: null } }, data: rep.data });
        } else {
          res = await prisma.reminder.updateMany({ where: { id: rep.id, teleStatus: null, endedAt: { not: null } }, data: rep.data });
        }
        if (res.count === 1) {
          applied++;
          log(`[repair] ${rep.id} ${rep.field}: ${rep.before} → ${rep.after} (${rep.reason})`);
        } else {
          log(`[repair] ${rep.id} ${rep.field}: PULADO — estado mudou entre diagnóstico e execução (condicional não casou)`);
        }
      } catch (e) {
        log(`[repair] ${rep.id} ${rep.field}: ERRO ${(e as Error).message}`);
      }
    }
    // "Paga sem atendimento" → fila de revisão humana (§15.1/§14.5) — nunca reparo.
    for (const f of findings) {
      if (f.problems.includes('paga_sem_atendimento')) {
        if (await enqueueException('teleconsulta_paid_no_atendimento', f.id, {
          paidAt: f.paidAt, teleStatus: f.teleStatus, source: 'diagnose §15.1',
        })) {
          enqueued++;
          log(`[enqueue] ${f.id} teleconsulta_paid_no_atendimento → ExceptionQueue (revisão humana)`);
        }
      }
    }
  } else if (opts.repair) {
    for (const rep of repairs) {
      log(`[repair-plan] ${rep.id} ${rep.field}: ${rep.before} → ${rep.after} (${rep.reason})`);
    }
    log(`[repair-plan] DRY-RUN — ${repairs.length} reparo(s) planejado(s); nada escrito. Repita com --apply para executar.`);
  }

  return { total: rows.length, inconsistent: findings.length, counts, findings, repairs, enqueued, applied };
}

function printTable(res: DiagnoseResult, log: (l: string) => void): void {
  const w = (s: string, n: number) => String(s).slice(0, n).padEnd(n);
  log('');
  log('=== §15.1 Diagnóstico de teleconsultas legadas ===');
  log(`total: ${res.total} · inconsistentes: ${res.inconsistent}`);
  if (Object.keys(res.counts).length) {
    log('por problema: ' + Object.entries(res.counts).map(([k, v]) => `${k}=${v}`).join(' · '));
  }
  if (res.findings.length) {
    log('');
    log(`${w('id', 14)}${w('paciente', 20)}${w('médico', 18)}${w('dueDate', 18)}${w('estado', 16)}${w('done', 6)}${w('paga', 6)}problemas`);
    for (const f of res.findings) {
      log(`${w(f.id, 14)}${w(f.patient, 20)}${w(f.doctor, 18)}${w(f.dueDate.slice(0, 16).replace('T', ' '), 18)}${w(f.teleStatus, 16)}${w(f.done ? 'sim' : 'não', 6)}${w(f.paidAt === '—' ? 'não' : 'sim', 6)}${f.problems.join(', ')}`);
    }
  } else {
    log('nenhuma inconsistência encontrada.');
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const repair = args.includes('--repair');
  const apply = args.includes('--apply');
  await loadSettings(); // honra minJointSeconds/entryWindowMin configurados no admin
  const res = await runDiagnose(Date.now(), { repair: repair || apply, apply });
  if (json) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    printTable(res, console.log);
    if (apply) console.log(`\n[repair] executados: ${res.applied}/${res.repairs.length} · exceções enfileiradas: ${res.enqueued}`);
  }
  await prisma.$disconnect();
}

// Guarda: só roda como CLI (tsx scripts/teleconsulta-diagnose.ts) — import de teste
// (vitest) NÃO dispara o main.
if (process.argv[1] && /teleconsulta-diagnose/.test(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((e) => { console.error('Falha:', e?.message ?? e); process.exit(1); });
}
