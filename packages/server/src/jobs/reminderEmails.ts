import { prisma } from '../prisma';
import { sendEmail } from '../utils/mailer';
import { reminderEmail, teleconsultaEmail, teleconsultaStartingEmail } from '../utils/emailTemplate';
import { sendPushToUser } from '../utils/push';
import { computeJointMs, loadPresenceEvents, resolveNoShow } from '../utils/teleconsultaLifecycle';
import { notifyTeleconsultaNotHeld } from '../utils/teleconsultaNotify';
import { getTeleconsultaConfig } from '../utils/settings';

const MS_MIN = 60_000;
const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

/** Rótulo humano da antecedência ( minutos antes do dueDate ). */
function offsetLabel(o: number): string {
  const map: Record<number, string> = {
    10080: 'Falta 1 semana',
    1440: 'Falta 1 dia',
    720: 'Faltam 12 horas',
    300: 'Faltam 5 horas',
    60: 'Falta 1 hora',
    0: 'É agora',
  };
  if (map[o]) return map[o];
  if (o >= MS_DAY / MS_MIN) return `Faltam ${Math.round(o / 1440)} dias`;
  if (o >= 60) return `Faltam ${Math.round(o / 60)} horas`;
  return `Em ${o} min`;
}

/**
 * Job de lembretes: para CADA antecedência escolhida pelo usuário ao criar
 * (notifyOffsetsMin — estilo Agenda do Google), dispara push + e-mail + notificação in-app
 * exatamente uma vez. O dedup é persistente (coluna sentOffsets) — sobrevive a restart/deploy,
 * ao contrário do Set em memória antigo (que reenviava infinito ou perdia tudo).
 *
 * Offset > 0 ("X antes")  dispara quando now >= dueDate - offset, e só enquanto dueDate > now.
 * Offset = 0 ("na hora")  dispara quando now >= dueDate, com tolerância de 24h (não dispara p/ lembretes antigos).
 */
/** Intervalo da recorrência em passos de data (lote "estilo Teams" 18/10/26).
 *  Tipado com ReminderRecurrence: se alguém adicionar valor novo na whitelist
 *  sem step aqui, o COMPILADOR reclama (antes eram 2 listas soltas). */
const RECURRENCE_STEP: Record<import('../utils/reminderConstants').ReminderRecurrence, (d: Date) => Date> = {
  diario: (d) => new Date(d.getTime() + MS_DAY),
  semanal: (d) => new Date(d.getTime() + 7 * MS_DAY),
  mensal: (d) => addMonths(d, 1),
  semestral: (d) => addMonths(d, 6),
  anual: (d) => addMonths(d, 12),
};
function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  const day = out.getDate();
  out.setMonth(out.getMonth() + n);
  // 31/jan +1m → 3/mar (JS estoura o mês): clampa pro último dia do mês-alvo (31/28-29).
  if (out.getDate() < day) out.setDate(0);
  return out;
}

/**
 * ROLL de recorrência (linha que ROLA, não duplica — padrão "série" do Teams):
 * quando o lembrete recorrente é marcado FEITO, ou fica >24h atrasado, avança a
 * dueDate p/ a próxima ocorrência (sempre à frente de now), rearma os disparos
 * (sentOffsets=[]) e renova o consentimento (cada teleconsulta pede aceite próprio).
 * Mantém UMA linha limpa por série — a lista nunca vira cemitério de ocorrências.
 */
