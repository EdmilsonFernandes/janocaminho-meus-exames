import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { emailTemplate } from '../utils/emailTemplate';

const router = Router();
router.use(requireAuth);

/** Preparo de consulta: gera 1 página HTML otimizada para o médico (30s de leitura). */
router.post('/exams/:examId', async (req: AuthedRequest, res, next) => {
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: String(req.params.examId) },
      include: {
        items: { where: { isAbnormal: true }, orderBy: { name: 'asc' }, take: 10 },
        patient: { select: { fullName: true, dateOfBirth: true, clinicalProfile: true } },
      },
    });
    if (!exam) { res.status(404).json({ error: 'Exame não encontrado' }); return; }

    const prior = await prisma.exam.findFirst({
      where: { patientId: exam.patientId, status: 'EXTRACTED', id: { not: exam.id }, kind: 'LAB_PANEL' },
      orderBy: { performedAt: 'desc' },
      include: { items: { where: { isAbnormal: true } } },
    });

    const age = exam.patient?.dateOfBirth
      ? Math.floor((Date.now() - new Date(exam.patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
      : null;

    const date = exam.performedAt ? new Date(exam.performedAt).toLocaleDateString('pt-BR') : 's/d';
    const name = (exam.rawExtraction as any)?.patientName ?? exam.patient?.fullName ?? 'Paciente';
    const lab = exam.sourceLab ?? (exam.rawExtraction as any)?.sourceLab ?? '';
    const doctor = (exam.rawExtraction as any)?.requestingDoctor ?? '';
    const profile = exam.patient?.clinicalProfile ?? '';

    const concernsHtml = exam.items.map((i, idx) =>
      `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee"><b>${i.name}</b></td><td style="padding:6px 8px;border-bottom:1px solid #eee">${i.valueText ?? '—'}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${i.refText ?? [i.refLow, i.refHigh].filter(x=>x!=null).join('-') ?? '—'}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;color:${i.flag==='HIGH'?'#d32f2f':i.flag==='LOW'?'#e65100':'#666'};font-weight:700">${i.flag}</td></tr>`
    ).join('');

    const priorHtml = prior ? `<p style="font-size:12px;color:#666;margin:4px 0">Comparado com exame anterior: ${prior.title} (${prior.performedAt ? new Date(prior.performedAt).toLocaleDateString('pt-BR') : 's/d'})</p>` : '';

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Preparo de Consulta — ${name}</title>
      <style>body{font-family:Segoe UI,Arial,sans-serif;padding:30px;max-width:720px;margin:auto;color:#15233b}
      h1{font-size:20px;margin:0 0 4px;color:#336886}h2{font-size:14px;margin:18px 0 6px;color:#336886;border-bottom:2px solid #336886;padding-bottom:3px}
      table{width:100%;border-collapse:collapse;font-size:13px}.info{font-size:13px;color:#555;margin:2px 0}
      .highlight{background:#fff3e0;padding:10px;border-radius:6px;margin:8px 0}</style></head><body>
      <h1>📋 Preparo de Consulta</h1>
      <p class="info"><b>Paciente:</b> ${name}${age ? ` (${age} anos)` : ''}</p>
      <p class="info"><b>Exame:</b> ${exam.title} — ${date}${lab ? ` • ${lab}` : ''}${doctor ? ` • Dr: ${doctor}` : ''}</p>
      ${profile ? `<div class="highlight"><b>Perfil clínico:</b> ${profile}</div>` : ''}
      ${priorHtml}
      <h2>🚩 Valores fora da faixa (${exam.items.length})</h2>
      <table><tr style="background:#eef3fb"><th style="padding:6px 8px;text-align:left">Exame</th><th style="padding:6px 8px;text-align:left">Resultado</th><th style="padding:6px 8px;text-align:left">Referência</th><th style="padding:6px 8px;text-align:left">Status</th></tr>${concernsHtml || '<tr><td colspan=4 style="padding:12px;text-align:center;color:#2e7d32">✅ Todos os valores dentro da faixa</td></tr>'}</table>
      <h2>📝 Observações</h2>
      <p style="font-size:13px;color:#666">Documento gerado automaticamente pelo app Meus Exames. Análise educativa — não substitui avaliação médica.</p>
      </body></html>`;

    if (req.query.html) { res.type('html').send(html); return; }
    res.json({ html, url: `${req.protocol}://${req.get('host')}/api/consulta/exams/${exam.id}?html=1` });
  } catch (e) { next(e); }
});

export default router;
