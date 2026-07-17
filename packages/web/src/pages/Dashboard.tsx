import { useEffect, useState } from 'react';
import { Stack, Typography, Grid, Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Card, CardContent, Chip, Accordion, AccordionSummary, AccordionDetails, useTheme } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ScienceIcon from '@mui/icons-material/Science';
import { GamificationBadges } from '../components/GamificationBadges';
import { BiometricService } from '../components/BiometricService';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { syncPushToken } from '../push';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { AiTip } from '../components/dashboard/AiTip';
import { HealthScoreCard } from '../components/dashboard/HealthScoreCard';
import { CurrentStateCard } from '../components/dashboard/CurrentStateCard';
import { RiskCard } from '../components/dashboard/RiskCard';
import { InsightsCards } from '../components/dashboard/InsightsCards';
import { AiCard } from '../components/dashboard/AiCard';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import InsightsIcon from '@mui/icons-material/Insights';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import BoltIcon from '@mui/icons-material/Bolt';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { CreditsCard } from '../components/dashboard/CreditsCard';
import { BiologicalAgeCard } from '../components/dashboard/BiologicalAgeCard';
import { CardiometabolicRiskCard } from '../components/dashboard/CardiometabolicRiskCard';
import { ShareHealthButton } from '../components/ShareHealthCard';
import { ReviewPrompt } from '../components/ReviewPrompt';
import { MetricCard } from '../components/dashboard/MetricCard';
import { DistributionCard } from '../components/dashboard/DistributionCard';
import { QuickActions } from '../components/dashboard/QuickActions';
import { FailedExamsAlert } from '../components/dashboard/FailedExamsAlert';
import { Section } from '../components/dashboard/Section';
import { PageContainer } from '../components/layout/PageContainer';

const readTotal = (r: Response) => Number(r.headers.get('X-Total-Count') ?? r.headers.get('content-range')?.split('/')?.[1] ?? '0');

const TIPS = [
  'Leve sempre seus exames anteriores à consulta — a comparação entre valores vale mais que um número isolado.',
  'Jejum de 8–12h antes de exames de sangue garante resultados mais precisos.',
  'Atividade física regular ajuda a reduzir colesterol, glicemia e pressão.',
  'Anote medicamentos e doses no seu perfil clínico — a IA usa isso para contextualizar a análise.',
  'Exames de imagem (ultrassom, tomografia) peça sempre o laudo + as imagens em CD.',
  'Repita exames laboratoriais no mesmo laboratório quando possível — facilita comparar a evolução.',
];