export async function rollRecurringReminders(now: number): Promise<void> {
  // Cursor por id (take sem orderBy repetia sempre as mesmas 200 e ia pra trás de
  // linhas 201+ em bases grandes — cada lote processado muda o dueDate, então o
  // where deixa de casar e o cursor avança até esvaziar).
  let cursor: string | undefined;
  do {
    const stale = await prisma.reminder.findMany({
      where: {
        recurrence: { not: null },
        OR: [{ done: true }, { done: false, dueDate: { lt: new Date(now - 24 * MS_HOUR) } }],
      },
      orderBy: { id: 'asc' },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      take: 200,
    });
    if (!stale.length) break;
    cursor = stale[stale.length - 1].id;
    for (const r of stale) {
      const rec = r.recurrence as import('../utils/reminderConstants').ReminderRecurrence | null;
      if (!rec) continue;
      const step = RECURRENCE_STEP[rec];
      if (!step) continue;
      let next = step(new Date(r.dueDate));
      // Catch-up: atraso maior que 1 intervalo (ex.: app parado 3 meses) avança até o futuro.
      let guard = 0;
      while (next.getTime() <= now && guard++ < 120) next = step(next);
      // Race-safe: só rola se o estado AINDA bate (paciente pode ter desmarcado
      // "feito" entre o findMany e o update — update condicional não sobrescreve).
      await prisma.reminder.updateMany({
        where: {
          id: r.id,
          recurrence: r.recurrence,
          OR: [{ done: true }, { done: false, dueDate: r.dueDate }],
        },
        data: { dueDate: next, sentOffsets: [], done: false, consentAt: null,
          // D5 (F3, 20/10): o pacote da PRÓXIMA consulta começa limpo — consent de
          // gravação e transcrição são POR consulta (áudio novo, consent novo).
          recordConsentAt: null, recordingAt: null, transcriptEnc: null, transcriptIv: null, transcriptAt: null,
          retryCount: 0,
          // Ciclo de vida (22/10): a PRÓXIMA ocorrência nasce ABERTA — sem isto o
          // endedAt da ocorrência anterior bloquearia o join da nova p/ sempre.
          endedAt: null,
          // Lifecycle v2 (24/10): próxima ocorrência nasce 'scheduled', sem presença
          // e sem tempo conjunto da ocorrência anterior.
          teleStatus: 'scheduled', patientJoinedAt: null, jointMs: 0,
          // B1 (§19, 24/10 reabertura): o PIX pago vale UMA ocorrência — sem isto a
          // série recorrente rolava com o paidAt da anterior e o paciente entrava na
          // nova consulta SEM pagar (o valor continua cobrado: consultPriceCents
          // permanece; o /join volta a exigir 402 até o PIX da nova ocorrência).
          paidAt: null, paymentRef: null },
      }).catch((e) => { console.error('[reminders] roll falhou:', r.id, e?.message); });
    }
  } while (true);
}

/**
 * AUTO-END de teleconsulta (22/10/26 + lifecycle 24/10 + §5 dono 26/10): consulta
 * INACABADA cuja tolerância de AUSÊNCIA venceu (dueDate + noShowToleranceMin, AppSetting
 * 'teleconsulta' — default 10min; antes era 30min fixos). Encerra sozinha (done=true)
 * para o card virar "não realizada" e o /join parar de aceitar re-entrada infinita.
 * Se AMBOS os papéis entraram, o encerramento é humano (POST /end ou feedback — queda
 * de conexão é caso do GRACE de reconexão de 5min do client, NÃO de ausência).
 * ESTRATÉGIA DIFERENCIADA (§5): o outcome 'no_show' registra QUEM faltou (noShowBy):
 *   ninguém apareceu ........ no_show / none
 *   só o médico ............ no_show / patient (estorno já reservado pelo ledger)
 *   só o paciente .......... no_show / doctor  + ExceptionQueue 'doctor_no_show'
 *                             (triagem humana; política de estorno é do dono)
 * A tolerância corre do DUE DATE (não do último join): o countdown do client e o job
 * caem no MESMO instante — previsível pros dois lados. O job NUNCA marca 'completed'
 * (exige ambos + tempo conjunto ≥ mínimo — decisão humana no /end).
 * Falha não derruba o job (catch por linha); banco legado sem as colunas → degrada.
 */
