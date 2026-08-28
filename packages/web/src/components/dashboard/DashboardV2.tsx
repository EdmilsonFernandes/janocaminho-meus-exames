import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stack, Typography, Box, Grid, useTheme, Skeleton, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { API_URL, token } from '../../config';
import { Heartbeat, Stethoscope, ChartLineUp, Dna } from '@phosphor-icons/react';
import { useSelectedPatient } from '../../patient-context';
import { syncPushToken } from '../../push';
import { BiometricService } from '../BiometricService';
import { PageContainer } from '../layout/PageContainer';
import { DashboardHeader } from './DashboardHeader';
import { FailedExamsAlert } from './FailedExamsAlert';
import { RejectedExamsAlert } from './RejectedExamsAlert';
import { NextStepsCard } from './NextStepsCard';
import { AiCard } from './AiCard';
import { QuickActions } from './QuickActions';
import { ActivityCard } from './ActivityCard';
import { RestingHeartCard } from './RestingHeartCard';
import { SinceExamCard } from './SinceExamCard';
import { CreditsCard } from './CreditsCard';
import { BiologicalAgeCard } from './BiologicalAgeCard';
import { ShareHealthButton } from '../ShareHealthCard';
import { ReviewPrompt } from '../ReviewPrompt';
import { AppCard } from '../AppCard';
import { GradientButton } from '../GradientButton';
import { ChangesSinceExam, type Marker } from './ChangesSinceExam';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { getGoals, goalSubtitle } from '../GoalQuiz';

const readTotal = (r: Response) =>
  Number(r.headers.get('X-Total-Count') ?? r.headers.get('content-range')?.split('/')?.[1] ?? '0');

