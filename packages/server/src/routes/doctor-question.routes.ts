// Pergunta do paciente ao médico (paga créditos). Espelha o padrão de doctor-share.routes +
// ticket.routes (thread). Aparece no portal do médico (resumo IA); paciente vê status "enviada".
import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { chargeCredits, CREDIT_COSTS } from '../utils/credits';
import { sendEmail } from '../utils/mailer';
import { doctorQuestionEmail, webUrl } from '../utils/emailTemplate';
import { logPaywallHit } from '../utils/paywall';
import { doctorMayPractice } from '../utils/doctorAccess';

const router = Router();
router.use(requireAuth);

// LISTAR perguntas do paciente (com status + última resposta do médico)
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    // ISOLAMENTO (plano família): ?patientId= filtra SÓ o dependente selecionado. Antes listava
    // perguntas de TODOS os pacientes do titular — uma dependente via as perguntas do titular.
    const selPid = typeof req.query.patientId === 'string' && pids.includes(req.query.patientId) ? req.query.patientId : null;
    const patientFilter: any = selPid ?? { in: pids };
    const questions = await prisma.doctorQuestion.findMany({
      where: { patientId: patientFilter },
      include: {
        doctor: { select: { id: true, name: true, specialty: true, photoUrl: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // marca "lida" pelo paciente ao listar (resposta do médico que ele ainda não viu)
    await prisma.doctorQuestion.updateMany({ where: { patientId: patientFilter, unreadByPatient: true }, data: { unreadByPatient: false } }).catch(() => {});
    res.json({ items: questions });
  } catch (e) { next(e); }
});

// DETALHE de uma pergunta (thread completa)
router.get('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const q = await prisma.doctorQuestion.findFirst({
      where: { id: String(req.params.id), patientId: { in: pids } },
      include: { doctor: { select: { id: true, name: true, specialty: true, photoUrl: true } }, messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!q) { res.status(404).json({ error: 'Pergunta não encontrada.' }); return; }
    res.json({ item: q });
  } catch (e) { next(e); }
});

/** Título legível de pergunta: colapsa espaços e corta em FRONTeira DE PALAVRA com reticências.
 *  Antes o subject era o texto cru picotado (cliente mandava .slice(0,90) no meio da frase e o
 *  server .slice(0,300)) — o "título" chegava com pedaço da pergunta (bug reportado 2026-08-19). */