export async function autoEndStaleTeleconsultas(now: number): Promise<void> {
  const { noShowToleranceMin } = getTeleconsultaConfig();
  // `endedAt: null` no where precisa da coluna — legado pré-migration rejeita a query
  // inteira → catch → [] (no-op até a migration aplicada).
  const rows = await prisma.reminder.findMany({
    where: { type: 'teleconsulta', endedAt: null },
    select: { id: true, dueDate: true, done: true, ownerId: true, patientId: true, createdByDoctorId: true, title: true },
    take: 200,
  }).catch(() => [] as { id: string; dueDate: Date; done: boolean; ownerId: string; patientId: string | null; createdByDoctorId: string | null; title: string | null }[]);
  for (const r of rows) {
    const joins = await prisma.auditLog.findMany({
      where: { action: 'TELECONSULTA_JOIN', targetId: r.id },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, after: true },
    });
    const dueMs = new Date(r.dueDate).getTime();
    /** Encerra (race-safe + drift-safe: legado sem noShowBy grava o resto igual).
     *  Devolve qtde de linhas afetadas — >0 = ESTE tick foi o vencedor (só ele notifica,
     *  senão /end manual + auto-end disparariam e-mail/push em dobro p/ ambos). */
    const endAs = async (endAt: Date, noShowBy: 'patient' | 'doctor' | 'none', jointMs: number): Promise<number> => {
      const out = await prisma.reminder.updateMany({
        where: { id: r.id, endedAt: null }, // race-safe: não pisa em end manual simultâneo
        data: { endedAt: endAt, done: true, teleStatus: 'no_show', noShowBy, jointMs },
      }).catch(async (e): Promise<any> => {
        if (/column .* does not exist/i.test(String((e as Error)?.message))) {
          const { noShowBy: _drop, ...rest } = { endedAt: endAt, done: true, teleStatus: 'no_show', noShowBy, jointMs };
          return prisma.reminder.updateMany({ where: { id: r.id, endedAt: null }, data: rest })
            .catch((e2) => { console.error('[reminders] auto-end falhou:', r.id, (e2 as Error)?.message); return null; });
        }
        console.error('[reminders] auto-end falhou:', r.id, (e as Error)?.message);
        return null;
      });
      return out?.count ?? 0;
    };
    /** Dono 26/10: no_show AUTO → paciente E médico sabem com o motivo (push+e-mail). */
    const notifyNotHeld = (noShowBy: 'patient' | 'doctor' | 'none') =>
      void notifyTeleconsultaNotHeld(r, { outcome: 'no_show', noShowBy }).catch(() => {});
    if (!joins.length) {
      // Ninguém nunca entrou: encerra VENCIDA além da tolerância e não realizada (done=false).
      if (r.done) continue;
      const decision = resolveNoShow({ dueMs, now, toleranceMin: noShowToleranceMin, patientJoined: false, doctorJoined: false });
      if (decision.outcome !== 'no_show') continue; // tolerância ainda correndo
      if ((await endAs(new Date(decision.deadlineMs), decision.noShowBy ?? 'none', 0)) > 0) notifyNotHeld(decision.noShowBy ?? 'none');
      continue;
    }
    const roles = new Set(joins.map((j: any) => (j.after as any)?.role).filter(Boolean));
    if (roles.size >= 2) continue; // ambos entraram: desconexão = grace do client; fim é humano
    // Presença materializada (carimbos) com fallback pro auditLog — consulta cujo join
    // antecede o deploy da coluna continua resolvida pelos eventos auditados.
    const stamps = await prisma.reminder.findUnique({ where: { id: r.id }, select: { patientJoinedAt: true, doctorJoinedAt: true } })
      .catch(() => null as null | { patientJoinedAt: Date | null; doctorJoinedAt: Date | null });
    const decision = resolveNoShow({
      dueMs, now, toleranceMin: noShowToleranceMin,
      patientJoined: roles.has('patient') || !!stamps?.patientJoinedAt,
      doctorJoined: roles.has('doctor') || !!stamps?.doctorJoinedAt,
    });
    if (decision.outcome !== 'no_show') continue; // dentro da tolerância — quem chegou segue esperando
    const lastJoinMs = new Date(joins[joins.length - 1].createdAt).getTime();
    // endedAt determinístico: a tolerância (join tardio além dela não estica o passado).
    const endAt = new Date(Math.max(decision.deadlineMs, lastJoinMs));
    // jointMs honesto: solo → 0 (nunca há intervalo com ambos; fica p/ registro completo).
    const jointMs = computeJointMs(await loadPresenceEvents(r.id), endAt.getTime());
    if ((await endAs(endAt, decision.noShowBy ?? 'none', jointMs)) > 0) notifyNotHeld(decision.noShowBy ?? 'none');
    // §5: só o PACIENTE esperou (médico não veio) → fila de triagem humana. POLÍTICA
    // PENDENTE (dono): estorno quando o médico falta; por ora o ledger reserva o valor
    // como qualquer no_show e a fila sinaliza — decisão financeira é manual.
    if (decision.noShowBy === 'doctor') {
      await prisma.exceptionQueue.create({
        data: {
          kind: 'doctor_no_show', reminderId: r.id,
          payload: { dueDate: new Date(dueMs).toISOString(), detectedAt: new Date(now).toISOString(), patientJoined: true, doctorJoined: false, source: 'auto_end' },
        },
      }).catch(() => { /* best-effort — o noShowBy na linha já registra */ });
    }
  }
}

