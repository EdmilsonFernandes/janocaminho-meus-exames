import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { sendEmail } from '../utils/mailer';
import { doctorInviteEmail, webUrl } from '../utils/emailTemplate';
import { getSettings } from '../utils/settings';
import { chargeCredits } from '../utils/credits';
import { normalizeCrmKey } from './doctor.routes';
import { logPaywallHit } from '../utils/paywall';
import { doctorMayPractice } from '../utils/doctorAccess';

const router = Router();
router.use(requireAuth);

// Revisão final do KYC (C2, herdado da main): este endpoint devolvia a LINHA INTEIRA do médico ao paciente —
// passwordHash, CPF cifrado, chaves PIX, tokens do Google… Agora só o que o paciente pode ver (os mesmos campos
// do diretório/lista) + o que a lógica interna precisa (blocked/verificationStatus), que NUNCA sai na resposta.
const PUBLIC_DOCTOR_SELECT = {
  id: true, name: true, crm: true, crmUf: true, specialty: true, photoUrl: true, email: true, clinicName: true, clinicCity: true,
} as const;
const SHARE_DOCTOR_SELECT = { ...PUBLIC_DOCTOR_SELECT, blocked: true, verificationStatus: true } as const;
function publicDoctor<T extends { blocked?: unknown; verificationStatus?: unknown }>(d: T): Omit<T, 'blocked' | 'verificationStatus'> {
  const { blocked: _b, verificationStatus: _v, ...rest } = d;
  return rest;
}

