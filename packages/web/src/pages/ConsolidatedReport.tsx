import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button, CircularProgress, Stack, Alert, Grid, Chip, Checkbox } from '@mui/material';
import { Title } from 'react-admin';
import DescriptionIcon from '@mui/icons-material/Description';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MedicationIcon from '@mui/icons-material/Medication';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import LiveHelpIcon from '@mui/icons-material/LiveHelp';
import InsightsIcon from '@mui/icons-material/Insights';
import { API_URL, apiHeaders, token } from '../config';
import { hapticSuccess, hapticError } from '../utils/haptic';
import { bumpCredits } from '../utils/credits-events';
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
import type { SourceExam } from '@meus-exames/shared';

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : 's/d');

const ReportPreviewCard = ({
  loading,
  disabled,
  onGenerate,
  onExams,
}: {
  loading: boolean;
  disabled: boolean;
  onGenerate: () => void;
  onExams: () => void;
}) => {
  const items = [
    { icon: <ReportProblemIcon />, title: 'Prioridades clínicas', desc: 'Valores alterados e pontos que merecem atenção.', accent: '#ef4444' },
    { icon: <InsightsIcon />, title: 'Evolução dos exames', desc: 'Comparação entre resultados anteriores e atuais.', accent: '#0b5cab' },
    { icon: <LiveHelpIcon />, title: 'Perguntas para o médico', desc: 'Uma lista objetiva para levar na consulta.', accent: '#7b1fa2' },
    { icon: <CheckCircleIcon />, title: 'Pontos positivos', desc: 'O que está estável ou dentro da referência.', accent: '#059669' },
  ];

  return (
    <Box sx={{ mt: 2, p: { xs: 2, md: 2.5 }, borderRadius: 4, border: '1px solid', borderColor: 'rgba(32,178,170,.22)', background: 'linear-gradient(135deg, rgba(32,178,170,.12), rgba(255,255,255,.96))' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chip size="small" label="Preview do relatório" sx={{ height: 22, mb: 1, bgcolor: '#20b2aa18', color: '#178f89', fontWeight: 900 }} />
          <Typography sx={{ fontWeight: 900, fontSize: { xs: 22, md: 26 }, lineHeight: 1.12, color: '#12312f', fontFamily: 'Poppins, sans-serif' }}>
            Um resumo pronto para consulta, antes de abrir exame por exame
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.75, color: '#516362', maxWidth: 620, lineHeight: 1.55 }}>
            O Dr. Exame consolida seu histórico em linguagem simples, com prioridades, contexto e perguntas para discutir com o profissional de saúde.
          </Typography>
        </Box>
        <Stack spacing={1} alignItems={{ xs: 'stretch', md: 'flex-end' }} sx={{ flexShrink: 0 }}>
          <Button variant="contained" size="large" startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <DescriptionIcon />} onClick={onGenerate} disabled={disabled} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 900, bgcolor: '#178f89', boxShadow: 'none', '&:hover': { bgcolor: '#0f766e', boxShadow: 'none' } }}>
            {loading ? 'Gerando...' : 'Gerar relatório completo'}
          </Button>
          <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
            <CreditBadge amount={CREDIT_COSTS.consolidated} />
          </Box>
        </Stack>
      </Stack>

      <Grid container spacing={1.25} sx={{ mt: 2 }}>
        {items.map((item) => (
          <Grid key={item.title} size={{ xs: 12, sm: 6 }}>
            <Box sx={{ height: '100%', p: 1.5, borderRadius: 3, bgcolor: '#fff', border: '1px solid', borderColor: `${item.accent}26` }}>
              <Box sx={{ width: 34, height: 34, borderRadius: 2, display: 'grid', placeItems: 'center', color: item.accent, bgcolor: `${item.accent}14`, mb: 1 }}>
                {item.icon}
              </Box>
              <Typography sx={{ fontWeight: 800, color: '#12312f' }}>{item.title}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, lineHeight: 1.45 }}>{item.desc}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" sx={{ mt: 1.5, p: 1.25, borderRadius: 3, bgcolor: 'rgba(255,255,255,.72)' }}>
        <Typography variant="caption" sx={{ color: '#516362', fontWeight: 700 }}>
          Consome créditos somente ao gerar. Use quando quiser levar uma visão consolidada para consulta.
        </Typography>
        <Button size="small" onClick={onExams} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, textTransform: 'none', fontWeight: 800, borderRadius: 99, color: '#178f89' }}>
          Ver exames usados →
        </Button>
      </Stack>
    </Box>
  );
};