// ─────────────── §13 (spec gaps 24/10): e-mail "começa em X min" ───────────────
// Lembrete por E-MAIL entryWindowMin antes do horário, pro PACIENTE e pro MÉDICO
// que agendou (backend puro — com o app fechado, o e-mail é o canal que chega;
// §13 de docs/design/2026-10-24-teleconsulta-gaps-spec.md). A antecedência vem de
// getTeleconsultaConfig() — a MESMA AppSetting 'teleconsulta' do /join (fonte
// única, nunca hardcode duplicado).
//
// DEDUP p/ 2 destinatários no sentOffsets (Int[]) SEM schema novo: markers
// codificados. paciente = 100000 + entryWindowMin · médico = 200000 + entryWindowMin.
// Por que NÃO o offset cru pro paciente: entryWindowMin é editável no admin e pode
// colidir com uma antecedência REAL do notifyOffsetsMin (ex.: 60 = "falta 1h") —
// 100060 nunca colide (offsets legítimos vão até 10080 = 1 semana). Reagendada
// (PUT /reminders/:id) já zera sentOffsets na rota — invalidação primária; trocar
// entryWindowMin (5→60) muda os markers e reenvia na nova janela (aceito: passa a
// valer a regra vigente).
const STARTING_MARK_PATIENT = 100_000;
const STARTING_MARK_DOCTOR = 200_000;

/** Marker de dedup do e-mail "começa em X min" (§13) no sentOffsets do reminder. */
export function startingEmailMark(offsetMin: number, role: 'patient' | 'doctor'): number {
  return (role === 'patient' ? STARTING_MARK_PATIENT : STARTING_MARK_DOCTOR) + offsetMin;
}

/**
 * Decisão PURA (§13): o e-mail "começa em X min" dispara neste instante?
 *  - offset extra = entryWindowMin (janela do /join — mesma config);
 *  - dispara a partir de dueDate − offset e SÓ enquanto dueDate é FUTURO:
 *    agendada com MENOS que a janela de antecedência → triggerMs já passou →
 *    dispara IMEDIATO no 1º tick do job (a matemática de offsets cobre, sem caso
 *    especial). dueDate ≤ now (já começou) não avisa mais — quem perdeu a hora
 *    recebe o offset 0 "na hora" do fluxo normal;
 *  - done/endedAt → encerrada/cancelada/concluída NÃO avisa. O claim do
 *    sendDueReminders RECONFIRMA isso no banco (race-safe contra mudança entre
 *    o findMany e o envio).
 */
export function shouldSendStartingReminder(
  r: { dueDate: Date | string; done?: boolean; endedAt?: Date | string | null },
  now: number,
  cfg: { entryWindowMin: number },
): boolean {
  if (r.done) return false;
  if (r.endedAt != null) return false;
  const dueMs = new Date(r.dueDate).getTime();
  const triggerMs = dueMs - cfg.entryWindowMin * MS_MIN;
  return now >= triggerMs && dueMs > now;
}

/**
 * PASS principal do job (exportado p/ testes — sem setInterval/fake timers):
 * dispara push+e-mail das antecedências vencidas (notifyOffsetsMin) e, para
 * teleconsulta, o e-mail "começa em X min" (§13) pro paciente E pro médico.
 */
