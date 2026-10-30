// FILA DE TELECONSULTA IMEDIATA ("Falar agora") — spec docs/design/2026-10-27-fila-imediata-spec.md §2.
// Paciente entra na fila (consent Art.15/CFM 2.314 NA ENTRADA + teto de preço); médicos
// declaram presença "atender agora" (heartbeat 30s, expira 90s no tick); o MATCH é feito
// pelo job (src/jobs/teleconsultaQueue.ts) — aqui só estado + aceite/recusa da offer.
//
// Auth MÉDICO local (`requireQueueDoctor`): o middleware/auth.ts original rejeita token
// de médico e doctor.routes.ts é de outro dono — espelhamos o requireDoctor (mesmo padrão
// do requireJoinIdentity em teleconsulta.routes.ts, sem tocar em arquivo alheio).
//
// Push sempre NEUTRO (LGPD — nada clínico no payload); `data` só {type:'teleconsulta',
// reminderId} quando há consulta (padrão push join :252). Erros sempre com `code`.
import { Router, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../prisma';
import { requireAuth, userPatientIds, type AuthedRequest } from '../middleware/auth';
import { audit } from '../utils/audit';
import { getTeleconsultaConfig } from '../utils/settings';
import { resolveCommissionRule } from '../finance/rules';
import { hasLiveKitConfig } from '../utils/livekit';
import { sendPushToUser } from '../utils/push';
import { findLiveTeleconsultaPix } from '../utils/teleconsultaPix';
import { PRESENCE_TTL_MS } from '../jobs/teleconsultaQueue';
import { DOCTOR_ACCESS_SELECT, doctorAccessDenial, practiceStatuses } from '../utils/doctorAccess';

/** Presença "fresca" = online + heartbeat dentro do TTL (o tick passo 1 materializa o
 *  offline; esta query é a verdade AO VIVO p/ status/heartbeat não dependerem do tick). */
const freshPresenceWhere = (now = new Date()) => ({
  online: true,
  lastHeartbeatAt: { gte: new Date(now.getTime() - PRESENCE_TTL_MS) },
} as const);

/** Idade do paciente em anos (null = sem dateOfBirth — mostra "—" no dialog do médico). */
function patientAge(dob: Date | null | undefined, now = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

interface AnyRequest extends AuthedRequest {
  doctorId?: string;
}

/** Auth de médico local (espelho do requireDoctor — ver comentário do módulo). */
async function requireQueueDoctor(req: AnyRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) { res.status(401).json({ error: 'Token obrigatório.' }); return; }
  let payload: any;
  try { payload = jwt.verify(header.slice(7), config.jwtSecret); } catch { res.status(401).json({ error: 'Token médico inválido.' }); return; }
  if (payload?.type !== 'doctor' || !payload?.doctorId) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
  const doc = await prisma.doctor.findUnique({ where: { id: payload.doctorId }, select: DOCTOR_ACCESS_SELECT });
  if (!doc) { res.status(401).json({ error: 'Médico não encontrado.' }); return; }
  const denial = doctorAccessDenial(doc); // política única (spec §7) — a spec da fila previa "CRM verificado"
  if (denial) { res.status(denial.status).json(denial.body); return; }
  req.doctorId = doc.id;
  next();
}

// ═══════════════════════════════ PACIENTE (requireAuth) ═══════════════════════════════

const router = Router();

/** GET /api/teleconsulta-queue/status — tela "Falar agora": faixa de preço dos médicos
 *  online, posição na fila e offer atual (com PIX vivo quando aguardando pagamento).
 *  v1.1: inclui `doctors[]` — médicos online (heartbeat fresco, não bloqueados) com
 *  especialidade/cidade/preço p/ o paciente ESCOLHER. Ordenação: mais atendimentos
 *  imediatos HOJE desc ("online primeiro e melhor primeiro"), empate = preço asc.
 *  Foto NÃO vem aqui (peso): `photoAvailable` + rota GET /api/doctor/photo/:id (?t=). */
router.get('/status', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const now = new Date();
    // `presenceAll` (main: filtra depois os médicos ocupados) + o nosso portão: só aparece quem pode ATUAR (aprovado ou legado em prazo).
    const presenceAll = await prisma.doctorOnlinePresence.findMany({
      where: { ...freshPresenceWhere(now), doctor: { blocked: false, verificationStatus: { in: practiceStatuses() } } },
      select: {
        doctorId: true,
        doctor: { select: { id: true, name: true, specialty: true, city: true, photoUrl: true, crmUf: true, consultPriceCents: true, instantPriceCents: true, verificationStatus: true, verifiedBy: true } },
      },
    });
    // Bug 29/10 (teste real Enrico): a lista mostrava médico ONLINE mas INCASÁVEL —
    // com teleconsulta agendada agora (±slotMin) ou offer/aceite vivo, o match pula
    // o médico (mesmos filtros do tick §3) e o paciente esperava 10min à toa.
    // Espelha os filtros aqui: só aparece quem pode de fato ser casado.
    const { slotMin } = getTeleconsultaConfig();
    const busyQueue = new Set(
      (await prisma.teleconsultaQueue.findMany({
        where: { status: { in: ['matched', 'accepted'] } },
        select: { matchedDoctorId: true },
      })).map((e) => e.matchedDoctorId).filter((d): d is string => !!d),
    );
    const agendaRows: { createdByDoctorId: string | null }[] = await prisma.reminder.findMany({
      where: {
        type: 'teleconsulta', done: false, endedAt: null, createdByDoctorId: { not: null },
        dueDate: { gte: new Date(now.getTime() - slotMin * 60_000), lte: new Date(now.getTime() + slotMin * 60_000) },
        OR: [{ teleStatus: null }, { teleStatus: 'scheduled' }, { teleStatus: 'in_progress' }],
      },
      select: { createdByDoctorId: true },
    }).catch((): { createdByDoctorId: string | null }[] => []); // drift legado: degrada sem agenda
    const agendaBusy = new Set(agendaRows.map((a) => a.createdByDoctorId).filter((d): d is string => !!d));
    const presence = presenceAll.filter((p) => !busyQueue.has(p.doctorId) && !agendaBusy.has(p.doctorId));
    // Carga de HOJE (mesma query do match §3) — ordena a lista: quem já atendeu mais
    // pela fila hoje vem primeiro (mais experiente da fila). Degrada sem ordem extra.
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const loadRows = await prisma.reminder.groupBy({
      by: ['createdByDoctorId'],
      where: { type: 'teleconsulta', createdByDoctorId: { not: null }, dueDate: { gte: dayStart } },
      _count: { _all: true },
    }).catch(() => [] as { createdByDoctorId: string | null; _count: { _all: number } }[]);
    const load = new Map<string, number>();
    for (const l of loadRows) if (l.createdByDoctorId) load.set(l.createdByDoctorId, l._count._all);

    const doctors = presence
      .map((p) => ({
        d: p.doctor,
        priceCents: p.doctor?.instantPriceCents ?? p.doctor?.consultPriceCents ?? 0,
        load: load.get(p.doctorId) ?? 0,
      }))
      .filter((x): x is { d: NonNullable<typeof x.d>; priceCents: number; load: number } => !!x.d)
      .sort((a, b) => b.load - a.load || a.priceCents - b.priceCents || a.d.name.localeCompare(b.d.name, 'pt-BR'))
      .map((x) => ({
        id: x.d.id,
        name: x.d.name,
        specialty: x.d.specialty ?? null,
        city: x.d.city ?? null,
        photoAvailable: !!x.d.photoUrl,
        priceCents: x.priceCents,
        crmUf: x.d.crmUf ?? null,
        // selo "Identidade verificada": só quem foi APROVADO por uma verificação de verdade — legado em prazo atende
        // sem selo, e aprovado EM LOTE (verifiedBy legacy_bulk:*) também, pois nunca teve a identidade conferida (M13)
        verified: x.d.verificationStatus === 'approved' && !String(x.d.verifiedBy ?? '').startsWith('legacy_bulk'),
      }));

    const prices = doctors.map((d) => d.priceCents);
    const priceRangeCents = doctors.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;

    // Entrada ativa do PACIENTE (qualquer paciente da conta — a fila é por pessoa).
    const ids = await userPatientIds(req.userId!);
    const entry = ids.length
      ? await prisma.teleconsultaQueue.findFirst({
          where: { patientId: { in: ids }, status: { in: ['waiting', 'matched', 'accepted'] } },
          orderBy: { enteredAt: 'asc' },
          select: {
            id: true, patientId: true, ownerId: true, status: true, enteredAt: true,
            matchedDoctorId: true, reminderId: true, attempts: true,
            matchedDoctor: { select: { name: true } },
          },
        })
      : null;

    let position: number | null = null;
    if (entry?.status === 'waiting') {
      const ahead = await prisma.teleconsultaQueue.count({
        where: { status: 'waiting', enteredAt: { lt: entry.enteredAt } },
      });
      position = ahead + 1;
    }
    // ETA heurístico: ~10min por atendimento dividido entre os médicos online.
    const doctorsOnline = doctors.length;
    const etaMin = entry?.status === 'waiting' && doctorsOnline > 0
      ? Math.max(1, Math.ceil((position ?? 1) / doctorsOnline) * 10)
      : null;

    let matched: { reminderId: string; doctorName: string; priceCents: number; payment: { qrCode: string; qrBase64: string; expiresAt: string } | null } | null = null;
    if (entry && (entry.status === 'matched' || entry.status === 'accepted') && entry.reminderId) {
      const r = await prisma.reminder.findUnique({
        where: { id: entry.reminderId },
        select: { consultPriceCents: true, paidAt: true },
      });
      const priceCents = r?.consultPriceCents ?? 0;
      // PIX vivo quando AINDA não pagou (reuso §3.2 — retomada, nunca ordem nova aqui).
      const payment = r && !r.paidAt && priceCents > 0
        ? await findLiveTeleconsultaPix(entry.reminderId, entry.ownerId)
        : null;
      matched = {
        reminderId: entry.reminderId,
        doctorName: entry.matchedDoctor?.name ?? 'Médico',
        priceCents,
        payment: payment ? { qrCode: payment.qrCode, qrBase64: payment.qrBase64, expiresAt: payment.expiresAt } : null,
      };
    }

    res.json({
      online: !!entry,
      entry: entry ? { id: entry.id, status: entry.status, position, enteredAt: entry.enteredAt.toISOString(), etaMin } : null,
      doctorsOnline,
      doctors, // v1.1: lista visível p/ escolha (ordenada: mais atendimentos hoje → preço)
      priceRangeCents,
      matched,
    });
  } catch (e) { next(e); }
});