export const ConsolidatedReportPage = () => {
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [examCount, setExamCount] = useState<number | null>(null);

  // Conta exames do paciente — esconde o botão "Gerar" se não tem nenhum
  useEffect(() => {
    if (!pid) return;
    fetch(`${API_URL}/exams?_start=0&_end=1&patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => { setExamCount(Number(r.headers.get('X-Total-Count') ?? r.headers.get('content-range')?.split('/')?.[1] ?? '0')); })
      .catch(() => setExamCount(0));
  }, [pid]);
  const [error, setError] = useState('');
  const [noCredits, setNoCredits] = useState(false);
  const [noExams, setNoExams] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Frente C: tick das perguntas do relatório pra levar ao médico + envio (cria DoctorQuestion + email).
  const [tickQ, setTickQ] = useState<Record<number, boolean>>({});
  const [send, setSend] = useState<{ status: 'idle' | 'sending' | 'done' | 'error'; msg?: string }>({ status: 'idle' });
  const sendQuestionsToDoctor = async () => {
    const qs: string[] = (analysis?.structured?.perguntasParaOMedico ?? []) as string[];
    const picked = qs.map((q, i) => ({ q, i })).filter((x) => tickQ[x.i]);
    if (!picked.length || !pid) return;
    setSend({ status: 'sending' });
    try {
      const sr = await fetch(`${API_URL}/doctor-shares`, { headers: apiHeaders() });
      const sd = sr.ok ? await sr.json() : { items: [] };
      const shares: any[] = sd.items ?? sd ?? [];
      const active = shares.filter((x: any) => x.active !== false);
      if (!active.length) { hapticError(); setSend({ status: 'error', msg: 'Você ainda não compartilhou dados com nenhum médico. Vá em “Meus Médicos” e compartilhe antes.' }); return; }
      const doc = active[0];
      const doctorId = doc.doctorId ?? doc.doctor?.id;
      const doctorName = doc.doctor?.name ?? doc.name ?? 'seu médico';
      const body = picked.map((x) => `• ${x.q}`).join('\n');
      const r = await fetch(`${API_URL}/doctor-questions`, {
        method: 'POST', headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: pid, doctorId, subject: 'Perguntas do meu relatório consolidado', body }),
      });
      if (r.status === 402) { const d = await r.json().catch(() => ({})); hapticError(); setSend({ status: 'error', msg: d.message || 'Créditos insuficientes pra enviar agora.' }); return; }
      if (!r.ok) { hapticError(); setSend({ status: 'error', msg: 'Não foi possível enviar agora. Tente novamente.' }); return; }
      bumpCredits();
      hapticSuccess();
      setSend({ status: 'done', msg: `Perguntas enviadas ao Dr(a). ${doctorName}. Ele(a) recebeu por e-mail e no portal.` });
      setTickQ({});
    } catch { hapticError(); setSend({ status: 'error', msg: 'Sem conexão. Tente novamente.' }); }
  };

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
    setError(''); setNoCredits(false); setNoExams(false);
    fetch(`${API_URL}/analyses/consolidated`, {
      method: 'POST', headers: apiHeaders(true), body: JSON.stringify({ patientId: pid, force }),
    })
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.json().catch(() => ({}));
        if (r.status === 402) { setNoCredits(true); return null; }   // sem créditos → card premium (não "insufficient_credits" cru)
        if (r.status === 400) { setNoExams(true); return null; }     // sem exame → CTA enviar exame (não erro)
        throw new Error(body.message || body.error || 'Falha ao gerar relatório');
      })
      .then((a) => { if (a) { setAnalysis(a); bumpCredits(); } })   // atualiza o saldo do header (consolidated consome)
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

  // A IA às vezes devolve `interacoesMedicamentos` como string/objeto vazio — o asArr()
  // transforma num array de 1 elemento e a seção renderizava "× :" sem conteúdo. Só
  // exibimos interações REAIS (objeto com medicamento ou observação preenchidos).
  const interacoes = (s?.interacoesMedicamentos ?? []).filter(
    (m: any) => m && typeof m === 'object' && (String(m.medicamento || '').trim() || String(m.observacao || '').trim())
  );

  // Nome de laboratório pode vir corrompido da extração (ex.: "VOLPI ara Vol! Jnir...").
  // Trunca pra não dominar o card; o texto completo fica no tooltip (title). O fix raiz é
  // na extração (pdftotext), mas aqui evitamos estouro de layout.
  const trimLab = (lab?: string | null) => {
    if (!lab) return '';
    const v = lab.trim();
    return v.length > 42 ? `${v.slice(0, 42)}…` : v;
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 920, mx: 'auto', overflowX: 'hidden' }}>
      <Title title="Relatório completo" />
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 800 }}>🧾 Relatório completo de saúde</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        A IA junta seus últimos exames (sangue, imagem e laudo) num documento único — ótimo para levar ao médico ou pedir segunda opinião documental.
      </Typography>

      {!analysis && examCount === 0 && pid && (
        <Box sx={{ mt: 2, p: 4, borderRadius: 3, textAlign: 'center', bgcolor: 'background.paper', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <Box sx={{ fontSize: 56, mb: 1.5, opacity: 0.4 }}>📄</Box>
          <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 18, mb: 1 }}>Você ainda não tem exames</Typography>
          <Typography color="text.secondary" sx={{ mb: 2.5 }}>Envie seu primeiro exame de sangue, imagem ou laudo para gerar um relatório completo da sua saúde.</Typography>
          <Button variant="contained" onClick={() => navigate('/exams')} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 800, px: 4, bgcolor: '#178f89' }}>Enviar meu primeiro exame →</Button>
        </Box>
      )}
      {!analysis && examCount !== 0 && (
        <ReportPreviewCard
          loading={loading}
          disabled={loading || !pid}
          onGenerate={() => generate(false)}
          onExams={() => navigate('/exams')}
        />
      )}
      {!pid && <Typography color="text.secondary" sx={{ mt: 1 }}>Selecione um perfil no topo para gerar o relatório.</Typography>}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {/* Sem créditos — card premium (converter: recarregar/assinar) em vez de "insufficient_credits" cru */}
      {noCredits && (
        <Box sx={{ mt: 2, p: 2.5, borderRadius: 3, textAlign: 'center', background: 'linear-gradient(135deg,rgba(99,102,241,.08),rgba(99,102,241,.02))', border: '1px solid', borderColor: 'rgba(99,102,241,.2)' }}>
          <Box sx={{ fontSize: 40 }}>💎</Box>
          <Typography sx={{ fontWeight: 800, mt: 1 }}>Seus créditos acabaram</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2, maxWidth: 420, mx: 'auto' }}>Recarregue créditos avulsos ou assine o mensal pra gerar relatórios completos e usar a IA sem travar.</Typography>
          <Stack direction="row" spacing={1.5} justifyContent="center" flexWrap="wrap" useFlexGap>
            <Button variant="contained" onClick={() => navigate('/planos')} sx={{ bgcolor: '#6366f1', textTransform: 'none', fontWeight: 700, borderRadius: 99, '&:hover': { bgcolor: '#4f46e5' } }}>Assinar R$19,90/mês</Button>
            <Button variant="outlined" onClick={() => navigate('/planos')} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 99 }}>Comprar créditos</Button>
          </Stack>
        </Box>
      )}

      {/* Sem exames — direcionar pra enviar (não erro) */}
      {noExams && (
        <Box sx={{ mt: 2, p: 2.5, borderRadius: 3, textAlign: 'center', bgcolor: 'action.hover' }}>
          <Box sx={{ fontSize: 40 }}>📄</Box>
          <Typography sx={{ fontWeight: 800, mt: 1 }}>Você ainda não tem exames</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2, maxWidth: 420, mx: 'auto' }}>Envie seu primeiro exame (PDF ou foto) pra a IA gerar um relatório completo da sua saúde.</Typography>
          <Button variant="contained" onClick={() => navigate('/exams/create')} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 99 }}>Enviar exame</Button>
        </Box>
      )}

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
                    <Typography variant="body2" title={e.sourceLab || undefined} sx={{ wordBreak: 'break-word', overflowWrap: 'anywhere', color: 'primary.main', fontWeight: 600, lineHeight: 1.35 }}>
                      📄 {e.title}{e.performedAt ? ` — ${fmtDate(e.performedAt)}` : ''}{e.sourceLab ? ` • ${trimLab(e.sourceLab)}` : ''}
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
                    <Typography sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{i + 1}. {p.titulo}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, wordBreak: 'break-word' }}>{p.detalhe}</Typography>
                  </Box>
                ))}
              </Stack>
            </ReportSectionCard>
          ) : null}

          {s.coisasBoas?.length ? (
            <ReportSectionCard icon={<CheckCircleIcon />} title="Pontos positivos" accent="#059669" count={s.coisasBoas.length} collapsible defaultExpanded={false}>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {s.coisasBoas.map((b, i) => <Chip key={i} sx={{ bgcolor: '#05966918', color: '#059669', fontWeight: 600, maxWidth: '100%', whiteSpace: 'normal', height: 'auto', py: 0.5, lineHeight: 1.3 }} label={txt(b)} />)}
              </Stack>
            </ReportSectionCard>
          ) : null}

          {interacoes.length ? (
            <ReportSectionCard icon={<MedicationIcon />} title="Interações com medicação" accent="#f59e0b" count={interacoes.length} collapsible defaultExpanded={false}>
              <Stack spacing={1}>
                {interacoes.map((m, i) => (
                  <Box key={i} sx={{ p: 1.5, borderRadius: '12px', bgcolor: '#f59e0b0d', border: '1px solid #f59e0b26' }}>
                    <Typography sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{m.medicamento} <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>× {m.analito}</Box></Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{m.observacao}</Typography>
                  </Box>
                ))}
              </Stack>
            </ReportSectionCard>
          ) : null}

          {s.sugestoesNutricao?.length ? (
            <ReportSectionCard icon={<RestaurantIcon />} title="Sugestões de nutrição" accent="#16a34a" count={s.sugestoesNutricao.length} collapsible defaultExpanded={false}>
              <Stack spacing={0.5}>
                {s.sugestoesNutricao.map((b, i) => <Typography key={i} variant="body2" sx={{ py: 0.25, wordBreak: 'break-word' }}>🥗 {txt(b)}</Typography>)}
              </Stack>
            </ReportSectionCard>
          ) : null}

          {s.metasSaude?.length ? (
            <ReportSectionCard icon={<TrackChangesIcon />} title="Metas de saúde" accent="#0288d1" count={s.metasSaude.length} collapsible defaultExpanded={false}>
              <Grid container spacing={1.5}>
                {s.metasSaude.map((m, i) => <Grid key={i} size={{ xs: 12, md: 6 }}><MetaCard m={m} /></Grid>)}
              </Grid>
            </ReportSectionCard>
          ) : null}

          {s.perguntasParaOMedico?.length ? (
            <ReportSectionCard icon={<LiveHelpIcon />} title="Perguntas para levar ao médico" accent="#7b1fa2" count={s.perguntasParaOMedico.length}>
              <Stack spacing={0.75}>
                {s.perguntasParaOMedico.map((q, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                    <Checkbox checked={!!tickQ[i]} onChange={() => setTickQ((c) => ({ ...c, [i]: !c[i] }))} size="small" sx={{ color: '#7b1fa2', p: 0.5 }} />
                    <Typography variant="body2" sx={{ wordBreak: 'break-word', flex: 1, pt: '2px' }}>{txt(q)}</Typography>
                  </Box>
                ))}
                {send.status === 'error' && <Alert severity="error" sx={{ py: 0.5, borderRadius: 2 }}>{send.msg}</Alert>}
                {send.status === 'done' && <Alert severity="success" sx={{ py: 0.5, borderRadius: 2 }}>{send.msg}</Alert>}
                <Button variant="contained" disabled={send.status === 'sending' || !Object.values(tickQ).some(Boolean)} onClick={sendQuestionsToDoctor}
                  sx={{ alignSelf: 'flex-start', borderRadius: 99, textTransform: 'none', fontWeight: 700, bgcolor: '#7b1fa2', '&:hover': { bgcolor: '#6a1b63' } }}>
                  {send.status === 'sending' ? 'Enviando…' : 'Enviar ao médico'}
                </Button>
                <Typography variant="caption" color="text.secondary">Marque as perguntas que quiser levar e toque em enviar. Seu médico recebe por e-mail e no portal.</Typography>
              </Stack>
            </ReportSectionCard>
          ) : null}

          {s.leituraFinal && (
            <Box sx={{ p: 2.5, borderRadius: '16px', background: 'linear-gradient(135deg, rgba(11,92,171,.10), rgba(11,92,171,.04))', border: '1px solid', borderColor: 'divider' }}>
              <Typography sx={(t) => ({ fontWeight: 800, color: t.palette.mode === 'dark' ? '#5b9bd5' : '#0b5cab', mb: 0.5, fontFamily: '"Poppins",sans-serif' })}>📌 Leitura final</Typography>
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
