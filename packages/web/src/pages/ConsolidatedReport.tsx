import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button, CircularProgress, Stack, Alert, Grid, Chip } from '@mui/material';
import { Title } from 'react-admin';
import DescriptionIcon from '@mui/icons-material/Description';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MedicationIcon from '@mui/icons-material/Medication';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import LiveHelpIcon from '@mui/icons-material/LiveHelp';
import InsightsIcon from '@mui/icons-material/Insights';
import { API_URL, apiHeaders } from '../config';
import { speakText, stopSpeakText } from '../utils/nativeDoc';
import { useSelectedPatient } from '../patient-context';
import { ShareDialog } from '../components/ShareDialog';
import { BootSplash } from '../components/BootSplash';
import { CreditBadge, CREDIT_COSTS } from '../components/CreditBadge';
import { ConfirmSpend } from '../components/ConfirmSpend';
import { DocPreview } from '../components/DocPreview';
import { ReportHero } from '../components/report/ReportHero';
import { ReportSectionCard } from '../components/report/ReportSectionCard';
import { DestaqueCard } from '../components/report/DestaqueCard';
import { MetaCard } from '../components/report/MetaCard';

interface Summary {
  resumoGeral?: string;
  comparativo?: { name: string; anterior?: string | null; atual?: string | null; leitura?: string | null; entenda?: string | null }[];
  pontosAtencao?: { titulo: string; detalhe: string }[];
  coisasBoas?: string[];
  leituraFinal?: string;
  perguntasParaOMedico?: string[];
  interacoesMedicamentos?: { medicamento: string; analito: string; observacao: string }[];
  sugestoesNutricao?: string[];
  metasSaude?: { analito: string; meta: string; prazo?: string | null }[];
  disclaimer?: string;
}
interface SourceExam { id: string; title: string; performedAt: string | null; sourceLab: string | null; kind: string }

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : 's/d');

