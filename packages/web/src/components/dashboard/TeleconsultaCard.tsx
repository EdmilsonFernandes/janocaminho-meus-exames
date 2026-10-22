import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Stack,
  Typography,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Avatar,
  useTheme,
} from '@mui/material';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import MicNoneRoundedIcon from '@mui/icons-material/MicNoneRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import { useUpcomingTeleconsulta } from '../../hooks/useUpcomingTeleconsulta';
import { openTelemedicinaRoom } from '../../utils/telemedicina';
import { AppCard } from '../AppCard';

export const TeleconsultaCard: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const tele = useUpcomingTeleconsulta();
  const [copied, setCopied] = useState(false);

  // Se não houver teleconsulta agendada ou ao vivo, não exibe o card
  if (tele.status === 'none' || !tele.item) {
    return null;
  }

  const isLive = tele.status === 'live';
  const isToday = tele.status === 'today';

  const handleJoin = () => {
    if (tele.item?.linkUrl) {
      void openTelemedicinaRoom(tele.item.linkUrl);
    } else if (tele.item?.id) {
      navigate(`/teleconsulta/${tele.item.id}`);
    } else {
      navigate('/telemedicina');
    }
  };

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tele.roomCode) {
      navigator.clipboard?.writeText(tele.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const doctorDisplayName = tele.doctorName
    ? tele.doctorName.toLowerCase().startsWith('dr')
      ? tele.doctorName
      : `Dr(a). ${tele.doctorName}`
    : 'Consulta médica online';

  const doctorCrm = tele.item?.doctor?.crm
    ? `CRM ${tele.item.doctor.crm}${tele.item.doctor.crmUf ? `/${tele.item.doctor.crmUf}` : ''}`
    : null;

  return (
    <AppCard
      sx={{
        p: { xs: 2.25, md: 2.75 },
        position: 'relative',
        overflow: 'hidden',
        bgcolor: isDark ? '#0f172a' : '#ffffff',
        color: isDark ? '#f8fafc' : '#0f172a',
        border: '1.5px solid',
        borderColor: isLive
          ? isDark ? 'rgba(16, 185, 129, 0.45)' : 'rgba(16, 185, 129, 0.35)'
          : isDark ? 'rgba(13, 148, 136, 0.35)' : 'rgba(13, 148, 136, 0.22)',
        boxShadow: isLive
          ? isDark ? '0 12px 36px rgba(0, 0, 0, 0.5)' : '0 12px 36px rgba(16, 185, 129, 0.12)'
          : isDark ? '0 8px 30px rgba(0, 0, 0, 0.4)' : '0 8px 26px rgba(13, 148, 136, 0.08)',
        borderRadius: '20px',
        transition: 'all 0.25s ease',
        '&:hover': {
          borderColor: '#0d9488',
          boxShadow: isDark
            ? '0 14px 40px rgba(0, 0, 0, 0.6)'
            : '0 14px 36px rgba(13, 148, 136, 0.14)',
        },
      }}
    >
      {/* Ambient gradient glow decorativo */}
      <Box
        sx={{
          position: 'absolute',
          top: -60,
          right: -60,
          width: 170,
          height: 170,
          borderRadius: '50%',
          background: isLive
            ? 'radial-gradient(circle, rgba(16, 185, 129, 0.18) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(13, 148, 136, 0.14) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Top Header do Card: Status pill + Horário */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          {isLive ? (
            <Chip
              size="small"
              icon={
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: '#10b981',
                    animation: 'tcPulse 1.6s infinite',
                    '@keyframes tcPulse': {
                      '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                      '50%': { opacity: 0.4, transform: 'scale(1.3)' },
                    },
                    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                  }}
                />
              }
              label="SALA LIBERADA • MÉDICO AGUARDANDO"
              sx={{
                bgcolor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.10)',
                color: isDark ? '#34d399' : '#059669',
                fontWeight: 800,
                fontSize: 11.5,
                border: '1px solid',
                borderColor: isDark ? 'rgba(52, 211, 153, 0.3)' : 'rgba(16, 185, 129, 0.3)',
                letterSpacing: '0.03em',
              }}
            />
          ) : isToday ? (
            <Chip
              size="small"
              icon={<AccessTimeRoundedIcon sx={{ fontSize: '14px !important', color: '#0d9488 !important' }} />}
              label="HOJE"
              sx={{
                bgcolor: isDark ? 'rgba(13, 148, 136, 0.18)' : 'rgba(13, 148, 136, 0.10)',
                color: isDark ? '#2dd4bf' : '#0f766e',
                fontWeight: 800,
                fontSize: 11.5,
                border: '1px solid rgba(13, 148, 136, 0.3)',
                letterSpacing: '0.04em',
              }}
            />
          ) : (
            <Chip
              size="small"
              icon={<CalendarMonthRoundedIcon sx={{ fontSize: '14px !important', color: '#0d9488 !important' }} />}
              label="CONSULTA AGENDADA"
              sx={{
                bgcolor: isDark ? 'rgba(13, 148, 136, 0.15)' : 'rgba(13, 148, 136, 0.08)',
                color: isDark ? '#2dd4bf' : '#0d9488',
                fontWeight: 700,
                fontSize: 11.5,
                border: '1px solid rgba(13, 148, 136, 0.25)',
              }}
            />
          )}

          {tele.relativeLabel && (
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>
              {tele.relativeLabel}
            </Typography>
          )}
        </Stack>

        {tele.roomCode && (
          <Tooltip title={copied ? 'Código copiado!' : 'Copiar código da sala'}>
            <Chip
              size="small"
              onClick={handleCopyCode}
              icon={
                copied ? (
                  <CheckCircleRoundedIcon sx={{ fontSize: '13px !important', color: '#10b981 !important' }} />
                ) : (
                  <ContentCopyRoundedIcon sx={{ fontSize: '13px !important', color: 'text.secondary !important' }} />
                )
              }
              label={`Sala #${tele.roomCode}`}
              sx={{
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                color: 'text.primary',
                fontSize: 11.5,
                fontFamily: 'monospace',
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                '&:hover': {
                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.09)',
                },
              }}
            />
          </Tooltip>
        )}
      </Stack>

      {/* Conteúdo Principal: Perfil do Médico & Especialidade */}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2.25 }}>
        <Box sx={{ position: 'relative', flexShrink: 0 }}>
          <Avatar
            sx={{
              width: { xs: 52, sm: 60 },
              height: { xs: 52, sm: 60 },
              borderRadius: '18px',
              bgcolor: isDark ? 'rgba(13, 148, 136, 0.2)' : 'rgba(13, 148, 136, 0.12)',
              color: '#0d9488',
              fontSize: 22,
              fontWeight: 800,
              border: '2px solid',
              borderColor: isLive ? '#10b981' : isDark ? 'rgba(13, 148, 136, 0.35)' : 'rgba(13, 148, 136, 0.25)',
            }}
          >
            {doctorDisplayName.replace(/^dr\(a\)\.\s*/i, '').charAt(0).toUpperCase() || '🩺'}
          </Avatar>
          {isLive && (
            <Box
              sx={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                width: 14,
                height: 14,
                borderRadius: '50%',
                bgcolor: '#10b981',
                border: '2.5px solid',
                borderColor: isDark ? '#0f172a' : '#ffffff',
              }}
              title="Médico online na sala"
            />
          )}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
            <Typography
              sx={{
                fontFamily: 'Poppins, sans-serif',
                fontWeight: 800,
                fontSize: { xs: 16, sm: 17.5 },
                lineHeight: 1.25,
                color: 'text.primary',
              }}
            >
              {doctorDisplayName}
            </Typography>
            <VerifiedRoundedIcon sx={{ fontSize: 17, color: '#0d9488' }} />
          </Stack>

          {doctorCrm && (
            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: 'text.secondary', fontFamily: 'monospace', mt: 0.2 }}>
              {doctorCrm}
            </Typography>
          )}

          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.3, fontWeight: 500 }}>
            {tele.specialty ? `${tele.specialty} • ` : ''}{tele.timeLabel}
          </Typography>
        </Box>
      </Stack>

      {/* Grid Clínico de Metadados: Data/Horário, Ambiente Seguro e Protocolo */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
          gap: 1.25,
          p: 1.5,
          borderRadius: '14px',
          bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.025)',
          border: '1px solid',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
          mb: 2.25,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
            Data & Horário
          </Typography>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary' }}>
            {tele.timeLabel || (isToday ? 'Hoje' : 'Agendada')}
          </Typography>
        </Box>

        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
            Ambiente Seguro
          </Typography>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <LockRoundedIcon sx={{ fontSize: 13, color: '#10b981' }} />
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary' }}>
              Vídeo HD E2EE
            </Typography>
          </Stack>
        </Box>

        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
            Protocolo
          </Typography>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary', fontFamily: 'monospace' }}>
            #{tele.roomCode || String(tele.item.id).slice(-5).toUpperCase()}
          </Typography>
        </Box>
      </Box>

      {/* Ações Primárias & Secundárias */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems="center">
        <Button
          fullWidth
          variant="contained"
          onClick={handleJoin}
          startIcon={<VideocamRoundedIcon />}
          sx={{
            py: 1.25,
            px: 2.5,
            background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: 14,
            borderRadius: '12px',
            textTransform: 'none',
            boxShadow: '0 4px 14px rgba(13, 148, 136, 0.35)',
            transition: 'all 0.2s ease',
            '&:hover': {
              background: 'linear-gradient(135deg, #0f766e 0%, #047857 100%)',
              boxShadow: '0 6px 20px rgba(13, 148, 136, 0.45)',
              transform: 'translateY(-1px)',
            },
          }}
        >
          {isLive ? 'Entrar na Consulta com Vídeo' : isToday ? 'Entrar na Sala de Espera' : 'Ver Detalhes da Consulta'}
        </Button>

        <Stack direction="row" spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
          <Tooltip title="Testar microfone e câmera">
            <IconButton
              onClick={() => {
                if (tele.item?.id) navigate(`/teleconsulta/${tele.item.id}`);
              }}
              sx={{
                width: 44,
                height: 44,
                borderRadius: '12px',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)',
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.02)',
                color: 'text.secondary',
                '&:hover': {
                  color: '#0d9488',
                  borderColor: '#0d9488',
                  bgcolor: isDark ? 'rgba(13, 148, 136, 0.1)' : 'rgba(13, 148, 136, 0.06)',
                },
              }}
            >
              <MicNoneRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Ver exames ou gerenciar">
            <IconButton
              onClick={() => navigate('/telemedicina')}
              sx={{
                width: 44,
                height: 44,
                borderRadius: '12px',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)',
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.02)',
                color: 'text.secondary',
                '&:hover': {
                  color: '#0d9488',
                  borderColor: '#0d9488',
                  bgcolor: isDark ? 'rgba(13, 148, 136, 0.1)' : 'rgba(13, 148, 136, 0.06)',
                },
              }}
            >
              <ArrowForwardRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
    </AppCard>
  );
};
