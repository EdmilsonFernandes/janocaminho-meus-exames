import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Chip,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import SpeedIcon from '@mui/icons-material/Speed';
import { speakText, stopSpeakText } from '../utils/nativeDoc';

export interface VoiceSummaryPlayerProps {
  /** Texto a ser narrado pela IA */
  text: string;
  /** Título principal (default: 'Resumo em Áudio com IA') */
  title?: string;
  /** Subtítulo descritivo (default: 'Ouça seu laudo em 1 minuto') */
  subtitle?: string;
  /** Badge opcional no topo direito */
  badgeLabel?: string;
  /** Tema de cor: 'purple' (estilo Kantesti) ou 'teal' (identidade Dr. Exame) */
  colorScheme?: 'purple' | 'teal';
  /** Modo compacto para cards menores ou cabeçalhos */
  compact?: boolean;
  /** Callback quando o estado de reprodução muda */
  onPlayStateChange?: (playing: boolean) => void;
}

// Alturas base das barras do equalizador (15 barras simulando voz humana)
const BAR_HEIGHTS = [8, 14, 22, 12, 26, 18, 10, 24, 28, 16, 9, 20, 15, 11, 7];

export const VoiceSummaryPlayer = ({
  text,
  title = 'Resumo em Áudio com IA',
  subtitle = 'Ouça seu laudo em 1 minuto',
  badgeLabel = 'Dr. Exame Voz',
  colorScheme = 'teal',
  compact = false,
  onPlayStateChange,
}: VoiceSummaryPlayerProps) => {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';

  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<number>(1.0);
  const restartingRef = useRef(false);

  // Parar fala ao desmontar o componente
  useEffect(() => {
    return () => {
      void stopSpeakText();
    };
  }, []);

  const handleTogglePlay = () => {
    if (playing) {
      void stopSpeakText();
      setPlaying(false);
      onPlayStateChange?.(false);
    } else {
      if (!text) return;
      setPlaying(true);
      onPlayStateChange?.(true);
      void speakText(text, {
        rate,
        onDone: () => {
          if (!restartingRef.current) {
            setPlaying(false);
            onPlayStateChange?.(false);
          }
        },
        onFail: () => {
          if (!restartingRef.current) {
            setPlaying(false);
            onPlayStateChange?.(false);
          }
        },
      });
    }
  };

  const handleChangeRate = (newRate: number) => {
    setRate(newRate);
    if (playing) {
      restartingRef.current = true;
      void stopSpeakText();
      void speakText(text, {
        rate: newRate,
        onDone: () => {
          setPlaying(false);
          onPlayStateChange?.(false);
          restartingRef.current = false;
        },
        onFail: () => {
          setPlaying(false);
          onPlayStateChange?.(false);
          restartingRef.current = false;
        },
      });
      setTimeout(() => {
        restartingRef.current = false;
      }, 500);
    }
  };

  // Cores dinâmicas baseadas no tema
  const primaryGrad =
    colorScheme === 'purple'
      ? 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)'
      : 'linear-gradient(135deg, #20b2aa 0%, #0f5f5a 100%)';

  const glowShadow =
    colorScheme === 'purple'
      ? '0 8px 24px rgba(139, 92, 246, 0.45)'
      : '0 8px 24px rgba(32, 178, 170, 0.45)';

  const barColor = colorScheme === 'purple' ? '#a855f7' : '#20b2aa';

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: compact ? '16px' : '22px',
        p: compact ? '12px 16px' : '16px 20px',
        background: dark
          ? colorScheme === 'purple'
            ? 'linear-gradient(135deg, rgba(88, 28, 135, 0.22) 0%, rgba(15, 23, 42, 0.75) 100%)'
            : 'linear-gradient(135deg, rgba(15, 95, 90, 0.25) 0%, rgba(15, 23, 42, 0.75) 100%)'
          : colorScheme === 'purple'
          ? 'linear-gradient(135deg, #faf5ff 0%, #fdf2f8 50%, #ffffff 100%)'
          : 'linear-gradient(135deg, #f0fdfa 0%, #f4f8f8 50%, #ffffff 100%)',
        border: '1px solid',
        borderColor: dark
          ? colorScheme === 'purple'
            ? 'rgba(168, 85, 247, 0.35)'
            : 'rgba(32, 178, 170, 0.35)'
          : colorScheme === 'purple'
          ? 'rgba(168, 85, 247, 0.2)'
          : 'rgba(32, 178, 170, 0.22)',
        boxShadow: dark
          ? '0 10px 30px rgba(0, 0, 0, 0.35)'
          : '0 8px 25px rgba(15, 95, 90, 0.06)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Keyframes de animação das ondas sonoras */}
      <style>{`
        @keyframes soundwaveAnim {
          0%, 100% { transform: scaleY(0.35); opacity: 0.65; }
          50% { transform: scaleY(1.35); opacity: 1; }
        }
        @keyframes pulseGlow {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
      `}</style>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: { xs: 1.25, sm: 2 },
          width: '100%',
        }}
      >
        {/* Esquerda: Botão Play Circular Gradiente */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.25, sm: 1.5 }, flexShrink: 0 }}>
          <IconButton
            onClick={handleTogglePlay}
            aria-label={playing ? 'Pausar áudio' : 'Ouvir resumo em áudio'}
            sx={{
              width: compact ? 42 : 48,
              height: compact ? 42 : 48,
              borderRadius: '50%',
              background: primaryGrad,
              color: '#ffffff',
              boxShadow: playing ? glowShadow : '0 4px 14px rgba(32, 178, 170, 0.25)',
              animation: playing ? 'pulseGlow 2s ease-in-out infinite' : 'none',
              transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              flexShrink: 0,
              '&:hover': {
                transform: 'scale(1.06)',
                boxShadow: glowShadow,
              },
              '&:active': {
                transform: 'scale(0.95)',
              },
            }}
          >
            {playing ? (
              <PauseIcon sx={{ fontSize: compact ? 22 : 25 }} />
            ) : (
              <PlayArrowIcon sx={{ fontSize: compact ? 24 : 27, ml: 0.25 }} />
            )}
          </IconButton>

          {/* Equalizador de Ondas Sonoras (Soundwave) — 10 barras responsivas */}
          <Box
            sx={{
              display: { xs: 'none', sm: 'flex' },
              alignItems: 'center',
              gap: '3px',
              height: 28,
              px: 0.5,
              flexShrink: 0,
            }}
          >
            {BAR_HEIGHTS.slice(0, 10).map((h, i) => {
              const delay = (i * 0.08).toFixed(2);
              return (
                <Box
                  key={i}
                  sx={{
                    width: 3,
                    height: `${Math.round(h * 0.85)}px`,
                    borderRadius: '999px',
                    bgcolor: barColor,
                    transformOrigin: 'bottom center',
                    opacity: playing ? 0.95 : 0.4,
                    animation: playing
                      ? `soundwaveAnim 1.2s ease-in-out ${delay}s infinite`
                      : 'none',
                    transition: 'opacity 0.3s ease',
                  }}
                />
              );
            })}
          </Box>
        </Box>

        {/* Centro: Título e Subtítulo Flexíveis (Sem Cortes de Texto!) */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minWidth: 0,
            px: { xs: 0.5, sm: 1 },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: { xs: 13, sm: compact ? 13.5 : 14.5 },
                fontFamily: 'Poppins, sans-serif',
                color: 'text.primary',
                lineHeight: 1.25,
              }}
            >
              {title}
            </Typography>

            {badgeLabel && (
              <Chip
                size="small"
                icon={<VolumeUpIcon style={{ fontSize: 12, color: 'inherit' }} />}
                label={badgeLabel}
                sx={{
                  height: 20,
                  fontSize: 10,
                  fontWeight: 800,
                  borderRadius: '999px',
                  bgcolor: alpha(barColor, 0.12),
                  color: barColor,
                  border: `1px solid ${alpha(barColor, 0.25)}`,
                  display: { xs: 'none', md: 'inline-flex' },
                }}
              />
            )}
          </Box>

          <Typography
            variant="caption"
            sx={{
              color: playing ? (colorScheme === 'purple' ? '#c084fc' : '#0f766e') : 'text.secondary',
              fontWeight: playing ? 700 : 500,
              fontSize: { xs: 11, sm: 11.5 },
              lineHeight: 1.3,
              mt: 0.25,
            }}
          >
            {playing ? '🔊 Dr. Exame narrando com voz médica...' : subtitle}
          </Typography>
        </Box>

        {/* Direita: Seletor de Velocidade (1.0x / 1.25x / 1.5x) */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            bgcolor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            p: '2px 4px',
            borderRadius: '999px',
            flexShrink: 0,
          }}
        >
          {[1.0, 1.25, 1.5].map((r) => {
            const active = rate === r;
            return (
              <Box
                key={r}
                component="button"
                type="button"
                onClick={() => handleChangeRate(r)}
                sx={{
                  border: 0,
                  background: active ? (colorScheme === 'purple' ? '#8b5cf6' : '#20b2aa') : 'none',
                  color: active ? '#ffffff' : 'text.secondary',
                  fontSize: 10,
                  fontWeight: 800,
                  px: { xs: 0.75, sm: 1 },
                  py: 0.35,
                  borderRadius: '999px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    color: active ? '#ffffff' : 'text.primary',
                  },
                }}
              >
                {r.toFixed(1)}x
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};
