import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';

// ── MINHAS CONSULTAS (28/10/26, spec §2) ──────────────────────────────────────────
// Consulta REGISTRADA PELO PACIENTE. Não é agendamento no consultório — a UI deixa
// isso explícito e não prometemos reserva externa (não há integração de agenda).
// Lembretes reaproveitam a infra de Reminder (type='consulta', offsets, push).
// Isolamento: ownerId + patientId ∈ userPatientIds em TODA rota.

const STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;
const MODES = ['presencial', 'teleconsulta'] as const;
const PAYMENT_TYPES = ['particular', 'convenio'] as const;
// Igual reminder.routes: link de encontro é EXTERNO http(s) com host — nunca hospedamos.
const LINK_URL_RE = /^https?:\/\/[^\s/]+/i;

function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function parseStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}
/** Inteiro ≥0 em CENTAVOS (o front converte R$). null = não informado. */
function parsePriceCents(v: unknown): number | null | 'invalid' {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100_000_000) return 'invalid';
  return n;
}
/** IDs de exame vindos do body: só strings não-vazias, dedup — posse validada depois. */
function parseExamIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x))];
}
/** Valida que TODOS os examIds pertencem ao paciente (e estão EXTRAÍDOS). Retorna os faltantes. */
async function invalidExamIds(patientId: string, examIds: string[]): Promise<string[]> {
  const found = await prisma.exam.findMany({
    where: { id: { in: examIds }, patientId, status: 'EXTRACTED' },
    select: { id: true },
  });
  const ok = new Set(found.map((e) => e.id));
  return examIds.filter((id) => !ok.has(id));
}

const router = Router();
router.use(requireAuth);

// LISTAR — histórico completo (desc). ?patientId= filtra (família).
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const q = req.query as Record<string, string | undefined>;
    const where: any = { ownerId: req.userId, patientId: { in: pids } };
    if (q.patientId && pids.includes(q.patientId)) where.patientId = q.patientId;
    if (q.status && (STATUSES as readonly string[]).includes(q.status)) where.status = q.status;
    const items = await prisma.patientConsultation.findMany({
      where,
      orderBy: { scheduledAt: 'desc' },
      include: { doctor: { select: { id: true, name: true, crm: true, crmUf: true, specialty: true, photoUrl: true } } },
    });
    res.json({ items });
  } catch (e) { next(e); }
});

// REGISTRAR consulta
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const b = req.body ?? {};
    const pid = b.patientId && pids.includes(b.patientId) ? b.patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }

    const scheduledAt = parseDate(b.scheduledAt);
    if (!scheduledAt) { res.status(400).json({ error: 'Data/hora da consulta é obrigatória.' }); return; }

    const mode = MODES.includes(b.mode) ? b.mode : 'presencial';
    const paymentType = PAYMENT_TYPES.includes(b.paymentType) ? b.paymentType : 'particular';
    const status = STATUSES.includes(b.status) ? b.status : 'scheduled';
    const linkUrl = parseStr(b.linkUrl, 500);
    if (mode === 'teleconsulta' && linkUrl && !LINK_URL_RE.test(linkUrl)) {
      res.status(400).json({ error: 'Link de teleconsulta inválido (use http:// ou https://).' });
      return;
    }
    const insuranceOperator = parseStr(b.insuranceOperator, 80);
    const insurancePlan = parseStr(b.insurancePlan, 80);
    if (paymentType === 'convenio' && !insuranceOperator) {
      res.status(400).json({ error: 'Informe a operadora do convênio.' });
      return;
    }
    const priceCents = parsePriceCents(b.priceCents);
    if (priceCents === 'invalid') { res.status(400).json({ error: 'Valor inválido.' }); return; }

    // Médico: por vínculo (doctorId) ou texto livre (snapshot §2 — nem toda consulta é
    // com médico do diretório). Snapshot SEMPRE denormalizado (Doctor pending é deletável).
    let doctorId: string | null = null;
    let doctorName = parseStr(b.doctorName, 120);
    let specialty = parseStr(b.specialty, 60);
    if (b.doctorId) {
      const doc = await prisma.doctor.findUnique({
        where: { id: String(b.doctorId) },
        select: { id: true, name: true, specialty: true },
      });
      if (!doc) { res.status(404).json({ error: 'Médico não encontrado.' }); return; }
      doctorId = doc.id;
      doctorName = doc.name; // snapshot da fonte oficial
      specialty = doc.specialty ?? specialty;
    }
    if (!doctorName) { res.status(400).json({ error: 'Informe o médico da consulta.' }); return; }

    // Exames selecionados: posse validada (nunca aceitar id de outro paciente).
    const examIds = parseExamIds(b.examIds);
    if (examIds.length) {
      const bad = await invalidExamIds(pid, examIds);
      if (bad.length) { res.status(400).json({ error: 'Exame não encontrado nesta conta.', examIds: bad }); return; }
    }

    const item = await prisma.patientConsultation.create({
      data: {
        patientId: pid,
        ownerId: req.userId!,
        doctorId,
        doctorName: doctorName!,
        specialty,
        scheduledAt,
        timezone: parseStr(b.timezone, 60) ?? 'America/Sao_Paulo',
        mode,
        placeName: parseStr(b.placeName, 120),
        address: parseStr(b.address, 200),
        linkUrl: mode === 'teleconsulta' ? linkUrl : null,
        paymentType,
        insuranceOperator: paymentType === 'convenio' ? insuranceOperator : null,
        insurancePlan: paymentType === 'convenio' ? insurancePlan : null,
        priceCents,
        reason: parseStr(b.reason, 400),
        privateNotes: parseStr(b.privateNotes, 2000),
        status,
        examIds,
      },
    });

    // Lembrete (best-effort — consulta NUNCA depende do Reminder nascer): só p/ consultas
    // futuras em scheduled. Reaproveita a infra de push existente (offsets default).
    if (b.remind !== false && status === 'scheduled' && scheduledAt.getTime() > Date.now()) {
      try {
        const reminder = await prisma.reminder.create({
          data: {
            patientId: pid,
            ownerId: req.userId!,
            title: `Consulta — ${doctorName}`,
            dueDate: scheduledAt,
            note: [item.reason, item.placeName, item.linkUrl].filter(Boolean).join(' · ').slice(0, 500) || null,
            type: 'consulta',
          },
        });
        await prisma.patientConsultation.update({ where: { id: item.id }, data: { reminderId: reminder.id } });
        item.reminderId = reminder.id;
      } catch (e: any) { console.error('[my-consultations] lembrete falhou:', e?.message); }
    }

    // Convênio informado pelo paciente (§5): registra provenance 'patient_reported' —
    // dedupe por médico+operadora+plano (NULL do PG fica fora do unique — findFirst determinístico).
    if (paymentType === 'convenio' && doctorId && insuranceOperator) {
      const dup = await prisma.doctorInsurance.findFirst({
        where: { doctorId, operator: { equals: insuranceOperator, mode: 'insensitive' }, ...(insurancePlan ? { plan: { equals: insurancePlan, mode: 'insensitive' } } : { plan: null }) },
        select: { id: true },
      });
      if (!dup) {
        await prisma.doctorInsurance.create({
          data: { doctorId, operator: insuranceOperator, plan: insurancePlan, verificationStatus: 'patient_reported', source: `patient:${pid}`, verifiedAt: new Date() },
        }).catch(() => {}); // best-effort: registro é útil, não crítico
      }
    }

    res.status(201).json({ item });
  } catch (e) { next(e); }
});

