import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { saveExamFile, resolveExamFile } from '../utils/storage';

// Chamados de suporte do paciente (estilo Zendesk). Tudo escopado em req.userId.
// Admin responde/gerencia via admin.routes.ts. Anexos reusam o storage de exames (S3/disco).
const router = Router();
router.use(requireAuth);

// Assuntos pré-definidos (fase 1 hardcoded; fase 2 = configurável via settings).
export const TICKET_CATEGORIES = [
  'Dúvida sobre um exame',
  'Erro no app',
  'Cobrança / Planos',
  'Compartilhamento com médico',
  'Recuperação de MFA',
  'Sugestão',
  'Outro',
];

const MAX_OPEN_TICKETS = 3; // limite de chamados abertos por usuário (anti-abuso)

type Attachment = { ref: string; name: string; size: number; type: string };

async function saveAttachments(files: Express.Multer.File[] | undefined, slug: string): Promise<Attachment[]> {
  if (!files?.length) return [];
  const out: Attachment[] = [];
  for (const f of files.slice(0, 5)) { // máx 5 anexos por mensagem
    const ref = await saveExamFile(f.buffer, slug, f.originalname, f.mimetype);
    out.push({ ref, name: f.originalname, size: f.size, type: f.mimetype });
  }
  return out;
}

// GET /tickets/categories — assuntos
router.get('/categories', (_req, res) => res.json(TICKET_CATEGORIES));

// GET /tickets — meus chamados (resumo)
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: req.userId! },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, number: true, category: true, subject: true, status: true, lastMessageBy: true, lastMessageAt: true, unreadByUser: true, createdAt: true, updatedAt: true },
    });
    res.json(tickets);
  } catch (e) { next(e); }
});

// GET /tickets/:id — thread completa (marca lido pelo usuário; anexos viram URL de download)
router.get('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: String(req.params.id) },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket || ticket.userId !== req.userId!) { res.status(404).json({ error: 'Chamado não encontrado' }); return; }
    if (ticket.unreadByUser) await prisma.supportTicket.update({ where: { id: ticket.id }, data: { unreadByUser: false } });
    const messages = ticket.messages.map((m) => ({
      id: m.id, authorRole: m.authorRole, body: m.body, createdAt: m.createdAt,
      attachments: ((m.attachments as Attachment[] | null) ?? []).map((a, idx) => ({
        name: a.name, size: a.size, type: a.type, url: `tickets/${ticket.id}/messages/${m.id}/attachments/${idx}`,
      })),
    }));
    res.json({ ...ticket, unreadByUser: false, messages });
  } catch (e) { next(e); }
});

// POST /tickets — abrir chamado (multipart: category, subject, message + files[])
router.post('/', upload.array('files', 5), async (req: AuthedRequest, res, next) => {
  try {
    const category = String(req.body.category ?? '').trim();
    const subject = String(req.body.subject ?? '').trim();
    const message = String(req.body.message ?? '').trim();
    if (!subject || !message) { res.status(400).json({ error: 'Assunto e descrição são obrigatórios.' }); return; }
    const openCount = await prisma.supportTicket.count({ where: { userId: req.userId!, status: { in: ['open', 'pending'] } } });
    if (openCount >= MAX_OPEN_TICKETS) { res.status(429).json({ error: `Limite de ${MAX_OPEN_TICKETS} chamados abertos. Aguarde um ser resolvido.` }); return; }
    const attachments = await saveAttachments(req.files as Express.Multer.File[] | undefined, 'tickets');
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: req.userId!, category: category || null, subject, status: 'open',
        lastMessageBy: 'user', lastMessageAt: new Date(), unreadByAdmin: true,
        messages: { create: { authorRole: 'user', authorId: req.userId!, body: message, attachments: attachments.length ? attachments : undefined } },
      },
    });
    res.status(201).json({ id: ticket.id, number: ticket.number, subject: ticket.subject, category: ticket.category, status: ticket.status, createdAt: ticket.createdAt });
  } catch (e) { next(e); }
});

// POST /tickets/:id/messages — responder (multipart: message + files[]). Reabre se fechado.
router.post('/:id/messages', upload.array('files', 5), async (req: AuthedRequest, res, next) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: String(req.params.id) }, select: { id: true, userId: true, number: true, status: true, closedAt: true } });
    if (!ticket || ticket.userId !== req.userId!) { res.status(404).json({ error: 'Chamado não encontrado' }); return; }
    const body = String(req.body.message ?? '').trim();
    const files = req.files as Express.Multer.File[] | undefined;
    if (!body && !files?.length) { res.status(400).json({ error: 'Mensagem ou anexo obrigatório.' }); return; }
    const attachments = await saveAttachments(files, `tickets-${ticket.number}`);
    const msg = await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, authorRole: 'user', authorId: req.userId!, body: body || '(anexo)', attachments: attachments.length ? attachments : undefined },
    });
    // Usuário sempre devolve o chamado ao atendimento do admin (status 'open'), inclusive se estava
    // 'pending' (antes ficava preso em "Aguardando você" e o admin não via o retorno) ou 'closed'
    // (reabre). closedAt some em qualquer caso (chamado volta a estar ativo).
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: 'open', lastMessageBy: 'user', lastMessageAt: new Date(), unreadByAdmin: true, closedAt: null },
    });
    res.status(201).json({ id: msg.id, createdAt: msg.createdAt });
  } catch (e) { next(e); }
});

// GET /tickets/:id/messages/:messageId/attachments/:idx — download de anexo (escopado ao dono)
router.get('/:id/messages/:messageId/attachments/:idx', async (req: AuthedRequest, res, next) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: String(req.params.id) }, select: { userId: true } });
    if (!ticket || ticket.userId !== req.userId!) { res.status(404).json({ error: 'Não encontrado' }); return; }
    const msg = await prisma.ticketMessage.findUnique({ where: { id: String(req.params.messageId) }, select: { ticketId: true, attachments: true } });
    if (!msg || msg.ticketId !== String(req.params.id)) { res.status(404).json({ error: 'Não encontrado' }); return; }
    const att = ((msg.attachments as Attachment[] | null) ?? [])[Number(req.params.idx)];
    if (!att) { res.status(404).json({ error: 'Anexo não encontrado' }); return; }
    const r = await resolveExamFile(att.ref);
    if (r.kind === 'url') { res.redirect(302, r.url as string); return; }
    if (r.file && fs.existsSync(r.file)) { res.sendFile(path.resolve(r.file)); return; }
    res.status(404).json({ error: 'Arquivo não disponível' });
  } catch (e) { next(e); }
});

export default router;
