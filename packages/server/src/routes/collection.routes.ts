// CHECKLIST DE COLETA (T2, 28/10/26) — o médico define exames que o paciente deve coletar.
// Dois routers:
//  - doctorRouter  → montado em /api/doctor (POST/GET/DELETE /patients/:patientId/checklist)
//  - default       → montado em /api/collection-checklist (GET, paciente vê o próprio plano)
// Mesmo padrão do teleconsultaQueue.routes.ts (doctorRouter exportado sem tocar doctor.routes).
// LGPD/push: corpo do push é NEUTRO — "Você tem exames para coletar — toque para ver"
// (nenhum analito/dado clínico viaja na notificação; o detalhe fica atrás do login).
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../prisma';
import { requireAuth, userPatientIds, type AuthedRequest } from '../middleware/auth';
import { canonicalName } from '../utils/normalize';
import { expireStaleChecklistItems } from '../utils/collectionChecklist';
import { sendPushToUser } from '../utils/push';

const MS_DAY = 86_400_000;

// Prazos oferecidos no portal (chips 30/60/90/180) — server valida a whitelist.
const ALLOWED_DUE_DAYS = new Set([30, 60, 90, 180]);

// ── AUTH MÉDICO (mesma checagem do requireDoctor de doctor.routes.ts — replicada aqui
//    porque o middleware não é exportido de lá; token JWT type:'doctor' + bloqueio admin). ──
const verifyDoctorToken = (token: string): any => {
  try { const p: any = jwt.verify(token, config.jwtSecret); return p?.type === 'doctor' ? p : null; } catch { return null; }
};
const requireDoctor = async (req: any, res: any, next: any) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'Token obrigatório.' }); return; }
  const payload = verifyDoctorToken(auth.slice(7));
  if (!payload?.doctorId) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
  const doc = await prisma.doctor.findUnique({
    where: { id: payload.doctorId },
    select: { id: true, blocked: true },
  });
  if (!doc) { res.status(401).json({ error: 'Médico não encontrado.' }); return; }
  if (doc.blocked) { res.status(403).json({ error: 'Acesso suspenso pela administração.' }); return; }
  req.doctorId = payload.doctorId;
  next();
};

