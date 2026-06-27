import { useEffect, useState } from 'react';
import { Box, Stack, Typography, Grid, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { GamificationBadges } from '../components/GamificationBadges';
import { BiometricService } from '../components/BiometricService';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { syncPushToken } from '../push';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { AiTip } from '../components/dashboard/AiTip';
import { HealthScoreCard } from '../components/dashboard/HealthScoreCard';
import { AiCard } from '../components/dashboard/AiCard';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { CreditsCard } from '../components/dashboard/CreditsCard';
import { MetricCard } from '../components/dashboard/MetricCard';
import { DistributionCard } from '../components/dashboard/DistributionCard';
import { QuickActions } from '../components/dashboard/QuickActions';
import { FailedExamsAlert } from '../components/dashboard/FailedExamsAlert';
import { PageContainer } from '../components/layout/PageContainer';

const readTotal = (r: Response) => Number(r.headers.get('X-Total-Count') ?? r.headers.get('content-range')?.split('/')?.[1] ?? '0');

const TIPS = [
  'Beba pelo menos 2 litros de água por dia — a hidratação melhora exames de rim e urina.',
  'Jejum de 8–12h antes de exames de sangue garante resultados mais precisos.',
  'Leve sempre seus exames anteriores à consulta — a comparação vale mais que um valor isolado.',
  'Atividade física regular ajuda a reduzir colesterol, glicemia e pressão.',
  'Anote medicamentos e doses no seu perfil clínico — a IA usa isso para contextualizar a análise.',
  'Exames de imagem (ultrassom, tomografia) peça sempre o laudo + as imagens em CD.',
  'Repita exames laboratoriais no mesmo laboratório quando possível — facilita comparar a evolução.',
];

export const Dashboard = () => {
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const [stats, setStats] = useState({ exams: 0, abnormal: 0 });
  const [failed, setFailed] = useState(0);
  const [deps, setDeps] = useState(0);
  const [lastExam, setLastExam] = useState<string | null>(null);
  const [buckets, setBuckets] = useState<{ bons: number; alerta: number; alterados: number }>({ bons: 0, alerta: 0, alterados: 0 });
  const [credits, setCredits] = useState<number | null>(null);
  const [me, setMe] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [bioOffer, setBioOffer] = useState(false);
  const [tipData, setTipData] = useState<{ abnormal: any; good: any }>({ abnormal: null, good: null });
  const tip = TIPS[new Date().getDate() % TIPS.length];

  useEffect(() => {
    // Score cacheado no localStorage por paciente → mostra INSTANTÂNEO (sem "Calculando…")
    // quando já existe cache. Só recalcula/busca em background; spinner só na 1ª visita.
    try {
      const c = pid ? localStorage.getItem(`dashScore:${pid}`) : null;
      if (c) setBuckets(JSON.parse(c));
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
        const it = await fetch(`${API_URL}/items?_start=0&_end=20${pidQ}`, { headers: h });
        if (it.ok) { const items = await it.json(); setTipData({ abnormal: items.find((x: any) => x.isAbnormal) ?? null, good: items.find((x: any) => !x.isAbnormal && x.value != null) ?? null }); }
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
  const score = totalVals ? Math.round((buckets.bons / totalVals) * 100) : null; // consistente com o donut
  const tipNode = <AiTip firstName={firstName} tipData={tipData} fallbackTip={tip} />;

  return (
    <PageContainer width="wide">
      <DashboardHeader firstName={firstName} />

      <HealthScoreCard loaded={loaded} score={score} abnormalCount={stats.abnormal} onDetails={() => navigate('/tendencias')} />

      {/* IA — card hero do Dr. Exame (robô + dica + CTA) */}
      <AiCard tip={tipNode} onChat={() => navigate('/chat')} />

      {/* Aviso de exames que falharam (pra reprocessar) */}
      <FailedExamsAlert count={failed} onClick={() => navigate('/exams')} />

      {/* Créditos (card premium verde) */}
      <CreditsCard credits={credits} onClick={() => navigate('/planos')} />

      {/* Contadores clicáveis */}
      <Grid container spacing={2} sx={{ mt: score === null ? 2 : 1, mb: 2 }}>
        <MetricCard label="Exames enviados" value={stats.exams} color="primary.main" icon={<MedicalServicesIcon />} onClick={() => navigate('/exams')} />
        <MetricCard label="Valores alterados" value={stats.abnormal} color={stats.abnormal ? 'error.main' : 'success.main'} icon={<WarningAmberIcon />} onClick={() => navigate('/alterados')} />
        <MetricCard label="Dependentes" value={deps} color="#8b5cf6" icon={<Diversity3Icon />} onClick={() => navigate('/familia')} />
        <MetricCard label="Última atualização" value={lastExam ? new Date(lastExam).toLocaleDateString('pt-BR') : '—'} color="#0ea5e9" icon={<EventAvailableIcon />} onClick={() => navigate('/linha-do-tempo')} />
      </Grid>

      {/* Distribuição dos valores + Dica */}
      <DistributionCard buckets={buckets} />

      {/* Ações rápidas */}
      <QuickActions />

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 3 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>Toque nos cards de contador para navegar.</Typography>
      </Stack>

      {/* GAMIFICAÇÃO — badges + streak */}
      <Box sx={{ mt: 2 }}>
        <GamificationBadges examsCount={stats.exams} score={score} />
      </Box>

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