/** POST /api/teleconsulta-queue {patientId, consent:true, maxPriceCents?, specialty?,
 *  preferredDoctorId?} — entrada na fila. Consent (Art.15/CFM 2.314) é dado AQUI e
 *  persistido na entry (auditável). Sem cobrança na entrada — o PIX só nasce no MATCH
 *  (§3.2). v1.1: escolha opcional — `specialty` (match SÓ com a especialidade exata)
 *  e `preferredDoctorId` (o escolhido recebe a offer primeiro; offline/ocupado no
 *  momento → FIFO normal do filtro — preferência macia, sem FK). */
router.post('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const ids = await userPatientIds(req.userId!);
    const pid = String(req.body?.patientId ?? '');
    if (!pid || !ids.includes(pid)) { res.status(404).json({ error: 'Paciente não encontrado.', code: 'PATIENT_NOT_FOUND' }); return; }
    if (req.body?.consent !== true) {
      res.status(400).json({ error: 'Autorize a telemedicina (Art. 15, Res. CFM 2.314/2022) antes de entrar na fila.', code: 'CONSENT_REQUIRED' });
      return;
    }
    // v1.1: filtros opcionais — sanitizados (trim + teto de tamanho, nada de regex/HTML).
    let specialtyFilter: string | null = null;
    if (req.body?.specialty != null) {
      const s = String(req.body.specialty).trim();
      if (s.length > 80) { res.status(400).json({ error: 'Especialidade inválida.', code: 'BAD_SPECIALTY' }); return; }
      specialtyFilter = s || null;
    }
    let preferredDoctorId: string | null = null;
    if (req.body?.preferredDoctorId != null) {
      const d = String(req.body.preferredDoctorId).trim();
      if (d.length > 64) { res.status(400).json({ error: 'Médico inválido.', code: 'BAD_DOCTOR' }); return; }
      preferredDoctorId = d || null;
    }
    let maxPriceCents: number | null = null;
    if (req.body?.maxPriceCents != null) {
      const cents = Number(req.body.maxPriceCents);
      const min = getTeleconsultaConfig().priceMinCents;
      if (!Number.isInteger(cents) || cents < 0 || (cents !== 0 && cents < min)) {
        res.status(400).json({ error: `Teto de preço inválido (0 = só grátis, ou mínimo R$ ${(min / 100).toFixed(2).replace('.', ',')}).`, code: 'PRICE_FLOOR' });
        return;
      }
      maxPriceCents = cents === 0 ? null : cents; // 0 = só consultas grátis
    }
    if (!hasLiveKitConfig()) {
      res.status(503).json({ error: 'Teleconsulta por vídeo indisponível agora. Tente mais tarde.', code: 'QUEUE_LIVEKIT_OFF' });
      return;
    }
    // 1 entrada ativa por paciente (partial unique como cinto-de-querência da corrida).
    const dup = await prisma.teleconsultaQueue.findFirst({
      where: { patientId: pid, status: { in: ['waiting', 'matched', 'accepted'] } },
      select: { id: true, status: true },
    });
    if (dup) { res.status(409).json({ error: 'Você já está na fila de atendimento.', code: 'QUEUE_ACTIVE', entry: dup }); return; }

    const entry = await prisma.teleconsultaQueue.create({
      data: {
        patientId: pid,
        ownerId: req.userId!,
        consentAt: new Date(),
        maxPriceCents,
        specialtyFilter,
        preferredDoctorId,
      },
      select: { id: true, status: true, enteredAt: true, maxPriceCents: true, attempts: true },
    });
    await audit('QUEUE_ENTER', req, {
      actorType: 'USER', actorId: req.userId, targetType: 'PATIENT', targetId: pid,
      after: { entryId: entry.id, maxPriceCents, specialtyFilter, preferredDoctorId, consentAt: true },
    });
    // Push neutro de confirmação (LGPD: sem dado clínico; sem reminderId ainda).
    void sendPushToUser(req.userId!, 'Solicitação recebida', 'Você está na fila de atendimento. Avisaremos quando um médico estiver disponível.', { type: 'teleconsulta-queue' }).catch(() => {});
    res.status(201).json({ entry });
  } catch (e) { next(e); }
});

