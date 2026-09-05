import { Box, Card, CardContent, Grid, Typography } from '@mui/material';
import { UploadSimple, ChartLineUp, UsersThree, FileText } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

// Quick Actions — tiles compactos (ícone acima, texto abaixo).
// "Enviar exame" é a CTA PRIMÁRIA: tile preenchido (gradiente teal) com borda animada premium.
// IA fica no AiCard (hero), não duplica aqui.
const ACTIONS = [
  { icon: <UploadSimple size={22} weight="duotone" />, label: 'Enviar exame', to: '/exams/create', primary: true },
  { icon: <ChartLineUp size={22} weight="duotone" />, label: 'Evolução', to: '/evolucao', primary: false },
  { icon: <UsersThree size={22} weight="duotone" />, label: 'Família', to: '/familia', primary: false },
  { icon: <FileText size={22} weight="duotone" />, label: 'Relatório', to: '/relatorio', primary: false },
] as const;

export const QuickActions = () => {
  const navigate = useNavigate();
  return (
    <Grid container spacing={1.5}>
      {ACTIONS.map((a, i) => (
        <Grid size={{ xs: 6, sm: 3 }} key={a.label}>
          {a.primary ? (
            /* CTA primário — borda animada com rotating conic-gradient */
            <Box sx={{
              position: 'relative', borderRadius: '16px', p: '2px',
              background: 'conic-gradient(from 0deg, #20b2aa, #059669, #20b2aa, #5fc9c3, #20b2aa)',
              backgroundSize: '200% 200%',
              animation: 'dxBorderSpin 3s linear infinite',
              '@keyframes dxBorderSpin': {
                from: { filter: 'hue-rotate(0deg)' },
                to: { filter: 'hue-rotate(360deg)' },
              },
            }}>
              <Card
                onClick={() => navigate(a.to)}
                sx={{
                  height: '100%', cursor: 'pointer', textAlign: 'center',
                  borderRadius: '14px', border: 'none',
                  background: 'linear-gradient(135deg,#20b2aa,#178f89)',
                  color: '#fff',
                  boxShadow: '0 6px 20px rgba(32,178,170,0.30)',
                  transition: 'transform .15s ease, box-shadow .15s ease',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 8px 28px rgba(32,178,170,0.40)' },
                  '&:active': { transform: 'scale(.96)' },
                }}
              >
                <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1.75, '&:last-child': { pb: 1.75 } }}>
                  <Box sx={{
                    width: 44, height: 44, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.28), rgba(255,255,255,0.12))',
                    color: '#fff',
                  }}>{a.icon}</Box>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#fff' }}>{a.label}</Typography>
                </CardContent>
              </Card>
            </Box>
          ) : (
            <Card
              onClick={() => navigate(a.to)}
              sx={{
                height: '100%', cursor: 'pointer', textAlign: 'center',
                transition: 'transform .15s ease, box-shadow .15s ease',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: 6 },
                '&:active': { transform: 'scale(.96)' },
                border: '1px solid', borderColor: 'divider',
                bgcolor: 'background.paper',
                animation: `dxActionIn .35s cubic-bezier(.16,1,.3,1) ${i * 0.06}s both`,
                '@keyframes dxActionIn': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
              }}
            >
              <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1.75, '&:last-child': { pb: 1.75 } }}>
                <Box sx={{
                  width: 44, height: 44, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'text.secondary',
                  background: (t) => t.palette.mode === 'dark' ? 'rgba(32,178,170,.08)' : 'rgba(32,178,170,.06)',
                  transition: 'background-color .2s, transform .2s',
                  '&:hover': { transform: 'scale(1.08)' },
                }}>{a.icon}</Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>{a.label}</Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      ))}
    </Grid>
  );
};
