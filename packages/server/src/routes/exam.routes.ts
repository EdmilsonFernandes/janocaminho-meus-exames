import { Router } from 'express';
import fs from 'fs';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds, firstPatientId } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { sha256Buffer } from '../utils/crypto';
import { saveExamFile, resolveExamFile, deleteExamFile, patientSlug } from '../utils/storage';
import { parseListParams, setListHeaders } from '../utils/list';
import { serializeExam } from '../utils/serialize';
import { runExtraction } from '../extraction/pipeline';
import { config } from '../config';

const router = Router();
router.use(requireAuth);

// LIST (compatível com react-admin simple-rest)
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { start, take, sort, order } = parseListParams(req);
    const q = req.query as Record<string, string | undefined>;
    const where: any = { patientId: { in: pids } };
    if (q.patientId) where.patientId = q.patientId;
    if (q.kind) where.kind = q.kind;
    if (q.q) where.title = { contains: q.q, mode: 'insensitive' };

    const orderBy: any =
      sort && ['title', 'performedAt', 'createdAt', 'kind', 'status'].includes(sort)
        ? { [sort]: order ?? 'desc' }
        : { performedAt: 'desc' };

    const [total, rows] = await prisma.$transaction([
      prisma.exam.count({ where }),
      prisma.exam.findMany({
        where,
        orderBy,
        skip: start,
        take,
        include: { _count: { select: { items: true } } },
      }),
    ]);
    setListHeaders(res, start, start + take, total);
    res.json(rows.map(serializeExam));
  } catch (e) {
    next(e);
  }
});

// GET ONE (com itens agrupados + último resumo)
router.get('/:id', async (req, res, next) => {
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id },
      include: {
        items: { orderBy: [{ panel: 'asc' }, { name: 'asc' }] },
        analyses: { where: { type: 'SUMMARY' }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!exam) {
      res.status(404).json({ error: 'Exame não encontrado' });
      return;
    }
    res.json(serializeExam(exam));
  } catch (e) {
    next(e);
  }
});

// UPLOAD (multipart: file + patientId? + title?)
router.post('/', upload.single('file'), async (req: AuthedRequest, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Arquivo não enviado (campo "file" obrigatório)' });
      return;
    }
    const pids = await userPatientIds(req.userId!);
    const requested = req.body.patientId as string | undefined;
    let patientId: string | null | undefined = requested && pids.includes(requested) ? requested : pids[0];
    if (!patientId) patientId = await firstPatientId(req.userId!);
    if (!patientId) {
      res.status(400).json({ error: 'Nenhum paciente vinculado ao usuário' });
      return;
    }

    // PAYWALL: free limit de exames (exceto plano ativo)
    const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { planExpiresAt: true } });
    const active = !!me?.planExpiresAt && me.planExpiresAt > new Date();
    if (!active) {
      const count = await prisma.exam.count({ where: { patient: { ownerId: req.userId! } } });
      if (count >= config.freeExamLimit) {
        res.status(402).json({ error: 'free_limit', message: 'Você atingiu o limite do plano gratuito. Assine para enviar mais exames.', limit: config.freeExamLimit });
        return;
      }
    }

    const buffer = req.file.buffer;
    const fileSha256 = sha256Buffer(buffer);

    // idempotência: mesmo arquivo+paciente → devolve o exame existente
    const existing = await prisma.exam.findUnique({
      where: { patientId_fileSha256: { patientId, fileSha256 } },
    });
    if (existing) {
      res.json(serializeExam(existing));
      return;
    }

    // sobe o arquivo (S3 em prod / disco em dev) — pasta por paciente
    const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { fullName: true } });
    const slug = patientSlug(patient?.fullName ?? 'paciente', patientId);
    const ref = await saveExamFile(buffer, slug, req.file.originalname, req.file.mimetype);

    const title = (req.body.title && String(req.body.title).trim()) || 'Exame';
    const kindRaw = req.body.kind as string | undefined;
    const kind = ['LAB_PANEL', 'IMAGING', 'OTHER'].includes(kindRaw as string)
      ? (kindRaw as any)
      : 'OTHER';
    const exam = await prisma.exam.create({
      data: {
        patientId,
        title,
        kind,
        filePath: ref,
        fileSha256,
        fileSizeBytes: buffer.length,
      },
    });

    // dispara extração assíncrona (não bloqueia a resposta)
    runExtraction(exam.id).catch((e) => console.error('[upload] extração falhou:', e?.message));
    res.status(201).json(serializeExam(exam));
  } catch (e) {
    next(e);
  }
});

// REEXTRACT
router.post('/:id/reextract', async (req, res, next) => {
  try {
    const exam = await prisma.exam.findUnique({ where: { id: req.params.id } });
    if (!exam) {
      res.status(404).json({ error: 'Exame não encontrado' });
      return;
    }
    runExtraction(exam.id).catch((e) => console.error('[reextract] falhou:', e?.message));
    res.json({ ok: true, id: exam.id, status: 'EXTRACTING' });
  } catch (e) {
    next(e);
  }
});

// SERVE o arquivo (URL pré-assinada do S3 em prod, ou stream local em dev) — atrás de auth
router.get('/:id/file', async (req, res, next) => {
  try {
    const exam = await prisma.exam.findUnique({ where: { id: req.params.id } });
    if (!exam || !exam.filePath) {
      res.status(404).json({ error: 'Arquivo não encontrado' });
      return;
    }
    const r = await resolveExamFile(exam.filePath);
    if (r.kind === 'url') {
      res.redirect(302, r.url as string);
    } else {
      res.setHeader('Content-Type', 'application/pdf');
      fs.createReadStream(r.file as string).pipe(res);
    }
  } catch (e) {
    next(e);
  }
});

// DELETE
router.delete('/:id', async (req, res, next) => {
  try {
    const exam = await prisma.exam.findUnique({ where: { id: req.params.id } });
    if (!exam) {
      res.status(404).json({ error: 'Exame não encontrado' });
      return;
    }
    await deleteExamFile(exam.filePath);
    await prisma.exam.delete({ where: { id: exam.id } });
    res.json({ id: exam.id });
  } catch (e) {
    next(e);
  }
});

export default router;