/** DELETE /api/teleconsulta-queue — desistência. Matched: revoga o share efêmero e a
 *  teleconsulta NÃO paga/aberta some (offer órfão não incomoda ninguém). Accepted: a
 *  consulta criada permanece (encerramento é do /end, não da fila). */
router.delete('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const ids = await userPatientIds(req.userId!);
    const entry = ids.length
      ? await prisma.teleconsultaQueue.findFirst({
          where: { patientId: { in: ids }, status: { in: ['waiting', 'matched', 'accepted'] } },
          orderBy: { enteredAt: 'asc' },
          select: { id: true, status: true, patientId: true, ownerId: true, matchedDoctorId: true, reminderId: true },
        })
      : null;
    if (!entry) { res.status(404).json({ error: 'Você não está na fila.', code: 'NOT_IN_QUEUE' }); return; }

    await prisma.$transaction(async (tx) => {
      await tx.teleconsultaQueue.update({
        where: { id: entry.id },
        data: { status: 'cancelled', endedAt: new Date(), cancelReason: 'patient_cancel' },
      });
      if (entry.status === 'matched' && entry.matchedDoctorId) {
        // Share efêmero do match morre com a desistência (LGPD art.6º III — mínimo necessário).
        await tx.doctorShare.updateMany({
          where: { patientId: entry.patientId, doctorId: entry.matchedDoctorId, convenio: 'fila-imediata', revokedAt: null },
          data: { active: false, revokedAt: new Date() },
        });
        if (entry.reminderId) {
          const r = await tx.reminder.findUnique({ where: { id: entry.reminderId }, select: { paidAt: true, endedAt: true } });
          if (r && !r.paidAt && !r.endedAt) await tx.reminder.delete({ where: { id: entry.reminderId } });
        }
      }
    });
    await audit('QUEUE_CANCEL', req, {
      actorType: 'USER', actorId: req.userId, targetType: 'PATIENT', targetId: entry.patientId,
      after: { entryId: entry.id, fromStatus: entry.status },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ═══════════════════════════════ MÉDICO (requireQueueDoctor) ═══════════════════════════════

const doctorRouter = Router();
doctorRouter.use(requireQueueDoctor);

/** GET /api/doctor/queue/pricing — v1.1: o que o médico vê ANTES de ligar "Atender agora".
 *  priceCents = instantPriceCents ?? consultPriceCents (o que a fila vai cobrar);
 *  netCents = líquido com a comissão vigente (resolveCommissionRule congela no match). */
doctorRouter.get('/queue/pricing', async (req: AnyRequest, res, next) => {
  try {
    const doc = await prisma.doctor.findUnique({
      where: { id: req.doctorId! },
      select: { consultPriceCents: true, instantPriceCents: true, city: true },
    });
    const eff = doc?.instantPriceCents ?? doc?.consultPriceCents ?? null;
    const priceCents = eff && eff > 0 ? eff : null;
    let netCents: number | null = null;
    let platformBps: number | null = null;
    if (priceCents != null) {
      const rule = await resolveCommissionRule(req.doctorId!, new Date());
      if (rule?.platformBps) { platformBps = rule.platformBps; netCents = priceCents - Math.round(priceCents * (rule.platformBps / 10000)); }
      else netCents = priceCents; // sem regra ativa: sem comissão na v1
    }
    res.json({
      priceCents, netCents, platformBps,
      consultPriceCents: doc?.consultPriceCents ?? null,
      instantPriceCents: doc?.instantPriceCents ?? null, // null = herda o valor da consulta
      inheritsConsult: doc?.instantPriceCents == null,
      city: doc?.city ?? null, // v1.1: cidade de atendimento online (editável no dialog)
    });
  } catch (e) { next(e); }
});

/** PUT /api/doctor/instant-price — v1.1: valor PRÓPRIO do atendimento imediato.
 *  {instantPriceCents: int} — null/0 = herdar o valor da consulta. Mesma faixa (R$20–20.000).
 *  v1.1: aceita TAMBÉM {city?: string|null} (trim, máx 60 — null/'' limpa). Chaves
 *  AUSENTES não tocam o campo: {city:'X'} salva a cidade sem alterar o valor. */
doctorRouter.put('/instant-price', async (req: AnyRequest, res, next) => {
  try {
    const body = req.body ?? {};
    let data: number | null | undefined;
    if (body.instantPriceCents !== undefined) {
      const v = body.instantPriceCents;
      if (v === null || Number(v) === 0) data = null;
      else {
        const cents = Number(v);
        const minCents = getTeleconsultaConfig().priceMinCents;
        if (!Number.isInteger(cents) || cents < minCents || cents > 2_000_000) {
          res.status(400).json({ error: `Valor inválido: mínimo R$ ${(minCents / 100).toFixed(2).replace('.', ',')} (garante estorno integral), máximo R$ 20.000,00 — ou 0 para usar o valor da consulta.`, code: 'PRICE_FLOOR' });
          return;
        }
        data = cents;
      }
    }
    let city: string | null | undefined; // undefined = não tocar
    if (body.city !== undefined) {
      const c = body.city === null ? '' : String(body.city).trim();
      if (c.length > 60) { res.status(400).json({ error: 'Cidade inválida (máx. 60 caracteres).', code: 'BAD_CITY' }); return; }
      city = c || null;
    }
    if (data === undefined && city === undefined) {
      res.status(400).json({ error: 'Envie { instantPriceCents } e/ou { city }.', code: 'BAD_REQUEST' });
      return;
    }
    await prisma.doctor.update({ where: { id: req.doctorId! }, data: { ...(data !== undefined ? { instantPriceCents: data } : {}), ...(city !== undefined ? { city } : {}) } });
    const after = await prisma.doctor.findUnique({ where: { id: req.doctorId! }, select: { consultPriceCents: true, instantPriceCents: true, city: true } });
    const eff = after?.instantPriceCents ?? after?.consultPriceCents ?? null;
    res.json({ ok: true, instantPriceCents: after?.instantPriceCents ?? null, effectiveCents: eff && eff > 0 ? eff : null, city: after?.city ?? null });
  } catch (e) { next(e); }
});

/** PUT /api/doctor/online-presence {online:boolean} — toggle "Atender agora". Ligando
 *  exige CRM verificado (crmUf) + conta não bloqueada (bloqueio e verificação de identidade
 *  já caem no requireQueueDoctor, via política única utils/doctorAccess). */
doctorRouter.put('/online-presence', async (req: AnyRequest, res, next) => {
  try {
    const online = req.body?.online === true;
    if (typeof req.body?.online !== 'boolean') { res.status(400).json({ error: 'Envie { online: boolean }.', code: 'BAD_REQUEST' }); return; }
    if (online) {
      const doc = await prisma.doctor.findUnique({ where: { id: req.doctorId! }, select: { crm: true, crmUf: true } });
      // CRM "verificado" = UF explícita OU chave normalizada "-UF" (normalizeCrmKey do
      // register bota a UF no sufixo; médicos legados podem ter crmUf null).
      const crmOk = !!doc?.crm && (!!doc.crmUf || /-[A-Za-z]{2}$/.test(doc.crm));
      if (!crmOk) {
        res.status(403).json({ error: 'Complete a verificação do CRM antes de atender pela fila.', code: 'CRM_NOT_VERIFIED' });
        return;
      }
    }
    const now = new Date();
    await prisma.doctorOnlinePresence.upsert({
      where: { doctorId: req.doctorId! },
      update: online
        ? { online: true, lastHeartbeatAt: now, lastOnlineAt: now }
        : { online: false },
      create: { doctorId: req.doctorId!, online, lastHeartbeatAt: online ? now : null, lastOnlineAt: online ? now : null },
    });
    const doctorsOnline = await prisma.doctorOnlinePresence.count({ where: freshPresenceWhere(now) });
    // 29/10: consulta AGENDADA agora (±slotMin) deixa o médico fora do match da
    // fila enquanto durar — avisa no ligar pra ele não achar que "nada acontece".
    let agendaConflict = false;
    if (online) {
      const { slotMin } = getTeleconsultaConfig();
      agendaConflict = !!(await prisma.reminder.findFirst({
        where: {
          type: 'teleconsulta', done: false, endedAt: null, createdByDoctorId: req.doctorId!,
          dueDate: { gte: new Date(now.getTime() - slotMin * 60_000), lte: new Date(now.getTime() + slotMin * 60_000) },
          OR: [{ teleStatus: null }, { teleStatus: 'scheduled' }, { teleStatus: 'in_progress' }],
        },
        select: { id: true },
      }).catch(() => null));
    }
    await audit('PRESENCE_TOGGLE', req as any, {
      actorType: 'DOCTOR', actorId: req.doctorId, targetType: 'DOCTOR', targetId: req.doctorId,
      after: { online },
    });
    res.json({ online, doctorsOnline, agendaConflict });
  } catch (e) { next(e); }
});

/** POST /api/doctor/online-presence/heartbeat — mantém a presença viva (esperado 30s).
 *  Offline por expiração (<90s sem batida) reativa se a última batida tem <5min. */
doctorRouter.post('/online-presence/heartbeat', async (req: AnyRequest, res, next) => {
  try {
    const now = new Date();
    const p = await prisma.doctorOnlinePresence.findUnique({ where: { doctorId: req.doctorId! }, select: { id: true, online: true, lastHeartbeatAt: true } });
    if (!p) { res.status(409).json({ error: 'Presença inexistente — ative o modo "Atender agora" primeiro.', code: 'OFFLINE' }); return; }
    const lastMs = p.lastHeartbeatAt ? new Date(p.lastHeartbeatAt).getTime() : 0;
    const reactivate = !p.online && now.getTime() - lastMs < 5 * 60_000;
    if (!p.online && !reactivate) { res.status(409).json({ error: 'Presença expirada — ative o modo "Atender agora" novamente.', code: 'OFFLINE' }); return; }
    await prisma.doctorOnlinePresence.update({
      where: { id: p.id },
      data: { online: true, lastHeartbeatAt: now, ...(reactivate ? { lastOnlineAt: now } : {}) },
    });
    res.json({ ok: true, online: true });
  } catch (e) { next(e); }
});

/** GET /api/doctor/queue/calls — polling do portal (médico NÃO tem push): offer aberta
 *  (nome/idade/espera/preço/deadline) + stats da fila. */
doctorRouter.get('/queue/calls', async (req: AnyRequest, res, next) => {
  try {
    const now = new Date();
    const entry = await prisma.teleconsultaQueue.findFirst({
      where: { status: 'matched', matchedDoctorId: req.doctorId!, offerExpiresAt: { gt: now } },
      orderBy: { matchedAt: 'asc' },
      select: {
        id: true, patientId: true, enteredAt: true, reminderId: true, offerExpiresAt: true,
        patient: { select: { fullName: true, dateOfBirth: true } },
      },
    });
    const offerReminder = entry?.reminderId
      ? await prisma.reminder.findUnique({ where: { id: entry.reminderId }, select: { consultPriceCents: true } })
      : null;
    const [waiting, myAccepted] = await Promise.all([
      prisma.teleconsultaQueue.count({ where: { status: 'waiting' } }),
      prisma.teleconsultaQueue.count({ where: { status: 'accepted', matchedDoctorId: req.doctorId! } }),
    ]);
    res.json({
      offer: entry ? {
        callId: entry.id,
        patientName: entry.patient?.fullName ?? 'Paciente',
        patientAge: patientAge(entry.patient?.dateOfBirth, now),
        queueWaitSec: Math.max(0, Math.round((now.getTime() - new Date(entry.enteredAt).getTime()) / 1000)),
        priceCents: offerReminder?.consultPriceCents ?? 0,
        acceptDeadlineIso: entry.offerExpiresAt!.toISOString(),
        briefUrl: `/api/doctor/patients/${entry.patientId}/context`,
      } : null,
      stats: { waiting, myAccepted },
    });
  } catch (e) { next(e); }
});

class CallExpiredError extends Error {
  constructor(public readonly detail: string) { super('CALL_EXPIRED'); }
}

/** POST /api/doctor/queue/calls/:callId/accept — aceita a offer. Advisory lock por call
 *  (serializa 2 cliques/ticks concorrentes) + deadline validada DENTRO do lock. */
doctorRouter.post('/queue/calls/:callId/accept', async (req: AnyRequest, res, next) => {
  try {
    const callId = String(req.params.callId);
    const reminderId = await prisma.$transaction(async (tx) => {
      // $executeRaw (não $queryRaw): advisory lock devolve void (P2010 — padrão doctor.routes:1352).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'tele-queue:' + callId}))`;
      const entry = await tx.teleconsultaQueue.findUnique({
        where: { id: callId },
        select: { id: true, status: true, matchedDoctorId: true, reminderId: true, ownerId: true, offerExpiresAt: true },
      });
      if (!entry || entry.status !== 'matched' || entry.matchedDoctorId !== req.doctorId || !entry.reminderId) {
        throw new CallExpiredError('not_matched');
      }
      if (!entry.offerExpiresAt || entry.offerExpiresAt.getTime() < Date.now()) {
        throw new CallExpiredError('deadline');
      }
      await tx.teleconsultaQueue.update({
        where: { id: entry.id },
        data: { status: 'accepted', acceptedAt: new Date() },
      });
      return entry.reminderId;
    });
    const doc = await prisma.doctor.findUnique({ where: { id: req.doctorId! }, select: { name: true } });
    const docName = doc?.name || 'seu médico';
    const owner = await prisma.reminder.findUnique({ where: { id: reminderId }, select: { ownerId: true } });
    if (owner) {
      // WhatsApp-style (padrão push join :252) — neutro, sem dado clínico.
      void sendPushToUser(owner.ownerId, `✓ Dr. ${docName} vai te atender`, 'Toque para entrar na sala agora.', { type: 'teleconsulta', reminderId }).catch(() => {});
    }
    await audit('QUEUE_ACCEPT', req as any, {
      actorType: 'DOCTOR', actorId: req.doctorId, targetType: 'REMINDER', targetId: reminderId,
      after: { callId, reminderId },
    });
    res.json({ reminderId });
  } catch (e) {
    if (e instanceof CallExpiredError) { res.status(409).json({ error: 'Esta chamada não está mais disponível.', code: 'CALL_EXPIRED' }); return; }
    next(e);
  }
});

/** POST /api/doctor/queue/calls/:callId/decline {reason?: 'busy'|'mismatch'} — recusa a
 *  offer: entry volta a `waiting` PRESERVANDO enteredAt (FIFO), share efêmero revogado e
 *  teleconsulta não paga/aberta removida (a offer morre, não fica pendurada). */
doctorRouter.post('/queue/calls/:callId/decline', async (req: AnyRequest, res, next) => {
  try {
    const callId = String(req.params.callId);
    const reason = req.body?.reason === 'busy' || req.body?.reason === 'mismatch' ? req.body.reason : null;
    const entry = await prisma.teleconsultaQueue.findUnique({
      where: { id: callId },
      select: { id: true, status: true, matchedDoctorId: true, reminderId: true, patientId: true },
    });
    if (!entry || entry.status !== 'matched' || entry.matchedDoctorId !== req.doctorId) {
      res.status(409).json({ error: 'Esta chamada não está mais disponível.', code: 'CALL_EXPIRED' });
      return;
    }
    await prisma.$transaction(async (tx) => {
      // enteredAt intacto = FIFO preservado; attempts+1 conta a offer perdida (anti-gaming).
      await tx.teleconsultaQueue.update({
        where: { id: entry.id },
        data: { status: 'waiting', matchedDoctorId: null, matchedAt: null, offerExpiresAt: null, attempts: { increment: 1 } },
      });
      await tx.doctorShare.updateMany({
        where: { patientId: entry.patientId, doctorId: req.doctorId!, convenio: 'fila-imediata', revokedAt: null },
        data: { active: false, revokedAt: new Date() },
      });
      if (entry.reminderId) {
        const r = await tx.reminder.findUnique({ where: { id: entry.reminderId }, select: { paidAt: true, endedAt: true } });
        if (r && !r.paidAt && !r.endedAt) await tx.reminder.delete({ where: { id: entry.reminderId } });
      }
    });
    await audit('QUEUE_DECLINE', req as any, {
      actorType: 'DOCTOR', actorId: req.doctorId, targetType: 'PATIENT', targetId: entry.patientId,
      after: { callId, reason },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
export { doctorRouter };
