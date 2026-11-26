import { useState, useEffect } from 'react';
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
import { getSpeechRate, setSpeechRate, speakText, stopSpeakText } from '../utils/nativeDoc';
import { SPEECH_RATES, formatSpeechRate } from '../utils/speechText';

export interface VoiceSummaryPlayerProps {
  /** Texto a ser narrado pela IA */
  text: string;
  /** Título principal (default: 'Resumo em Áudio com IA') */
  title?: string;
  /** Subtítulo descritivo (default: 'Ouça seu laudo em 1 minuto') */
  subtitle?: string;
  /** Badge opcional no topo direito */
  badgeLabel?: string;
  /** Tema de cor (identidade Dr. Exame; 'purple' removido — off-brand) */
  colorScheme?: 'teal';
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
  // A velocidade é uma preferência do aparelho, compartilhada por todos os áudios do app.
  const [rate, setRate] = useState<number>(() => getSpeechRate());

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
      const ended = () => { setPlaying(false); onPlayStateChange?.(false); };
      void speakText(text, { onDone: ended, onFail: ended });
    }
  };

  // Trocar a velocidade NÃO recomeça a fala: o motor repete só a frase atual, já na nova velocidade.
  const handleChangeRate = (newRate: number) => {
    setRate(newRate);
    setSpeechRate(newRate);
  };

  // Cores dinâmicas baseadas no tema (identidade teal Dr. Exame)
  const primaryGrad = 'linear-gradient(135deg, #20b2aa 0%, #0f5f5a 100%)';

  const glowShadow = '0 8px 24px rgba(32, 178, 170, 0.45)';

  const barColor = '#20b2aa';

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: compact ? '16px' : '20px',
        p: compact ? '12px 16px' : '16px 20px',
        background: dark
          ? 'linear-gradient(135deg, rgba(15, 95, 90, 0.25) 0%, rgba(15, 23, 42, 0.75) 100%)'
          : 'linear-gradient(135deg, #f0fdfa 0%, #f4f8f8 50%, #ffffff 100%)',
        border: '1px solid',
        borderColor: dark ? 'rgba(32, 178, 170, 0.35)' : 'rgba(32, 178, 170, 0.22)',
        boxShadow: dark
          ? '0 10px 30px rgba(0, 0, 0, 0.35)'
          : '0 8px 25px rgba(15, 95, 90, 0.06)',
        overflow: 'hidden',
        userSelect: 'none',
        '@keyframes pulseGlow': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.06)' },
        },
      }}
    >
      {/* Linha 1: Play + Título/Subtítulo (layout independente da largura da viewport,
          funciona igual em card estreito na landing ou largo no relatório) */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
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
              // Play ativo (áudio narrando) — infinite permitido; reduced-motion desliga.
              animation: playing ? 'pulseGlow 2s ease-in-out infinite' : 'none',
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
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

          {/* Título + Subtítulo ocupam toda a largura restante — nunca espremidos */}
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: compact ? 14 : 15,
                fontFamily: 'Poppins, sans-serif',
                color: 'text.primary',
                lineHeight: 1.25,
              }}
            >
              {title}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: playing ? '#0f766e' : 'text.secondary',
                fontWeight: playing ? 700 : 500,
                fontSize: 12,
                lineHeight: 1.35,
                mt: 0.25,
              }}
            >
              {playing ? 'Dr. Exame narrando com voz médica…' : subtitle}
            </Typography>
          </Box>
      </Box>

      {/* Linha 2: Onda sonora + badge + seletor de velocidade */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
          rowGap: 1,
          mt: 1.25,
          pt: 1.25,
          borderTop: '1px solid',
          borderColor: dark ? 'rgba(255,255,255,0.06)' : alpha(barColor, 0.12),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '3px', height: 26, flexShrink: 0 }}>
            {/* Equalizador ESTÁTICO (dieta de movimento): a opacidade já sinaliza
                narrando/parado — sem barras dançantes infinitas. */}
            {BAR_HEIGHTS.slice(0, 12).map((h, i) => (
              <Box
                key={i}
                sx={{
                  width: 3,
                  height: `${Math.round(h * 0.8)}px`,
                  borderRadius: '2px',
                  bgcolor: barColor,
                  opacity: playing ? 0.95 : 0.4,
                  transition: 'opacity 0.3s ease',
                }}
              />
            ))}
          </Box>

          {badgeLabel && (
            <Chip
              size="small"
              icon={<VolumeUpIcon style={{ fontSize: 12, color: 'inherit' }} />}
              label={badgeLabel}
              sx={{
                height: 22,
                flexShrink: 0,
                fontSize: 12,
                fontWeight: 800,
                borderRadius: '8px',
                bgcolor: alpha(barColor, 0.12),
                color: '#0f766e',
                border: `1px solid ${alpha(barColor, 0.25)}`,
                minWidth: 0,
                '& .MuiChip-label': { whiteSpace: 'nowrap' },
              }}
            />
          )}
        </Box>

        {/* Seletor de velocidade — as mesmas opções em todos os áudios do app */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            bgcolor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            p: '3px',
            borderRadius: '8px',
            flexShrink: 0,
            ml: 'auto',
          }}
          role="group"
          aria-label="Velocidade da fala"
        >
          {SPEECH_RATES.map((r) => {
            const active = rate === r;
            return (
              <Box
                key={r}
                component="button"
                type="button"
                aria-pressed={active}
                aria-label={`Velocidade ${formatSpeechRate(r)}`}
                onClick={() => handleChangeRate(r)}
                sx={{
                  border: 0,
                  background: active ? '#20b2aa' : 'none',
                  color: active ? '#ffffff' : 'text.secondary',
                  fontSize: 12,
                  fontWeight: 800,
                  fontFamily: 'inherit',
                  px: 1,
                  minHeight: 32,
                  minWidth: 40,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'background-color 0.15s ease, color 0.15s ease',
                  '&:hover': {
                    color: active ? '#ffffff' : 'text.primary',
                  },
                }}
              >
                {formatSpeechRate(r)}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};