// EDITAR (campos + status). Médico não muda na edição (recriar é o fluxo V1).
router.patch('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const item = await prisma.patientConsultation.findUnique({ where: { id: String(req.params.id) } });
    if (!item || item.ownerId !== req.userId || !pids.includes(item.patientId)) {
      res.status(404).json({ error: 'Consulta não encontrada.' }); return;
    }
    const b = req.body ?? {};
    const data: any = {};

    if (b.scheduledAt !== undefined) {
      const d = parseDate(b.scheduledAt);
      if (!d) { res.status(400).json({ error: 'Data/hora inválida.' }); return; }
      data.scheduledAt = d;
    }
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) { res.status(400).json({ error: 'Status inválido.' }); return; }
      data.status = b.status;
    }
    if (b.mode !== undefined) {
      if (!MODES.includes(b.mode)) { res.status(400).json({ error: 'Modo inválido.' }); return; }
      data.mode = b.mode;
    }
    if (b.paymentType !== undefined) {
      if (!PAYMENT_TYPES.includes(b.paymentType)) { res.status(400).json({ error: 'Tipo de pagamento inválido.' }); return; }
      data.paymentType = b.paymentType;
    }
    if (b.linkUrl !== undefined) {
      const u = parseStr(b.linkUrl, 500);
      if (u && !LINK_URL_RE.test(u)) { res.status(400).json({ error: 'Link de teleconsulta inválido.' }); return; }
      data.linkUrl = u;
    }
    if (b.priceCents !== undefined) {
      const p = parsePriceCents(b.priceCents);
      if (p === 'invalid') { res.status(400).json({ error: 'Valor inválido.' }); return; }
      data.priceCents = p;
    }
    if (b.insuranceOperator !== undefined) data.insuranceOperator = parseStr(b.insuranceOperator, 80);
    if (b.insurancePlan !== undefined) data.insurancePlan = parseStr(b.insurancePlan, 80);
    if (b.placeName !== undefined) data.placeName = parseStr(b.placeName, 120);
    if (b.address !== undefined) data.address = parseStr(b.address, 200);
    if (b.reason !== undefined) data.reason = parseStr(b.reason, 400);
    if (b.privateNotes !== undefined) data.privateNotes = parseStr(b.privateNotes, 2000);
    if (b.examIds !== undefined) {
      const examIds = parseExamIds(b.examIds);
      if (examIds.length) {
        const bad = await invalidExamIds(item.patientId, examIds);
        if (bad.length) { res.status(400).json({ error: 'Exame não encontrado nesta conta.', examIds: bad }); return; }
      }
      data.examIds = examIds;
    }

    const updated = await prisma.patientConsultation.update({ where: { id: item.id }, data });

    // Sync do lembrete (best-effort): data → dueDate; cancelada/no_show → done (para o push);
    // voltar a scheduled → reabre.
    if (updated.reminderId) {
      const patch: any = {};
      if (data.scheduledAt !== undefined) patch.dueDate = data.scheduledAt;
      if (data.status !== undefined) patch.done = updated.status !== 'scheduled';
      if (Object.keys(patch).length) {
        await prisma.reminder.update({ where: { id: updated.reminderId }, data: patch }).catch(() => {}); // reminder pode ter sido deletado
      }
    }

    res.json({ item: updated });
  } catch (e) { next(e); }
});

// EXCLUIR registro (privado do paciente). Lembrete associado só é marcado done.
router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const item = await prisma.patientConsultation.findUnique({ where: { id: String(req.params.id) } });
    if (!item || item.ownerId !== req.userId || !pids.includes(item.patientId)) {
      res.status(404).json({ error: 'Consulta não encontrada.' }); return;
    }
    if (item.reminderId) {
      await prisma.reminder.updateMany({ where: { id: item.reminderId }, data: { done: true } }).catch(() => {});
    }
    await prisma.patientConsultation.delete({ where: { id: item.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