/** Share ativo com scope 'exams' (mesma família clínica do /vitals e /context). */
async function requireExamsShare(doctorId: string, patientId: string): Promise<boolean> {
  const share = await prisma.doctorShare.findFirst({
    where: { doctorId, patientId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { scopes: true },
  });
  return !!share?.scopes.includes('exams');
}

const serialize = (i: any) => ({
  id: i.id,
  patientId: i.patientId,
  doctorId: i.doctorId ?? null,
  analyteName: i.analyteName,
  analyteCanonical: i.analyteCanonical,
  instruction: i.instruction ?? null,
  dueAt: i.dueAt,
  status: i.status,
  collectedAt: i.collectedAt ?? null,
  collectedExamId: i.collectedExamId ?? null,
  createdAt: i.createdAt,
});

// ═══════════════════ MÉDICO (portal, painel do paciente) ═══════════════════
export const doctorRouter = Router();

// Lista completa (histórico: pending / collected ✓ / expired) — lazy-expire antes de ler.
doctorRouter.get('/patients/:patientId/checklist', requireDoctor, async (req: any, res, next) => {
  try {
    const patientId = String(req.params.patientId);
    if (!(await requireExamsShare(req.doctorId, patientId))) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    await expireStaleChecklistItems();
    const items = await prisma.collectionChecklistItem.findMany({
      where: { patientId },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
    });
    res.json({ items: items.map(serialize) });
  } catch (e) {
    if (/relation "collection_checklist_items" does not exist/i.test(String((e as Error).message))) { res.json({ items: [] }); return; }
    next(e);
  }
});

// Adiciona item: nome do analito (canonical calculado aqui — mesma função do app),
// prazo em dias (whitelist 30/60/90/180) + instrução curta opcional.
// Efeitos: cria LEMBRETE na agenda do paciente (engine existente — push nas antecedências)
// + push imediato NEUTRO (sem dado clínico no corpo).
doctorRouter.post('/patients/:patientId/checklist', requireDoctor, async (req: any, res, next) => {
  try {
    const patientId = String(req.params.patientId);
    if (!(await requireExamsShare(req.doctorId, patientId))) { res.status(403).json({ error: 'Sem permissão.' }); return; }

    const analyteName = String(req.body?.analyteName ?? '').trim().slice(0, 120);
    const dueInDays = Number(req.body?.dueInDays ?? 0);
    const instruction = String(req.body?.instruction ?? '').trim().slice(0, 140) || null;
    if (analyteName.length < 2) { res.status(400).json({ error: 'Informe o exame/analito (mín. 2 caracteres).' }); return; }
    if (!ALLOWED_DUE_DAYS.has(dueInDays)) { res.status(400).json({ error: 'Prazo inválido (use 30, 60, 90 ou 180 dias).' }); return; }

    const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, ownerId: true } });
    if (!patient) { res.status(404).json({ error: 'Paciente não encontrado.' }); return; }

    const dueAt = new Date(Date.now() + dueInDays * MS_DAY);
    const item = await prisma.collectionChecklistItem.create({
      data: {
        patientId,
        doctorId: req.doctorId,
        analyteName,
        analyteCanonical: canonicalName(analyteName),
        instruction,
        dueAt,
      },
    });

    // LEMBRETE na agenda do paciente (engine existente de push/e-mail por antecedência).
    // Título/nota NEUTROS: o corpo do push do job é "Falta 1 dia — <título> (data)" —
    // nenhum analito pode vazar num push (a notificação só abre o app).
    await prisma.reminder.create({
      data: {
        patientId,
        ownerId: patient.ownerId,
        title: 'Plano de coleta',
        dueDate: dueAt,
        note: 'Você tem exames para coletar — toque para ver.',
        type: 'exame',
        createdByDoctorId: req.doctorId,
        notifyOffsetsMin: [1440, 0],
      },
    }).catch(() => { /* best-effort: checklist vive sem o lembrete */ });

    // Push imediato neutro (sendPushToUser também grava a notificação in-app).
    await sendPushToUser(patient.ownerId, 'Plano de coleta', 'Você tem exames para coletar — toque para ver', { type: 'collection_checklist' })
      .catch((e: any) => console.error('[checklist] push criação falhou:', e?.message));

    res.status(201).json({ item: serialize(item) });
  } catch (e) { next(e); }
});

// Remove item (médico desfez / erro de digitação). O lembrete da agenda fica — é do paciente.
doctorRouter.delete('/patients/:patientId/checklist/:itemId', requireDoctor, async (req: any, res, next) => {
  try {
    const patientId = String(req.params.patientId);
    if (!(await requireExamsShare(req.doctorId, patientId))) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    const item = await prisma.collectionChecklistItem.findFirst({ where: { id: String(req.params.itemId), patientId } });
    if (!item) { res.status(404).json({ error: 'Item não encontrado.' }); return; }
    await prisma.collectionChecklistItem.delete({ where: { id: item.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ═══════════════════ PACIENTE (card do dashboard + histórico) ═══════════════════
const router = Router();

router.get('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await expireStaleChecklistItems();
    const ids = await userPatientIds(req.userId!);
    if (!ids.length) { res.json({ items: [] }); return; }
    const items = await prisma.collectionChecklistItem.findMany({
      where: { patientId: { in: ids } },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
    });
    res.json({ items: items.map(serialize) });
  } catch (e) {
    if (/relation "collection_checklist_items" does not exist/i.test(String((e as Error).message))) { res.json({ items: [] }); return; }
    next(e);
  }
});

export default router;
