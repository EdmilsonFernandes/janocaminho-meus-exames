// FILA DE TELECONSULTA IMEDIATA — job de tick (spec docs/design/2026-10-27-fila-imediata-spec.md §3).
// `runTeleconsultaQueueTick(now)` é PURO/testável (relógio injetado); tudo que muda estado
// roda em $transaction com pg_advisory_xact_lock(hashtext('tele-queue')) — 2 ticks/deploy
// concorrentes serializam. Side effects EXTERNOS (push, PIX, sala LiveKit, audit) ficam
// FORA da tx de propósito (padrão doctor.routes:1342): falha externa não rola estado atrás.
//
// Passos do tick:
//  1. Presença: heartbeat >90s → offline (o heartbeat esperado é 30s).
//  2. Offers expiradas (matched && offerExpiresAt<now): attempts+1; ≥3 ou sem outros
//     médicos → expired 'no_accept' + push; senão volta a waiting (FIFO preservado).
//  3. Espera: waiting && enteredAt < now−queuePatientTimeoutMin → expired 'timeout' + push.
//  4. Match FIFO: cria Reminder + DoctorShare efêmero (convenio='fila-imediata') + PIX
//     quando consultPriceCents>0 (§3.2).
//  5. Aceite: rota POST /queue/calls/:id/accept (lock por call — ver teleconsultaQueue.routes).
//  6. Fim: accepted cujo Reminder tem endedAt≠null → 'ended' + share efêmero revogado
//     (no_show do MÉDICO pago → ExceptionQueue 'doctor_no_show', triagem de estorno).
import { createId } from '@paralleldrive/cuid2';
import { prisma } from '../prisma';
import { audit } from '../utils/audit';
import { sendPushToUser } from '../utils/push';
import { getTeleconsultaConfig } from '../utils/settings';
import { createLiveKitRoom } from '../utils/livekit';
import { createTeleconsultaPix } from '../utils/teleconsultaPix';
import { resolveCommissionRule } from '../finance/rules';
import { practiceStatuses } from '../utils/doctorAccess';

/** TTL da presença (heartbeat esperado 30s; 90s = 3 batidas perdidas). */
export const PRESENCE_TTL_MS = 90_000;
/** Intervalo do job (spec §3) + 1ª passada 2s após o boot. */
const TICK_INTERVAL_MS = 15_000;
const TICK_FIRST_MS = 2_000;
/** Máx. de offers antes de expirar a entrada (anti-gaming, spec §3.2/§8-7). */
const MAX_OFFER_ATTEMPTS = 3;
const QUEUE_SHARE_CONVENIO = 'fila-imediata';

export interface TeleconsultaQueueTickReport {
  presenceExpired: number;
  offersExpired: number;
  entriesExpired: number;
  waitingExpired: number;
  matched: number;
  ended: number;
}

interface MatchOutcome {
  entryId: string;
  ownerId: string;
  reminderId: string;
  reminderTitle: string;
  consultPriceCents: number;
  doctorId: string;
  doctorName: string;
  patientId: string;
}

interface ExpiredOutcome {
  entryId: string;
  ownerId: string;
  reason: 'no_accept' | 'timeout';
}

/** O tick completo. `now` injetável (teste determinístico). Nunca lança p/ o caller do
 *  setInterval — erros de DB propagam p/ o catch do job (o processo não cai). */
