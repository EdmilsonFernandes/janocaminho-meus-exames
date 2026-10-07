import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useNotify } from 'react-admin';
import { API_URL, apiHeaders } from '../../config';
import { hapticLight } from '../../utils/haptic';
import { tealText } from '../../theme';

/**
 * PersonaSwitcher — Alternador de perspectiva do paciente entre Saúde Geral e Lente Esportiva.
 * Permite "virar a lente" com 1 toque direto no topo do painel, sem formulários burocráticos.
 */
export const PersonaSwitcher = ({ active }: { active: boolean }) => {
  const notify = useNotify();

  const handleToggle = async (next: boolean) => {
    if (next === active) return;
    hapticLight();
    try {
      const r = await fetch(`${API_URL}/sports/profile`, {
        method: 'PUT',
        headers: apiHeaders(true),
        body: JSON.stringify({ active: next }),
      });
      if (!r.ok) {
        notify('Não foi possível alternar o modo no momento.', { type: 'error' });
        return;
      }
      notify(next ? 'Lente de alta performance esportiva ativada ⚡' : 'Modo de saúde preventiva geral ativado 🌿', { type: 'info' });
      window.dispatchEvent(new Event('sports-profile-changed'));
    } catch {
      notify('Falha ao alternar a lente.', { type: 'error' });
    }
  };

  return (
    <Box
      sx={{
        mb: 2,
        p: 0.5,
        borderRadius: '999px',
        bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
        border: '1px solid',
        borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
      }}
    >
      {/* Botão 1: Saúde Geral */}
      <Box
        component="button"
        onClick={() => void handleToggle(false)}
        sx={{
          flex: 1,
          py: 0.9,
          px: { xs: 1, sm: 2 },
          borderRadius: '999px',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.75,
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          bgcolor: !active ? 'background.paper' : 'transparent',
          boxShadow: !active ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
          color: !active ? 'text.primary' : 'text.secondary',
          '&:hover': {
            color: 'text.primary',
          },
        }}
      >
        <Box component="span" sx={{ fontSize: 14 }}>🌿</Box>
        <Typography sx={{ fontSize: { xs: 12, sm: 13 }, fontWeight: !active ? 800 : 600, color: 'inherit' }}>
          Saúde Geral
        </Typography>
      </Box>

      {/* Botão 2: Lente Esportiva */}
      <Box
        component="button"
        onClick={() => void handleToggle(true)}
        sx={{
          flex: 1,
          py: 0.9,
          px: { xs: 1, sm: 2 },
          borderRadius: '999px',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.75,
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          bgcolor: active
            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
            : 'transparent',
          background: active
            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
            : 'transparent',
          boxShadow: active ? '0 2px 10px rgba(245, 158, 11, 0.35)' : 'none',
          color: active ? '#ffffff' : 'text.secondary',
          '&:hover': {
            color: active ? '#ffffff' : (t) => tealText(t.palette.mode),
          },
        }}
      >
        <Box component="span" sx={{ fontSize: 14 }}>⚡</Box>
        <Typography sx={{ fontSize: { xs: 12, sm: 13 }, fontWeight: active ? 800 : 600, color: 'inherit' }}>
          Lente Esportiva
        </Typography>
      </Box>
    </Box>
  );
};
