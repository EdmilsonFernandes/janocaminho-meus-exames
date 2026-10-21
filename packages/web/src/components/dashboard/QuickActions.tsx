import { Box, Card, CardContent, Typography } from '@mui/material';
import { UploadSimple, ChartLineUp, UsersThree, FileText } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { RADIUS, tealText } from '../../theme';

// Quick Actions — tiles compactos (ícone acima, texto abaixo).
// "Enviar exame" segue variant="outlined" com destaque teal (borda + label forte):
// a única CTA PRIMÁRIA (gradiente) do dashboard é o HeroHealthCard (dieta de primária).
// IA fica no AiCard (hero), não duplica aqui.
const ACTIONS = [
  { icon: <UploadSimple size={22} weight="duotone" />, label: 'Enviar exame', to: '/exams/create', primary: true, color: '#20b2aa' },
  { icon: <ChartLineUp size={22} weight="duotone" />, label: 'Evolução', to: '/evolucao', primary: false, color: '#0ea5e9' },
  { icon: <UsersThree size={22} weight="duotone" />, label: 'Família', to: '/familia', primary: false, color: '#f59e0b' },
  { icon: <FileText size={22} weight="duotone" />, label: 'Relatório', to: '/relatorio', primary: false, color: '#8b5cf6' },
] as const;

export const QuickActions = () => {
  const navigate = useNavigate();
  return (
    // Container query (não breakpoint de viewport): as colunas respondem à LARGURA DA COLUNA
    // do app (shell centraliza em ~360px). Com Grid xs/sm por viewport, janelas de 600-900px
    // viravam 4 colunas de 81px e os cards quebravam ("Enviar exame" em 2 linhas, cortado).
    // '@sm' no sx = @container (min-width: 600px) medindo ESTE Box. Fix 2026-09-07.
    // Padrão container-query correto: o wrapper é o query container; o grid (FILHO) tem a
    // regra @container — um elemento não pode ser seu próprio container (spec CSS).
    <Box sx={{ containerType: 'inline-size' }}>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 1.5,
        '@container (min-width: 600px)': { gridTemplateColumns: 'repeat(4, 1fr)' },
      }}>
      {ACTIONS.map((a, i) => (
        <Box key={a.label} sx={{ height: '100%', display: 'flex' }}>
          <Card
            variant="outlined"
            onClick={() => navigate(a.to)}
            sx={{
              width: '100%',
              height: '100%',
              cursor: 'pointer',
              textAlign: 'center',
              borderRadius: RADIUS.card,
              transition: 'transform .18s cubic-bezier(.34,1.56,.64,1), box-shadow .2s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              '&:hover': {
                transform: 'translateY(-3px)',
                boxShadow: `0 8px 24px rgba(0,0,0,.08)`,
                '& .action-icon-box': { transform: 'scale(1.12)' },
              },
              '&:active': { transform: 'scale(.96)' },
              border: a.primary ? '1.5px solid' : '1px solid',
              borderColor: a.primary ? 'rgba(32,178,170,.45)' : 'divider',
              bgcolor: (t) => (a.primary && t.palette.mode === 'dark') ? 'rgba(32,178,170,.08)' : 'background.paper',
              animation: `dxActionIn .35s cubic-bezier(.16,1,.3,1) ${i * 0.06}s both`,
              '@keyframes dxActionIn': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
            }}
          >
            <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Box className="action-icon-box" sx={{
                width: 44, height: 44, borderRadius: RADIUS.tile, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: a.color,
                bgcolor: (t) => t.palette.mode === 'dark' ? `${a.color}15` : `${a.color}10`,
                border: `1px solid ${a.color}25`,
                transition: 'background-color .2s, transform .2s ease',
              }}>{a.icon}</Box>
              <Typography variant="caption" sx={{ fontWeight: a.primary ? 800 : 700, color: a.primary ? (t) => tealText(t.palette.mode) : 'text.primary' }}>{a.label}</Typography>
            </CardContent>
          </Card>
        </Box>
      ))}
      </Box>
    </Box>
  );
};