/** Busca os mesmos dados do Dashboard legacy — V2 isolada (não toca no fetch do legacy). */
function useDashboardData(pid: string | null) {
  const [stats, setStats] = useState({ exams: 0, abnormal: 0 });
  const [failed, setFailed] = useState(0);
  const [lastExam, setLastExam] = useState<string | null>(null);
  const [buckets, setBuckets] = useState<{ bons: number; alerta: number; alterados: number }>({ bons: 0, alerta: 0, alterados: 0 });
  const [score, setScore] = useState<number | null>(null);
  const [importante, setImportante] = useState(0);
  const [moderada, setModerada] = useState(0);
  const [cardioRisk, setCardioRisk] = useState<any>(null);
  const [markerCount, setMarkerCount] = useState(0);
  const [credits, setCredits] = useState<number | null>(null);
  const [me, setMe] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [worsened, setWorsened] = useState<Marker[]>([]);
  const [improved, setImproved] = useState<Marker[]>([]);
  const [staleWarning, setStaleWarning] = useState('');
  // Honestidade de estados (auditoria 2026-08): o server diz POR QUE cada feature não calculou
  // (availability) — o cliente nunca mais infere estado positivo a partir de null.
  const [availability, setAvailability] = useState<any>(null);
  const [rejected, setRejected] = useState(0);

  useEffect(() => {
    if (!pid) {
      setLoaded(true);
      return;
    }
    // Score cacheado (instantâneo na 1ª pintura, igual ao legacy).
    try {
      const c = pid ? localStorage.getItem(`dashScore:${pid}`) : null;
      if (c) setBuckets(JSON.parse(c));
      const cn = pid ? localStorage.getItem(`dashScoreNum:${pid}`) : null;
      if (cn) setScore(Number(cn));
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
        const rj = await fetch(`${API_URL}/exams?_start=0&_end=1&status=REJECTED${pidQ}`, { headers: h });
        setRejected(readTotal(rj));
        // Contagem de alterados VEM DO flag-summary (mesma fonte de /alterados — exclui exames
        // com CPF divergente). Antes: X-Total-Count de /items?abnormal=true (rota de lista, sem
        // o filtro) → Home dizia "8 alterados" enquanto /alterados dizia "tudo dentro da faixa".
        const fs = await fetch(`${API_URL}/items/flag-summary${pid ? `?patientId=${pid}` : ''}`, { headers: h });
        if (fs.ok) {
          const fd = await fs.json();
          const b = fd.buckets ?? { bons: 0, alerta: 0, alterados: 0 };
          setBuckets(b);
          setStats((s) => ({ ...s, abnormal: (b.alerta ?? 0) + (b.alterados ?? 0) }));
          try { if (pid) localStorage.setItem(`dashScore:${pid}`, JSON.stringify(b)); } catch { /* ignore */ }
        }
        if (pid) {
          const hs = await fetch(`${API_URL}/patients/${pid}/health-summary`, { headers: h });
          if (hs.ok) {
            const hd = await hs.json();
            if (typeof hd.score === 'number') {
              setScore(hd.score);
              try { localStorage.setItem(`dashScoreNum:${pid}`, String(hd.score)); } catch { /* ignore */ }
            } else {
              // Sem score canônico agora (ex.: todos os exames eram de terceiro) → NÃO fica
              // score velho do localStorage (mostrava 93 de dados que não são mais contados).
              try { localStorage.removeItem(`dashScoreNum:${pid}`); } catch { /* ignore */ }
              setScore(null);
            }
            setImportante(hd.byPriority?.importante ?? 0);
            setModerada(hd.byPriority?.moderada ?? 0);
            setCardioRisk(hd.cardiometabolicRisk ?? null);
            setAvailability(hd.availability ?? null);
            setMarkerCount(typeof hd.markers === 'number' ? hd.markers : 0);
            setStaleWarning(hd.staleWarning ?? '');
            // "Pioraram" = trend PIOROU mesmo (hd.worsening). Antes alimentava com topAttention
            // (= alterados, qualquer tendência) — marcador ALTERADO-QUER-MELHORANDO caía nas
            // DUAS listas (topAttention ∩ improving) e o card mostrava o mesmo valor 2×
            // (bug da Heloisa: PCR 7.61 "piorou" e "melhorou" ao mesmo tempo).
            setWorsened(Array.isArray(hd.worsening) ? hd.worsening.slice(0, 3) : []);
            setImproved(Array.isArray(hd.improving) ? hd.improving.slice(0, 3) : []);
          }
        }
        const p = await fetch(`${API_URL}/patients`, { headers: h });
        if (p.ok) { const pd = await p.json(); setMe(Array.isArray(pd) ? (pd.find((x: any) => x.id === pid) ?? pd[0]) : null); }
        const st = await fetch(`${API_URL}/billing/status`, { headers: h });
        if (st.ok) { const sd = await st.json(); setCredits(typeof sd.credits === 'number' ? sd.credits : null); }
        fetch(`${API_URL}/achievements/heartbeat`, { method: 'POST', headers: h }).catch(() => {});
      } catch { /* ignore */ } finally { setLoaded(true); }
      void syncPushToken();
    })();
  }, [pid]);

  return { stats, failed, lastExam, buckets, score, importante, moderada, cardioRisk, markerCount, credits, me, loaded, worsened, improved, staleWarning, availability, rejected };
}

const statusFromScore = (s: number | null): { label: string; tone: 'primary' | 'success' | 'warning' | 'error' } => {
  if (s == null) return { label: '—', tone: 'primary' };
  if (s >= 80) return { label: 'Em ótima forma', tone: 'success' };
  if (s >= 60) return { label: 'Em boa forma', tone: 'primary' };
  if (s >= 40) return { label: 'Pede atenção', tone: 'warning' };
  return { label: 'Precisa de cuidados', tone: 'error' };
};

/** HERO — única hierarquia de saúde (score + prioridades + última análise + CTA).
 *  Sem exames NÃO existe "Calculando…" eterno (não há nada calculando): é onboarding com
 *  CTA pro 1º exame. "Nada crítico" só com score real — ausência de dado não é normalidade. */
