import { Button, Card, CardContent, Grid, Typography } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useNavigate } from 'react-router-dom';

// Grid de ações rápidas (Evolução, Relatório, Enviar, Família, IA). Extração pura dos 2 grids originais.
// (Consolidação em quick-actions visual = task #15.)
export const QuickActions = () => {
  const navigate = useNavigate();
  return (
    <>
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
    </>
  );
};
