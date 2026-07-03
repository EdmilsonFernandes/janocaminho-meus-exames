import { Box, Card, CardContent, Grid, Typography } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import DescriptionIcon from '@mui/icons-material/Description';
import { useNavigate } from 'react-router-dom';

// Quick Actions — tiles compactos (ícone acima, texto abaixo).
// "Enviar exame" é a CTA PRIMÁRIA: tile preenchido (gradiente teal) pra se destacar
// das demais (que são tiles paper secundários). IA fica no AiCard (hero), não duplica aqui.
const ACTIONS = [
  { icon: <UploadFileIcon />, label: 'Enviar exame', to: '/exams/create', primary: true },
  { icon: <ShowChartIcon />, label: 'Evolução', to: '/evolucao', primary: false },
  { icon: <Diversity3Icon />, label: 'Família', to: '/familia', primary: false },
  { icon: <DescriptionIcon />, label: 'Relatório', to: '/relatorio', primary: false },
] as const;

export const QuickActions = () => {
  const navigate = useNavigate();
  return (
    <Grid container spacing={1.5}>
      {ACTIONS.map((a) => (
        <Grid size={{ xs: 6, sm: 3 }} key={a.label}>
          <Card
            onClick={() => navigate(a.to)}
            sx={{
              height: '100%', cursor: 'pointer', textAlign: 'center', transition: 'all .15s',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: 6 },
              border: '1px solid', borderColor: a.primary ? 'primary.main' : 'divider',
              background: a.primary ? 'linear-gradient(135deg,#20b2aa,#178f89)' : undefined,
              bgcolor: a.primary ? undefined : 'background.paper',
              color: a.primary ? '#fff' : undefined,
              boxShadow: a.primary ? '0 6px 16px rgba(32,178,170,0.30)' : undefined,
            }}
          >
            <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Box sx={{ width: 42, height: 42, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: a.primary ? '#fff' : 'text.secondary', bgcolor: a.primary ? 'rgba(255,255,255,0.22)' : 'action.hover', '& svg': { fontSize: 22 } }}>{a.icon}</Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: a.primary ? '#fff' : 'text.primary' }}>{a.label}</Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};
