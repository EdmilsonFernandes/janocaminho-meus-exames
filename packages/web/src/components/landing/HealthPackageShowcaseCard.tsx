import { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import AccessibilityNewIcon from '@mui/icons-material/AccessibilityNew';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import BiotechIcon from '@mui/icons-material/Biotech';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import { VoiceSummaryPlayer } from '../VoiceSummaryPlayer';

export interface HealthPackageShowcaseCardProps {
  onCtaClick?: () => void;
  ctaText?: string;
}

export const HealthPackageShowcaseCard = ({
  onCtaClick,
  ctaText = 'Começar agora com garantia',
}: HealthPackageShowcaseCardProps) => {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';

  const demoVoiceText =
    'Olá! Analisei seus exames de sangue mais recentes. Seus marcadores cardiovasculares e hepáticos estão excelentes. Recomendo atenção preventiva na vitamina D e na hidratação diária.';

  const PILLARS = [
    {
      icon: <HourglassEmptyIcon sx={{ fontSize: 18, color: '#0f766e' }} />,
      label: 'Idade Biológica no Sangue',
      tip: 'Algoritmo de longevidade PhenoAge',
    },
    {
      icon: <AccessibilityNewIcon sx={{ fontSize: 18, color: '#20b2aa' }} />,
      label: 'Mapa do seu Corpo (13 Regiões)',
      tip: 'Visualização interativa de órgãos',
    },
    {
      icon: <HeadphonesIcon sx={{ fontSize: 18, color: '#14b8a6' }} />,
      label: 'Resumo Explicativo em Áudio',
      tip: 'Voz humanizada que explica em 1 min',
    },
    {
      icon: <BiotechIcon sx={{ fontSize: 18, color: '#0284c7' }} />,
      label: 'Tendências e Conexões dos Órgãos',
      tip: 'Gráficos comparativos com exames anteriores',
    },
    {
      icon: <RestaurantMenuIcon sx={{ fontSize: 18, color: '#10b981' }} />,
      label: 'Orientações Nutricionais & Hábitos',
      tip: 'Metas preventivas para levar ao seu médico',
    },
  ];

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        maxWidth: 480,
        mx: 'auto',
        borderRadius: '28px',
        bgcolor: dark ? '#0a1628' : '#ffffff',
        border: '1px solid',
        borderColor: dark ? 'rgba(95, 201, 195, 0.25)' : 'rgba(15, 95, 90, 0.12)',
        boxShadow: dark
          ? '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(95, 201, 195, 0.15)'
          : '0 20px 50px rgba(15, 95, 90, 0.08), 0 1px 3px rgba(0,0,0,0.02)',
        p: { xs: 2.5, sm: 3.5 },
        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: dark
            ? '0 30px 70px rgba(0,0,0,0.6), 0 0 0 1px rgba(95, 201, 195, 0.3)'
            : '0 25px 60px rgba(15, 95, 90, 0.14)',
        },
      }}
    >
      {/* Topo do Card: Ícone de Sangue + Título + Badge de Desconto VIP */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: '12px',
              bgcolor: 'rgba(239, 68, 68, 0.12)',
              display: 'grid',
              placeItems: 'center',
              color: '#ef4444',
            }}
          >
            <WaterDropIcon sx={{ fontSize: 22 }} />
          </Box>
          <Typography
            sx={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 800,
              fontSize: { xs: 17, sm: 19 },
              color: 'text.primary',
            }}
          >
            Plano Anual Saúde Total
          </Typography>
        </Box>

        <Chip
          label="PLANO COMPLETO"
          size="small"
          sx={{
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 800,
            fontSize: 10.5,
            color: dark ? '#5fc9c3' : '#0f766e',
            bgcolor: alpha('#20b2aa', 0.12),
            border: '1.5px solid rgba(32, 178, 170, 0.35)',
            borderRadius: '999px',
            letterSpacing: '0.04em',
          }}
        />
      </Box>

      {/* Destaque Superior: 13 Sistemas Mapeados + Player de Voz Dr. Exame de Alta Fidelidade */}
      <Box
        sx={{
          mb: 2.5,
          p: { xs: 2, sm: 2.25 },
          borderRadius: '20px',
          bgcolor: dark ? 'rgba(32, 178, 170, 0.05)' : 'rgba(32, 178, 170, 0.04)',
          border: '1px solid',
          borderColor: dark ? 'rgba(95, 201, 195, 0.2)' : 'rgba(32, 178, 170, 0.18)',
        }}
      >
        {/* Linha com Gauge dos 13 Órgãos e chamada descritiva */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            mb: 2,
            pb: 1.75,
            borderBottom: '1px solid',
            borderColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(32, 178, 170, 0.12)',
          }}
        >
          {/* Gauge Circular com segmentos Dr. Exame (Teal + Esmeralda) */}
          <Box
            sx={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              position: 'relative',
              flexShrink: 0,
              background: dark
                ? 'radial-gradient(circle, #0b1a2e 58%, transparent 60%), conic-gradient(#20b2aa 0deg 240deg, #10b981 240deg 315deg, #14b8a6 315deg 360deg)'
                : 'radial-gradient(circle, #ffffff 58%, transparent 60%), conic-gradient(#20b2aa 0deg 240deg, #10b981 240deg 315deg, #14b8a6 315deg 360deg)',
              boxShadow: '0 4px 14px rgba(32, 178, 170, 0.25)',
            }}
          >
            <Box sx={{ textAlign: 'center' }}>
              <Typography
                sx={{
                  fontFamily: 'Poppins, sans-serif',
                  fontWeight: 900,
                  fontSize: 18,
                  lineHeight: 1,
                  color: dark ? '#5fc9c3' : '#0f766e',
                }}
              >
                13
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontSize: 7.5,
                  fontWeight: 800,
                  color: 'text.secondary',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                Órgãos
              </Typography>
            </Box>
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: { xs: 13.5, sm: 14.5 },
                color: 'text.primary',
                fontFamily: 'Poppins, sans-serif',
                lineHeight: 1.25,
              }}
            >
              13 Sistemas e Órgãos Analisados
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontSize: 11.5,
                display: 'block',
                mt: 0.25,
              }}
            >
              Cruzamento clínico inteligente entre exames atuais e histórico
            </Typography>
          </Box>
        </Box>

        {/* Player de Voz Oficial Dr. Exame com Largura Total (Sem cortes de texto!) */}
        <Box sx={{ width: '100%', minWidth: 0 }}>
          <VoiceSummaryPlayer
            text={demoVoiceText}
            title="Resumo em Áudio com IA"
            subtitle="Toque no Play para ouvir amostra"
            colorScheme="teal"
            badgeLabel="Dr. Exame Voz"
            compact
          />
        </Box>
      </Box>

      {/* Lista das 5 Pílulas de Recursos com Checkmark Verde */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mb: 3 }}>
        {PILLARS.map((p, i) => (
          <Box
            key={i}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: '10px 14px',
              borderRadius: '14px',
              bgcolor: dark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
              border: '1px solid',
              borderColor: dark ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: dark ? 'rgba(255,255,255,0.07)' : '#f1f5f9',
                borderColor: '#20b2aa',
                transform: 'translateX(3px)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ display: 'grid', placeItems: 'center' }}>{p.icon}</Box>
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: 13, color: 'text.primary' }}>
                  {p.label}
                </Typography>
                <Typography variant="caption" sx={{ fontSize: 10.5, color: 'text.secondary', display: 'block' }}>
                  {p.tip}
                </Typography>
              </Box>
            </Box>

            <CheckCircleIcon sx={{ fontSize: 20, color: '#10b981', flexShrink: 0 }} />
          </Box>
        ))}
      </Box>

      {/* Botão de Ação CTA */}
      {onCtaClick && (
        <Button
          fullWidth
          variant="contained"
          onClick={onCtaClick}
          sx={{
            py: 1.5,
            borderRadius: '999px',
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 800,
            fontSize: 14.5,
            textTransform: 'none',
            background: 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)',
            boxShadow: '0 8px 24px rgba(32, 178, 170, 0.4)',
            '&:hover': {
              background: 'linear-gradient(135deg, #178f89 0%, #0f5f5a 100%)',
              boxShadow: '0 12px 30px rgba(32, 178, 170, 0.55)',
              transform: 'translateY(-1px)',
            },
          }}
        >
          {ctaText}
        </Button>
      )}

      {/* Selo de Garantia no Rodapé */}
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          mt: 2,
          px: 1.5,
          py: 0.6,
          borderRadius: '999px',
          bgcolor: dark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          color: '#10b981',
          fontSize: 11.5,
          fontWeight: 700,
        }}
      >
        <ShieldOutlinedIcon sx={{ fontSize: 15 }} />
        <span>Garantia de 30 dias · Ciência sem alucinação</span>
      </Box>
    </Box>
  );
};