const HeroHealthCard = ({ loaded, score, exams, importante, moderada, lastExam, onDetails, onFirstExam }: {
  loaded: boolean; score: number | null; exams: number; importante: number; moderada: number; lastExam: string | null; onDetails: () => void; onFirstExam: () => void;
}) => {
  const t = useTheme();
  const st = statusFromScore(score);
  const last = lastExam ? new Date(lastExam).toLocaleDateString('pt-BR') : null;
  const totalAtt = importante + moderada;
  const noData = score == null && exams === 0;
  const title = noData ? 'Começa com seu primeiro exame' : score == null ? 'Score indisponível' : st.label;
  return (
    <AppCard kind="tinted" tone={st.tone} tone2="secondary" glow sx={{ p: { xs: 2, sm: 2.25, md: 3 } }}>
      <Stack direction="row" spacing={{ xs: 1.5, sm: 2 }} alignItems="center" sx={{ width: '100%', minWidth: 0 }}>
        <Box sx={{ position: 'relative', display: 'grid', placeItems: 'center', width: { xs: 76, sm: 92 }, height: { xs: 76, sm: 92 }, flexShrink: 0 }}>
          <Box component="svg" viewBox="0 0 100 100" sx={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            <circle cx="50" cy="50" r="42" fill="none" stroke={alpha(t.palette.text.primary, 0.12)} strokeWidth="9" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#20b2aa" strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${(score ?? 0) * 2.64} 999`} style={{ transition: 'stroke-dasharray .8s cubic-bezier(.16,1,.3,1)' }} />
          </Box>
          <Box sx={{ position: 'absolute', textAlign: 'center' }}>
            {loaded ? <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 'clamp(1.25rem, 6vw, 1.625rem)', sm: 26 }, lineHeight: 1, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{score ?? '—'}</Typography>
              : <Skeleton variant="text" width={36} height={30} />}
            <Typography sx={{ fontSize: 10, color: 'text.secondary', mt: -0.5 }}>de 100</Typography>
          </Box>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Sentence case (audit Onda A): caixa alta + ls largo = cara de painel admin. */}
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: st.tone === 'success' ? '#047857' : st.tone === 'warning' ? '#8a5a1f' : st.tone === 'error' ? '#b91c1c' : '#0f6e68' }}>Sua saúde hoje</Typography>
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 'clamp(1.125rem, 5.5vw, 1.375rem)', sm: 22 }, lineHeight: 1.15, color: 'text.primary', mt: 0.25, textWrap: 'balance' }}>{title}</Typography>
          <Stack direction="row" spacing={1.5} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
            {totalAtt > 0 ? (
              <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>
                {importante > 0 && <Box component="span" sx={{ color: '#b91c1c', fontWeight: 700 }}>● {importante} importante{importante > 1 ? 's' : ''}</Box>}
                {importante > 0 && moderada > 0 && <Box component="span" sx={{ color: 'text.secondary' }}> · </Box>}
                {moderada > 0 && <Box component="span" sx={{ color: '#b45309', fontWeight: 700 }}>● {moderada} moderado{moderada > 1 ? 's' : ''}</Box>}
              </Typography>
            ) : noData ? (
              /* Copy personalizada pelo objetivo do quiz-first onboarding (licença Mito). */
              <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>{goalSubtitle(getGoals()) ?? 'Envie um exame pra começarmos a construir sua visão de saúde.'}</Typography>
            ) : score != null ? (
              <Typography sx={{ fontSize: 13.5, color: 'success.main', fontWeight: 700 }}>● Nada crítico no momento</Typography>
            ) : null}
            {last && !noData && <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>· atualizado {last}</Typography>}
          </Stack>
        </Box>
      </Stack>
      {noData ? (
        <GradientButton onClick={onFirstExam} endIcon={<ArrowForwardIcon />} sx={{ mt: 2.25, width: { xs: '100%', sm: 'auto' }, alignSelf: 'stretch' }}>
          Enviar primeiro exame
        </GradientButton>
      ) : (
        <GradientButton onClick={onDetails} endIcon={<ArrowForwardIcon />} sx={{ mt: 2.25, width: { xs: '100%', sm: 'auto' }, alignSelf: 'stretch' }}>
          Ver análise completa
        </GradientButton>
      )}
    </AppCard>
  );
};