// §6 (28/10/26): duração do compartilhamento. undefined = campo não veio (mantém o atual
// no PATCH); null = explícito "sem expiração" (default/legado); Date válido = expira em.
function parseShareExpiry(v: unknown): Date | null | undefined {
  if (v === null) return null;
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// LISTAR compartilhamentos do paciente (com cota de perguntas: openQuestions/questionLimit)
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const shares = await prisma.doctorShare.findMany({
      where: { patientId: { in: pids } },
      include: { doctor: { select: { id: true, name: true, crm: true, specialty: true, photoUrl: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    // Conta perguntas EM ABERTO por vínculo (patientId+doctorId) pra mostrar a cota no app.
    // O gate (doctor-question.routes) usa openQuestionLimit ?? 5 — espelhamos aqui pro front desabilitar
    // o envio antes de o usuário tentar (evita a surpresa do "enviou de novo").
    const openByLink = await prisma.doctorQuestion.groupBy({
      by: ['patientId', 'doctorId'],
      where: { patientId: { in: pids }, status: 'open' },
      _count: { _all: true },
    });
    const openMap = new Map(openByLink.map((r) => [`${r.patientId}|${r.doctorId}`, r._count._all]));
    const items = shares.map((s) => ({
      ...s,
      openQuestions: openMap.get(`${s.patientId}|${s.doctorId}`) ?? 0,
      questionLimit: s.openQuestionLimit ?? 5,
    }));
    res.json({ items });
  } catch (e) { next(e); }
});

// CRIAR compartilhamento (paciente compartilha dados com médico)
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const { doctorCrm, doctorUf, doctorName, doctorSpecialty, doctorEmail, scopes, convenio, patientId, examIds, expiresAt } = req.body ?? {};
    const pids = await userPatientIds(req.userId!);
    const pid = patientId && pids.includes(patientId) ? patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }

    // Normaliza CRM pra chave canônica "12345-SP" (compatível c/ o que já existe na base).
    const norm = normalizeCrmKey(doctorCrm, doctorUf);
    const crmKey = norm?.crm ?? null;
    const uf = norm?.uf ?? null;

    // encontra o médico pelo CRM, ou cria se vier nome + CRM
    let doctor = crmKey ? await prisma.doctor.findUnique({ where: { crm: crmKey }, select: SHARE_DOCTOR_SELECT }) : null;
    if (!doctor && doctorName && crmKey) {
      doctor = await prisma.doctor.create({
        select: SHARE_DOCTOR_SELECT,
        data: {
          name: String(doctorName), crm: crmKey, crmUf: uf, specialty: doctorSpecialty || null,
          // §4 (28/10/26): cidade/clínica informadas pelo paciente enriquecem o diretório
          // (busca "perto de você") — só entram no CADASTRO NOVO; o que o médico publicou
          // prevalece. Combo IBGE manda "Nome (UF)" — stripamos o sufixo no storage.
          clinicCity: typeof (req.body ?? {}).doctorClinicCity === 'string' ? String(req.body.doctorClinicCity).replace(/\s*\([A-Za-z]{2}\)\s*$/, '').trim().slice(0, 80) || null : null,
          clinicName: typeof (req.body ?? {}).doctorClinicName === 'string' ? String(req.body.doctorClinicName).trim().slice(0, 120) || null : null,
          email: (doctorEmail || `pending-${Date.now()}@invite.com`).toLowerCase(), passwordHash: 'pending-invite',
        },
      }).catch(() => null);
    }
    if (!doctor) { res.status(404).json({ error: 'Médico não encontrado. Informe nome + CRM pra cadastrá-lo.' }); return; }

    // share (upsert — se já existe, reativa)
    const expiry = parseShareExpiry(expiresAt);
    const existing = await prisma.doctorShare.findUnique({ where: { patientId_doctorId: { patientId: pid, doctorId: doctor.id } } });
    if (existing) {
      const updated = await prisma.doctorShare.update({ where: { id: existing.id }, data: { active: true, scopes: scopes || existing.scopes, convenio: convenio != null ? String(convenio) : existing.convenio, revokedAt: null, ...(Array.isArray(examIds) ? { examIds } : {}), ...(expiry !== undefined ? { expiresAt: expiry } : {}) } });
      res.json({ share: updated, doctor: publicDoctor(doctor) }); return;
    }
    // Custo de compartilhar = soma dos escopos selecionados (parametrizado em app_settings).
    // Só cobra na CRIAÇÃO nova (reativar existente / editar escopos = grátis, sem fricção).
    const selectedScopes: string[] = Array.isArray(scopes) && scopes.length ? scopes : ['exams'];
    const shareCost = selectedScopes.reduce((sum: number, k: string) => sum + ((getSettings().shares as Record<string, number>)[k] ?? 0), 0);
    if (shareCost > 0) {
      const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { credits: true } });
      void logPaywallHit(req.userId!, 'SHARE');
      if ((me?.credits ?? 0) < shareCost) { res.status(402).json({ error: 'insufficient_credits', message: `Compartilhar custa ${shareCost} créditos.` }); return; }
      void logPaywallHit(req.userId!, 'SHARE');
      if (!(await chargeCredits(req.userId!, shareCost, 'share', 'Compartilhamento com médico'))) { res.status(402).json({ error: 'insufficient_credits', message: 'Saldo insuficiente.' }); return; }
    }
    const share = await prisma.doctorShare.create({ data: { patientId: pid, doctorId: doctor.id, scopes: selectedScopes, convenio: convenio ? String(convenio) : null, creditsCharged: shareCost, examIds: Array.isArray(examIds) ? examIds : [], expiresAt: expiry ?? null } });

    // "Meus médicos" (28/10/26): compartilhar também SALVA o médico na lista do paciente.
    // O vínculo por si NÃO dá acesso — o acesso é exatamente este share (best-effort:
    // falha do vínculo nunca derruba o compartilhamento).
    await prisma.patientDoctorLink.upsert({
      where: { patientId_doctorId: { patientId: pid, doctorId: doctor.id } },
      update: {},
      create: { patientId: pid, doctorId: doctor.id, source: 'share' },
    }).catch(() => {});

    // notifica o médico por e-mail — SÓ se ele pode atuar (revisão final, C1): o aviso leva o NOME do paciente,
    // os escopos e o convênio; conta não verificada/rejeitada/bloqueada (ex.: quem registrou o CRM de outro
    // médico) não pode receber isso. O share continua criado: vale quando o médico for aprovado.
    const notified = !!doctor.email && !doctor.email.includes('@invite.com') && doctorMayPractice(doctor);
    if (notified) {
      const patient = await prisma.patient.findUnique({ where: { id: pid }, select: { fullName: true } });
      try {
        await sendEmail({
          to: doctor.email,
          subject: `${patient?.fullName ?? 'Paciente'} compartilhou dados com você — Meus Exames`,
          html: doctorInviteEmail({ doctorName: doctor.name, patientName: patient?.fullName ?? 'Paciente', scopes: scopes || ['exams'], convenio: convenio != null ? String(convenio) : null, portalUrl: webUrl('/#/doctor') }),
        });
      } catch (e: any) { console.error('[doctor-share] falha email:', e?.message); }
    }
    res.status(201).json({ share, doctor: publicDoctor(doctor), chargedCredits: shareCost, notified });
  } catch (e) { next(e); }
});