export async function sendDueReminders(now: number): Promise<void> {
  const from = new Date(now - 24 * MS_HOUR);     // tolerância: dispara "na hora" até 24h depois
  const to = new Date(now + 8 * MS_DAY);          // cobre a maior antecedência oferecida (1 semana)
  const reminders = await prisma.reminder.findMany({
    where: { done: false, dueDate: { gte: from, lte: to } },
    include: { patient: { include: { owner: { select: { id: true, email: true, name: true } } } } },
  });

  // Teleconsulta: médico que agendou (createdByDoctorId é scalar no reminder —
  // sem include de relação; busca em lote antes do loop). Nome p/ o e-mail de
  // antecedência do PACIENTE; e-mail p/ o destinatário MÉDICO do §13.
  const teleDoctorIds = Array.from(new Set(reminders.filter((r) => r.type === 'teleconsulta' && r.createdByDoctorId).map((r) => r.createdByDoctorId as string)));
  const doctorNames = new Map<string, string>();
  const doctorEmails = new Map<string, string>();
  if (teleDoctorIds.length) {
    (await prisma.doctor.findMany({ where: { id: { in: teleDoctorIds } }, select: { id: true, name: true, email: true } }))
      .forEach((d) => { doctorNames.set(d.id, d.name); doctorEmails.set(d.id, d.email); });
  }

  for (const r of reminders) {
    const owner = r.patient?.owner;
    const dueMs = new Date(r.dueDate).getTime();
    const sent = new Set(r.sentOffsets ?? []);
    const dateStr = new Date(r.dueDate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const name = owner?.name?.split(' ')[0] ?? 'Paciente';
    // Teleconsulta sem offsets (rows criadas antes do default do scheduleTele):
    // padrão de consulta — o dono espera o e-mail "está chegando" nelas também.
    const isTele = r.type === 'teleconsulta';
    const offsets = r.notifyOffsetsMin?.length ? r.notifyOffsetsMin : (isTele ? [1440, 60, 0] : []);
    const docName = isTele && r.createdByDoctorId ? doctorNames.get(r.createdByDoctorId) : undefined;
    const fired: number[] = [];

    for (const o of offsets) {
      if (sent.has(o)) continue;
      const triggerMs = dueMs - o * MS_MIN;
      const eligible = o === 0
        ? now >= dueMs && dueMs >= now - 24 * MS_HOUR      // "na hora" (+ tolerância)
        : now >= triggerMs && dueMs > now;                 // "X antes" (só enquanto futuro)
      if (!eligible) continue;

      const label = offsetLabel(o);
      const body = `${label} — ${r.title} (${dateStr}).`;

      // push + notificação in-app (sendPushToUser cria a Notification e manda FCM p/ os devices)
      if (owner?.id) {
        await sendPushToUser(owner.id, `Lembrete: ${r.title}`, `${name}, ${body}`, { type: 'reminder', reminderId: r.id, offset: String(o) }).catch((e) => console.error('[reminders] push falhou:', e?.message));
      }
      // e-mail (cada antecedência avisa por e-mail — iPhone sem push também é lembrado)
      if (owner?.email) {
        await sendEmail({
          to: owner.email,
          // Teleconsulta: template próprio com CTA direto pra sala (App Link
          // abre o app no Android; web oferece instalar).
          subject: isTele ? `${label} — sua teleconsulta${docName ? ` com ${docName}` : ''}` : `Lembrete: ${r.title}`,
          html: isTele
            ? teleconsultaEmail({ name, doctorName: docName, dueDate: dateStr, teleId: r.id, kind: 'reminder' })
            : reminderEmail(name, r.title, dateStr),
        })
          .catch((e) => console.error('[reminders] e-mail falhou:', e?.message));
      }
      console.log(`[reminders] disparo ${label} p/ ${owner?.email ?? owner?.id}: ${r.title}`);
      fired.push(o);
    }

    // marca os offsets disparados (dedup persistente) — um UPDATE por lembrete com trabalho neste tick
    if (fired.length) {
      await prisma.reminder.update({ where: { id: r.id }, data: { sentOffsets: { push: fired } } }).catch((e) => console.error('[reminders] update sentOffsets falhou:', e?.message));
    }

    // ── §13: e-mail "começa em X min" pro PACIENTE e pro MÉDICO que agendou ──
    if (isTele) {
      const { entryWindowMin } = getTeleconsultaConfig();
      if (shouldSendStartingReminder(r, now, { entryWindowMin })) {
        // Fuso explícito, relógio SERVER: converte p/ America/Sao_Paulo (imune ao
        // TZ do host) — o sufixo "(horário de Brasília)" entra no template.
        const dateBrt = new Date(r.dueDate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
        // Pagamento pendente: só quando há cobrança AINDA não confirmada (paidAt).
        const rawPrice = r.consultPriceCents ?? 0;
        const priceCents: number | undefined = !r.paidAt && rawPrice > 0 ? rawPrice : undefined;
        // CLAIM race-safe (dedup §13): grava o marker SÓ se o estado AINDA bate —
        // não done, não encerrada (endedAt), dueDate intacto (reagendada invalida),
        // marker ausente (2ª passada/restart/worker paralelo). Só 1 vencedor →
        // exatamente 1 e-mail por papel. Envio falhar DEPOIS do claim → log de
        // tentativa (aceite do provedor ≠ entrega); marker não é retraído p/ não
        // duplicar em reprocessamento — os demais canais (offset 0, push, in-app)
        // seguem de pé. Falha no claim (coluna ausente em banco legado) → no-op.
        const claim = async (marker: number): Promise<boolean> => {
          try {
            const res = await prisma.reminder.updateMany({
              where: { id: r.id, done: false, endedAt: null, dueDate: r.dueDate, NOT: { sentOffsets: { has: marker } } },
              data: { sentOffsets: { push: marker } },
            });
            return res.count === 1;
          } catch (e) {
            console.error('[reminders] claim do starting e-mail falhou:', r.id, (e as Error)?.message);
            return false;
          }
        };

        // PACIENTE (dono da conta) — try/catch por envio: falha não bloqueia o médico.
        const markPatient = startingEmailMark(entryWindowMin, 'patient');
        if (owner?.email && !sent.has(markPatient) && (await claim(markPatient))) {
          await sendEmail({
            to: owner.email,
            subject: `Começa em ${entryWindowMin} min — teleconsulta${docName ? ` com ${docName}` : ''}`,
            html: teleconsultaStartingEmail({ name, otherName: docName, dueDate: dateBrt, teleId: r.id, role: 'patient', priceCents }),
          }).catch((e) => console.error('[reminders] starting e-mail (paciente) falhou:', r.id, (e as Error)?.message));
          console.log(`[reminders] starting (-${entryWindowMin}min) paciente ${owner.email}: ${r.title}`);
        }

        // MÉDICO que agendou. Sem createdByDoctorId (linha legado/auto) → só o
        // paciente é avisado — nunca falha o loop por causa disso.
        const markDoctor = startingEmailMark(entryWindowMin, 'doctor');
        const docEmail = r.createdByDoctorId ? doctorEmails.get(r.createdByDoctorId) : undefined;
        const patientName = r.patient?.fullName;
        if (docEmail && patientName && !sent.has(markDoctor) && (await claim(markDoctor))) {
          // "Dr. Roberto Silva" → "Roberto" (prefixo não é nome); sem nome → neutro.
          const docFirst = (doctorNames.get(r.createdByDoctorId as string) || '')
            .replace(/^(dr|dra)\.?\s+/i, '').split(' ')[0] || 'doutor(a)';
          await sendEmail({
            to: docEmail,
            subject: `Começa em ${entryWindowMin} min — teleconsulta com ${patientName}`,
            html: teleconsultaStartingEmail({ name: docFirst, otherName: patientName, dueDate: dateBrt, teleId: r.id, role: 'doctor', priceCents }),
          }).catch((e) => console.error('[reminders] starting e-mail (médico) falhou:', r.id, (e as Error)?.message));
          console.log(`[reminders] starting (-${entryWindowMin}min) médico ${docEmail}: ${r.title}`);
        }
      }
    }
  }
}

export function startReminderEmailJob(): void {
  const check = async () => {
    try {
      await sendDueReminders(Date.now());
    } catch (e) {
      console.error('[reminders] job error:', (e as Error).message);
    }
    try {
      await rollRecurringReminders(Date.now());
    } catch (e) {
      console.error('[reminders] roll error:', (e as Error).message);
    }
    try {
      await autoEndStaleTeleconsultas(Date.now());
    } catch (e) {
      console.error('[reminders] auto-end error:', (e as Error).message);
    }
  };

  setInterval(check, 5 * MS_MIN); // a cada 5 min — "na hora" dispara com no máx 5 min de atraso
  setTimeout(check, 30_000);      // 30s após iniciar
  console.log('[reminders] job iniciado (antecedências configuráveis · push+email+in-app · starting §13 · a cada 5 min)');
}
