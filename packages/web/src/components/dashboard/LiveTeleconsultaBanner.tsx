import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button, Stack, Avatar, Chip } from '@mui/material';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useUpcomingTeleconsulta } from '../../hooks/useUpcomingTeleconsulta';
import { openTelemedicinaRoom } from '../../utils/telemedicina';
import { doctorPhotoUrl } from '../../config';
import { safeAvatar } from '../../utils/safeAvatar';

/**
 * Banner VIP de teleconsulta ao vivo / médico aguardando na sala.
 * Aparece no topo do Dashboard (imediatamente após a saudação), garantindo
 * que tanto no mobile quanto no desktop o paciente veja de imediato sem rolar a tela.
 */
export const LiveTeleconsultaBanner: React.FC = () => {
  const navigate = useNavigate();
  const tele = useUpcomingTeleconsulta();

  if (tele.status !== 'live' || !tele.item) {
    return null;
  }

  const handleJoin = () => {
    if (tele.item?.linkUrl) {
      void openTelemedicinaRoom(tele.item.linkUrl);
    } else if (tele.item?.id) {
      navigate(`/teleconsulta/${tele.item.id}`);
    } else {
      navigate('/telemedicina');
    }
  };

  const doctorDisplayName = tele.doctorName
    ? tele.doctorName.toLowerCase().startsWith('dr')
      ? tele.doctorName
      : `Dr(a). ${tele.doctorName}`
    : 'Médico responsável';

  const doctorPhoto = tele.item.doctor?.id ? doctorPhotoUrl(tele.item.doctor.id) : null;
  const initial = (tele.doctorName || 'M').charAt(0).toUpperCase();

  return (
    <Box
      sx={{
        mb: 2.5,
        borderRadius: '16px',
        p: { xs: 2, sm: 2.25 },
        background: 'linear-gradient(135deg, #093834 0%, #0d524d 50%, #178f89 100%)',
        color: '#ffffff',
        boxShadow: '0 8px 32px -4px rgba(23, 143, 137, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.15) inset',
        position: 'relative',
        overflow: 'hidden',
        animation: 'livePulseBorder 3s infinite ease-in-out',
        '@keyframes livePulseBorder': {
          '0%, 100%': {
            boxShadow: '0 8px 32px -4px rgba(23, 143, 137, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.15) inset',
          },
          '50%': {
            boxShadow: '0 12px 38px 0px rgba(23, 143, 137, 0.55), 0 0 0 2px rgba(32, 178, 170, 0.6) inset',
          },
        },
      }}
    >
      {/* Decorative ambient light */}
      <Box
        sx={{
          position: 'absolute',
          top: -30,
          right: -30,
          width: 140,
          height: 140,
          borderRadius: '50%',
          bgcolor: 'rgba(255, 255, 255, 0.1)',
          filter: 'blur(30px)',
          pointerEvents: 'none',
        }}
      />

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
        spacing={2}
      >
        {/* Left: Doctor info and status */}
        <Stack direction="row" spacing={1.75} alignItems="center">
          <Box sx={{ position: 'relative' }}>
            <Avatar
              src={doctorPhoto || undefined}
              sx={{
                width: { xs: 52, sm: 56 },
                height: { xs: 52, sm: 56 },
                border: '2.5px solid #20b2aa',
                boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                bgcolor: '#0f3d3a',
                color: '#20b2aa',
                fontWeight: 800,
                fontSize: 22,
              }}
            >
              {safeAvatar(doctorDisplayName, initial)}
            </Avatar>
            {/* Live radar beacon */}
            <Box
              sx={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                width: 16,
                height: 16,
                borderRadius: '50%',
                bgcolor: '#22c55e',
                border: '2px solid #093834',
                animation: 'beaconPulse 1.8s infinite',
                '@keyframes beaconPulse': {
                  '0%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0.7)' },
                  '70%': { boxShadow: '0 0 0 8px rgba(34, 197, 94, 0)' },
                  '100%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0)' },
                },
              }}
            />
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Chip
                size="small"
                icon={
                  <Box
                    sx={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      bgcolor: '#ffffff',
                      ml: '6px !important',
                      animation: 'blinkDot 1.2s infinite',
                      '@keyframes blinkDot': {
                        '0%, 100%': { opacity: 1 },
                        '50%': { opacity: 0.3 },
                      },
                    }}
                  />
                }
                label="AO VIVO • SALA LIBERADA"
                sx={{
                  bgcolor: '#ef4444',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: 11,
                  height: 22,
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                  '& .MuiChip-label': { px: 0.75, py: 0 },
                }}
              />
              {tele.roomCode && (
                <Typography
                  variant="caption"
                  sx={{
                    bgcolor: 'rgba(255,255,255,0.15)',
                    px: 0.75,
                    py: 0.25,
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    fontFamily: 'monospace',
                  }}
                >
                  #{tele.roomCode}
                </Typography>
              )}
            </Stack>

            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 800,
                fontSize: { xs: 15.5, sm: 17 },
                lineHeight: 1.25,
                color: '#ffffff',
                fontFamily: '"Poppins", sans-serif',
              }}
            >
              {doctorDisplayName} está te aguardando!
            </Typography>

            <Typography
              variant="caption"
              sx={{
                color: 'rgba(255, 255, 255, 0.85)',
                display: 'block',
                fontSize: { xs: 12, sm: 13 },
                mt: 0.25,
              }}
            >
              {tele.doctorSpecialty ? `${tele.doctorSpecialty} · ` : ''}Sua sala de vídeo criptografada já está aberta.
            </Typography>
          </Box>
        </Stack>

        {/* Right / CTA: Join consultation */}
        <Button
          variant="contained"
          size="large"
          onClick={handleJoin}
          endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 20 }} />}
          startIcon={<VideocamRoundedIcon sx={{ fontSize: 22 }} />}
          sx={{
            bgcolor: '#ffffff',
            color: '#0d524d',
            fontWeight: 800,
            fontSize: { xs: 14, sm: 15 },
            py: { xs: 1.25, sm: 1.25 },
            px: { xs: 2.5, sm: 3 },
            borderRadius: '12px',
            textTransform: 'none',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            '&:hover': {
              bgcolor: '#f0fdfa',
              transform: 'scale(1.02)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
            },
          }}
        >
          Entrar na consulta agora
        </Button>
      </Stack>
    </Box>
  );
};
