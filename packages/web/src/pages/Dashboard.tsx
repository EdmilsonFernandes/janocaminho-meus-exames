import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Grid, CircularProgress, Stack, Chip, Alert, Avatar } from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import BoltIcon from '@mui/icons-material/Bolt';
import { useNavigate } from 'react-router-dom';
import { API_URL, token, photoUrlFor } from '../config';
import { useSelectedPatient } from '../patient-context';
import { syncPushToken } from '../push';

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

const DONUT = [
  { key: 'bons', name: 'Bons (na faixa)', color: '#10b981' },
  { key: 'alerta', name: 'Alerta (abaixo)', color: '#f59e0b' },
  { key: 'alterados', name: 'Alterados', color: '#ef4444' },
] as const;

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
        const fe = await fetch(`${API_URL}/exams?_start=0&_end=1&status=FAILED${pidQ}`, { headers: h });
        setFailed(readTotal(fe));
        const a = await fetch(`${API_URL}/items?abnormal=true&_start=0&_end=1${pidQ}`, { headers: h });
        setStats((s) => ({ ...s, abnormal: readTotal(a) }));
        const p = await fetch(`${API_URL}/patients`, { headers: h });
        if (p.ok) { const pd = await p.json(); setDeps(Array.isArray(pd) ? pd.length : 0); setMe(pd.find((x: any) => x.id === pid) ?? pd[0] ?? null); }
        const fs = await fetch(`${API_URL}/items/flag-summary${pid ? `?patientId=${pid}` : ''}`, { headers: h });
        if (fs.ok) { const fd = await fs.json(); setBuckets(fd.buckets ?? { bons: 0, alerta: 0, alterados: 0 }); }
        const st = await fetch(`${API_URL}/billing/status`, { headers: h });
        if (st.ok) { const sd = await st.json(); setCredits(typeof sd.credits === 'number' ? sd.credits : null); }
      } catch { /* ignore */ } finally { setLoaded(true); }
      void syncPushToken();
    })();
  }, [pid]);

  const scoreColor = (s: number) => (s >= 80 ? '#2e7d32' : s >= 60 ? '#e65100' : '#c62828');
  const creditColor = (c: number) => (c >= 100 ? '#10b981' : c >= 30 ? '#f59e0b' : '#ef4444');
  const totalVals = buckets.bons + buckets.alerta + buckets.alterados;
  const score = totalVals ? Math.round((buckets.bons / totalVals) * 100) : null; // consistente com o donut
  const donutData = DONUT.map((d) => ({ ...d, value: (buckets as any)[d.key] })).filter((d) => d.value > 0);

  const statCard = (label: string, value: React.ReactNode, color: string, to: string) => (
    <Grid size={{ xs: 6, md: 3 }}>
      <Card onClick={() => navigate(to)} sx={{ height: '100%', cursor: 'pointer', transition: 'all .15s', '&:hover': { transform: 'translateY(-2px)', boxShadow: 6, borderColor: color } }}>
        <CardContent>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Typography variant="h3" sx={{ fontWeight: 800, color }}>{value}</Typography>
        </CardContent>
      </Card>
    </Grid>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1080, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 0.5 }}>
        <Avatar src={me?.photoUrl ? photoUrlFor(me.id) : undefined} sx={{ width: 56, height: 56, bgcolor: 'primary.main', fontWeight: 800, fontSize: 22, boxShadow: '0 4px 12px rgba(32,178,170,.25)' }}>{me?.fullName?.charAt(0)?.toUpperCase()}</Avatar>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>Meus Exames</Typography>
          <Typography variant="body2" color="text.secondary">Seu assistente de saúde com IA — educativo, não substitui o médico.</Typography>
        </Box>
      </Stack>

      {!loaded && (
        <Card sx={{ mt: 3, borderRadius: 4, minHeight: 144, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
          <CircularProgress size={28} sx={{ color: 'primary.main' }} />
          <Typography sx={{ fontWeight: 600, color: 'text.secondary' }}>Calculando seu score…</Typography>
        </Card>
      )}
      {loaded && score !== null && (
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
              <Typography variant="caption" color="text.secondary">*Baseado em todos os seus exames extraídos. Educativo, não substitui o médico.</Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Aviso de exames que falharam (pra reprocessar) */}
      {failed > 0 && (
        <Alert severity="warning" sx={{ mt: 2, mb: 1, borderRadius: 3 }} action={<Button size="small" color="inherit" onClick={() => navigate('/exams')}>Ver</Button>} onClick={() => navigate('/exams')}>
          {failed} exame(s) falhou(aram) na leitura — abra e toque em “Re-extrair”.
        </Alert>
      )}

      {/* Badge de créditos (separada do score) */}
      {credits != null && (
        <Card onClick={() => navigate('/planos')} sx={{ mt: 2, mb: 2, cursor: 'pointer', borderRadius: 4, background: creditColor(credits) + '14', border: `1px solid ${creditColor(credits)}44` }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <BoltIcon sx={{ color: creditColor(credits), fontSize: 30 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 18, color: creditColor(credits) }}>{credits} créditos disponíveis</Typography>
              <Typography variant="caption" color="text.secondary">Toque para comprar mais ou ver o extrato</Typography>
            </Box>
            <Typography variant="button" sx={{ color: creditColor(credits), fontWeight: 700, display: { xs: 'none', sm: 'block' } }}>Planos →</Typography>
          </CardContent>
        </Card>
      )}

      {/* Contadores clicáveis */}
      <Grid container spacing={2} sx={{ mt: score === null ? 2 : 1, mb: 2 }}>
        {statCard('Exames enviados', stats.exams, 'primary.main', '/exams')}
        {statCard('Valores alterados', stats.abnormal, stats.abnormal ? 'error.main' : 'success.main', '/alterados')}
        {statCard('Perfis (dependentes)', deps, '#8b5cf6', '/familia')}
        {statCard('Última atualização', <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2, mt: 1 }}>{lastExam ? new Date(lastExam).toLocaleDateString('pt-BR') : '—'}</Typography>, '#0ea5e9', '/linha-do-tempo')}
      </Grid>

      {/* Donut de distribuição + Dica */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ height: '100%', borderRadius: 4 }}><CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Distribuição dos valores</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Últimos exames extraídos deste perfil.</Typography>
            {totalVals === 0 ? (
              <Typography color="text.secondary">Sem valores extraídos ainda. Envie um exame.</Typography>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                <Box sx={{ width: 150, height: 150, position: 'relative', flexShrink: 0 }}>
                  <ResponsiveContainer width={150} height={150}>
                    <PieChart>
                      <Pie data={donutData as any} dataKey="value" innerRadius={45} outerRadius={70} paddingAngle={2} stroke="none">
                        {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 24, lineHeight: 1 }}>{totalVals}</Typography>
                    <Typography variant="caption" color="text.secondary">valores</Typography>
                  </Box>
                </Box>
                <Stack spacing={1}>
                  {donutData.map((d) => (
                    <Stack key={d.key} direction="row" alignItems="center" spacing={1}>
                      <Box sx={{ width: 14, height: 14, borderRadius: 1, bgcolor: d.color }} />
                      <Typography variant="body2"><strong>{d.value}</strong> {d.name}{totalVals ? ` (${Math.round((d.value / totalVals) * 100)}%)` : ''}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card variant="outlined" sx={{ height: '100%', borderRadius: 4, borderColor: 'secondary.main', background: 'linear-gradient(135deg,#fffaf3,#fdf3e7)' }}>
            <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', height: '100%' }}>
              <LightbulbIcon sx={{ color: '#d4a574', mt: 0.3 }} />
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#b88a54' }}>Dica do Dr. Exame</Typography>
                <Typography variant="body2" sx={{ mt: 0.3 }}>{tip}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

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
        <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>Toque nos cards de contador para navegar.</Typography>
      </Stack>
    </Box>
  );
};
