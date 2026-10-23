import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { parseListParams, setListHeaders } from '../utils/list';
import { REMINDER_TYPES, REMINDER_RECURRENCES } from '../utils/reminderConstants';

/** Antecedências (minutos antes do dueDate) escolhidas pelo usuário ao criar — estilo Agenda do Google. */
const DEFAULT_OFFSETS = [1440, 300, 0]; // 1 dia · 5h · na hora
function parseOffsets(v: unknown): number[] {
  if (!Array.isArray(v)) return DEFAULT_OFFSETS;
  const out = Array.from(new Set(v.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0).map((n) => Math.round(n))));
  out.sort((a, b) => a - b);
  return out.length ? out : DEFAULT_OFFSETS;
}

// ── Lote "estilo Teams" (18/10/26): tipo/link/recorrência com whitelist (nunca confiar no client).
// As listas vivem em utils/reminderConstants (fonte única — rotas + jobs).
function parseType(v: unknown): string | null {
  return REMINDER_TYPES.includes(v as any) ? String(v) : null;
}
function parseRecurrence(v: unknown): string | null {
  return REMINDER_RECURRENCES.includes(v as any) ? String(v) : null;
}
/** http(s) com HOST (review: "https://" vazio passava no prefixo solto). */
const LINK_URL_RE = /^https?:\/\/[^\s/]+/i;
function parseLinkUrl(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = v.trim();
  // Só http(s) — o link é EXTERNO por design (Meet/Teams/WhatsApp); nunca hospedamos chamada.
  if (!LINK_URL_RE.test(s)) return null;
  return s.slice(0, 500);
}

const router = Router();
router.use(requireAuth);

// LIST (próximos lembretes do paciente/owner)
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { start, take } = parseListParams(req);
    const q = req.query as Record<string, string | undefined>;
    const where: any = { ownerId: req.userId, patientId: { in: pids } };
    if (q.patientId && pids.includes(q.patientId)) where.patientId = q.patientId;
    if (q.done !== undefined) where.done = q.done === 'true';
    const [total, rows] = await prisma.$transaction([
      prisma.reminder.count({ where }),
      prisma.reminder.findMany({ where, skip: start, take, orderBy: { dueDate: 'asc' } }),
    ]);

    // Enriquecimento com dados do médico (se agendado via Portal do Médico)
    const docIds = Array.from(new Set(rows.map((r) => r.createdByDoctorId).filter(Boolean))) as string[];
    let docMap: Record<string, any> = {};
    if (docIds.length > 0) {
      const docs = await prisma.doctor.findMany({
        where: { id: { in: docIds } },
        select: { id: true, name: true, crm: true, crmUf: true, specialty: true, photoUrl: true },
      });
      docMap = Object.fromEntries(docs.map((d) => [d.id, d]));
    }
    const enriched = rows.map((r) => ({
      ...r,
      doctor: r.createdByDoctorId ? docMap[r.createdByDoctorId] ?? null : null,
    }));

    setListHeaders(res, start, start + take, total);
    res.json(enriched);
  } catch (e) { next(e); }
});

// CREATE
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { patientId, title, dueDate, note } = req.body ?? {};
    const pid = patientId && pids.includes(patientId) ? patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente.' }); return; }
    if (!title || !dueDate) { res.status(400).json({ error: 'Título e data são obrigatórios.' }); return; }
    const b = req.body ?? {};
    const type = parseType(b.type);
    const linkUrl = parseLinkUrl(b.linkUrl);
    // Teleconsulta sem link não faz sentido (o botão "Entrar" não teria pra onde levar).
    // Dono 23/10: teleconsulta é agendada SÓ pelo médico (portal dele) — evita
    // salas paralelas/confusão de "quem criou". Paciente pede ao médico.
    if (type === 'teleconsulta') { res.status(403).json({ error: 'Teleconsulta é agendada pelo seu médico no portal dele. Peça para ele agendar por lá.' }); return; }
    const r = await prisma.reminder.create({
      data: {
        ownerId: req.userId!, patientId: pid, title: String(title), dueDate: new Date(dueDate),
        note: note ? String(note) : null, notifyOffsetsMin: parseOffsets(b.notifyOffsetsMin),
        type, linkUrl, recurrence: parseRecurrence(b.recurrence),
      },
    });
    res.status(201).json(r);
  } catch (e) { next(e); }
});

