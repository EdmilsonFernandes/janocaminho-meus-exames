import { useState, useRef } from 'react';
import {
  Box,
  Container,
  Typography,
  Stack,
  Button,
  Chip,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import FavoriteIcon from '@mui/icons-material/Favorite';
import ScienceIcon from '@mui/icons-material/Science';
import WaterIcon from '@mui/icons-material/Water';
import BoltIcon from '@mui/icons-material/Bolt';
import BloodtypeIcon from '@mui/icons-material/Bloodtype';
import BiotechIcon from '@mui/icons-material/Biotech';
import AccessibilityNewIcon from '@mui/icons-material/AccessibilityNew';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';
const INK = '#0f5f5a';

interface OrganPreview {
  key: string;
  name: string;
  emoji: string;
  icon: any;
  topPct: number;
  leftPct: number;
  status: 'ok' | 'alterado' | 'atencao';
  statusLabel: string;
  calculation: string;
  calculationValue: string;
  calculationInterp: string;
  markers: string[];
  clinicalTip: string;
}

const ORGANS: OrganPreview[] = [
  {
    key: 'coracao',
    name: 'Coração & Vasos',
    emoji: '❤️',
    icon: FavoriteIcon,
    topPct: 32,
    leftPct: 53,
    status: 'alterado',
    statusLabel: 'Fora da meta',
    calculation: 'Índice de Castelli I (CT / HDL)',
    calculationValue: '4,6',
    calculationInterp: 'Relação levemente aumentada; sugere atenção cardiovascular preventiva',
    markers: ['Colesterol Total', 'LDL', 'HDL', 'Triglicerídeos', 'Apolipoproteína B'],
    clinicalTip: 'Acompanhar a evolução do LDL e a proporção TG/HDL antes da consulta.',
  },
  {
    key: 'figado',
    name: 'Fígado & Enzimas',
    emoji: '🧪',
    icon: ScienceIcon,
    topPct: 38,
    leftPct: 44,
    status: 'ok',
    statusLabel: 'Dentro da referência',
    calculation: 'Escore FIB-4 (Fibrose Hepática)',
    calculationValue: '0,92',
    calculationInterp: 'Baixa probabilidade de fibrose ou sobrecarga enzimática',
    markers: ['TGO (AST)', 'TGP (ALT)', 'Gama-GT', 'Bilirrubinas', 'Fosfatase Alcalina'],
    clinicalTip: 'Enzimas hepáticas estáveis e preservadas.',
  },
  {
    key: 'rins',
    name: 'Rins & Filtração',
    emoji: '💧',
    icon: WaterIcon,
    topPct: 44,
    leftPct: 52,
    status: 'ok',
    statusLabel: 'Dentro da referência',
    calculation: 'Taxa de Filtração Glomerular (eGFR)',
    calculationValue: '> 90 mL/min',
    calculationInterp: 'Função de filtração renal excelente e preservada',
    markers: ['Creatinina', 'Ureia', 'Ácido Úrico', 'Sódio', 'Potássio'],
    clinicalTip: 'Importante manter boa hidratação no dia a dia.',
  },
  {
    key: 'metabolismo',
    name: 'Pâncreas & Metabolismo',
    emoji: '⚡',
    icon: BoltIcon,
    topPct: 41,
    leftPct: 48,
    status: 'atencao',
    statusLabel: 'Atenção preventiva',
    calculation: 'HOMA-IR (Resistência à Insulina)',
    calculationValue: '2,4',
    calculationInterp: 'Sensibilidade limítrofe; benefício com ajustes na dieta e treino',
    markers: ['Glicose de Jejum', 'Hemoglobina Glicada', 'Insulina Basal'],
    clinicalTip: 'Glicemia de jejum e insulina fornecem visão precoce anos antes do diabetes.',
  },
  {
    key: 'sangue',
    name: 'Sangue & Imunidade',
    emoji: '🩸',
    icon: BloodtypeIcon,
    topPct: 50,
    leftPct: 50,
    status: 'ok',
    statusLabel: 'Dentro da referência',
    calculation: 'Volume Globular & Série Vermelha',
    calculationValue: 'Normocítico',
    calculationInterp: 'Distribuição e oxigenação celular dentro do padrão',
    markers: ['Hemoglobina', 'Hematócrito', 'Leucócitos', 'Plaquetas', 'Ferritina'],
    clinicalTip: 'Imunidade e estoques de ferro monitorados em conjunto.',
  },
  {
    key: 'hormonios',
    name: 'Hormônios & Tireoide',
    emoji: '🧬',
    icon: BiotechIcon,
    topPct: 20,
    leftPct: 50,
    status: 'ok',
    statusLabel: 'Dentro da referência',
    calculation: 'Eixo Hipófise-Tireoide',
    calculationValue: 'Equilibrado',
    calculationInterp: 'TSH e T4 Livre trabalhando em sinergia metabólica',
    markers: ['TSH', 'T4 Livre', 'Testosterona Total', 'Cortisol', 'Vitamina D'],
    clinicalTip: 'Regulação de energia, disposição e humor.',
  },
];

export const LandingBodyMapSection = () => {
  const navigate = useNavigate();
  const [selectedKey, setSelectedKey] = useState<string>('coracao');
  const detailCardRef = useRef<HTMLDivElement>(null);
  const activeOrgan = ORGANS.find((o) => o.key === selectedKey) || ORGANS[0];

  const handleSelectOrgan = (key: string, shouldScroll = true) => {
    setSelectedKey(key);
    if (shouldScroll && typeof window !== 'undefined') {
      setTimeout(() => {
        detailCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  };

  return (
    <Box
      id="mapa-do-corpo"
      sx={{
        py: { xs: 8, md: 12 },
        scrollMarginTop: 80,
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(160deg, #04101f 0%, #071a33 55%, #0a2a45 100%)',
        color: '#e8eef0',
      }}
    >
      <style>{`
        @keyframes landingLaserScan {
          0% { top: 0%; opacity: 0; }
          12% { opacity: 0.95; }
          88% { opacity: 0.95; }
          100% { top: 98%; opacity: 0; }
        }
        .landing-laser-scan {
          animation: landingLaserScan 4.5s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
      `}</style>

      {/* Background Glow */}
      <Box
        sx={{
          position: 'absolute',
          top: '-20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 800,
          height: 800,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(32,178,170,0.18), transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        {/* Section Header */}
        <Box sx={{ textAlign: 'center', maxWidth: 760, mx: 'auto', mb: { xs: 4, md: 7 } }}>
          <Stack direction="row" spacing={1} justifyContent="center" alignItems="center" sx={{ mb: 1.5 }}>
            <Box
              sx={{
                px: 1.5,
                py: 0.5,
                borderRadius: '999px',
                bgcolor: 'rgba(32,178,170,0.18)',
                color: '#5fc9c3',
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Tecnologia Exclusiva Dr. Exame
            </Box>
          </Stack>
          <Typography
            variant="h2"
            sx={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 800,
              fontSize: { xs: '2rem', md: '2.8rem' },
              lineHeight: 1.15,
              mb: 2,
              letterSpacing: '-0.02em',
              color: '#ffffff',
            }}
          >
            O Mapa do seu Corpo,{' '}
            <Box component="span" sx={{ color: '#5fc9c3', fontStyle: 'italic', fontFamily: "'Instrument Serif', Georgia, serif" }}>
              iluminado pelos seus exames.
            </Box>
          </Typography>
          <Typography sx={{ color: '#9fb5c8', fontSize: { xs: 16, md: 18 }, lineHeight: 1.6 }}>
            Seus exames de sangue não são números soltos numa folha. Nossa inteligência conecta cada marcador ao seu respectivo órgão e calcula razões clínicas da literatura médica automaticamente.
          </Typography>
        </Box>

        {/* Interactive Showcase Grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(300px, 380px) 1fr' },
            gap: { xs: 3.5, md: 5 },
            alignItems: 'center',
            maxWidth: 1040,
            mx: 'auto',
          }}
        >
          {/* Anatomical Raio-X Figure */}
          <Box
            sx={{
              position: 'relative',
              borderRadius: '24px',
              overflow: 'hidden',
              boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(95,201,195,0.22)',
              aspectRatio: '720/964',
              maxWidth: 380,
              width: '100%',
              mx: 'auto',
              bgcolor: '#061428',
            }}
          >
            {/* HUD Badge */}
            <Box
              sx={{
                position: 'absolute',
                top: 12,
                left: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.25,
                py: 0.4,
                borderRadius: '999px',
                background: 'rgba(4, 16, 31, 0.8)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(95, 201, 195, 0.35)',
                zIndex: 8,
                pointerEvents: 'none',
              }}
            >
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#5fc9c3', boxShadow: '0 0 8px #5fc9c3' }} />
              <Typography sx={{ fontSize: 10, fontWeight: 800, color: '#5fc9c3', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Bio-Scan Clínico
              </Typography>
            </Box>

            {/* Raio-X Base Image */}
            <Box
              component="img"
              src={`${import.meta.env.BASE_URL}body-xray.webp`}
              alt="Ilustração Raio-X Anatômica"
              sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />

            {/* Bio-scanner laser beam */}
            <Box
              className="landing-laser-scan"
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: '2px',
                background: 'linear-gradient(90deg, transparent 0%, rgba(95,201,195,0.3) 15%, #ffffff 50%, rgba(95,201,195,0.3) 85%, transparent 100%)',
                boxShadow: '0 0 16px 3px rgba(95,201,195,0.85)',
                pointerEvents: 'none',
                zIndex: 6,
              }}
            />

            {/* Subtle Vignette */}
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(ellipse at 50% 45%, transparent 50%, rgba(2,8,20,0.6))',
                pointerEvents: 'none',
              }}
            />

            {/* Hotspots */}
            {ORGANS.map((organ) => {
              const isSelected = selectedKey === organ.key;
              const color = organ.status === 'alterado' ? '#ef4444' : organ.status === 'atencao' ? '#f59e0b' : '#10b981';

              return (
                <Box
                  key={organ.key}
                  component="button"
                  onClick={() => handleSelectOrgan(organ.key, true)}
                  aria-label={`Ver ${organ.name}`}
                  sx={{
                    position: 'absolute',
                    top: `${organ.topPct}%`,
                    left: `${organ.leftPct}%`,
                    width: 44,
                    height: 44,
                    margin: '-22px 0 0 -22px',
                    border: 'none',
                    bgcolor: 'transparent',
                    cursor: 'pointer',
                    zIndex: 4,
                    outline: 'none',
                    '&:focus-visible': { outline: '2px solid #5fc9c3', outlineOffset: 4 },
                  }}
                >
                  {/* Ping Animation on Alert */}
                  {organ.status !== 'ok' && (
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 8,
                        borderRadius: '50%',
                        border: `2px solid ${color}`,
                        animation: 'dxPing 2.2s cubic-bezier(0,0,0.2,1) infinite',
                        '@keyframes dxPing': {
                          '0%': { transform: 'scale(0.8)', opacity: 0.9 },
                          '80%, 100%': { transform: 'scale(2.2)', opacity: 0 },
                        },
                      }}
                    />
                  )}

                  {/* Core Dot */}
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 13,
                      borderRadius: '50%',
                      bgcolor: color,
                      boxShadow: `0 0 16px 4px ${color}, 0 0 32px 8px ${alpha(color, 0.45)}`,
                      transform: isSelected ? 'scale(1.4)' : 'scale(1)',
                      transition: 'transform .2s ease',
                    }}
                  />
                </Box>
              );
            })}
          </Box>

          {/* Details & Controls Column */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Quick System Buttons */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {ORGANS.map((organ) => {
                const isSelected = selectedKey === organ.key;
                const statusColor = organ.status === 'alterado' ? '#ef4444' : organ.status === 'atencao' ? '#f59e0b' : '#10b981';

                return (
                  <Chip
                    key={organ.key}
                    label={`${organ.emoji} ${organ.name}`}
                    onClick={() => setSelectedKey(organ.key)}
                    sx={{
                      fontWeight: 700,
                      fontSize: 13,
                      py: 2,
                      px: 0.5,
                      borderRadius: '12px',
                      cursor: 'pointer',
                      bgcolor: isSelected ? 'rgba(32,178,170,0.25)' : 'rgba(255,255,255,0.06)',
                      color: isSelected ? '#5fc9c3' : '#c3d5e2',
                      border: '1px solid',
                      borderColor: isSelected ? '#5fc9c3' : 'rgba(255,255,255,0.1)',
                      transition: 'all .15s ease',
                      '&:hover': {
                        bgcolor: 'rgba(32,178,170,0.15)',
                        borderColor: '#5fc9c3',
                      },
                    }}
                  />
                );
              })}
            </Box>

            {/* Selected Organ Detail Card */}
            <Box
              ref={detailCardRef}
              sx={{
                bgcolor: 'rgba(10, 34, 58, 0.85)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(95, 201, 195, 0.25)',
                borderRadius: '20px',
                p: { xs: 2.5, md: 3 },
                boxShadow: '0 20px 48px rgba(0,0,0,0.3)',
                scrollMarginTop: { xs: 90, md: 30 },
              }}
            >
              {/* Header */}
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: '12px',
                      bgcolor: 'rgba(32,178,170,0.15)',
                      color: '#5fc9c3',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <activeOrgan.icon sx={{ fontSize: 24 }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 18, color: '#ffffff', fontFamily: 'Poppins, sans-serif' }}>
                      {activeOrgan.name}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: '#8fa8be' }}>
                      {activeOrgan.markers.length} marcadores monitorados
                    </Typography>
                  </Box>
                </Stack>
                <Box
                  sx={{
                    px: 1.5,
                    py: 0.5,
                    borderRadius: '999px',
                    fontSize: 12,
                    fontWeight: 700,
                    bgcolor: activeOrgan.status === 'alterado' ? 'rgba(239,68,68,0.2)' : activeOrgan.status === 'atencao' ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)',
                    color: activeOrgan.status === 'alterado' ? '#fca5a5' : activeOrgan.status === 'atencao' ? '#fcd34d' : '#86efac',
                    border: '1px solid',
                    borderColor: activeOrgan.status === 'alterado' ? 'rgba(239,68,68,0.4)' : activeOrgan.status === 'atencao' ? 'rgba(245,158,11,0.4)' : 'rgba(16,185,129,0.4)',
                  }}
                >
                  {activeOrgan.statusLabel}
                </Box>
              </Stack>

              {/* Clinical Calculation Box */}
              <Box
                id="calculos-clinicos"
                sx={{
                  bgcolor: 'rgba(6, 20, 38, 0.7)',
                  borderRadius: '14px',
                  p: 2,
                  mb: 2,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Typography sx={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#5fc9c3', mb: 0.5 }}>
                  ⚡ Cálculo Clínico Literário (Zero Alucinação)
                </Typography>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 15, color: '#ffffff' }}>
                    {activeOrgan.calculation}
                  </Typography>
                  <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 18, color: '#5fc9c3' }}>
                    {activeOrgan.calculationValue}
                  </Typography>
                </Stack>
                <Typography sx={{ fontSize: 13, color: '#b2c8db', lineHeight: 1.4 }}>
                  {activeOrgan.calculationInterp}
                </Typography>
              </Box>

              {/* Markers List */}
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#8fa8be', mb: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Exames & Marcadores Mapeados:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2.5 }}>
                {activeOrgan.markers.map((marker) => (
                  <Box
                    key={marker}
                    sx={{
                      px: 1.25,
                      py: 0.5,
                      borderRadius: '8px',
                      bgcolor: 'rgba(255,255,255,0.06)',
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: '#d6e4ef',
                    }}
                  >
                    {marker}
                  </Box>
                ))}
              </Box>

              {/* Action Buttons */}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={() => navigate('/registrar')}
                  endIcon={<ArrowForwardIcon />}
                  sx={{
                    borderRadius: '999px',
                    py: 1.2,
                    fontWeight: 800,
                    fontSize: 14,
                    textTransform: 'none',
                    bgcolor: '#178f89',
                    background: 'linear-gradient(135deg, #178f89, #20b2aa)',
                    boxShadow: '0 6px 20px rgba(32,178,170,0.35)',
                    '&:hover': { bgcolor: '#12736e', transform: 'translateY(-1px)' },
                  }}
                >
                  Ver no meu exame — é grátis
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={() => {
                    // Na home: rola até o demo. Em /features: deep-link ?ir=decifre
                    // (a landing rola até #demo sozinha ao montar).
                    const el = document.getElementById('demo');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                    else navigate('/?ir=decifre');
                  }}
                  sx={{
                    borderRadius: '999px',
                    py: 1.2,
                    fontWeight: 700,
                    fontSize: 14,
                    textTransform: 'none',
                    color: '#5fc9c3',
                    borderColor: 'rgba(95,201,195,0.4)',
                    '&:hover': { borderColor: '#5fc9c3', bgcolor: 'rgba(32,178,170,0.1)' },
                  }}
                >
                  Testar laudo agora
                </Button>
              </Stack>
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
};
