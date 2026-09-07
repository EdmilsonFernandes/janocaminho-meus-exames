import { Box, Stack, Typography, Chip } from '@mui/material';

const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

export const DashboardHeader = ({ firstName }: { firstName: string }) => (
  <Box sx={{
    mb: 2,
    p: { xs: 2, sm: 2.5 },
    borderRadius: '20px',
    background: (t) => t.palette.mode === 'dark'
      ? 'radial-gradient(ellipse at 15% 20%, rgba(32,178,170,0.14), transparent 55%), radial-gradient(ellipse at 85% 80%, rgba(212,165,116,0.08), transparent 50%), rgba(26,36,36,0.5)'
      : 'radial-gradient(ellipse at 15% 20%, rgba(32,178,170,0.08), transparent 60%), radial-gradient(ellipse at 85% 80%, rgba(212,165,116,0.05), transparent 50%), rgba(255,255,255,0.7)',
    border: '1px solid',
    borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(32,178,170,0.15)',
    boxShadow: '0 2px 10px rgba(0,0,0,0.02), 0 8px 24px rgba(32,178,170,0.03)',
    position: 'relative',
    overflow: 'hidden',
    '&::after': {
      content: '""',
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '2px',
      background: 'linear-gradient(90deg, transparent, rgba(32,178,170,0.5) 30%, rgba(212,165,116,0.4) 70%, transparent)',
    },
  }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5}>
      <Box>
        <Typography sx={{
          fontWeight: 800,
          letterSpacing: '-0.02em',
          fontSize: { xs: '1.45rem', sm: '1.85rem' },
          lineHeight: 1.2,
          color: 'text.primary',
        }}>
          {saudacao()}, {firstName || 'tudo bem?'} 👋
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.35, display: 'block', fontSize: { xs: 12, sm: 13 } }}>
          Seu painel de saúde — educativo, não substitui o médico.
        </Typography>
      </Box>

      <Chip
        icon={
          <Box sx={{
            width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981', ml: '6px !important',
            boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.7)',
            animation: 'dxPulseGreen 2s infinite',
            '@keyframes dxPulseGreen': {
              '0%': { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.7)' },
              '70%': { transform: 'scale(1)', boxShadow: '0 0 0 6px rgba(16, 185, 129, 0)' },
              '100%': { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(16, 185, 129, 0)' },
            },
          }} />
        }
        label="Sincronizado"
        size="small"
        sx={{
          bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.10)',
          color: (t) => t.palette.mode === 'dark' ? '#34d399' : '#047857',
          fontWeight: 700,
          fontSize: 11,
          height: 26,
          borderRadius: '999px',
          border: '1px solid rgba(16,185,129,0.2)',
          display: { xs: 'none', sm: 'inline-flex' },
        }}
      />
    </Stack>
  </Box>
);

