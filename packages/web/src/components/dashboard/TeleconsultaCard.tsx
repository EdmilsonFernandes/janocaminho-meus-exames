import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Stack, Typography, Button, Chip, IconButton, Tooltip } from '@mui/material';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import { useUpcomingTeleconsulta } from '../../hooks/useUpcomingTeleconsulta';
import { openTelemedicinaRoom } from '../../utils/telemedicina';
import { AppCard } from '../AppCard';

export const TeleconsultaCard: React.FC = () => {
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

  return (
    <AppCard
      sx={{
        p: { xs: 2.25, md: 2.75 },
        position: 'relative',
        overflow: 'hidden',
        background: isLive
          ? 'linear-gradient(135deg, #1f2937 0%, #111827 100%)'
          : 'linear-gradient(135deg, #0b3a37 0%, #072a28 100%)',
        color: '#ffffff',
        border: isLive ? '1.5px solid rgba(239, 68, 68, 0.45)' : '1.5px solid rgba(212, 165, 116, 0.35)',
        boxShadow: isLive
          ? '0 12px 36px rgba(239, 68, 68, 0.25)'
          : '0 12px 36px rgba(11, 58, 55, 0.22)',
      }}
    >
      {/* Glow decorativo de fundo */}
      <Box
        sx={{
          position: 'absolute',
          top: -60,
          right: -60,
          width: 160,
          height: 160,
          borderRadius: '50%',
          bgcolor: isLive ? 'rgba(239, 68, 68, 0.15)' : 'rgba(212, 165, 116, 0.12)',
          filter: 'blur(30px)',
          pointerEvents: 'none',
        }}
      />

      {/* Top Header do Card: Status pill + Horário */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1.75 }}>
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
                    bgcolor: '#ef4444',
                    // Live (teleconsulta ao vivo) — infinite permitido; reduced-motion desliga.
                    animation: 'tcPulse 1.4s infinite',
                    '@keyframes tcPulse': {
                      '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                      '50%': { opacity: 0.4, transform: 'scale(1.3)' },
                    },
                    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                  }}
                />
              }
              label="CONSULTA AO VIVO"
              sx={{
                bgcolor: 'rgba(239, 68, 68, 0.2)',
                color: '#fca5a5',
                fontWeight: 800,
                fontSize: 11,
                border: '1px solid rgba(239, 68, 68, 0.4)',
                letterSpacing: '0.04em',
              }}
            />
          ) : isToday ? (
            <Chip
              size="small"
              label="HOJE"
              sx={{
                bgcolor: 'rgba(212, 165, 116, 0.22)',
                color: '#f5d4af',
                fontWeight: 800,
                fontSize: 11,
                border: '1px solid rgba(212, 165, 116, 0.4)',
                letterSpacing: '0.04em',
              }}
            />
          ) : (
            <Chip
              size="small"
              icon={<CalendarMonthRoundedIcon sx={{ fontSize: '14px !important', color: '#99f6e4 !important' }} />}
              label="TELECONSULTA AGENDADA"
              sx={{
                bgcolor: 'rgba(45, 212, 191, 0.15)',
                color: '#ccfbf1',
                fontWeight: 700,
                fontSize: 11,
                border: '1px solid rgba(45, 212, 191, 0.3)',
              }}
            />
          )}

          {tele.relativeLabel && (
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#fbf3e8', opacity: 0.9 }}>
              {tele.relativeLabel}
            </Typography>
          )}
        </Stack>

        {tele.roomCode && (
          <Tooltip title={copied ? 'Código copiado!' : 'Copiar código da sala'}>
            <Chip
              size="small"
              onClick={handleCopyCode}
              icon={copied ? <CheckCircleRoundedIcon sx={{ fontSize: '13px !important', color: '#4ade80 !important' }} /> : <ContentCopyRoundedIcon sx={{ fontSize: '13px !important', color: 'rgba(255,255,255,0.7) !important' }} />}
              label={`Sala #${tele.roomCode}`}
              sx={{
                bgcolor: 'rgba(255, 255, 255, 0.08)',
                color: 'rgba(255, 255, 255, 0.85)',
                fontSize: 11,
                fontFamily: 'monospace',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.15)' },
              }}
            />
          </Tooltip>
        )}
      </Stack>

      {/* Conteúdo Principal: Médico & Especialidade */}
      <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: '14px',
            bgcolor: isLive ? 'rgba(239, 68, 68, 0.25)' : 'rgba(212, 165, 116, 0.2)',
            display: 'grid',
            placeItems: 'center',
            color: isLive ? '#f87171' : '#f5d4af',
            flexShrink: 0,
            border: isLive ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(212, 165, 116, 0.35)',
          }}
        >
          <VideocamRoundedIcon sx={{ fontSize: 26 }} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 800,
              fontSize: { xs: 16.5, sm: 18 },
              lineHeight: 1.25,
              color: '#ffffff',
            }}
          >
            {tele.doctorName ? `${tele.doctorName}` : 'Consulta médica online'}
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#ccfbf1', opacity: 0.9, mt: 0.3 }}>
            {tele.specialty ? `${tele.specialty} · ` : ''}{tele.timeLabel}
          </Typography>
        </Box>
      </Stack>

      {/* Checklist de Preparação Rápida */}
      <Box
        sx={{
          bgcolor: 'rgba(0, 0, 0, 0.22)',
          borderRadius: '12px',
          p: 1.5,
          mb: 2.25,
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <Typography sx={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f5d4af', mb: 1 }}>
          Preparação para o atendimento
        </Typography>

        <Stack spacing={0.75}>
          <Stack direction="row" spacing={1} alignItems="center">
            <CheckCircleRoundedIcon sx={{ fontSize: 16, color: '#34d399' }} />
            <Typography sx={{ fontSize: 12.5, color: '#e5e7eb' }}>
              Histórico e exames sincronizados com a sala do médico
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <CheckCircleRoundedIcon sx={{ fontSize: 16, color: '#34d399' }} />
            <Typography sx={{ fontSize: 12.5, color: '#e5e7eb' }}>
              Câmera e microfone compatíveis no navegador
            </Typography>
          </Stack>

          {tele.hasPendingExams && (
            <Stack direction="row" spacing={1} alignItems="center">
              <AssignmentTurnedInRoundedIcon sx={{ fontSize: 16, color: '#fbbf24' }} />
              <Typography sx={{ fontSize: 12.5, color: '#fde68a' }}>
                Você possui pedidos pendentes de exames para esta consulta
              </Typography>
            </Stack>
          )}
        </Stack>
      </Box>

      {/* Ações: Entrar na sala / Detalhes */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems="center">
        <Button
          fullWidth
          variant="contained"
          onClick={handleJoin}
          startIcon={<VideocamRoundedIcon />}
          sx={{
            py: 1.1,
            px: 2.5,
            bgcolor: isLive ? '#ef4444' : '#fbf3e8',
            color: isLive ? '#ffffff' : '#0b3a37',
            fontWeight: 800,
            fontSize: 13.5,
            borderRadius: '12px',
            textTransform: 'none',
            boxShadow: isLive ? '0 4px 16px rgba(239, 68, 68, 0.4)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
            '&:hover': {
              bgcolor: isLive ? '#dc2626' : '#ffffff',
            },
          }}
        >
          {isLive ? 'Entrar na chamada agora' : isToday ? 'Entrar na sala de espera' : 'Ver detalhes da consulta'}
        </Button>

        <Button
          fullWidth
          variant="text"
          onClick={() => navigate('/telemedicina')}
          endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />}
          sx={{
            py: 1.1,
            color: '#ccfbf1',
            fontWeight: 700,
            fontSize: 13,
            borderRadius: '12px',
            textTransform: 'none',
            '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' },
          }}
        >
          Gerenciar consultas
        </Button>
      </Stack>
    </AppCard>
  );
};
