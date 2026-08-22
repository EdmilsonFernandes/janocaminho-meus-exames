import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import { Readable } from 'stream';
import { ZipArchive } from 'archiver';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { reconcileScaleFlag } from '../utils/normalize';
import { resolveExamFile, patientSlug } from '../utils/storage';

const router = Router();
router.use(requireAuth);

const d = (v: any): Date => (v ? new Date(v) : new Date());

/** Reúne todos os dados estruturados do usuário (base do /export e do /export-all). */
async function gatherExportData(userId: string) {
  const pids = await userPatientIds(userId);
  const [patients, exams, measurements, vaccines, expenses, reminders, analyses, medications] = await Promise.all([
    prisma.patient.findMany({ where: { id: { in: pids } } }),
    prisma.exam.findMany({ where: { patientId: { in: pids } }, include: { items: true } }),
    prisma.measurement.findMany({ where: { patientId: { in: pids } } }),
    prisma.vaccine.findMany({ where: { patientId: { in: pids } } }),
    prisma.expense.findMany({ where: { patientId: { in: pids } } }),
    prisma.reminder.findMany({ where: { patientId: { in: pids } } }),
    prisma.aiAnalysis.findMany({ where: { patientId: { in: pids }, type: 'SUMMARY' }, select: { type: true, contentMd: true, createdAt: true } }),
    prisma.medication.findMany({ where: { patientId: { in: pids } } }),
  ]);
  return { exportedAt: new Date().toISOString(), app: 'Meus Exames', version: 1, patients, exams, measurements, vaccines, expenses, reminders, analyses, medications };
}

// EXPORT — JSON com todos os dados estruturados do usuário (portabilidade/LGPD/backup)
router.get('/export', async (req: AuthedRequest, res, next) => {
  try {
    res.setHeader('Content-Disposition', 'attachment; filename="meus-exames-backup.json"');
    res.json(await gatherExportData(req.userId!));
  } catch (e) { next(e); }
});

// EXPORT-ALL — ZIP "baixe tudo em 1 clique" (LGPD art. 18, II — portabilidade):
// dados.json + LEIA-ME + Relatorios/*.md legíveis + PDFs originais (disco ou S3).
// Rate-limit 5 min por usuário (o zip percorre todos os arquivos).
const exportAllAt = new Map<string, number>();
router.get('/export-all', async (req: AuthedRequest, res, next) => {
  try {
    const uid = req.userId!;
    if (Date.now() - (exportAllAt.get(uid) ?? 0) < 5 * 60 * 1000) { res.status(429).json({ error: 'Aguarde alguns minutos antes de gerar outro pacote completo.' }); return; }
    exportAllAt.set(uid, Date.now());

    const data = await gatherExportData(uid);
    const analysesAll = await prisma.aiAnalysis.findMany({
      where: { patientId: { in: data.patients.map((p) => p.id) } },
      select: { type: true, contentMd: true, createdAt: true, patientId: true },
      orderBy: { createdAt: 'asc' },
    });
    const patientName = (pid: string) => data.patients.find((p) => p.id === pid)?.fullName ?? 'paciente';

    // archiver v8: API de classe (new ZipArchive) — não é mais função callable.
    const zip = new ZipArchive({ zlib: { level: 6 } });
    zip.on('warning', () => {}); // arquivo individual faltando não derruba o pacote
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="meus-exames-completo-${new Date().toISOString().slice(0, 10)}.zip"`);
    zip.pipe(res);

    zip.append(JSON.stringify(data, null, 2), { name: 'dados.json' });
    zip.append([
      '# Meus Exames — seu pacote completo',
      '',
      `Gerado em ${data.exportedAt}. Este ZIP contém TODOS os seus dados (direito de portabilidade — LGPD art. 18, II):`,
      '',
      '- `dados.json` — tudo estruturado (perfis, exames com valores, medições, vacinas, despesas, lembretes, análises). Formato aberto.',
      '- `Relatorios/` — seus relatórios/interpretações em Markdown, legíveis em qualquer editor.',
      '- `Exames-PDF/` — os arquivos ORIGINAIS que você enviou.',
      '',
      'Para restaurar numa conta do Meus Exames: Perfil → Seus dados → Importar (usa o `dados.json`).',
      'Conteúdo educativo — não substitui consulta médica.',
      '',
    ].join('\n'), { name: 'LEIA-ME.md' });

    for (const a of analysesAll) {
      if (!a.contentMd || !a.patientId) continue;
      const dt = a.createdAt.toISOString().slice(0, 10);
      const tipo = (a.type ?? 'analise').toLowerCase();
      zip.append(`# ${a.type ?? 'Análise'} — ${patientName(a.patientId)} (${dt})\n\n${a.contentMd}\n`, { name: `Relatorios/${dt}-${tipo}-${patientSlug(patientName(a.patientId), a.patientId)}.md` });
    }

    for (const e of data.exams) {
      if (!e.filePath) continue;
      try {
        const r = await resolveExamFile(e.filePath);
        const dt = (e.performedAt ? new Date(e.performedAt) : new Date(e.createdAt)).toISOString().slice(0, 10);
        const name = `Exames-PDF/${dt}-${patientSlug(patientName(e.patientId), e.patientId)}-${e.id.slice(-6)}.pdf`;
        if (r.kind === 'file' && fs.existsSync(r.file as string)) zip.append(fs.createReadStream(r.file as string), { name });
        else if (r.kind === 'url') {
          const resp = await fetch(r.url as string);
          if (resp.ok && resp.body) zip.append(Readable.fromWeb(resp.body as never), { name });
        }
      } catch { /* arquivo individual ausente: pula, não quebra o pacote */ }
    }

    await zip.finalize();
  } catch (e) { next(e); }
});

// IMPORT — recria os dados do JSON exportado na conta do usuário (novos IDs)
router.post('/import', async (req: AuthedRequest, res, next) => {
  try {
    const data = req.body;
    if (!data?.patients || !Array.isArray(data.patients)) { res.status(400).json({ error: 'JSON inválido (esperado { patients, exams, ... })' }); return; }
    const uid = req.userId!;
    const counts = { patients: 0, exams: 0, items: 0, measurements: 0, vaccines: 0, expenses: 0, reminders: 0, medications: 0 };
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
    for (const m of (data.medications ?? [])) { const pid = pidMap.get(m.patientId); if (!pid) continue; await prisma.medication.create({ data: { patientId: pid, name: String(m.name ?? 'Remédio'), dosage: m.dosage ?? null, frequency: m.frequency ?? null, active: m.active !== false, notes: m.notes ?? null } }).catch(() => {}); counts.medications++; }
    res.json({ ok: true, counts });
  } catch (e) { next(e); }
});

export default router;