const NextBestActionCard = ({
  loaded,
  exams,
  abnormal,
  failed,
  lastExam,
  credits,
  onNavigate,
}: {
  loaded: boolean;
  exams: number;
  abnormal: number;
  failed: number;
  lastExam: string | null;
  credits: number | null;
  onNavigate: (to: string) => void;
}) => {
  const isDark = useTheme().palette.mode === 'dark';
  const lastExamLabel = lastExam ? new Date(lastExam).toLocaleDateString('pt-BR') : null;
  const action = !loaded
    ? {
        tone: '#178f89',
        chip: 'Organizando seus dados',
        title: 'Montando sua prioridade de hoje',
        body: 'Estamos cruzando exames, alertas e créditos para sugerir o melhor próximo passo.',
        cta: 'Ver exames',
        to: '/exams',
      }
    : failed > 0
      ? {
          tone: '#dc2626',
          chip: `${failed} leitura${failed > 1 ? 's' : ''} pendente${failed > 1 ? 's' : ''}`,
          title: 'Revise os exames que não foram lidos',
          body: 'Documento ilegível ou fora do padrão impede resumo, relatório e alertas confiáveis.',
          cta: 'Revisar agora',
          to: '/exams',
        }
      : exams === 0
        ? {
            tone: '#178f89',
            chip: 'Primeiro passo',
            title: 'Envie seu primeiro exame',
            body: 'Com um PDF ou foto, o Dr. Exame já extrai resultados e monta seus próximos insights.',
            cta: 'Enviar exame',
            to: '/exams/create',
          }
        : abnormal > 0
          ? {
              tone: '#f59e0b',
              chip: `${abnormal} valor${abnormal > 1 ? 'es' : ''} de atenção`,
              title: 'Veja o que merece atenção antes da consulta',
              body: 'Priorize os valores alterados e gere perguntas objetivas para conversar com seu médico.',
              cta: 'Ver valores alterados',
              to: '/alterados',
            }
          : credits != null && credits < 20
            ? {
                tone: '#6366f1',
                chip: `${credits} crédito${credits === 1 ? '' : 's'}`,
                title: 'Recarregue para manter a IA disponível',
                body: 'Relatórios completos e perguntas ao Dr. Exame usam créditos. Evite ficar travado quando precisar.',
                cta: 'Ver planos',
                to: '/planos',
              }
            : {
                tone: '#178f89',
                chip: lastExamLabel ? `Último exame em ${lastExamLabel}` : `${exams} exame${exams > 1 ? 's' : ''}`,
                title: 'Gere um relatório pronto para levar ao médico',
                body: 'A IA consolida seus exames, pontos de atenção, evolução e perguntas em um documento único.',
                cta: 'Gerar relatório',
                to: '/relatorio',
              };

  return (
    <Card variant="outlined" sx={{ mt: 2, borderRadius: 3, overflow: 'hidden', borderColor: `${action.tone}33`, background: `linear-gradient(135deg, ${action.tone}14, ${isDark ? '#1a2424' : '#fff'})` }}>
      <CardContent sx={{ p: { xs: 2, md: 2.25 }, '&:last-child': { pb: { xs: 2, md: 2.25 } } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <Box sx={{ width: 42, height: 42, borderRadius: 2.5, bgcolor: `${action.tone}18`, color: action.tone, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <AutoAwesomeIcon />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Chip size="small" label={action.chip} sx={{ height: 22, mb: 0.75, bgcolor: `${action.tone}18`, color: action.tone, fontWeight: 800 }} />
            <Typography sx={{ fontWeight: 900, fontSize: { xs: 18, sm: 20 }, lineHeight: 1.18, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>
              {action.title}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary', lineHeight: 1.45 }}>
              {action.body}
            </Typography>
          </Box>
          <Button variant="contained" onClick={() => onNavigate(action.to)} sx={{ alignSelf: { xs: 'stretch', sm: 'center' }, borderRadius: 99, textTransform: 'none', fontWeight: 900, bgcolor: action.tone, boxShadow: 'none', px: 2.25, '&:hover': { bgcolor: action.tone, filter: 'brightness(.92)', boxShadow: 'none' } }}>
            {action.cta} →
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
};

export const Dashboard = () => {
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const [stats, setStats] = useState({ exams: 0, abnormal: 0 });
  const [failed, setFailed] = useState(0);
  const [deps, setDeps] = useState(0);
  const [lastExam, setLastExam] = useState<string | null>(null);
  const [buckets, setBuckets] = useState<{ bons: number; alerta: number; alterados: number }>({ bons: 0, alerta: 0, alterados: 0 });
  const [hsScore, setHsScore] = useState<number | null>(null);
  const [hsAltered, setHsAltered] = useState<number>(0);
  const [credits, setCredits] = useState<number | null>(null);
  const [me, setMe] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [bioOffer, setBioOffer] = useState(false);
  const [tipData, setTipData] = useState<{ abnormal: any; good: any }>({ abnormal: null, good: null });
  const [tipFallback, setTipFallback] = useState('');
  const tip = tipFallback || TIPS[new Date().getDate() % TIPS.length];

  useEffect(() => {
    // Score cacheado no localStorage por paciente → mostra INSTANTÂNEO (sem "Calculando…")
    // quando já existe cache. Só recalcula/busca em background; spinner só na 1ª visita.
    try {
      const c = pid ? localStorage.getItem(`dashScore:${pid}`) : null;
      if (c) setBuckets(JSON.parse(c));
      const cn = pid ? localStorage.getItem(`dashScoreNum:${pid}`) : null;
      if (cn) setHsScore(Number(cn));
    } catch { /* ignore */ }
    (async () => {
      const h = { Authorization: `Bearer ${token()}` };
      try {
        const pidQ = pid ? `&patientId=${pid}` : '';
        const e = await fetch(`${API_URL}/exams?_start=0&_end=1${pidQ}`, { headers: h });
        const eData = await e.json().catch(() => []);
        setStats((s) => ({ ...s, exams: readTotal(e) }));
        if (Array.isArray(eData) && eData[0]?.performedAt) setLastExam(eData[0].performedAt);
        const fe = await fetch(`${API_URL}/exams?_start=0&_end=1&status=FAILED${pidQ}`, { headers: h });
        setFailed(readTotal(fe));
        const a = await fetch(`${API_URL}/items?abnormal=true&_start=0&_end=1${pidQ}`, { headers: h });
        setStats((s) => ({ ...s, abnormal: readTotal(a) }));
        const p = await fetch(`${API_URL}/patients`, { headers: h });
        if (p.ok) { const pd = await p.json(); setDeps(Array.isArray(pd) ? pd.length : 0); setMe(pd.find((x: any) => x.id === pid) ?? pd[0] ?? null); }
        const fs = await fetch(`${API_URL}/items/flag-summary${pid ? `?patientId=${pid}` : ''}`, { headers: h });
        if (fs.ok) {
          const fd = await fs.json();
          const b = fd.buckets ?? { bons: 0, alerta: 0, alterados: 0 };
          setBuckets(b);
          try { if (pid) localStorage.setItem(`dashScore:${pid}`, JSON.stringify(b)); } catch { /* ignore */ }
        }
        // Camada canonical (Layer 2): score correto (dedup por marcador + só últimos 12 meses +
        // exclui borderline — alinhado ao Portal do Médico) e dica da IA a partir do marcador de
        // MAIOR atenção (sem staleness — antes vinha de /items cru, que pegava um item de exame
        // ANTIGO e dizia "ácido úrico alto" à toa, quando o atual já estava normal).
        if (pid) {
          const hs = await fetch(`${API_URL}/patients/${pid}/health-summary`, { headers: h });
          if (hs.ok) {
            const hd = await hs.json();
            if (typeof hd.score === 'number') {
              setHsScore(hd.score);
              try { localStorage.setItem(`dashScoreNum:${pid}`, String(hd.score)); } catch { /* ignore */ }
            }
            setHsAltered((hd.byPriority?.importante ?? 0) + (hd.byPriority?.moderada ?? 0));
            // Fallback da dica: sempre RELEVANTE (sobre os exames do paciente), nunca genérico
            // "beba água". Quando não há marcador de atenção (topAttention vazio — ex.: alterados
            // são antigos/stale), prioriza o aviso de exames desatualizados ou o score.
            let fb = '';
            if (hd.staleWarning) fb = `⏳ ${hd.staleWarning}`;
            else if (typeof hd.score === 'number') fb = `Seu score de saúde está em ${hd.score}/100 — continue enviando exames e levando-os às consultas médicas.`;
            if (fb) setTipFallback(fb);
            const markerToTip = (m: any) => m ? {
              name: m.name,
              value: m.latest?.valueNumeric ?? null,
              unit: m.unit,
              flag: (m.latest?.valueNumeric != null && m.refHigh != null && m.latest.valueNumeric > m.refHigh) ? 'HIGH'
                  : (m.latest?.valueNumeric != null && m.refLow != null && m.latest.valueNumeric < m.refLow) ? 'LOW'
                  : (m.flag || ''),
            } : null;
            const top = Array.isArray(hd.topAttention) ? hd.topAttention[0] : null;
            const imp = Array.isArray(hd.improving) ? hd.improving[0] : null;
            if (top || imp) setTipData({ abnormal: markerToTip(top), good: markerToTip(imp) });
          }
        }
        const st = await fetch(`${API_URL}/billing/status`, { headers: h });
        if (st.ok) { const sd = await st.json(); setCredits(typeof sd.credits === 'number' ? sd.credits : null); }
        // Streak server-side das conquistas — fire-and-forget (1x/dia, idempotente).
        fetch(`${API_URL}/achievements/heartbeat`, { method: 'POST', headers: h }).catch(() => {});
      } catch { /* ignore */ } finally { setLoaded(true); }
      // Oferece biometria 1x (nativo + ainda não ativou)
      if (BiometricService.isSupported() && !BiometricService.hasEnrollment()) setTimeout(() => setBioOffer(true), 1500);
      void syncPushToken();
    })();
  }, [pid]);

  const firstName = (me?.fullName || '').split(' ')[0];
  const totalVals = buckets.bons + buckets.alerta + buckets.alterados;
  // Score da camada canonical (Layer 2): dedup por marcador + últimos 12 meses + exclui borderline
  // — alinhado ao Portal do Médico (antes derivava do flag-summary, que inflava contando itens
  // sem referência como "bom" e duplicatas). buckets continuam só pro donut (DistributionCard).
  const bucketsScore = totalVals ? Math.round((buckets.bons / totalVals) * 100) : null;
  const score = hsScore ?? bucketsScore;
  const tipNode = <AiTip firstName={firstName} tipData={tipData} fallbackTip={tip} />;

  return (
    <PageContainer width="wide" sx={{ bgcolor: '#FAFBFC', minHeight: '100vh' }}>
      <DashboardHeader firstName={firstName} />

      {/* 1 · HERO — Score de Saúde */}
      <HealthScoreCard loaded={loaded} score={score} abnormalCount={hsAltered || stats.abnormal} onDetails={() => navigate('/tendencias')} />
      <NextBestActionCard
        loaded={loaded}
        exams={stats.exams}
        abnormal={stats.abnormal}
        failed={failed}
        lastExam={lastExam}
        credits={credits}
        onNavigate={navigate}
      />

      {/* 2 · SUA SAÚDE AGORA — 1 leitura de risco (resumo) + atalhos pras telas de detalhe.
          Antes havia 5 cards de saúde competindo (poluído). Agora: Score no hero + 1 risco aqui. */}
      <Section label="Sua saúde agora" icon={<InsightsIcon />}>
        <RiskCard />
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
          <Button size="small" onClick={() => navigate('/tendencias')} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 99, color: '#178f89', border: '1px solid', borderColor: 'divider' }}>📊 Tendências & Previsões →</Button>
          <Button size="small" onClick={() => navigate('/conquistas')} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 99, color: '#178f89', border: '1px solid', borderColor: 'divider' }}>🏆 Conquistas →</Button>
        </Stack>
      </Section>

      {/* 3 · Dr. EXAME — dica de IA (✨) + CTA chat. Limpo, sem cards avançados misturados. */}
      <Section label="Dr. Exame" icon={<SmartToyIcon />}>
        <AiCard tip={tipNode} onChat={() => navigate('/chat')} />
      </Section>

      {/* 4 · ANÁLISES DETALHADAS — cards avançados (estado atual, idade biológica,
          cardiometabólico, distribuição) num acordeão COLAPSADO por padrão. Antes ficavam
          soltos e competiam (dashboard "poluído"). Agora: quem quer aprofundar, expande.
          NENHUMA funcionalidade perdida — tudo continua aqui, só organizado. */}
      <Accordion disableGutters elevation={0} defaultExpanded={false} sx={{ mt: 1, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', borderRadius: '16px !important', overflow: 'hidden' }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: '52px !important', '& .MuiAccordionSummary-content': { my: 0.75 } }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <ScienceIcon sx={{ color: '#178f89', fontSize: 20 }} />
            <Box>
              <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 14, lineHeight: 1.2 }}>Análises detalhadas da sua saúde</Typography>
              <Typography variant="caption" color="text.secondary">Estado atual, idade biológica, risco cardiometabólico e distribuição</Typography>
            </Box>
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 1.5, pt: 0.5 }}>
          <Stack spacing={2}>
            <CurrentStateCard />
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}><BiologicalAgeCard /></Grid>
              <Grid size={{ xs: 12, md: 6 }}><CardiometabolicRiskCard /></Grid>
            </Grid>
            <DistributionCard buckets={buckets} />
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* 5 · SEUS NÚMEROS — métricas clicáveis (donut foi pra 'Análises detalhadas') */}
      <Section label="Seus números" icon={<AnalyticsIcon />}>
        <Grid container spacing={2}>
          <MetricCard label="Exames enviados" value={stats.exams} color="primary.main" icon={<MedicalServicesIcon />} onClick={() => navigate('/exams')} />
          <MetricCard label="Valores alterados" value={stats.abnormal} color={stats.abnormal ? 'error.main' : 'success.main'} icon={<WarningAmberIcon />} onClick={() => navigate('/alterados')} />
          <MetricCard label="Dependentes" value={deps} color="#8b5cf6" icon={<Diversity3Icon />} onClick={() => navigate('/familia')} />
          <MetricCard label="Última atualização" value={lastExam ? new Date(lastExam).toLocaleDateString('pt-BR') : '—'} color="#0ea5e9" icon={<EventAvailableIcon />} onClick={() => navigate('/linha-do-tempo')} />
        </Grid>
      </Section>

      {/* 6 · AÇÕES RÁPIDAS — primária "Enviar exame" + exames falhados + créditos */}
      <Section label="Ações rápidas" icon={<BoltIcon />}>
        <Stack spacing={2}>
          <FailedExamsAlert count={failed} onClick={() => navigate('/exams')} />
          <QuickActions />
          <CreditsCard credits={credits} onClick={() => navigate('/planos')} />
        </Stack>
      </Section>

      {/* Conquistas removido do dashboard — link compacto acima (tela própria /conquistas) */}

      {/* Compartilhar (loop viral) — botão discreto no rodapé do dashboard */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
        <ShareHealthButton score={score} />
      </Box>

      {/* Review prompt — aparece 1x no APK após score carregado + exame extraído */}
      <ReviewPrompt trigger={loaded && stats.exams > 0} />

      {/* Oferta de biometria (1x — nativo + não ativou) */}
      <Dialog open={bioOffer} onClose={() => setBioOffer(false)} PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'text.primary' }}>🔐 Entrar com biometria?</DialogTitle>
        <DialogContent><Typography sx={{ color: 'text.secondary' }}>Ative a entrada por face/digital neste aparelho. Na próxima vez, você entra sem digitar senha — mais rápido e seguro.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setBioOffer(false)}>Agora não</Button>
          <Button variant="contained" onClick={() => { BiometricService.enroll(token() || '', false); setBioOffer(false); }} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 800 }}>Ativar biometria</Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};
