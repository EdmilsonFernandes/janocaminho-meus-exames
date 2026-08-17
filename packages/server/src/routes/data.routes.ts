import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { reconcileScaleFlag } from '../utils/normalize';

const router = Router();
router.use(requireAuth);

const d = (v: any): Date => (v ? new Date(v) : new Date());

// EXPORT — JSON com todos os dados estruturados do usuário (portabilidade/LGPD/backup)
router.get('/export', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const [patients, exams, measurements, vaccines, expenses, reminders, analyses] = await Promise.all([
      prisma.patient.findMany({ where: { id: { in: pids } } }),
      prisma.exam.findMany({ where: { patientId: { in: pids } }, include: { items: true } }),
      prisma.measurement.findMany({ where: { patientId: { in: pids } } }),
      prisma.vaccine.findMany({ where: { patientId: { in: pids } } }),
      prisma.expense.findMany({ where: { patientId: { in: pids } } }),
      prisma.reminder.findMany({ where: { patientId: { in: pids } } }),
      prisma.aiAnalysis.findMany({ where: { patientId: { in: pids }, type: 'SUMMARY' }, select: { type: true, contentMd: true, createdAt: true } }),
    ]);
    res.setHeader('Content-Disposition', 'attachment; filename="meus-exames-backup.json"');
    res.json({ exportedAt: new Date().toISOString(), app: 'Meus Exames', version: 1, patients, exams, measurements, vaccines, expenses, reminders, analyses });
  } catch (e) { next(e); }
});

// IMPORT — recria os dados do JSON exportado na conta do usuário (novos IDs)
router.post('/import', async (req: AuthedRequest, res, next) => {
  try {
    const data = req.body;
    if (!data?.patients || !Array.isArray(data.patients)) { res.status(400).json({ error: 'JSON inválido (esperado { patients, exams, ... })' }); return; }
    const uid = req.userId!;
    const counts = { patients: 0, exams: 0, items: 0, measurements: 0, vaccines: 0, expenses: 0, reminders: 0 };
    const pidMap = new Map<string, string>();
    for (const p of data.patients) {
      const np = await prisma.patient.create({ data: { ownerId: uid, fullName: String(p.fullName ?? 'Importado'), relationship: p.relationship ?? null, dateOfBirth: p.dateOfBirth ? d(p.dateOfBirth) : null, clinicalProfile: p.clinicalProfile ?? null, phone: p.phone ?? null, gender: p.gender ?? null } });
      pidMap.set(p.id, np.id); counts.patients++;
    }
    for (const e of (data.exams ?? [])) {
      const patientId = pidMap.get(e.patientId); if (!patientId) continue;
      const ne = await prisma.exam.create({ data: { patientId, title: String(e.title ?? 'Exame'), kind: ['LAB_PANEL', 'IMAGING', 'OTHER'].includes(e.kind) ? e.kind : 'OTHER', status: 'EXTRACTED', performedAt: e.performedAt ? d(e.performedAt) : null, sourceLab: e.sourceLab ?? null, pageCount: Number(e.pageCount) || 0, filePath: 'imported', fileSha256: 'import-' + crypto.randomUUID() } });
      counts.exams++;
      for (const it of (e.items ?? [])) {
        // SANEAMENTO na importação (auditoria 2026-08-17): flags de backups ANTIGOS entravam
        // verbatim (erradas de bugs passados). Recomputa com o reconcile atual quando há
        // valor+faixa; senão mantém a flag importada.
        let impFlag = it.flag ?? 'UNKNOWN'; let impAbn = !!it.isAbnormal;
        if (it.valueNumeric != null && it.refLow != null && it.refHigh != null) {
          const rec = reconcileScaleFlag(Number(it.valueNumeric), Number(it.refLow), Number(it.refHigh), it.unit ?? undefined);
          impFlag = rec.flag; impAbn = rec.isAbnormal;
        }
        await prisma.examItem.create({ data: { examId: ne.id, panel: it.panel ?? null, name: String(it.name ?? ''), nameCanonical: it.nameCanonical ?? String(it.name ?? ''), valueNumeric: it.valueNumeric ?? null, valueText: it.valueText ?? null, unit: it.unit ?? null, refLow: it.refLow ?? null, refHigh: it.refHigh ?? null, refText: it.refText ?? null, flag: impFlag, isAbnormal: impAbn, extractedPage: Number(it.extractedPage) || 1 } }).catch(() => {});
        counts.items++;
      }
    }
    for (const m of (data.measurements ?? [])) { const pid = pidMap.get(m.patientId); if (!pid) continue; await prisma.measurement.create({ data: { patientId: pid, type: m.type ?? 'OTHER', value: Number(m.value) || 0, valueSecondary: m.valueSecondary != null ? Number(m.valueSecondary) : null, unit: m.unit ?? '', measuredAt: d(m.measuredAt), note: m.note ?? null } }).catch(() => {}); counts.measurements++; }
    for (const v of (data.vaccines ?? [])) { const pid = pidMap.get(v.patientId); if (!pid) continue; await prisma.vaccine.create({ data: { patientId: pid, name: String(v.name ?? ''), dateApplied: d(v.dateApplied), nextDoseDate: v.nextDoseDate ? d(v.nextDoseDate) : null, lot: v.lot ?? null, note: v.note ?? null } }).catch(() => {}); counts.vaccines++; }
    for (const x of (data.expenses ?? [])) { const pid = pidMap.get(x.patientId); if (!pid) continue; await prisma.expense.create({ data: { patientId: pid, ownerId: uid, description: String(x.description ?? ''), category: x.category ?? 'Outro', amount: Number(x.amount) || 0, spentAt: d(x.spentAt) } }).catch(() => {}); counts.expenses++; }
    for (const r of (data.reminders ?? [])) { const pid = pidMap.get(r.patientId); if (!pid) continue; await prisma.reminder.create({ data: { patientId: pid, ownerId: uid, title: String(r.title ?? ''), dueDate: d(r.dueDate), note: r.note ?? null, done: !!r.done } }).catch(() => {}); counts.reminders++; }
    res.json({ ok: true, counts });
  } catch (e) { next(e); }
});

export default router;
