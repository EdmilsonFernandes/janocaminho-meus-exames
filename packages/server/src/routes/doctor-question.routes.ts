// Pergunta do paciente ao médico (paga créditos). Espelha o padrão de doctor-share.routes +
// ticket.routes (thread). Aparece no portal do médico (resumo IA); paciente vê status "enviada".
import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { chargeCredits, CREDIT_COSTS } from '../utils/credits';

const router = Router();
router.use(requireAuth);

// LISTAR perguntas do paciente (com status + última resposta do médico)
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const questions = await prisma.doctorQuestion.findMany({
      where: { patientId: { in: pids } },
      include: {
        doctor: { select: { id: true, name: true, specialty: true, photoUrl: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
    // marca "lida" pelo paciente ao listar (resposta do médico que ele ainda não viu)
    await prisma.doctorQuestion.updateMany({ where: { patientId: { in: pids }, unreadByPatient: true }, data: { unreadByPatient: false } }).catch(() => {});
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

// CRIAR pergunta ao médico (cobre créditos; exige DoctorShare ativo)
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const { patientId, doctorId, subject } = req.body ?? {};
    const body = String(subject ?? '').trim();
    if (!doctorId || !body) { res.status(400).json({ error: 'Médico e pergunta são obrigatórios.' }); return; }
    const pids = await userPatientIds(req.userId!);
    const pid = patientId && pids.includes(patientId) ? patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }

    // Exige compartilhamento ATIVO com o médico (só pergunta a médico que aceitou ver os exames)
    const share = await prisma.doctorShare.findFirst({ where: { patientId: pid, doctorId: String(doctorId), active: true } });
    if (!share) { res.status(403).json({ error: 'Compartilhe seus exames com este médico antes de enviar perguntas.' }); return; }

    // Cobra créditos ANTES de criar (padrão chargeCredits atômico; 402 se saldo insuficiente)
    const cost = CREDIT_COSTS.question;
    const ok = await chargeCredits(req.userId!, cost, 'doctor_question', `Pergunta ao médico: ${body.slice(0, 40)}`);
    if (!ok) { res.status(402).json({ error: 'insufficient_credits', message: 'Créditos insuficientes para enviar a pergunta.' }); return; }

    const q = await prisma.doctorQuestion.create({
      data: {
        patientId: pid,
        doctorId: String(doctorId),
        doctorShareId: share.id,
        subject: body.slice(0, 300),
        creditsCharged: cost,
        status: 'open',
        unreadByDoctor: true,
        messages: { create: { authorRole: 'patient', authorId: pid, body } },
      },
      include: { doctor: { select: { id: true, name: true } } },
    });
    res.status(201).json({ item: q, enviado: true });
  } catch (e) { next(e); }
});

export default router;