// UPDATE (marcar feito / editar)
router.put('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.reminder.findUnique({ where: { id: String(req.params.id) } });
    if (!existing || existing.ownerId !== req.userId) { res.status(404).json({ error: 'Lembrete não encontrado' }); return; }
    const { title, dueDate, note, done, notifyOffsetsMin, type, linkUrl, recurrence } = req.body ?? {};
    const data: any = {};
    if (title != null) data.title = String(title);
    if (dueDate != null) data.dueDate = new Date(dueDate);
    if (note != null) data.note = String(note);
    if (done != null) data.done = Boolean(done);
    if (type !== undefined) data.type = parseType(type);
    // Link inválido (scheme sem host, javascript:, …) é ERRO, não "limpa silenciosa"
    if (linkUrl !== undefined && String(linkUrl ?? '').trim() && !parseLinkUrl(linkUrl)) {
      res.status(400).json({ error: 'Link inválido — use http(s)://…' }); return;
    }
    if (linkUrl !== undefined) data.linkUrl = parseLinkUrl(linkUrl);
    if (recurrence !== undefined) data.recurrence = parseRecurrence(recurrence);
    // Mesma regra do CREATE (review): PUT não pode deixar teleconsulta sem link
    // (chip sem botão Entrar + consentimento 400 = meia-entrada inútil).
    // F2 LiveKit: consulta provider='livekit' entra PELO APP (linkUrl=null ok).
    const finalType = data.type !== undefined ? data.type : existing.type;
    const finalLink = data.linkUrl !== undefined ? data.linkUrl : existing.linkUrl;
    if (finalType === 'teleconsulta' && existing.provider !== 'livekit' && !finalLink) {
      res.status(400).json({ error: 'Teleconsulta precisa do link da chamada (Meet/Teams/WhatsApp).' }); return;
    }
    const offsetsChanged = notifyOffsetsMin !== undefined;
    const dueChanged = dueDate !== undefined && new Date(dueDate).getTime() !== new Date(existing.dueDate).getTime();
    if (offsetsChanged) data.notifyOffsetsMin = parseOffsets(notifyOffsetsMin);
    // Mudou data ou antecedências -> rearma os disparos (limpa o que já foi enviado p/ reavaliar).
    if (dueChanged || offsetsChanged) data.sentOffsets = [];
    res.json(await prisma.reminder.update({ where: { id: existing.id }, data }));
  } catch (e) { next(e); }
});

// CONSENTIMENTO DE TELEMEDICINA (Art. 15, Res. CFM 2.314/2022) — o PACIENTE (owner)
// registra o aceite livre/esclarecido; o carimbo habilita o botão "Entrar na consulta".
// Idempotente: re-aceitar só refresca o carimbo (sem duplicar histórico — a data mais
// nova é a que vale; o primeiro aceite fica preservado se já existir).
router.put('/:id/consent', async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.reminder.findUnique({ where: { id: String(req.params.id) } });
    if (!existing || existing.ownerId !== req.userId) { res.status(404).json({ error: 'Lembrete não encontrado' }); return; }
    if (existing.type !== 'teleconsulta') { res.status(400).json({ error: 'Consentimento vale apenas para teleconsulta.' }); return; }
    const r = await prisma.reminder.update({
      where: { id: existing.id },
      data: { consentAt: existing.consentAt ?? new Date() },
    });
    res.json({ id: r.id, consentAt: r.consentAt });
  } catch (e) { next(e); }
});

// DELETE
router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.reminder.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) { res.status(404).json({ error: 'Lembrete não encontrado' }); return; }
    
    // Verifica se o usuário é o dono do lembrete OU o dono do paciente vinculado
    let hasAccess = existing.ownerId === req.userId;
    if (!hasAccess && existing.patientId) {
      const pat = await prisma.patient.findFirst({ where: { id: existing.patientId, ownerId: req.userId } });
      if (pat) hasAccess = true;
    }
    if (!hasAccess) { res.status(403).json({ error: 'Sem permissão para excluir este lembrete.' }); return; }

    // Desvincula pedidos de exame antes de deletar
    await prisma.examRequest.updateMany({ where: { reminderId: existing.id }, data: { reminderId: null } }).catch(() => {});
    await prisma.reminder.delete({ where: { id: existing.id } });
    res.json({ id: existing.id });
  } catch (e) { next(e); }
});

export default router;