/** Tile de indicador — premium (sombra 3 camadas, radius 20, hover glow, entrada escalonada). */
const IndicatorTile = ({ icon, label, value, sub, tone, onClick, idx = 0 }: {
  icon: ReactNode; label: string; value: string; sub?: string; tone: 'error' | 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'premium'; onClick: () => void; idx?: number;
}) => (
  <AppCard kind="interactive" onClick={onClick} sx={{
    p: 2, height: '100%', borderRadius: '20px !important',
    boxShadow: '0 1px 2px rgba(0,0,0,.03), 0 2px 8px rgba(0,0,0,.04), 0 8px 20px rgba(0,0,0,.03)',
    transition: 'transform .15s ease, box-shadow .2s ease, border-color .2s ease',
    '&:hover': { boxShadow: '0 2px 4px rgba(32,178,170,.06), 0 8px 24px rgba(32,178,170,.1), 0 16px 36px rgba(32,178,170,.06)', transform: 'translateY(-2px)' },
    '&:active': { transform: 'scale(.98)' },
    animation: `dashTileIn .35s cubic-bezier(.16,1,.3,1) ${idx * 0.07}s both`,
    '@keyframes dashTileIn': { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
  }}>
    <Stack direction="row" spacing={{ xs: 1, sm: 1.5 }} alignItems="center" sx={{ width: '100%', minWidth: 0 }}>
      <Box sx={{ width: { xs: 36, sm: 44 }, height: { xs: 36, sm: 44 }, borderRadius: '14px', display: 'grid', placeItems: 'center', flexShrink: 0,
        bgcolor: (th) => alpha((th.palette as any)[tone]?.main ?? '#20b2aa', 0.12), color: `${tone}.main`,
        transition: 'transform .15s', '&:hover': { transform: 'scale(1.06)' } }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <Typography noWrap sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.1, fontWeight: 600, textOverflow: 'ellipsis' }}>{label}</Typography>
        <Typography noWrap sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 'clamp(0.875rem, 4.5vw, 1.0625rem)', sm: 17 }, color: 'text.primary', lineHeight: 1.2, mt: 0.15, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
        {sub && <Typography noWrap sx={{ fontSize: 11, color: 'text.disabled', lineHeight: 1.1, textOverflow: 'ellipsis' }}>{sub}</Typography>}
      </Box>
    </Stack>
  </AppCard>
);

