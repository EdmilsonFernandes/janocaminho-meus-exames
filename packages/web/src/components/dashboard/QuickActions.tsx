import { Box, Card, CardContent, Typography } from '@mui/material';
import { UploadSimple, ChartLineUp, UsersThree, FileText } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

// Quick Actions — tiles compactos (ícone acima, texto abaixo).
// "Enviar exame" é a CTA PRIMÁRIA: tile preenchido (gradiente teal) com borda animada premium.
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
        <Box key={a.label}>
          {a.primary ? (
            /* CTA primário — borda animada com rotating conic-gradient */
            <Box sx={{
              position: 'relative', borderRadius: '20px', p: '2px',
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
                  borderRadius: '18px', border: 'none',
                  background: 'linear-gradient(135deg,#20b2aa,#178f89)',
                  color: '#fff',
                  boxShadow: '0 6px 20px rgba(32,178,170,0.30)',
                  transition: 'transform .18s cubic-bezier(.34,1.56,.64,1), box-shadow .2s ease',
                  position: 'relative',
                  overflow: 'hidden',
                  '&:hover': { transform: 'translateY(-3px) scale(1.01)', boxShadow: '0 10px 30px rgba(32,178,170,0.45)' },
                  '&:active': { transform: 'scale(.96)' },
                }}
              >
                {/* Mini "+" badge */}
                <Box sx={{
                  position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: '50%',
                  bgcolor: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 900, color: '#fff',
                }}>+</Box>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1.75, '&:last-child': { pb: 1.75 } }}>
                  <Box sx={{
                    width: 44, height: 44, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.28), rgba(255,255,255,0.12))',
                    color: '#fff',
                  }}>{a.icon}</Box>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: '#fff' }}>{a.label}</Typography>
                </CardContent>
              </Card>
            </Box>
          ) : (
            <Card
              onClick={() => navigate(a.to)}
              sx={{
                height: '100%', cursor: 'pointer', textAlign: 'center',
                borderRadius: '20px',
                transition: 'transform .18s cubic-bezier(.34,1.56,.64,1), box-shadow .2s ease',
                '&:hover': {
                  transform: 'translateY(-3px)',
                  boxShadow: `0 8px 24px rgba(0,0,0,.08)`,
                  '& .action-icon-box': { transform: 'scale(1.12)' },
                },
                '&:active': { transform: 'scale(.96)' },
                border: '1px solid', borderColor: 'divider',
                bgcolor: 'background.paper',
                animation: `dxActionIn .35s cubic-bezier(.16,1,.3,1) ${i * 0.06}s both`,
                '@keyframes dxActionIn': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
              }}
            >
              <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1.75, '&:last-child': { pb: 1.75 } }}>
                <Box className="action-icon-box" sx={{
                  width: 44, height: 44, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: a.color,
                  bgcolor: (t) => t.palette.mode === 'dark' ? `${a.color}15` : `${a.color}10`,
                  border: `1px solid ${a.color}25`,
                  transition: 'background-color .2s, transform .2s ease',
                }}>{a.icon}</Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>{a.label}</Typography>
              </CardContent>
            </Card>
          )}
        </Box>
      ))}
      </Box>
    </Box>
  );
};
