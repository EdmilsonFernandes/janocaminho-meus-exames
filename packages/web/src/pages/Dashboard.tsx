import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Grid, CircularProgress, Stack, Chip } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { syncPushToken } from '../push';
import { DrExame } from '../components/DrExame';

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
  const [deps, setDeps] = useState(0);
  const [lastExam, setLastExam] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const tip = TIPS[new Date().getDate() % TIPS.length];

  useEffect(() => {
    (async () => {
      const h = { Authorization: `Bearer ${token()}` };
      try {
        const pidQ = pid ? `&patientId=${pid}` : '';
        const e = await fetch(`${API_URL}/exams?_start=0&_end=1${pidQ}`, { headers: h });
        const eData = await e.json().catch(() => []);
        setStats((s) => ({ ...s, exams: readTotal(e) }));
        if (Array.isArray(eData) && eData[0]?.performedAt) setLastExam(eData[0].performedAt);
        const a = await fetch(`${API_URL}/items?abnormal=true&_start=0&_end=1${pidQ}`, { headers: h });
        setStats((s) => ({ ...s, abnormal: readTotal(a) }));
        const p = await fetch(`${API_URL}/patients`, { headers: h });
        if (p.ok) { const pd = await p.json(); setDeps(Array.isArray(pd) ? pd.length : 0); }
      } catch { /* ignore */ }
      if (pid) {
        try {
          const sr = await fetch(`${API_URL}/patients/${pid}/health-score`, { headers: h });
          if (sr.ok) { const sd = await sr.json(); setScore(typeof sd.score === 'number' ? sd.score : null); }
        } catch { /* ignore */ }
      } else {
        setScore(null);
      }
      void syncPushToken(); // registra token FCM do dispositivo após login (no-op no web)
    })();
  }, [pid]);

  const scoreColor = (s: number) => (s >= 80 ? '#2e7d32' : s >= 60 ? '#e65100' : '#c62828');

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1080, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 0.5 }}>
        <DrExame size={56} sx={{ borderRadius: '18%' }} />
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>Meus Exames</Typography>
          <Typography variant="body2" color="text.secondary">Seu assistente de saúde com IA — educativo, não substitui o médico.</Typography>
        </Box>
      </Stack>

      {/* Score de saúde */}
      {score !== null && (
        <Card sx={{ mt: 3, borderRadius: 4, background: 'linear-gradient(135deg,#ffffff,#e6f7f6)' }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <CircularProgress variant="determinate" value={score} size={104} thickness={6} sx={{ color: scoreColor(score), '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }} />
              <Box sx={{ top: 0, left: 0, bottom: 0, right: 0, position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1 }}>{score}</Typography>
                <Typography variant="caption" color="text.secondary">/ 100</Typography>
              </Box>
            </Box>
            <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Seu Score de Saúde</Typography>
              <Typography variant="body2" color="text.secondary">
                {score >= 80 ? 'Tudo bem! A maioria dos seus valores está dentro da faixa.' : score >= 60 ? 'Atenção a alguns valores — vale conversar com seu médico.' : 'Vários valores fora da faixa no último exame — procure orientação médica.'}
              </Typography>
              <Typography variant="caption" color="text.secondary">*Baseado no último exame laboratorial. Educativo, não substitui o médico.</Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Cards de estatística — 4 para preencher a grade no desktop */}
      <Grid container spacing={2} sx={{ mt: score === null ? 2 : 1, mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card sx={{ height: '100%' }}><CardContent>
            <Typography variant="caption" color="text.secondary">Exames enviados</Typography>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'primary.main' }}>{stats.exams}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card sx={{ height: '100%' }}><CardContent>
            <Typography variant="caption" color="text.secondary">Valores alterados</Typography>
            <Typography variant="h3" sx={{ fontWeight: 800, color: stats.abnormal ? 'error.main' : 'success.main' }}>{stats.abnormal}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card sx={{ height: '100%' }}><CardContent>
            <Typography variant="caption" color="text.secondary">Perfis (dependentes)</Typography>
            <Typography variant="h3" sx={{ fontWeight: 800 }}>{deps}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card sx={{ height: '100%' }}><CardContent>
            <Typography variant="caption" color="text.secondary">Última atualização</Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2, mt: 1 }}>{lastExam ? new Date(lastExam).toLocaleDateString('pt-BR') : '—'}</Typography>
          </CardContent></Card>
        </Grid>
      </Grid>

      {/* Dica do Dr. Exame — premium filler */}
      <Card variant="outlined" sx={{ mb: 2, borderRadius: 4, borderColor: 'secondary.main', background: 'linear-gradient(135deg,#fffaf3,#fdf3e7)' }}>
        <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          <LightbulbIcon sx={{ color: '#d4a574', mt: 0.3 }} />
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#b88a54' }}>Dica do Dr. Exame</Typography>
            <Typography variant="body2" sx={{ mt: 0.3 }}>{tip}</Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Atalhos premium */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', background: 'linear-gradient(135deg, rgba(32,178,170,.08), rgba(212,165,116,.08))', borderColor: 'rgba(32,178,170,.25)' }}><CardContent>
            <Typography variant="h6">📈 Evolução da minha saúde</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>O que subiu, o que caiu e a previsão dos próximos meses.</Typography>
            <Button variant="contained" startIcon={<ShowChartIcon />} onClick={() => navigate('/evolucao')}>Ver evolução</Button>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}><CardContent>
            <Typography variant="h6">🧾 Relatório completo</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Junte seus exames num documento para o médico.</Typography>
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => navigate('/relatorio')}>Gerar relatório</Button>
          </CardContent></Card>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mt: 0 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ height: '100%' }}><CardContent>
            <Typography variant="h6">Enviar exame</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>PDF/imagem — a IA extrai por visão.</Typography>
            <Button variant="contained" startIcon={<UploadFileIcon />} onClick={() => navigate('/exams/create')}>Enviar</Button>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ height: '100%' }}><CardContent>
            <Typography variant="h6">Saúde da Família</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Compare o score de cada dependente.</Typography>
            <Button variant="outlined" startIcon={<Diversity3Icon />} onClick={() => navigate('/familia')}>Ver família</Button>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ height: '100%' }}><CardContent>
            <Typography variant="h6">Assistente de saúde</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Pergunte sobre seus exames.</Typography>
            <Button variant="outlined" startIcon={<AutoAwesomeIcon />} onClick={() => navigate('/chat')}>Conversar</Button>
          </CardContent></Card>
        </Grid>
      </Grid>

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 3 }}>
        <Chip size="small" label="🔒 LGPD" variant="outlined" />
        <Chip size="small" label="🧠 IA não-diagnóstica" variant="outlined" />
        <Chip size="small" label="📄 Extração por visão" variant="outlined" />
      </Stack>
    </Box>
  );
};
