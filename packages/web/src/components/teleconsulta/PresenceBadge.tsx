import { Box, Stack, Typography, keyframes } from '@mui/material';
import PersonSearchRoundedIcon from '@mui/icons-material/PersonSearchRounded';
import SensorsRoundedIcon from '@mui/icons-material/SensorsRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import { useTheme } from '@mui/material';

export type PresenceState = 'not_joined' | 'connecting' | 'present' | 'reconnecting' | 'left';

const blink = keyframes`0%,100%{opacity:1}50%{opacity:.35}`;
const spin = keyframes`to{transform:rotate(360deg)}`;

/**
 * PresenceBadge — presentational, SEM wiring (o Teleconsulta.tsx integra depois).
 * Mostra o estado de presença do participante na sala (paciente ou médico):
 * not_joined | connecting | present | reconnecting | left.
 */
export const PresenceBadge = ({ state, dense = false }: { state: PresenceState; dense?: boolean }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const CFG: Record<PresenceState, { label: string; color: string; bg: string; border: string }> = {
    not_joined: {
      label: 'Ainda não entrou',
      color: isDark ? 'rgba(232,238,240,0.65)' : '#475569',
      bg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
      border: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)',
    },
    connecting: {
      label: 'Conectando…',
      color: '#2dd4bf',
      bg: isDark ? 'rgba(13,148,136,0.15)' : 'rgba(13,148,136,0.10)',
      border: 'rgba(45,212,191,0.35)',
    },
    present: {
      label: 'Presente na sala',
      color: isDark ? '#34d399' : '#059669',
      bg: isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.10)',
      border: 'rgba(52,211,153,0.35)',
    },
    reconnecting: {
      label: 'Reconectando…',
      color: isDark ? '#fbbf24' : '#b45309',
      bg: isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.10)',
      border: 'rgba(251,191,36,0.35)',
    },
    left: {
      label: 'Saiu',
      color: isDark ? 'rgba(232,238,240,0.5)' : '#64748b',
      bg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
    },
  };

  const c = CFG[state];

  const icon = () => {
    switch (state) {
      case 'not_joined':
        return <PersonSearchRoundedIcon sx={{ fontSize: dense ? 13 : 15, color: c.color }} />;
      case 'connecting':
        return <SyncRoundedIcon sx={{ fontSize: dense ? 13 : 15, color: c.color, animation: `${spin} 1.4s linear infinite`, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }} />;
      case 'present':
        return <FiberManualRecordRoundedIcon sx={{ fontSize: dense ? 12 : 14, color: c.color, animation: `${blink} 1.6s ease-in-out infinite`, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }} />;
      case 'reconnecting':
        return <SyncRoundedIcon sx={{ fontSize: dense ? 13 : 15, color: c.color, animation: `${spin} 0.9s linear infinite`, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }} />;
      case 'left':
        return <LogoutRoundedIcon sx={{ fontSize: dense ? 13 : 15, color: c.color }} />;
    }
  };

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.5}
      aria-live={state === 'connecting' || state === 'reconnecting' ? 'polite' : undefined}
      sx={{
        display: 'inline-flex',
        px: 1,
        py: dense ? 0.15 : 0.35,
        borderRadius: '999px',
        bgcolor: c.bg,
        border: '1px solid',
        borderColor: c.border,
        width: 'fit-content',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center' }}>{icon()}</Box>
      <Typography sx={{ fontSize: dense ? 10.5 : 11.5, fontWeight: 800, color: c.color, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
        {c.label}
      </Typography>
    </Stack>
  );
};