// ATUALIZAR / REVOGAR compartilhamento
router.patch('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const share = await prisma.doctorShare.findUnique({ where: { id: String(req.params.id) } });
    if (!share || !pids.includes(share.patientId)) { res.status(404).json({ error: 'Compartilhamento não encontrado.' }); return; }
    const { scopes, active, examIds } = req.body ?? {};
    const expiry = parseShareExpiry((req.body ?? {}).expiresAt);
    if ((req.body ?? {}).expiresAt !== undefined && expiry === undefined) {
      res.status(400).json({ error: 'Data de expiração inválida.' }); return;
    }
    const updated = await prisma.doctorShare.update({
      where: { id: share.id },
      data: { scopes: scopes ?? undefined, active: active ?? undefined, revokedAt: active === false ? new Date() : undefined, ...(Array.isArray(examIds) ? { examIds } : {}), ...(expiry !== undefined ? { expiresAt: expiry } : {}) },
    });
    res.json({ share: updated });
  } catch (e) { next(e); }
});

// ADICIONAR 1 EXAME ao share (§4 spec teleconsulta 24/10): o "1 toque" da notificação
// "Novo exame processado — compartilhar com Dr. X?". Adiciona só o examId ao recorte —
// sem re-compartilhar tudo, sem cobrar (não é criação/reativação) e sem email.
router.post('/:id/exams', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const share = await prisma.doctorShare.findUnique({ where: { id: String(req.params.id) } });
    if (!share || !pids.includes(share.patientId)) { res.status(404).json({ error: 'Compartilhamento não encontrado.' }); return; }
    if (!share.active) { res.status(409).json({ error: 'Compartilhamento revogado — reative antes de compartilhar exames.' }); return; }
    const examId = String(req.body?.examId ?? '');
    if (!examId) { res.status(400).json({ error: 'examId obrigatório.' }); return; }
    const exam = await prisma.exam.findFirst({ where: { id: examId, patientId: share.patientId, status: 'EXTRACTED' }, select: { id: true } });
    if (!exam) { res.status(404).json({ error: 'Exame não encontrado (ou não extraído) para este paciente.' }); return; }
    if (share.examIds.includes(examId)) { res.json({ share }); return; } // idempotente
    const updated = await prisma.doctorShare.update({ where: { id: share.id }, data: { examIds: [...share.examIds, examId] } });
    res.json({ share: updated });
  } catch (e) { next(e); }
});

