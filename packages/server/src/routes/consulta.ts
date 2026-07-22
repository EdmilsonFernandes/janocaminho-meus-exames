import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { describeStaleness } from '../analysis/health-state';

const router = Router();
router.use(requireAuth);

/** Preparo de consulta: gera 1 página HTML profissional para o médico. */
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

    const concernsHtml = exam.items.map((i) =>
      `<tr><td style="padding:8px 10px;border-bottom:1px solid #e8e8e8"><b>${i.name}</b></td><td style="padding:8px 10px;border-bottom:1px solid #e8e8e8">${i.valueText ?? '—'}</td><td style="padding:8px 10px;border-bottom:1px solid #e8e8e8;color:#888">${i.refText ?? [i.refLow, i.refHigh].filter(x=>x!=null).join('-') ?? '—'}</td><td style="padding:8px 10px;border-bottom:1px solid #e8e8e8;font-weight:700;color:${i.flag==='HIGH'?'#d32f2f':i.flag==='LOW'?'#e65100':'#666'}">${i.flag === 'HIGH' ? '↑ Acima' : i.flag === 'LOW' ? '↓ Abaixo' : i.flag}</td></tr>`
    ).join('');

    // Guarda temporal: exame ANTIGO → não compara com outro antigo (em 2026, "evolução" 2018 vs 2017 é enganosa).
    const examStale = describeStaleness(exam.performedAt);
    const priorDate = prior?.performedAt ? new Date(prior.performedAt).toLocaleDateString('pt-BR') : 's/d';
    let priorHtml = '';
    if (prior) {
      if (examStale.isStale) {
        priorHtml = ''; // exame antigo: omite "comparado com" (outro antigo não é evolução válida)
      } else {
        const priorStale = describeStaleness(prior.performedAt);
        const gapMo = Math.abs((examStale.ageMo ?? 0) - (priorStale.ageMo ?? 0));
        priorHtml = (priorStale.isStale || gapMo > 18)
          ? `<p style="font-size:12px;color:#888;margin:6px 0">Exame anterior (${prior.title}, ${priorDate}) é antigo — comparação limitada; leve também exames recentes.</p>`
          : `<p style="font-size:12px;color:#888;margin:6px 0">Comparado com: ${prior.title} (${priorDate}) — ${prior.items.length} valor(es) alterado(s) no exame anterior</p>`;
      }
    }
    const bannerHtml = (examStale.isStale && examStale.label)
      ? `<div style="background:#fff3e0;border-left:4px solid #f59e0b;border-radius:8px;padding:12px;margin:8px 0 14px;font-size:13px">⏳ <b>Exame de ${date} (${examStale.label}).</b> Apresente ao médico como <b>histórico</b> — pode não refletir seu estado de saúde atual. Considere refazer os exames.</div>`
      : '';

    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preparo de Consulta — ${name}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #15233b; background: #f8fafc; padding: 16px; }
        .doc { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
        .header { background: linear-gradient(135deg, #20b2aa, #178f89); color: #fff; padding: 24px 28px; }
        .header h1 { font-size: 22px; font-weight: 800; }
        .header .sub { font-size: 13px; opacity: .85; margin-top: 2px; }
        .body { padding: 20px 24px; }
        .patient-box { background: #f0f7ff; border-radius: 10px; padding: 16px; margin-bottom: 20px; border-left: 4px solid #20b2aa; }
        .patient-box p { font-size: 14px; margin: 2px 0; word-break: break-word; }
        .section-title { font-size: 15px; font-weight: 700; color: #178f89; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #20b2aa; }
        .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 400px; }
        th { background: #e6f7f6; padding: 8px 10px; text-align: left; font-weight: 700; color: #178f89; word-break: break-word; }
        td { padding: 8px 10px; word-break: break-word; vertical-align: top; }
        .highlight { background: #fff8e1; border-radius: 8px; padding: 12px; margin: 8px 0; font-size: 13px; word-break: break-word; }
        .footer { text-align: center; padding: 16px; font-size: 11px; color: #aaa; }
        @media print { body { background: #fff; padding: 0; } .doc { box-shadow: none; max-width: 100%; } }
      </style></head><body>
      <div class="doc">
        <div class="header">
          <h1>📋 Preparo de Consulta</h1>
          <div class="sub">Meus Exames — documento gerado para o médico assistente</div>
        </div>
        <div class="body">
          <div class="patient-box">
            <p><b>👤 Paciente:</b> ${name}${age ? ` (${age} anos)` : ''}</p>
            <p><b>🧪 Exame:</b> ${exam.title} — ${date}${lab ? ` • Laboratório: ${lab}` : ''}${doctor ? ` • Solicitante: Dr. ${doctor}` : ''}</p>
            ${profile ? `<p><b>💊 Perfil clínico:</b> ${profile}</p>` : ''}
          </div>
          ${bannerHtml}
          ${priorHtml}
          <div class="section-title">🚩 Valores fora da faixa (${exam.items.length})</div>
          <div class="table-wrap">
          <table>
            <tr><th>Exame</th><th>Resultado</th><th>Referência</th><th>Status</th></tr>
            ${concernsHtml || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#2e7d32">✅ Todos os valores dentro da faixa de referência</td></tr>'}
          </table>
          </div>
          <div class="section-title">📝 Observações</div>
          <div class="highlight">Este documento foi gerado automaticamente pelo app <b>Meus Exames</b>. Os valores foram extraídos por IA a partir do PDF do exame. Análise educativa — não substitui avaliação médica.</div>
        </div>
        <div class="footer">Meus Exames • Análise educativa de saúde • meus-exames.app</div>
      </div>
      </body></html>`;

    res.json({ html });
  } catch (e) { next(e); }
});

export default router;