export const DashboardV2 = () => {
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const d = useDashboardData(pid);
  const [bioOffer, setBioOffer] = useState(false);
  const firstName = (d.me?.fullName || '').split(' ')[0];

  useEffect(() => {
    // Offer por PAPEL (paciente): médico matriculado no aparelho não pode calar o offer
    // do paciente (bug: hasEnrollment "qualquer papel" escondia p/ sempre).
    if (BiometricService.isSupported() && !BiometricService.hasEnrollmentFor('patient')) {
      const id = setTimeout(() => setBioOffer(true), 1500);
      return () => clearTimeout(id);
    }
  }, []);

  const totalResults = d.buckets.bons + d.buckets.alerta + d.buckets.alterados;
  const cardioLevel: string = d.cardioRisk?.level ?? '';
  const cardioFactors: number = Array.isArray(d.cardioRisk?.factors) ? d.cardioRisk.factors.filter((f: any) => f.risk).length : 0;

  return (
    <PageContainer width="wide" sx={{ bgcolor: (t) => (t.palette.mode === 'dark' ? 'background.default' : '#FAFBFC'), minHeight: '100vh', pb: { xs: 10, sm: 5 } }}>
      <DashboardHeader firstName={firstName} />
      <FailedExamsAlert count={d.failed} onClick={() => navigate('/exams')} />
      <RejectedExamsAlert count={d.rejected} onClick={() => navigate('/exams')} />

      {/* HERO + MUDANÇAS — mobile: coluna; desktop: 7/5 */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <HeroHealthCard loaded={d.loaded} score={d.score} exams={d.stats.exams} importante={d.importante} moderada={d.moderada} lastExam={d.lastExam} onDetails={() => navigate('/tendencias')} onFirstExam={() => navigate('/exams/create')} />
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <ChangesSinceExam worsened={d.worsened} improved={d.improved} onView={() => navigate('/evolucao')} loaded={d.loaded} />
        </Grid>
      </Grid>

      {/* PRÓXIMOS PASSOS — onboarding progressivo p/ usuário novo/perfil incompleto; some quando pronto */}
      <NextStepsCard exams={d.stats.exams} />

      {/* DR. EXAME — insight + CTA chat (já com contexto) */}
      <Box sx={{ mt: 2 }}>
        <AiCard tip={null} onChat={() => navigate('/chat')} />
      </Box>

      {/* SEUS INDICADORES — tiles (mobile 2x2, desktop 1x4).
          "Em dia"/"sem fatores" SÓ com cálculo real: sem dados o tile é neutro ("Sem dados")
          e diz o que destrava — ausência de informação nunca vira normalidade. */}
      <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <IndicatorTile idx={0} icon={<Heartbeat size={22} weight="duotone" />} tone={cardioLevel ? (cardioFactors > 0 ? 'error' : 'success') : 'info'} label="Cardiometabólico"
            value={cardioLevel || (d.loaded ? 'Sem dados' : '—')} sub={cardioLevel
              ? (cardioFactors > 0 ? `${cardioFactors} fator${cardioFactors > 1 ? 'es' : ''} de risco` : 'sem fatores')
              : (d.loaded ? (d.stats.exams > 0 ? 'sem colesterol, peso ou pressão' : 'envie um exame ou registre peso/pressão') : '')}
            onClick={() => navigate(d.stats.exams > 0 ? '/tendencias' : '/exams/create')} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <BiologicalAgeCard />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <IndicatorTile idx={2} icon={<Stethoscope size={22} weight="duotone" />} tone="primary" label="Seus exames"
            value={d.loaded ? String(d.stats.exams) : '—'} sub={d.stats.exams === 0 && d.loaded ? 'envie o primeiro' : `${d.stats.abnormal} alterado${d.stats.abnormal === 1 ? '' : 's'}`} onClick={() => navigate('/exams')} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <IndicatorTile idx={3} icon={<ChartLineUp size={22} weight="duotone" />} tone="info" label="Evolução" value={totalResults > 0 ? String(totalResults) : (d.loaded ? 'Sem dados' : '—')} sub={totalResults > 0 ? 'histórico de tendências' : (d.loaded ? 'após o 1º exame' : '')} onClick={() => navigate('/evolucao')} />
        </Grid>
      </Grid>

      {/* ATIVIDADE FÍSICA (Health Connect) — só existe no APK; no web o card retorna null.
          Só no perfil TITULAR: o celular é do titular, então os passos do aparelho são
          dele — no dashboard de um dependente o card mostraria os passos do pai. */}
      {(!d.me?.relationship || d.me.relationship === 'Titular') && (
        <Box sx={{ mt: 2, display: 'grid', gap: 2 }}>
          <ActivityCard lastExamAt={d.lastExam} />
          <RestingHeartCard />
        </Box>
      )}

      {/* "DESDE SEU ÚLTIMO EXAME" (assinatura do produto): o que mudou no dia-a-dia
          entre exames — só existe com atividade sincronizada + exames extraídos */}
      <Box sx={{ mt: 2 }}>
        <SinceExamCard lastExamAt={d.lastExam} />
      </Box>

      {/* AÇÕES RÁPIDAS + CRÉDITOS */}
      <Box sx={{ mt: 2.5 }}>
        <QuickActions />
      </Box>
      <Box sx={{ mt: 2 }}>
        <CreditsCard credits={d.credits} onClick={() => navigate('/planos')} />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
        <ShareHealthButton score={d.score ?? undefined} />
      </Box>
      <ReviewPrompt trigger={d.loaded && d.stats.exams > 0} />

      {/* Oferta de biometria — DIALOG (o card flutuante de rodapé se perdia atrás da
          MobileBottomNav e parecia "sumido"; dialog é o padrão de app de banco). */}
      <Dialog open={bioOffer} onClose={() => setBioOffer(false)} PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'text.primary' }}>🔐 Entrar com biometria?</DialogTitle>
        <DialogContent><Typography sx={{ color: 'text.secondary' }}>Ative a entrada por face/digital neste aparelho. Na próxima vez, você entra sem digitar senha — mais rápido e seguro.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setBioOffer(false)} sx={{ textTransform: 'none' }}>Agora não</Button>
          <GradientButton onClick={() => { BiometricService.enroll(token() || '', false); setBioOffer(false); }}>Ativar biometria</GradientButton>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};