// EXCLUIR compartilhamento (diferente de revogar: REMOVE o registro em vez de só desativar).
// Se o médico for pending-invite (cadastro errado, nunca claimado/registrou) e não tiver outros
// shares, exclui o médico também → limpa o diretório de entradas erradas. Médico CLAIMADO (conta
// real) nunca é excluído aqui — só o share deste paciente.
router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const share = await prisma.doctorShare.findUnique({ where: { id: String(req.params.id) } });
    if (!share || !pids.includes(share.patientId)) { res.status(404).json({ error: 'Compartilhamento não encontrado.' }); return; }
    const doctorId = share.doctorId;
    await prisma.doctorShare.delete({ where: { id: share.id } });
    // cleanup: médico pending-invite sem outros shares → remove (era só um cadastro de compartilhamento)
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, select: { passwordHash: true } });
    if (doctor?.passwordHash === 'pending-invite') {
      // "Meus médicos" (28/10/26): médico SALVO na lista de alguém (vínculo) também
      // segura o cadastro público — só some se ninguém usa mais nada dele.
      const [remaining, links] = await Promise.all([
        prisma.doctorShare.count({ where: { doctorId } }),
        prisma.patientDoctorLink.count({ where: { doctorId } }),
      ]);
      if (remaining === 0 && links === 0) await prisma.doctor.delete({ where: { id: doctorId } }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Teto de convites virais por paciente-usuário em 24 h (2ª rodada da revisão final, Important #4): o convite é GRÁTIS e o
// cadastro por ele devolve um JWT de médico sem prova de e-mail — um paciente que minta 100 links monta 100 contas de médico
// em um minuto (cota do consultaCRM e sessões UaiID cobradas). 20/dia é muito mais que qualquer uso legítimo.
const INVITE_DAILY_CAP = 20;

// ── CONVITE VIRAL AO MÉDICO VIA WHATSAPP (SEM FRICÇÃO DE CRM) ──
// Gera um link mágico seguro para o paciente enviar no WhatsApp do médico.
router.post('/invite-link', async (req: AuthedRequest, res, next) => {
  try {
    const { patientId, scopes, examIds } = req.body ?? {};
    const pids = await userPatientIds(req.userId!);
    const pid = patientId && pids.includes(patientId) ? patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente selecionado.' }); return; }

    const patient = await prisma.patient.findUnique({
      where: { id: pid },
      select: { id: true, fullName: true, relationship: true },
    });
    if (!patient) { res.status(404).json({ error: 'Paciente não encontrado.' }); return; }

    // Cota diária: convites (AppSetting `doc_invite:*`) deste usuário criados nas últimas 24 h. `updatedAt >= janela` é só o
    // pré-filtro indexável (todo convite criado agora tem updatedAt recente; um aceito/revogado ontem também, por isso a
    // conta final olha o `createdAt` gravado no próprio convite).
    const windowStart = Date.now() - 24 * 3_600_000;
    const mine = await prisma.appSetting.findMany({
      where: { key: { startsWith: 'doc_invite:' }, updatedAt: { gte: new Date(windowStart) }, value: { path: ['ownerId'], equals: req.userId! } },
      select: { value: true },
    });
    const createdToday = mine.filter((r) => { const t = Date.parse(String((r.value as { createdAt?: string } | null)?.createdAt ?? '')); return Number.isFinite(t) && t >= windowStart; }).length;
    if (createdToday >= INVITE_DAILY_CAP) {
      res.status(429).json({ code: 'INVITE_LIMIT', error: `Você já gerou ${INVITE_DAILY_CAP} convites nas últimas 24 horas. Tente novamente amanhã.` });
      return;
    }

    // Token criptograficamente seguro e opaco (18 bytes = 36 hex)
    const { randomBytes } = await import('crypto');
    const token = randomBytes(18).toString('hex');
    const selectedScopes = Array.isArray(scopes) && scopes.length ? scopes : ['exams', 'evolution', 'alerts', 'summary'];
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 dias

    const payload = {
      token,
      patientId: patient.id,
      ownerId: req.userId!,
      patientName: patient.fullName,
      scopes: selectedScopes,
      examIds: Array.isArray(examIds) ? examIds : [],
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt,
      acceptedDoctorId: null,
      acceptedAt: null,
    };

    await prisma.appSetting.upsert({
      where: { key: `doc_invite:${token}` },
      update: { value: payload as any },
      create: { key: `doc_invite:${token}`, value: payload as any },
    });

    const inviteUrl = `${webUrl('/#/dr/vinculo')}?token=${token}`;
    const message = `Olá Dr(a)! 👋\n\nOrganizei meus exames laboratoriais e histórico de saúde na plataforma Dr. Exame.\n\nCriei um acesso direto e seguro para visualizar meus laudos, comparativos e gráficos de evolução aqui:\n${inviteUrl}\n\nAo abrir pelo link, sua conta já se conecta automaticamente ao meu prontuário!`;

    res.status(201).json({
      token,
      inviteUrl,
      message,
      patientName: patient.fullName,
      expiresAt,
    });
  } catch (e) { next(e); }
});

// Revogar convite viral
router.delete('/invite-link/:token', async (req: AuthedRequest, res, next) => {
  try {
    const token = String(req.params.token);
    const key = `doc_invite:${token}`;
    const setting = await prisma.appSetting.findUnique({ where: { key } });
    if (!setting) { res.status(404).json({ error: 'Convite não encontrado.' }); return; }

    const inv = setting.value as any;
    if (inv.ownerId !== req.userId) { res.status(403).json({ error: 'Sem permissão.' }); return; }

    inv.status = 'revoked';
    inv.revokedAt = new Date().toISOString();
    await prisma.appSetting.update({ where: { key }, data: { value: inv } });

    // Se o médico já tiver aceitado, revoga o DoctorShare também para corte imediato de acesso
    if (inv.acceptedDoctorId) {
      await prisma.doctorShare.updateMany({
        where: { patientId: inv.patientId, doctorId: inv.acceptedDoctorId },
        data: { active: false, revokedAt: new Date() },
      });
    }

    res.json({ ok: true, revoked: true });
  } catch (e) { next(e); }
});

export default router;