export const ConsolidatedReportPage = () => {
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [error, setError] = useState('');
  const [shareOpen, setShareOpen] = useState(false);

  // Carrega o ÚLTIMO relatório salvo ao entrar (não repensa a cada visita — economiza créditos)
  useEffect(() => {
    if (!pid) return;
    fetch(`${API_URL}/analyses/consolidated/latest?patientId=${pid}`, { headers: apiHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.analysis) setAnalysis({ ...d.analysis, sourceExams: d.sourceExams ?? [] }); })
      .catch(() => {});
  }, [pid]);

  const [confirmSpend, setConfirmSpend] = useState<{ open: boolean; onYes: () => void }>({ open: false, onYes: () => {} });
  const generate = (force = false) => {
    if (!pid) return;
    if (force) {
      setConfirmSpend({ open: true, onYes: () => { setConfirmSpend(s => ({ ...s, open: false })); doGenerate(true); } });
      return;
    }
    doGenerate(false);
  };
  const doGenerate = (force: boolean) => {
    setLoading(true);
    setError('');
    fetch(`${API_URL}/analyses/consolidated`, {
      method: 'POST', headers: apiHeaders(true), body: JSON.stringify({ patientId: pid, force }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Falha ao gerar relatório');
        return r.json();
      })
      .then((a) => setAnalysis(a))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const asArr = (x: any): any[] => (Array.isArray(x) ? x : x == null ? [] : [x]);
  const txt = (x: any): string => typeof x === 'string' ? x : (x?.texto || x?.titulo || x?.detalhe || x?.name || (x && typeof x === 'object' ? JSON.stringify(x) : String(x ?? '')));
  const s: Summary | undefined = analysis?.structured
    ? {
        ...analysis.structured,
        comparativo: asArr(analysis.structured.comparativo),
        pontosAtencao: asArr(analysis.structured.pontosAtencao),
        coisasBoas: asArr(analysis.structured.coisasBoas),
        perguntasParaOMedico: asArr(analysis.structured.perguntasParaOMedico),
        interacoesMedicamentos: asArr(analysis.structured.interacoesMedicamentos),
        sugestoesNutricao: asArr(analysis.structured.sugestoesNutricao),
        metasSaude: asArr(analysis.structured.metasSaude),
      }
    : undefined;
  const sourceExams: SourceExam[] = analysis?.sourceExams ?? [];

  /** Imprime/salva PDF premium — mostra num preview DENTRO do app (DocPreview),
   *  sem window.open (que é bloqueado no PWA mobile). HTML próprio, independente do React. */
  const [docHtml, setDocHtml] = useState('');
  const [docOpen, setDocOpen] = useState(false);
  const speak = () => {
    const text = s?.resumoGeral;
    if (!text) return;
    if (speaking) { stopSpeakText(); setSpeaking(false); }
    else { speakText(text, { onDone: () => setSpeaking(false), onFail: () => setSpeaking(false) }); setSpeaking(true); }
  };
  const printReport = () => {
    const esc = (str?: string) => (str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    const examList = sourceExams
      .map((e) => `<li><b>${esc(e.title)}</b>${e.performedAt ? ' — ' + fmtDate(e.performedAt) : ''}${e.sourceLab ? ' • ' + esc(e.sourceLab) : ''}</li>`)
      .join('');
    const comp = (s?.comparativo ?? []).map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.anterior ?? '—')}</td><td><b>${esc(c.atual ?? '—')}</b></td><td>${esc(c.leitura ?? '')}</td></tr>`).join('');
    const atencao = (s?.pontosAtencao ?? []).map((p) => `<li><b>${esc(p.titulo)}</b> — ${esc(p.detalhe)}</li>`).join('');
    const boas = (s?.coisasBoas ?? []).map((b) => `<li>${esc(txt(b))}</li>`).join('');
    const nut = (s?.sugestoesNutricao ?? []).map((b) => `<li>${esc(txt(b))}</li>`).join('');
    const metas = (s?.metasSaude ?? []).map((m) => `<li><b>${esc(m.analito)}</b>: ${esc(m.meta)}${m.prazo ? ` (${esc(m.prazo)})` : ''}</li>`).join('');
    const inter = (s?.interacoesMedicamentos ?? []).map((m) => `<li><b>${esc(m.medicamento)}</b> × ${esc(m.analito)}: ${esc(m.observacao)}</li>`).join('');
    const perg = (s?.perguntasParaOMedico ?? []).map((q) => `<li>${esc(txt(q))}</li>`).join('');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de Saúde</title>
<style>
*{box-sizing:border-box}body{font-family:'Inter','Segoe UI',Arial,sans-serif;color:#2d3748;background:#eef7f6;margin:0;padding:32px;line-height:1.6}
.doc{max-width:760px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 6px 30px rgba(32,178,170,.18)}
.head{background:linear-gradient(135deg,#20b2aa,#178f89);color:#fff;padding:28px 32px}
.head h1{margin:0;font-size:24px;font-weight:800;font-family:'Poppins',Arial,sans-serif}.head p{margin:4px 0 0;opacity:.9;font-size:13px}
.body{padding:28px 32px}
.base{background:#e6f7f6;border-left:4px solid #20b2aa;border-radius:10px;padding:14px 16px;margin-bottom:18px;font-size:13px}
.base b{color:#178f89}
h2{font-size:15px;color:#178f89;margin:22px 0 8px;border-bottom:2px solid #e6f1f0;padding-bottom:4px;font-family:'Poppins',Arial,sans-serif}
ul,ol{margin:6px 0;padding-left:22px}li{margin:4px 0;font-size:14px}
table{border-collapse:collapse;width:100%;font-size:13px;margin-top:6px}
td,th{border:1px solid #dceaea;padding:7px 9px;text-align:left}th{background:#e6f7f6;font-weight:700;color:#178f89}
.foot{text-align:center;color:#718096;font-size:11px;padding:16px}
</style></head><body>
<div class="doc">
  <div class="head"><h1>Relatório de Saúde</h1><p>Análise educativa consolidada — não substitui consulta médica</p></div>
  <div class="body">
    ${examList ? `<div class="base"><b>Relatório baseado em ${sourceExams.length} exame(s):</b><ul style="margin:6px 0 0">${examList}</ul></div>` : ''}
    ${s?.resumoGeral ? `<h2>Resumo geral</h2><p>${esc(s.resumoGeral)}</p>` : ''}
    ${comp ? `<h2>Itens em destaque</h2><table><tr><th>Exame</th><th>Anterior</th><th>Atual</th><th>Variação</th></tr>${comp}</table>` : ''}
    ${atencao ? `<h2>🚩 Pontos de atenção</h2><ul>${atencao}</ul>` : ''}
    ${boas ? `<h2>✅ Pontos positivos</h2><ul>${boas}</ul>` : ''}
    ${inter ? `<h2>💊 Interações com medicação</h2><ul>${inter}</ul>` : ''}
    ${nut ? `<h2>🥗 Sugestões de nutrição</h2><ul>${nut}</ul>` : ''}
    ${metas ? `<h2>🎯 Metas</h2><ul>${metas}</ul>` : ''}
    ${s?.leituraFinal ? `<h2>Leitura final</h2><p>${esc(s.leituraFinal)}</p>` : ''}
    ${perg ? `<h2>🩺 Perguntas para o médico</h2><ol>${perg}</ol>` : ''}
    <div class="foot">${esc(s?.disclaimer || 'Análise educativa gerada por IA. A interpretação final deve ser feita por profissional de saúde.')}</div>
  </div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
    setDocHtml(html);
    setDocOpen(true);
  };

  const counts = { itens: s?.comparativo?.length ?? 0, atencao: s?.pontosAtencao?.length ?? 0, positivos: s?.coisasBoas?.length ?? 0 };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 920, mx: 'auto', overflowX: 'hidden' }}>
      <Title title="Relatório completo" />
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 800 }}>🧾 Relatório completo de saúde</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        A IA junta seus últimos exames (sangue, imagem e laudo) num documento único — ótimo para levar ao médico ou pedir segunda opinião documental.
      </Typography>

      {!analysis && (
        <>
          <Button variant="contained" size="large" startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <DescriptionIcon />} onClick={() => generate(false)} disabled={loading || !pid}>
            {loading ? 'Gerando...' : 'Gerar relatório completo'}
          </Button>{' '}
          <CreditBadge amount={CREDIT_COSTS.consolidated} />
        </>
      )}
      {!pid && <Typography color="text.secondary" sx={{ mt: 1 }}>Selecione um perfil no topo para gerar o relatório.</Typography>}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {analysis && s && (
        <Stack spacing={2} sx={{ mt: 2 }}>
          <ReportHero
            resumo={s.resumoGeral}
            counts={counts}
            speaking={speaking}
            loading={loading}
            onSpeak={speak}
            onShare={() => setShareOpen(true)}
            onPrint={printReport}
            onRegen={() => generate(true)}
          />

          {sourceExams.length > 0 && (
            <ReportSectionCard icon={<DescriptionIcon />} title="Baseado nos exames" accent="#20b2aa" count={sourceExams.length}>
              <Stack spacing={0.5} useFlexGap>
                {sourceExams.map((e, i) => (
                  <Box key={i} onClick={() => navigate(`/exams/${e.id}/show`)} sx={{ cursor: 'pointer', '&:hover': { opacity: 0.8 } }}>
                    <Typography variant="body2" sx={{ wordBreak: 'break-word', overflowWrap: 'anywhere', color: 'primary.main', fontWeight: 600, lineHeight: 1.35 }}>
                      📄 {e.title}{e.performedAt ? ` — ${fmtDate(e.performedAt)}` : ''}{e.sourceLab ? ` • ${e.sourceLab}` : ''}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </ReportSectionCard>
          )}

          {s.comparativo?.length ? (
            <ReportSectionCard icon={<InsightsIcon />} title="Itens em destaque" accent="#0b5cab" count={s.comparativo.length}>
              <Grid container spacing={1.5}>
                {s.comparativo.map((c, i) => <Grid key={i} size={{ xs: 12, md: 6 }}><DestaqueCard c={c} /></Grid>)}
              </Grid>
            </ReportSectionCard>
          ) : null}

          {s.pontosAtencao?.length ? (
            <ReportSectionCard icon={<ReportProblemIcon />} title="Pontos de atenção" accent="#ef4444" count={s.pontosAtencao.length}>
              <Stack spacing={1.25}>
                {s.pontosAtencao.map((p, i) => (
                  <Box key={i}>
                    <Typography sx={{ fontWeight: 700 }}>{i + 1}. {p.titulo}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, wordBreak: 'break-word' }}>{p.detalhe}</Typography>
                  </Box>
                ))}
              </Stack>
            </ReportSectionCard>
          ) : null}

          {s.coisasBoas?.length ? (
            <ReportSectionCard icon={<CheckCircleIcon />} title="Pontos positivos" accent="#10b981" count={s.coisasBoas.length}>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {s.coisasBoas.map((b, i) => <Chip key={i} sx={{ bgcolor: '#10b98118', color: '#10b981', fontWeight: 600 }} label={txt(b)} />)}
              </Stack>
            </ReportSectionCard>
          ) : null}

          {s.interacoesMedicamentos?.length ? (
            <ReportSectionCard icon={<MedicationIcon />} title="Interações com medicação" accent="#f59e0b" count={s.interacoesMedicamentos.length}>
              <Stack spacing={1}>
                {s.interacoesMedicamentos.map((m, i) => (
                  <Box key={i} sx={{ p: 1.5, borderRadius: '12px', bgcolor: '#f59e0b0d', border: '1px solid #f59e0b26' }}>
                    <Typography sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{m.medicamento} <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>× {m.analito}</Box></Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{m.observacao}</Typography>
                  </Box>
                ))}
              </Stack>
            </ReportSectionCard>
          ) : null}

          {s.sugestoesNutricao?.length ? (
            <ReportSectionCard icon={<RestaurantIcon />} title="Sugestões de nutrição" accent="#16a34a" count={s.sugestoesNutricao.length}>
              <Stack spacing={0.5}>
                {s.sugestoesNutricao.map((b, i) => <Typography key={i} variant="body2" sx={{ py: 0.25, wordBreak: 'break-word' }}>🥗 {txt(b)}</Typography>)}
              </Stack>
            </ReportSectionCard>
          ) : null}

          {s.metasSaude?.length ? (
            <ReportSectionCard icon={<TrackChangesIcon />} title="Metas de saúde" accent="#0288d1" count={s.metasSaude.length}>
              <Grid container spacing={1.5}>
                {s.metasSaude.map((m, i) => <Grid key={i} size={{ xs: 12, md: 6 }}><MetaCard m={m} /></Grid>)}
              </Grid>
            </ReportSectionCard>
          ) : null}

          {s.perguntasParaOMedico?.length ? (
            <ReportSectionCard icon={<LiveHelpIcon />} title="Perguntas para levar ao médico" accent="#7b1fa2" count={s.perguntasParaOMedico.length}>
              <Stack spacing={0.75}>
                {s.perguntasParaOMedico.map((q, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ width: 18, height: 18, borderRadius: '4px', border: '2px solid #7b1fa2', flexShrink: 0, mt: '2px' }} />
                    <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{txt(q)}</Typography>
                  </Box>
                ))}
              </Stack>
            </ReportSectionCard>
          ) : null}

          {s.leituraFinal && (
            <Box sx={{ p: 2.5, borderRadius: '16px', background: 'linear-gradient(135deg, rgba(11,92,171,.10), rgba(11,92,171,.04))', border: '1px solid', borderColor: 'divider' }}>
              <Typography sx={{ fontWeight: 800, color: '#0b5cab', mb: 0.5, fontFamily: '"Poppins",sans-serif' }}>📌 Leitura final</Typography>
              <Typography sx={{ lineHeight: 1.7, wordBreak: 'break-word' }}>{s.leituraFinal}</Typography>
            </Box>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
            {s.disclaimer || 'Análise educativa gerada por IA a partir dos seus exames. A interpretação final deve ser feita por profissional de saúde.'}
          </Typography>
        </Stack>
      )}
      <ShareDialog analysisId={analysis?.id} open={shareOpen} onClose={() => setShareOpen(false)} />
      <DocPreview html={docHtml} open={docOpen} onClose={() => setDocOpen(false)} title="Relatório de Saúde" />
      <ConfirmSpend open={confirmSpend.open} credits={CREDIT_COSTS.consolidated} title="Gerar novo relatório"
        desc="Vamos analisar seus exames mais recentes com a IA e gerar um relatório completo."
        onClose={() => setConfirmSpend(s => ({ ...s, open: false }))} onConfirm={confirmSpend.onYes} />
      {loading && <BootSplash title="Gerando seu relatório" messages={['Analisando seu histórico de exames…', 'Cruzando dados laboratoriais…', 'Identificando tendências…', 'Preparando insights…']} />}
    </Box>
  );
};
