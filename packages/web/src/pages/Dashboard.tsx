import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Grid, CircularProgress } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';

const readTotal = (r: Response) => Number(r.headers.get('X-Total-Count') ?? r.headers.get('content-range')?.split('/')?.[1] ?? '0');

export const Dashboard = () => {
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const [stats, setStats] = useState({ exams: 0, abnormal: 0 });
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const h = { Authorization: `Bearer ${token()}` };
      try {
        const pidQ = pid ? `&patientId=${pid}` : '';
        const e = await fetch(`${API_URL}/exams?_start=0&_end=1${pidQ}`, { headers: h });
        const a = await fetch(`${API_URL}/items?abnormal=true&_start=0&_end=1${pid ? `&patientId=${pid}` : ''}`, { headers: h });
        setStats({ exams: readTotal(e), abnormal: readTotal(a) });
      } catch { /* ignore */ }
      if (pid) {
        try {
          const sr = await fetch(`${API_URL}/patients/${pid}/health-score`, { headers: h });
          if (sr.ok) { const sd = await sr.json(); setScore(typeof sd.score === 'number' ? sd.score : null); }
        } catch { /* ignore */ }
      } else {
        setScore(null);
      }
    })();
  }, [pid]);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" gutterBottom>Meus Exames 🩺</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Envie seus exames, acompanhe a evolução dos valores e converse com a IA sobre sua saúde (análise educativa, não substitui o médico).
      </Typography>

      {score !== null && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <CircularProgress
                variant="determinate"
                value={score}
                size={104}
                thickness={6}
                sx={{ color: score >= 80 ? '#2e7d32' : score >= 60 ? '#e65100' : '#c62828', '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }}
              />
              <Box sx={{ top: 0, left: 0, bottom: 0, right: 0, position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1 }}>{score}</Typography>
                <Typography variant="caption" color="text.secondary">/ 100</Typography>
              </Box>
            </Box>
            <Box sx={{ flex: '1 1 220px' }}>
              <Typography variant="h6">Seu Score de Saúde</Typography>
              <Typography variant="body2" color="text.secondary">
                {score >= 80
                  ? 'Tudo bem! A maioria dos seus valores está dentro da faixa.'
                  : score >= 60
                  ? 'Atenção a alguns valores — vale conversar com seu médico.'
                  : 'Vários valores fora da faixa no último exame — procure orientação médica.'}
              </Typography>
              <Typography variant="caption" color="text.secondary">*Baseado no último exame laboratorial. Educativo, não substitui o médico.</Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card><CardContent><Typography color="text.secondary">Exames</Typography><Typography variant="h3">{stats.exams}</Typography></CardContent></Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card><CardContent><Typography color="text.secondary">Valores alterados</Typography><Typography variant="h3" color={stats.abnormal ? 'error' : 'inherit'}>{stats.abnormal}</Typography></CardContent></Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ background: 'linear-gradient(135deg,#33688614,#5FD35A14)', borderColor: '#33688655' }}><CardContent>
            <Typography variant="h6">📈 Evolução da minha saúde</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>O que subiu, o que caiu e a previsão dos próximos meses.</Typography>
            <Button variant="contained" startIcon={<ShowChartIcon />} onClick={() => navigate('/evolucao')}>Ver evolução</Button>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined"><CardContent>
            <Typography variant="h6">🧾 Relatório completo</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Junte seus exames num documento para o médico.</Typography>
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => navigate('/relatorio')}>Gerar relatório</Button>
          </CardContent></Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined"><CardContent>
            <Typography variant="h6">Enviar exame</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>PDF/imagem — a IA extrai por visão.</Typography>
            <Button variant="contained" startIcon={<UploadFileIcon />} onClick={() => navigate('/exams/create')}>Enviar</Button>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined"><CardContent>
            <Typography variant="h6">Saúde da Família</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Compare o score de cada dependente.</Typography>
            <Button variant="outlined" startIcon={<MedicalServicesIcon />} onClick={() => navigate('/familia')}>Ver família</Button>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined"><CardContent>
            <Typography variant="h6">Assistente de saúde</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Pergunte sobre seus exames.</Typography>
            <Button variant="outlined" startIcon={<MedicalServicesIcon />} onClick={() => navigate('/chat')}>Conversar</Button>
          </CardContent></Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 4 }}>
        <Typography variant="body2" color="text.secondary">
          Dica: preencha seu <strong>perfil clínico</strong> (menu “Perfil”) com condições e medicações — a IA usa isso para contextualizar as análises.
        </Typography>
      </Box>
    </Box>
  );
};
