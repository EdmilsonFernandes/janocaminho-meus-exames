import { Box, Typography, Chip, useTheme } from '@mui/material';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ScienceIcon from '@mui/icons-material/Science';

export const ClinicalDecisionCard = () => {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';

  const ACTIONS = [
    {
      title: 'Repetir dosagem lipídica (LDL/ApoB) em 45 dias',
      tag: 'Agora',
    },
    {
      title: 'Levar o laudo estruturado do Dr. Exame ao cardiologista',
      tag: 'Agora',
    },
    {
      title: 'Ajustar ingestão hídrica para proteção renal (>2,5L/dia)',
      tag: 'Agora',
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
      {/* Topo do Card */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '12px',
              bgcolor: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <HealthAndSafetyIcon sx={{ fontSize: 24 }} />
          </Box>
          <Box>
            <Typography
              sx={{
                fontFamily: 'Poppins, sans-serif',
                fontWeight: 800,
                fontSize: { xs: 16, sm: 18 },
                color: 'text.primary',
                lineHeight: 1.2,
              }}
            >
              Avaliação de Risco Clínico
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Suporte à Decisão Zero Alucinação
            </Typography>
          </Box>
        </Box>

        <Chip
          label="EXEMPLO"
          size="small"
          sx={{
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 800,
            fontSize: 10,
            letterSpacing: '0.06em',
            color: '#64748b',
            bgcolor: dark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
            border: '1px dashed #cbd5e1',
          }}
        />
      </Box>

      {/* Caixa do Velocímetro Segmentado */}
      <Box
        sx={{
          borderRadius: '20px',
          p: 2.5,
          mb: 2.5,
          background: dark
            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(15, 23, 42, 0.6) 100%)'
            : 'linear-gradient(135deg, #fef2f2 0%, #fff7ed 50%, #ffffff 100%)',
          border: '1px solid',
          borderColor: dark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
        }}
      >
        {/* Arco do Velocímetro com traços */}
        <Box sx={{ position: 'relative', width: 110, height: 75, display: 'grid', placeItems: 'center' }}>
          <Box
            sx={{
              width: 100,
              height: 50,
              borderTopLeftRadius: 100,
              borderTopRightRadius: 100,
              border: '10px dashed #ef4444',
              borderBottom: 'none',
              position: 'relative',
            }}
          />
          <Box sx={{ position: 'absolute', bottom: 2, textAlign: 'center' }}>
            <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 900, fontSize: 24, lineHeight: 1, color: '#ef4444' }}>
              78
            </Typography>
            <Typography variant="caption" sx={{ fontSize: 9.5, fontWeight: 700, color: 'text.secondary' }}>
              de 100
            </Typography>
          </Box>
        </Box>

        {/* Textos de Gravidade e Badges */}
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 18, color: 'text.primary', mb: 0.5 }}>
            Atenção Preventiva
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label="Ação sugerida"
              sx={{
                bgcolor: 'rgba(239, 68, 68, 0.12)',
                color: '#ef4444',
                fontWeight: 800,
                fontSize: 10.5,
                borderRadius: '999px',
              }}
            />
            <Chip
              size="small"
              label="Gravidade: Moderada"
              sx={{
                bgcolor: 'rgba(245, 158, 11, 0.12)',
                color: '#d97706',
                fontWeight: 800,
                fontSize: 10.5,
                borderRadius: '999px',
              }}
            />
          </Box>
        </Box>
      </Box>

      {/* Esteira Horizontal de 4 Estágios (Stepper) */}
      <Box sx={{ mb: 3 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
            px: 1,
            mb: 0.75,
          }}
        >
          {/* Linha de conexão */}
          <Box
            sx={{
              position: 'absolute',
              top: 7,
              left: 20,
              right: 20,
              height: 2,
              bgcolor: dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
              zIndex: 1,
            }}
          />
          {/* Pontos da esteira */}
          {[
            { label: 'Normal', active: true, col: '#10b981' },
            { label: 'Suspeito', active: true, col: '#ef4444' },
            { label: 'Presuntivo', active: false, col: '#94a3b8' },
            { label: 'Confirmado', active: false, col: '#94a3b8' },
          ].map((step, i) => (
            <Box
              key={i}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                zIndex: 2,
              }}
            >
              <Box
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  bgcolor: step.active ? step.col : dark ? '#1e293b' : '#ffffff',
                  border: `2.5px solid ${step.col}`,
                  boxShadow: step.active ? `0 0 8px ${step.col}` : 'none',
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  mt: 0.5,
                  fontSize: 10,
                  fontWeight: step.active ? 800 : 600,
                  color: step.active ? 'text.primary' : 'text.disabled',
                }}
              >
                {step.label}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Checklist de Decisão Clínica com botões [Agora] */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mb: 2.5 }}>
        {ACTIONS.map((act, i) => (
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
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <CheckCircleIcon sx={{ fontSize: 18, color: '#10b981', flexShrink: 0 }} />
              <Typography sx={{ fontWeight: 600, fontSize: 12.5, color: 'text.primary' }}>
                {act.title}
              </Typography>
            </Box>

            <Chip
              label={act.tag}
              size="small"
              sx={{
                bgcolor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                fontWeight: 800,
                fontSize: 10,
                borderRadius: '8px',
                height: 22,
                flexShrink: 0,
              }}
            />
          </Box>
        ))}
      </Box>

      {/* Selo Inferior de Confiabilidade com até 13 exames */}
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.5,
          py: 0.6,
          borderRadius: '999px',
          bgcolor: dark ? 'rgba(32, 178, 170, 0.12)' : 'rgba(32, 178, 170, 0.08)',
          border: '1px solid rgba(32, 178, 170, 0.25)',
          color: dark ? '#5fc9c3' : '#0f766e',
          fontSize: 11.5,
          fontWeight: 700,
        }}
      >
        <ScienceIcon sx={{ fontSize: 15 }} />
        <span>Até 13 sistemas orgânicos cruzados para graduar risco</span>
      </Box>
    </Box>
  );
};
