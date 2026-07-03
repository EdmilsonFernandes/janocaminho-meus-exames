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
import { chargeCredits, computeUploadCost, UPLOAD_RULES } from '../utils/credits';

const router = Router();
router.use(requireAuth);

// LIST (compatível com react-admin simple-rest)
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { start, take, sort, order } = parseListParams(req);
    const q = req.query as Record<string, string | undefined>;
    const headerPid = req.headers['x-patient-id'] as string | undefined;
    const activePid = (headerPid && pids.includes(headerPid)) ? headerPid : (q.patientId && pids.includes(q.patientId) ? q.patientId : undefined);
    const where: any = activePid ? { patientId: activePid } : { patientId: { in: pids } };
    if (q.kind) where.kind = q.kind;
    if (q.status) where.status = q.status;
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
        patient: { select: { fullName: true, relationship: true } },
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
    const headerPid = req.headers['x-patient-id'] as string | undefined;
    const requested = req.body.patientId as string | undefined;
    let patientId: string | null | undefined = (headerPid && pids.includes(headerPid)) ? headerPid : (requested && pids.includes(requested) ? requested : pids[0]);
    if (!patientId) patientId = await firstPatientId(req.userId!);
    if (!patientId) {
      res.status(400).json({ error: 'Nenhum paciente vinculado ao usuário' });
      return;
    }

    // COBRANÇA DE UPLOAD (por dependente, cota mensal — não devolve ao deletar exame):
    //   Premium ativo: primeiros premiumFreeQuota envios do mês = grátis; depois premiumCost cada.
    //   Free: freeCost créditos por envio (sempre).
    const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { planExpiresAt: true, credits: true } });
    const active = !!me?.planExpiresAt && me.planExpiresAt > new Date();
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const pCounter = await prisma.patient.findUnique({ where: { id: patientId }, select: { uploadMonth: true, monthlyUploadCount: true } });
    const countSoFar = pCounter?.uploadMonth === monthKey ? (pCounter?.monthlyUploadCount ?? 0) : 0;
    const uploadCost = computeUploadCost(active, countSoFar);
    if (uploadCost > 0 && (!me || me.credits < uploadCost)) {
      const msg = active
        ? `Você já usou seus ${UPLOAD_RULES.premiumFreeQuota} envios grátis deste mês neste perfil. Para enviar mais, recarregue créditos (${uploadCost} por envio).`
        : `Para enviar um exame é preciso ${UPLOAD_RULES.freeCost} crédito. Recarregue créditos (PIX) ou assine o mensal (${UPLOAD_RULES.premiumFreeQuota} envios grátis/mês em cada perfil).`;
      res.status(402).json({ error: 'no_credits_upload', message: msg, cost: uploadCost, plan: active ? 'premium' : 'free' });
      return;
    }
    const uploadCountAfter = countSoFar + 1;

    const buffer = req.file.buffer;
    const fileSha256 = sha256Buffer(buffer);

    // idempotência: mesmo arquivo+paciente → devolve o exame existente
    const existing = await prisma.exam.findUnique({
      where: { patientId_fileSha256: { patientId, fileSha256 } },
    });
    if (existing) {
      res.json({ ...serializeExam(existing), duplicate: true });
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
    // TRANSAÇÃO ATÔMICA: cria exame + debita créditos + atualiza contador mensal.
    // Se QUALQUER passo falhar (ex: sem créditos), tudo é desfeito (rollback) — não cria exame grátis.
    const exam = await prisma.$transaction(async (tx) => {
      const created = await tx.exam.create({
        data: {
          patientId,
          title,
          kind,
          filePath: ref,
          fileSha256,
          fileSizeBytes: buffer.length,
        },
      });
      await tx.patient.update({ where: { id: patientId }, data: { uploadMonth: monthKey, monthlyUploadCount: uploadCountAfter } });
      if (uploadCost > 0) {
        // Débito atômico: só decrementa se credits >= uploadCost (guarda no WHERE do updateMany)
        const r = await tx.user.updateMany({ where: { id: req.userId!, credits: { gte: uploadCost } }, data: { credits: { decrement: uploadCost } } });
        if (r.count === 0) throw new Error('Sem créditos suficientes pra este upload.');
        await tx.creditTransaction.create({ data: { userId: req.userId!, delta: -uploadCost, kind: 'upload', label: `Envio de exame: ${created.title}`, refId: created.id } });
      }
      return created;
    });

    // avisa se o MESMO checksum já existe em outro perfil do usuário
    const elsewhere = await prisma.exam.findFirst({
      where: { fileSha256, patientId: { not: patientId }, patient: { ownerId: req.userId! } },
      select: { id: true },
    });
    // dispara extração assíncrona (não bloqueia a resposta)
    runExtraction(exam.id).catch((e) => console.error('[upload] extração falhou:', e?.message));
    res.status(201).json({ ...serializeExam(exam), duplicateElsewhere: !!elsewhere });
  } catch (e) {
    next(e);
  }
});

// DETECTAR DUPLICATAS — agrupa exames do mesmo paciente com mesma data + título similar
router.get('/duplicates/list', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const activePid = req.query.patientId ? String(req.query.patientId) : undefined;
    const scope = activePid && pids.includes(activePid) ? activePid : { in: pids };
    const exams = await prisma.exam.findMany({
      where: { patientId: scope, status: 'EXTRACTED' },
      select: { id: true, title: true, performedAt: true, kind: true, createdAt: true },
      orderBy: { performedAt: 'desc' },
    });
    const norm = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const groups: Record<string, typeof exams> = {};
    for (const e of exams) {
      const date = e.performedAt ? new Date(e.performedAt).toISOString().split('T')[0] : 's/d';
      const key = `${date}|${norm(e.title || '')}`;
      (groups[key] ??= []).push(e);
    }
    const dupes = Object.values(groups).filter((g) => g.length > 1);
    res.json({ duplicates: dupes, total: dupes.length });
  } catch (e) { next(e); }
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
    const patientId = exam.patientId;
    await deleteExamFile(exam.filePath);
    await prisma.exam.delete({ where: { id: exam.id } });
    // Invalida o relatório consolidado (aiAnalysis SUMMARY do paciente) — pode ter sido gerado
    // com dados deste exame. Sem isto, o relatório ficava ÓRFÃO: paciente removia o exame
    // ("não é meu") e o relatório continuava mostrando os dados do exame removido (divergência).
    await prisma.aiAnalysis.deleteMany({ where: { patientId, type: 'SUMMARY', examId: null } }).catch(() => {});
    res.json({ id: exam.id });
  } catch (e) {
    next(e);
  }
});

// ATESTO de titularidade — bloqueio suave anti-fraude (nome do doc ≠ paciente)
router.post('/:id/attest', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const exam = await prisma.exam.findUnique({ where: { id: String(req.params.id) } });
    if (!exam || !pids.includes(exam.patientId)) {
      res.status(404).json({ error: 'Exame não encontrado' });
      return;
    }
    const raw: any = exam.rawExtraction ?? {};
    await prisma.exam.update({
      where: { id: exam.id },
      data: { rawExtraction: { ...raw, nameAttested: true, nameAttestedAt: new Date().toISOString() } },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