const tidySubject = (raw: string): string => {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (t.length <= 80) return t;
  const cut = t.slice(0, 80);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

// CRIAR pergunta ao médico (cobre créditos; exige DoctorShare ativo)
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const { patientId, doctorId, subject } = req.body ?? {};
    const subjectStr = String(subject ?? '').trim();
    // body opcional: o fluxo do RELATÓRIO envia a lista de perguntas aqui (subject = título).
    const msgBody = String((req.body ?? {}).body ?? '').trim() || subjectStr;
    if (!doctorId || !msgBody) { res.status(400).json({ error: 'Médico e pergunta são obrigatórios.' }); return; }
    const pids = await userPatientIds(req.userId!);
    const pid = patientId && pids.includes(patientId) ? patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }

    // Exige compartilhamento ATIVO com o médico (só pergunta a médico que aceitou ver os exames)
    const share = await prisma.doctorShare.findFirst({ where: { patientId: pid, doctorId: String(doctorId), active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    if (!share) { res.status(403).json({ error: 'Compartilhe seus exames com este médico antes de enviar perguntas.' }); return; }

    // Revisão final do KYC (C1): a pergunta carrega NOME do paciente + texto de saúde e vai por e-mail ao médico.
    // Só quem PODE ATUAR (não bloqueado e verificado/legado em prazo) recebe — conta não verificada, rejeitada ou
    // bloqueada (ex.: quem registrou o CRM de outro médico, ou um médico bloqueado por fraude que ainda tem shares)
    // não. Recusa ANTES de cobrar créditos e de criar a pergunta.
    const target = await prisma.doctor.findUnique({
      where: { id: String(doctorId) },
      select: { name: true, email: true, emailVerified: true, blocked: true, verificationStatus: true },
    });
    if (!target || !doctorMayPractice(target)) {
      res.status(409).json({
        error: 'doctor_unavailable', code: 'DOCTOR_UNAVAILABLE',
        message: 'Este médico ainda não está disponível para receber perguntas. Nenhum crédito foi cobrado — tente de novo quando ele concluir a verificação.',
      });
      return;
    }

    // ===== Fatia 1: dedup estável por sentKey + expiração automática =====
    // sentKey (opcional): hash analysisId+index vindo do relatório. Estável entre regenerações
    // (mesmo analysisId = mesmo sentKey) → bloqueia reenvio pós-regenerar. NULL = texto livre
    // (Medicos.tsx) → cai no dedup por conteúdo (fallback fraco, mas mantém compat).
    const sentKey = req.body?.sentKey ? String(req.body.sentKey).slice(0, 120) : null;
    const analysisId = req.body?.analysisId ? String(req.body.analysisId).slice(0, 120) : null;

    // AUTO-EXPIRAÇÃO preguiçosa: qualquer pergunta EM ABERTO com expiresAt < now() vira closed/timeout.
    // Roda no próximo POST (esse) — não precisa de cron. Libera espaço no gate anti-flood.
    const now = new Date();
    await prisma.doctorQuestion.updateMany({
      where: { patientId: pid, doctorId: String(doctorId), status: 'open', expiresAt: { lt: now } },
      data: { status: 'closed', closedReason: 'timeout' },
    }).catch(() => {});

    // DEDUP por sentKey (preferencial) ou conteúdo (fallback). sentKey é robusto porque é estável
    // entre regenerações; conteúdo quebra pós-regenerar (texto pode mudar levemente).
    if (sentKey) {
      const dupByKey = await prisma.doctorQuestion.findFirst({
        where: { patientId: pid, doctorId: String(doctorId), sentKey, status: 'open' },
        select: { id: true },
      });
      if (dupByKey) {
        res.status(409).json({ error: 'question_duplicate', message: 'Você já enviou essa pergunta e ela está aguardando resposta do médico. Quando ele responder, você pode enviar outras.' });
        return;
      }
    } else {
      // Fallback texto livre (Medicos.tsx): dedup por conteúdo normalizado.
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
      const incoming = norm(msgBody);
      if (incoming) {
        const open = await prisma.doctorQuestion.findMany({
          where: { patientId: pid, doctorId: String(doctorId), status: 'open' },
          include: { messages: { where: { authorRole: 'patient' }, orderBy: { createdAt: 'asc' }, take: 1 } },
        });
        const isDup = (q: any) => norm(q.subject || '') === incoming || (q.messages?.[0] && norm(q.messages[0].body || '') === incoming);
        if (open.some(isDup)) {
          res.status(409).json({ error: 'question_duplicate', message: 'Você já enviou essa pergunta e ela está aguardando resposta do médico. Quando ele responder, você pode enviar outras.' });
          return;
        }
      }
    }

    // GATE anti-flood: limita perguntas EM ABERTO por vínculo (protege o médico de inundação).
    // Responder/fechar uma pergunta libera espaço. O médico (Pro) pode levantar o limite via consulta.
    // NOTA: auto-expiração acima já rodou → openCount reflete apenas as vigentes.
    const openCount = await prisma.doctorQuestion.count({ where: { patientId: pid, doctorId: String(doctorId), status: 'open' } });
    const limit = share.openQuestionLimit ?? 5;
    if (openCount >= limit) {
      res.status(409).json({ error: 'question_limit', message: `Você tem ${openCount} pergunta(s) em aberto com este médico. Aguarde a resposta (ou agende uma consulta para liberar mais perguntas).` });
      return;
    }

    // Cobra créditos ANTES de criar (padrão chargeCredits atômico; 402 se saldo insuficiente)
    const cost = CREDIT_COSTS.question;
    const ok = await chargeCredits(req.userId!, cost, 'doctor_question', `Pergunta ao médico: ${msgBody.slice(0, 40)}`);
    void logPaywallHit(req.userId!, 'DOCTOR_QUESTION');
    if (!ok) { res.status(402).json({ error: 'insufficient_credits', message: 'Créditos insuficientes para enviar a pergunta.' }); return; }

    const q = await prisma.doctorQuestion.create({
      data: {
        patientId: pid,
        doctorId: String(doctorId),
        doctorShareId: share.id,
        subject: tidySubject(subjectStr || msgBody),
        creditsCharged: cost,
        status: 'open',
        unreadByDoctor: true,
        // Fatia 1: dedup estável + auto-expira em 7d se médico não responder.
        sentKey: sentKey ?? null,
        analysisId: analysisId ?? null,
        expiresAt: new Date(Date.now() + 7 * 86400000),
        messages: { create: { authorRole: 'patient', authorId: pid, body: msgBody } },
      },
      include: { doctor: { select: { id: true, name: true } } },
    });
    // Avisa o MÉDICO por e-mail (best-effort) — sem isso, ele só descobre da pergunta abrindo o portal.
    const doc = target; // já carregado (e já sabemos que pode atuar) lá em cima
    const pat = await prisma.patient.findUnique({ where: { id: pid }, select: { fullName: true } });
    if (doc.email && doc.emailVerified && !doc.email.includes('@invite.com')) {
      void sendEmail({ to: doc.email, subject: `${pat?.fullName ?? 'Paciente'} fez uma pergunta — Meus Exames`, html: doctorQuestionEmail({ doctorName: doc.name, patientName: pat?.fullName ?? 'Paciente', subject: msgBody, portalUrl: webUrl('/#/doctor') }) }).catch(() => {});
    }
    // AUTO-RECEBIMENTO: mensagem automática no thread confirmando ao paciente que a pergunta
    // chegou e será analisada pelo médico (com o nome dele). authorRole='system' é string livre
    // (não enum) — não exige migration. Renderizada diferenciada (centralizada/muted) nos 2 lados.
    await prisma.doctorQuestionMessage.create({ data: { questionId: q.id, authorRole: 'system', body: `✅ Recebido! ${doc?.name || 'Seu médico'} vai analisar e responder em breve.` } }).catch(() => {});
    res.status(201).json({ item: q, enviado: true });
  } catch (e) { next(e); }
});

export default router;