export async function runTeleconsultaQueueTick(now: Date = new Date()): Promise<TeleconsultaQueueTickReport> {
  const { queuePatientTimeoutMin, queueOfferTtlSec, slotMin } = getTeleconsultaConfig();
  const report: TeleconsultaQueueTickReport = {
    presenceExpired: 0, offersExpired: 0, entriesExpired: 0, waitingExpired: 0, matched: 0, ended: 0,
  };
  const matches: MatchOutcome[] = [];
  const expiredPushes: ExpiredOutcome[] = [];
  /** Entradas re-postas na fila neste tick (offer expirada): NÃO re-casar no mesmo
   *  tick — o re-oferto vem no tick seguinte (spec §8-6: "aceitar expirado → waiting
   *  attempts+1"; casar no mesmo instante bateria a tentativa sem dá tempo de polling). */
  const requeuedIds = new Set<string>();

  await prisma.$transaction(async (tx) => {
    // Serializa ticks concorrentes (spec §7 corrida de tick). $executeRaw: void (P2010).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tele-queue'))`;

    // ── 1. PRESENÇA: heartbeat >90s → offline (materializa p/ listas/portal). ──
    const presence = await tx.doctorOnlinePresence.updateMany({
      where: { online: true, lastHeartbeatAt: { lt: new Date(now.getTime() - PRESENCE_TTL_MS) } },
      data: { online: false },
    });
    report.presenceExpired = presence.count;

    // ── 2. OFFERS EXPIRADAS (deadline de aceite vencido). ──
    const staleOffers = await tx.teleconsultaQueue.findMany({
      where: { status: 'matched', offerExpiresAt: { lt: now } },
      orderBy: { matchedAt: 'asc' },
      select: { id: true, patientId: true, ownerId: true, attempts: true, matchedDoctorId: true, reminderId: true, enteredAt: true },
    });
    if (staleOffers.length) {
      // "Sem outros médicos online" (além do que deixou a offer vencer) → expira a entrada.
      const othersOnline = await tx.doctorOnlinePresence.count({
        where: { online: true, lastHeartbeatAt: { gte: new Date(now.getTime() - PRESENCE_TTL_MS) } },
      });
      for (const o of staleOffers) {
        const attempts = o.attempts + 1;
        const giveUp = attempts >= MAX_OFFER_ATTEMPTS || othersOnline === 0;
        // Teleconsulta da offer morta: não paga/aberta → some (PIX pago depois da expiração
        // é detectado/reembolsado pela conciliação existente — spec §3.2/§7).
        if (o.reminderId) {
          const r = await tx.reminder.findUnique({ where: { id: o.reminderId }, select: { paidAt: true, endedAt: true } });
          if (r && !r.paidAt && !r.endedAt) await tx.reminder.delete({ where: { id: o.reminderId } }).catch(() => {});
        }
        if (o.matchedDoctorId) {
          await tx.doctorShare.updateMany({
            where: { patientId: o.patientId, doctorId: o.matchedDoctorId, convenio: QUEUE_SHARE_CONVENIO, revokedAt: null },
            data: { active: false, revokedAt: now },
          });
        }
        if (giveUp) {
          await tx.teleconsultaQueue.update({
            where: { id: o.id },
            data: { status: 'expired', endedAt: now, cancelReason: 'no_accept', attempts },
          });
          report.entriesExpired++;
          expiredPushes.push({ entryId: o.id, ownerId: o.ownerId, reason: 'no_accept' });
        } else {
          // Volta pra fila PRESERVANDO enteredAt (FIFO — spec §3.2 "attempts preservado").
          await tx.teleconsultaQueue.update({
            where: { id: o.id },
            data: { status: 'waiting', matchedDoctorId: null, matchedAt: null, offerExpiresAt: null, attempts },
          });
          requeuedIds.add(o.id);
        }
        report.offersExpired++;
      }
    }

    // ── 3. ESPERA: paciente esperou além do timeout → expired 'timeout' + push neutro. ──
    const staleWaiting = await tx.teleconsultaQueue.findMany({
      where: { status: 'waiting', enteredAt: { lt: new Date(now.getTime() - queuePatientTimeoutMin * 60_000) } },
      select: { id: true, ownerId: true },
    });
    for (const w of staleWaiting) {
      await tx.teleconsultaQueue.update({
        where: { id: w.id },
        data: { status: 'expired', endedAt: now, cancelReason: 'timeout' },
      });
      report.waitingExpired++;
      expiredPushes.push({ entryId: w.id, ownerId: w.ownerId, reason: 'timeout' });
    }

    // ── 4. MATCH FIFO (waiting por enteredAt asc) sobre médicos de presença fresca. ──
    // Entradas repostas pelo passo 2 ficam p/ o PRÓXIMO tick (requeuedIds).
    const waitingEntries = (await tx.teleconsultaQueue.findMany({
      where: { status: 'waiting' },
      orderBy: { enteredAt: 'asc' },
      select: { id: true, patientId: true, ownerId: true, consentAt: true, maxPriceCents: true, enteredAt: true, specialtyFilter: true, preferredDoctorId: true },
    })).filter((e) => !requeuedIds.has(e.id));
    if (waitingEntries.length) {
      const freshCutoff = new Date(now.getTime() - PRESENCE_TTL_MS);
      const candidates = await tx.doctorOnlinePresence.findMany({
        where: { online: true, lastHeartbeatAt: { gte: freshCutoff }, doctor: { verificationStatus: { in: practiceStatuses(now) } } },
        select: {
          doctorId: true, lastOnlineAt: true,
          doctor: { select: { id: true, name: true, blocked: true, specialty: true, consultPriceCents: true, instantPriceCents: true } },
        },
      });
      // Médicos já ocupados neste tick (offer feita) + offers/aceites vivos do banco.
      const busyOffer = new Set(
        (await tx.teleconsultaQueue.findMany({
          where: { status: { in: ['matched', 'accepted'] } },
          select: { matchedDoctorId: true },
        })).map((e) => e.matchedDoctorId).filter((d): d is string => !!d),
      );
      // Agenda: teleconsulta ocupando dueDate ± slotMin (reuso do conflictWhere §19,
      // doctor.routes:1272 — scheduled/in_progress/legado-null, não-done, não-ended).
      const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
      const agenda: { createdByDoctorId: string | null; dueDate: Date }[] = await tx.reminder.findMany({
        where: {
          type: 'teleconsulta', done: false, endedAt: null, createdByDoctorId: { not: null },
          dueDate: { gte: new Date(now.getTime() - slotMin * 60_000), lte: new Date(now.getTime() + slotMin * 60_000) },
          OR: [{ teleStatus: null }, { teleStatus: 'scheduled' }, { teleStatus: 'in_progress' }],
        },
        select: { createdByDoctorId: true, dueDate: true },
      }).catch((): { createdByDoctorId: string | null; dueDate: Date }[] => []); // drift legado: degrada sem agenda
      const agendaBusy = new Set(agenda.map((a) => a.createdByDoctorId).filter((d): d is string => !!d));
      // Carga de hoje (ordenação: menos atendimentos primeiro; empate = presença antiga).
      const loadRows = await tx.reminder.groupBy({
        by: ['createdByDoctorId'],
        where: { type: 'teleconsulta', createdByDoctorId: { not: null }, dueDate: { gte: dayStart } },
        _count: { _all: true },
      }).catch(() => [] as { createdByDoctorId: string | null; _count: { _all: number } }[]);
      const load = new Map<string, number>();
      for (const l of loadRows) if (l.createdByDoctorId) load.set(l.createdByDoctorId, l._count._all);

      const pool = candidates
        .filter((c) => c.doctor && !c.doctor.blocked && !busyOffer.has(c.doctorId) && !agendaBusy.has(c.doctorId))
        .sort((a, b) =>
          (load.get(a.doctorId) ?? 0) - (load.get(b.doctorId) ?? 0) ||
          new Date(a.lastOnlineAt ?? 0).getTime() - new Date(b.lastOnlineAt ?? 0).getTime());

      // Share do paciente por médico: share REAL revogado pelo paciente BLOQUEIA o
      // candidato (ele tirou o acesso); o share EFÊMERO ('fila-imediata', revogado pelo
      // próprio fluxo em expiry/decline) NÃO bloqueia — é reativado no próximo match.
      const shares = await tx.doctorShare.findMany({
        where: { patientId: { in: waitingEntries.map((e) => e.patientId) } },
        select: { patientId: true, doctorId: true, active: true, convenio: true },
      });
      const shareKey = (p: string, d: string) => `${p}:${d}`;
      const shareMap = new Map(shares.map((s) => [shareKey(s.patientId, s.doctorId), { active: s.active, convenio: s.convenio ?? null }] as const));

      for (const entry of waitingEntries) {
        const budget = entry.maxPriceCents ?? 0; // null = só grátis (spec §3.4)
        // v1.1: escolha do paciente — filtro de especialidade (match EXATO) e médico
        // preferido primeiro. Preferência é MACIA: o escolhido só vence se estiver no
        // pool (online, não bloqueado, não ocupado); fora dele → FIFO normal do filtro.
        let ordered = pool;
        if (entry.specialtyFilter) {
          const f = entry.specialtyFilter;
          ordered = ordered.filter((c) => c.doctor!.specialty === f);
        }
        if (entry.preferredDoctorId) {
          const preferred = ordered.find((c) => c.doctorId === entry.preferredDoctorId);
          if (preferred) ordered = [preferred, ...ordered.filter((c) => c.doctorId !== entry.preferredDoctorId)];
        }
        const pick = ordered.find((c) => {
          if (busyOffer.has(c.doctorId)) return false;
          const price = c.doctor!.instantPriceCents ?? c.doctor!.consultPriceCents ?? 0;
          if (price > budget) return false;
          const s = shareMap.get(shareKey(entry.patientId, c.doctorId));
          // share real inativo = paciente revogou o acesso deste médico → fora.
          if (s && !s.active && s.convenio !== QUEUE_SHARE_CONVENIO) return false;
          return true;
        });
        if (!pick) continue; // sem candidato agora — próximo tick tenta (entrada não expira por isso)
        const doctor = pick.doctor!;
        const effPrice = doctor.instantPriceCents ?? doctor.consultPriceCents;
        const consultPriceCents = effPrice && effPrice > 0 ? effPrice : null; // v1.1: instantPriceCents ?? consultPriceCents (congela no Reminder)

        // Sala renascida (D2): id gerado ANTES p/ roomName previsível (padrão doctor.routes:1293).
        const reminderId = createId();
        const roomName = `teleconsulta-${reminderId}`;
        // §18.2: regra de comissão CONGELADA no agendamento (só quando há cobrança).
        const commissionSnapshot = consultPriceCents ? await resolveCommissionRule(doctor.id, now) : null;
        await tx.reminder.create({
          data: {
            id: reminderId,
            ownerId: entry.ownerId,
            patientId: entry.patientId,
            title: 'Consulta imediata',
            dueDate: now, // "agora" — janela de entrada já aberta
            type: 'teleconsulta',
            provider: 'livekit',
            roomName,
            teleStatus: 'scheduled',
            consentAt: entry.consentAt, // consent Art.15 dado NA ENTRADA — persistido no ato
            consultPriceCents,
            commissionSnapshot: commissionSnapshot ? (commissionSnapshot as unknown as object) : undefined,
            createdByDoctorId: doctor.id,
            notifyOffsetsMin: [], // sem antecedências: a chamada é AGORA (push do match avisa)
          },
        });
        // Share efêmero mínimo (LGPD art.6º III): summary+exams, sem custo, sem perguntas.
        // Share REAL ativo dispensa o efêmero; linha EFÊMERA revogada (decline/expiry
        // anterior) é REATIVADA — o fluxo é quem revogou, não o paciente.
        // Postgres: erro de constraint ABORTA a tx (25P02) — nunca criar-then-catch;
        // read-then-write direto (o advisory lock do tick serializa, sem corrida).
        if (shareMap.get(shareKey(entry.patientId, doctor.id))?.active !== true) {
          const existing = await tx.doctorShare.findUnique({
            where: { patientId_doctorId: { patientId: entry.patientId, doctorId: doctor.id } },
            select: { convenio: true, active: true },
          });
          if (!existing) {
            await tx.doctorShare.create({
              data: {
                patientId: entry.patientId, doctorId: doctor.id, scopes: ['summary', 'exams'],
                convenio: QUEUE_SHARE_CONVENIO, active: true, creditsCharged: 0, openQuestionLimit: 0, examIds: [],
              },
            });
          } else if (existing.convenio === QUEUE_SHARE_CONVENIO && !existing.active) {
            await tx.doctorShare.update({
              where: { patientId_doctorId: { patientId: entry.patientId, doctorId: doctor.id } },
              data: { active: true, revokedAt: null },
            });
          } // share REAL existente (ativo ou revogado pelo paciente) permanece como está
          shareMap.set(shareKey(entry.patientId, doctor.id), { active: true, convenio: QUEUE_SHARE_CONVENIO });
        }
        await tx.teleconsultaQueue.update({
          where: { id: entry.id },
          data: {
            status: 'matched', matchedDoctorId: doctor.id, reminderId,
            matchedAt: now, offerExpiresAt: new Date(now.getTime() + queueOfferTtlSec * 1000),
            attempts: { increment: 1 },
          },
        });
        busyOffer.add(doctor.id); // 1 offer por médico por tick (partial unique reforça)
        report.matched++;
        matches.push({
          entryId: entry.id, ownerId: entry.ownerId, reminderId, reminderTitle: 'Consulta imediata',
          consultPriceCents: consultPriceCents ?? 0, doctorId: doctor.id, doctorName: doctor.name,
          patientId: entry.patientId,
        });
      }
    }

    // ── 6. FIM: accepted cujo Reminder encerrou (ou sumiu) → 'ended' + share revogado. ──
    const accepted = await tx.teleconsultaQueue.findMany({
      where: { status: 'accepted' },
      select: { id: true, patientId: true, ownerId: true, matchedDoctorId: true, reminderId: true },
    });
    for (const a of accepted) {
      const r = a.reminderId
        ? await tx.reminder.findUnique({ where: { id: a.reminderId }, select: { endedAt: true, teleStatus: true, noShowBy: true, paidAt: true } })
        : null;
      if (r && !r.endedAt) continue; // chamada viva — nada a fazer
      await tx.teleconsultaQueue.update({
        where: { id: a.id },
        data: { status: 'ended', endedAt: now },
      });
      if (a.matchedDoctorId) {
        await tx.doctorShare.updateMany({
          where: { patientId: a.patientId, doctorId: a.matchedDoctorId, convenio: QUEUE_SHARE_CONVENIO, revokedAt: null },
          data: { active: false, revokedAt: now },
        });
      }
      // §5/§18.7: pago + no_show do MÉDICO → triagem de estorno (política do dono — a
      // reserva já está no ledger pelo /end; aqui só sinaliza a fila humana).
      if (r?.teleStatus === 'no_show' && r.noShowBy === 'doctor' && r.paidAt && a.reminderId) {
        const dup = await tx.exceptionQueue.findFirst({ where: { kind: 'doctor_no_show', reminderId: a.reminderId }, select: { id: true } });
        if (!dup) {
          await tx.exceptionQueue.create({
            data: { kind: 'doctor_no_show', reminderId: a.reminderId, payload: { source: 'fila-imediata', queueEntryId: a.id } },
          }).catch(() => { /* best-effort — o noShowBy na linha já registra */ });
        }
      }
      report.ended++;
    }
  });

  // ── Side effects EXTERNOS (fora da tx): push neutro, PIX, sala, audit. ──
  for (const x of expiredPushes) {
    // §4 Expirou — mensagem neutra, sem dado clínico.
    void sendPushToUser(x.ownerId, 'Atendimento imediato indisponível', 'Nenhum médico disponível agora. Tente mais tarde.', { type: 'teleconsulta-queue' }).catch(() => {});
    await audit('QUEUE_EXPIRE', null, {
      actorType: 'SYSTEM', targetType: 'PATIENT', targetId: x.entryId,
      after: { entryId: x.entryId, reason: x.reason },
    });
  }
  for (const m of matches) {
    // Sala LiveKit nasce no match (idempotente; join recria se preciso) — fora da tx.
    void createLiveKitRoom(`teleconsulta-${m.reminderId}`).catch(() => { /* join recria */ });
    // §3.2: PIX no MATCH (10min; startPixExpiryJob já roda warning/expiração).
    if (m.consultPriceCents > 0) {
      const user = await prisma.user.findUnique({ where: { id: m.ownerId }, select: { id: true, name: true, email: true } });
      if (user) {
        const pix = await createTeleconsultaPix(
          { id: m.reminderId, ownerId: m.ownerId, title: m.reminderTitle, consultPriceCents: m.consultPriceCents },
          user,
        ).catch(() => null);
        // Falha de PIX NÃO desfaz o match: o /join bloqueia 402 e o POST /billing recria.
        if (pix && !pix.ok) console.warn('[tele-queue] PIX do match não saiu (join 402 + billing recria):', m.reminderId);
      }
    }
    // §4 Match — push neutro; data só {type:'teleconsulta', reminderId}.
    const body = m.consultPriceCents > 0
      ? 'Toque para concluir o pagamento e entrar na sala.'
      : 'Toque para entrar na sala agora.';
    void sendPushToUser(m.ownerId, `✓ Dr. ${m.doctorName} vai te atender`, body, { type: 'teleconsulta', reminderId: m.reminderId }).catch(() => {});
    await audit('QUEUE_MATCH', null, {
      actorType: 'SYSTEM', targetType: 'REMINDER', targetId: m.reminderId,
      after: { entryId: m.entryId, doctorId: m.doctorId, patientId: m.patientId, priceCents: m.consultPriceCents },
    });
  }
  return report;
}

/** Job periódico (padrão reconciliation.ts:260-277): setInterval 15s + 1ª passada 2s
 *  após o boot. try/catch por tick — falha NUNCA derruba o processo. */
export function startTeleconsultaQueueJob(): void {
  const tick = async () => {
    try {
      const report = await runTeleconsultaQueueTick(new Date());
      if (report.matched || report.offersExpired || report.entriesExpired || report.waitingExpired || report.ended || report.presenceExpired) {
        console.log(`[tele-queue] tick: ${report.matched} match(es), ${report.offersExpired} offer(s) expirada(s), ${report.entriesExpired + report.waitingExpired} entrada(s) expirada(s), ${report.ended} finalizada(s), ${report.presenceExpired} presença(s) offline`);
      }
    } catch (e) {
      console.error('[tele-queue] job error:', (e as Error)?.message);
    }
  };
  setInterval(tick, TICK_INTERVAL_MS);
  setTimeout(tick, TICK_FIRST_MS);
  console.log('[tele-queue] job iniciado (fila imediata · a cada 15s)');
}
