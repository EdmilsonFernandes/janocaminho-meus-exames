import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Box,
  Stack,
  Typography,
  Chip,
  Button,
  IconButton,
  Tooltip,
  useTheme,
  Divider,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import FavoriteIcon from '@mui/icons-material/Favorite';
import PsychologyIcon from '@mui/icons-material/Psychology';
import AirIcon from '@mui/icons-material/Air';
import ScienceIcon from '@mui/icons-material/Science';
import BoltIcon from '@mui/icons-material/Bolt';
import WaterIcon from '@mui/icons-material/Water';
import BloodtypeIcon from '@mui/icons-material/Bloodtype';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import AccessibilityNewIcon from '@mui/icons-material/AccessibilityNew';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import BiotechIcon from '@mui/icons-material/Biotech';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import RemoveIcon from '@mui/icons-material/Remove';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import HistoryToggleOffIcon from '@mui/icons-material/HistoryToggleOff';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import type { ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppCard } from './AppCard';
import { SEM, tealText } from '../theme';

export type RegionLevel = 'ok' | 'atencao' | 'alterado' | 'sem_dados' | 'desatualizado';
export type MarkerLevel = 'ok' | 'atencao' | 'alterado';

export interface BodyRegionMarkerView {
  nameCanonical: string;
  name: string;
  level: MarkerLevel;
  valueText: string | null;
  unit: string | null;
  refText: string | null;
  performedAt: string | null;
  prior: { valueText: string | null; performedAt: string | null } | null;
  deltaPct: number | null;
  trend: string | null;
  examId: string | null;
  historical: boolean;
}

export interface BodyRegionView {
  key: string;
  label: string;
  emoji: string;
  level: RegionLevel;
  markers: BodyRegionMarkerView[];
}

export interface BodyMapProps {
  regions: BodyRegionView[] | null;
  loaded: boolean;
  onRegionClick?: (r: BodyRegionView) => void;
  onNavigateToTrend?: (canonical: string) => void;
  onNavigateToExam?: (examId: string) => void;
  onUploadExam?: () => void;
}

const LEVEL_LABEL: Record<RegionLevel, string> = {
  ok: 'Dentro da referência',
  atencao: 'Atenção',
  alterado: 'Fora da referência',
  desatualizado: 'Exames > 1 ano',
  sem_dados: 'Sem dados',
};

const SYSTEM_ICON: Record<string, ComponentType<any>> = {
  cerebro: PsychologyIcon,
  coracao: FavoriteIcon,
  pulmoes: AirIcon,
  figado: ScienceIcon,
  pancreas: BoltIcon,
  rins: WaterIcon,
  sangue: BloodtypeIcon,
  hormonios: BiotechIcon,
  musculos: FitnessCenterIcon,
  ossos: AccessibilityNewIcon,
};

// Coordenadas anatômicas no raio-x frontal (%)
const ANATOMICAL_HOTSPOTS: Record<string, { x: number; y: number; side?: 'left' | 'right' }> = {
  cerebro: { x: 50, y: 9.5 },
  pulmoes: { x: 42, y: 24.5 },
  coracao: { x: 52, y: 28.5 },
  sangue: { x: 34.5, y: 31.5, side: 'left' },
  figado: { x: 44, y: 34.5, side: 'left' },
  pancreas: { x: 53.5, y: 36.5 },
  rins: { x: 58.5, y: 41.5, side: 'right' },
  hormonios: { x: 50, y: 47 },
  musculos: { x: 40, y: 60, side: 'left' },
  ossos: { x: 58.5, y: 63, side: 'right' },
};

const formatDate = (isoString: string | null) => {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return null;
  }
};

export const BodyMap = ({
  regions,
  loaded,
  onRegionClick,
  onNavigateToTrend,
  onNavigateToExam,
  onUploadExam,
}: BodyMapProps) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const dark = theme.palette.mode === 'dark';

  // Normalização defensiva: sem dados ou formato inesperado não crasha
  const safeList: BodyRegionView[] = useMemo(() => {
    if (!Array.isArray(regions)) return [];
    return regions.map((r) => ({
      key: r?.key || 'desconhecido',
      label: r?.label || 'Sistema',
      emoji: r?.emoji || '🩺',
      level: (r?.level as RegionLevel) || 'sem_dados',
      markers: Array.isArray(r?.markers)
        ? r.markers.map((m) => ({
            nameCanonical: m?.nameCanonical || '',
            name: m?.name || 'Marcador',
            level: (m?.level as MarkerLevel) || 'ok',
            valueText: m?.valueText || '—',
            unit: m?.unit || '',
            refText: m?.refText || null,
            performedAt: m?.performedAt || null,
            prior: m?.prior || null,
            deltaPct: typeof m?.deltaPct === 'number' ? m.deltaPct : null,
            trend: m?.trend || null,
            examId: m?.examId || null,
            historical: !!m?.historical,
          }))
        : [],
    }));
  }, [regions]);

  // Escolhe órgão inicial: primeiro com alteração, ou primeiro com dados, ou primeiro da lista
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    const firstBad = safeList.find((r) => r.level === 'alterado');
    if (firstBad) return firstBad.key;
    const firstWarn = safeList.find((r) => r.level === 'atencao');
    if (firstWarn) return firstWarn.key;
    const firstWithData = safeList.find((r) => r.markers.length > 0);
    if (firstWithData) return firstWithData.key;
    return safeList[0]?.key || 'coracao';
  });

  // Atualiza seleção se safeList carregar depois
  useEffect(() => {
    if (safeList.length > 0 && !safeList.some((r) => r.key === selectedKey)) {
      const best = safeList.find((r) => r.level === 'alterado') || safeList.find((r) => r.markers.length > 0) || safeList[0];
      if (best) setSelectedKey(best.key);
    }
  }, [safeList, selectedKey]);

  const activeRegion = useMemo(() => {
    return safeList.find((r) => r.key === selectedKey) || safeList[0] || null;
  }, [safeList, selectedKey]);

  const detailPanelRef = useRef<HTMLDivElement>(null);
  const [panelFlash, setPanelFlash] = useState(false);

  // Cores de status acessíveis com contraste AA
  const getLevelColor = (level: RegionLevel): string => {
    if (level === 'sem_dados') return dark ? '#64748b' : '#94a3b8';
    if (level === 'desatualizado') return dark ? '#cbd5e1' : '#64748b';
    if (level === 'ok') return dark ? SEM.ok.dark : SEM.ok.light;
    if (level === 'atencao') return dark ? SEM.warn.dark : SEM.warn.light;
    return dark ? SEM.bad.dark : SEM.bad.light;
  };

  const handleSelect = (key: string, shouldScroll = true) => {
    setSelectedKey(key);
    const reg = safeList.find((r) => r.key === key);
    if (reg && onRegionClick) {
      onRegionClick(reg);
    }
    // Efeito de feedback tátil e foco no painel
    setPanelFlash(true);
    setTimeout(() => setPanelFlash(false), 800);

    // Scroll suave automático direto para os resultados correspondentes abaixo
    if (shouldScroll && typeof window !== 'undefined') {
      setTimeout(() => {
        detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  };

  const handleGoTrend = (canonical: string) => {
    if (onNavigateToTrend) {
      onNavigateToTrend(canonical);
    } else {
      navigate(`/tendencias?select=${encodeURIComponent(canonical)}`);
    }
  };

  const handleGoExam = (examId: string) => {
    if (onNavigateToExam) {
      onNavigateToExam(examId);
    } else {
      navigate(`/exams/${examId}/show`);
    }
  };

  const handleGoUpload = () => {
    if (onUploadExam) {
      onUploadExam();
    } else {
      navigate('/exams/create');
    }
  };

  // Se não estiver carregado ou vazio, exibe fallback leve
  if (loaded && safeList.length === 0) {
    return (
      <AppCard>
        <Typography component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 16 }}>
          🩺 Mapa do seu Corpo
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          Envie seu primeiro exame de sangue para visualizar a saúde de cada órgão de forma interativa.
        </Typography>
        <Button
          variant="contained"
          size="small"
          onClick={handleGoUpload}
          startIcon={<UploadFileIcon />}
          sx={{ mt: 2, borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}
        >
          Enviar exame agora
        </Button>
      </AppCard>
    );
  }

  const activeColor = activeRegion ? getLevelColor(activeRegion.level) : '#20b2aa';

  return (
    <AppCard
      sx={{
        p: { xs: 2, sm: 2.5 },
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Keyframes de pulso sutil, bio-scanner laser e aceleração GPU */}
      <style>{`
        @keyframes subtleOrganPulse {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          50% { transform: scale(1.18); opacity: 0.65; }
        }
        @keyframes organRingPing {
          0% { transform: scale(0.8); opacity: 0.85; }
          70%, 100% { transform: scale(2.3); opacity: 0; }
        }
        @keyframes bioScanLaser {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 0.95; }
          90% { opacity: 0.95; }
          100% { top: 98%; opacity: 0; }
        }
        @keyframes radarSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes panelGlowFlash {
          0% { transform: scale(0.99); box-shadow: 0 0 0 3px rgba(95,201,195,0.6); }
          50% { transform: scale(1.008); box-shadow: 0 0 0 6px rgba(95,201,195,0.3); }
          100% { transform: scale(1); }
        }
        .organ-pulse-active {
          animation: subtleOrganPulse 3s ease-in-out infinite;
        }
        .organ-ring-ping {
          animation: organRingPing 2.8s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        .bio-scan-laser-beam {
          animation: bioScanLaser 4.2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
        .radar-reticle {
          animation: radarSpin 12s linear infinite;
        }
        .panel-flash-glow {
          animation: panelGlowFlash 0.7s ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .organ-pulse-active, .organ-ring-ping, .bio-scan-laser-beam, .radar-reticle, .panel-flash-glow {
            animation: none !important;
          }
        }
      `}</style>

      {/* Cabeçalho do Card */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 15.5, sm: 17 }, display: 'flex', alignItems: 'center', gap: 1 }}>
            🩺 Mapa do seu Corpo
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
            Toque nos pontos brilhantes do corpo para rolar direto aos exames e laudos do órgão.
          </Typography>
        </Box>
        <Chip
          size="small"
          label="Bio-Scanner Clínico"
          sx={{
            fontWeight: 700,
            fontSize: 11,
            bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
            color: 'primary.main',
            borderRadius: '999px',
          }}
        />
      </Box>

      {/* Grade Principal: Corpo Anatômico + Detalhes do Órgão */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 320px) 1fr' },
          gap: { xs: 2.5, md: 3 },
          alignItems: 'start',
        }}
      >
        {/* COLUNA 1: Ilustração Anatômica de Raio-X com Hotspots Interativos e Bio-Scanner */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              maxWidth: { xs: 260, sm: 290 },
              aspectRatio: '720/964',
              borderRadius: '20px',
              overflow: 'hidden',
              background: '#04101f',
              boxShadow: '0 16px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(95,201,195,0.25)',
              userSelect: 'none',
              touchAction: 'manipulation',
            }}
          >
            {/* HUD Badge de Bio-Scan no topo do Raio-X */}
            <Box
              sx={{
                position: 'absolute',
                top: 10,
                left: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.2,
                py: 0.45,
                borderRadius: '999px',
                background: 'rgba(4, 16, 31, 0.78)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(95, 201, 195, 0.35)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                zIndex: 8,
                pointerEvents: 'none',
              }}
            >
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  bgcolor: '#5fc9c3',
                  boxShadow: '0 0 8px #5fc9c3',
                  animation: 'subtleOrganPulse 2s infinite',
                }}
              />
              <Typography
                component="span"
                sx={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  color: '#5fc9c3',
                  textTransform: 'uppercase',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                Bio-Scan Ativo
              </Typography>
            </Box>

            {/* Imagem de base raio-x leve (WebP 24KB) */}
            <Box
              component="img"
              src={`${import.meta.env.BASE_URL}body-xray.webp`}
              alt="Ilustração anatômica do corpo humano"
              loading="lazy"
              decoding="async"
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                opacity: 0.88,
              }}
            />

            {/* Feixe Laser Bio-Scanner Animado que percorre o corpo */}
            <Box
              className="bio-scan-laser-beam"
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: '2px',
                background: 'linear-gradient(90deg, transparent 0%, rgba(95,201,195,0.25) 15%, #ffffff 50%, rgba(95,201,195,0.25) 85%, transparent 100%)',
                boxShadow: '0 0 14px 3px rgba(95,201,195,0.85), 0 0 28px rgba(95,201,195,0.4)',
                pointerEvents: 'none',
                zIndex: 6,
              }}
            />

            {/* Vinheta cônica/radial para visual de diagnóstico cibernético */}
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(ellipse at 50% 45%, transparent 52%, rgba(2, 8, 20, 0.62))',
                pointerEvents: 'none',
              }}
            />

            {/* Hotspots dos Órgãos Posicionados com Precisão e Clicáveis */}
            {safeList.map((reg) => {
              const spot = ANATOMICAL_HOTSPOTS[reg.key];
              if (!spot) return null;

              const isSelected = reg.key === selectedKey;
              const col = getLevelColor(reg.level);
              const hasAlert = reg.level === 'alterado' || reg.level === 'atencao';
              const hasData = reg.level !== 'sem_dados';

              return (
                <Tooltip
                  key={reg.key}
                  title={`${reg.emoji} ${reg.label} — ${LEVEL_LABEL[reg.level]} (toque para ver exames)`}
                  arrow
                  placement="top"
                  enterTouchDelay={0}
                >
                  <Box
                    component="button"
                    type="button"
                    onClick={() => handleSelect(reg.key, true)}
                    aria-label={`${reg.label}: ${LEVEL_LABEL[reg.level]}`}
                    sx={{
                      position: 'absolute',
                      left: `${spot.x}%`,
                      top: `${spot.y}%`,
                      transform: 'translate(-50%, -50%)',
                      width: isSelected ? 46 : 38,
                      height: isSelected ? 46 : 38,
                      border: 0,
                      background: 'none',
                      p: 0,
                      cursor: 'pointer',
                      zIndex: isSelected ? 12 : 5,
                      display: 'grid',
                      placeItems: 'center',
                      transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.2s ease, height 0.2s ease',
                      '&:hover': {
                        transform: 'translate(-50%, -50%) scale(1.15)',
                      },
                      '&:focus-visible': {
                        outline: `2px solid #5fc9c3`,
                        outlineOffset: 3,
                      },
                    }}
                  >
                    {/* Retícula/Mira cibernética giratória no órgão ativo */}
                    {isSelected && (
                      <Box
                        className="radar-reticle"
                        sx={{
                          position: 'absolute',
                          inset: 1,
                          borderRadius: '50%',
                          border: `1.5px dashed ${alpha(col, 0.85)}`,
                          pointerEvents: 'none',
                        }}
                      />
                    )}

                    {/* Halo de pulso sutil em caso de alteração/atenção */}
                    {hasAlert && (
                      <Box
                        className="organ-ring-ping"
                        sx={{
                          position: 'absolute',
                          inset: 4,
                          borderRadius: '50%',
                          border: `2px solid ${col}`,
                          pointerEvents: 'none',
                        }}
                      />
                    )}

                    {/* Núcleo do Hotspot Colorido */}
                    <Box
                      className={hasAlert ? 'organ-pulse-active' : undefined}
                      sx={{
                        width: isSelected ? 22 : 16,
                        height: isSelected ? 22 : 16,
                        borderRadius: '50%',
                        bgcolor: col,
                        boxShadow: isSelected
                          ? `0 0 18px 4px ${col}, 0 0 32px ${alpha(col, 0.7)}`
                          : hasData
                          ? `0 0 12px 2px ${alpha(col, 0.85)}`
                          : 'none',
                        border: isSelected ? '2.5px solid #ffffff' : '1.5px solid rgba(255,255,255,0.75)',
                        opacity: hasData ? 1 : 0.45,
                        transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      }}
                    />
                  </Box>
                </Tooltip>
              );
            })}
          </Box>

          {/* Legenda Resumida dos Status */}
          <Stack direction="row" spacing={1.5} sx={{ mt: 1.5, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, fontSize: 11.5, color: 'text.secondary' }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dark ? SEM.bad.dark : SEM.bad.light }} />
              Fora da faixa
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, fontSize: 11.5, color: 'text.secondary' }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dark ? SEM.warn.dark : SEM.warn.light }} />
              Atenção
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, fontSize: 11.5, color: 'text.secondary' }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dark ? SEM.ok.dark : SEM.ok.light }} />
              Normal

            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, fontSize: 11.5, color: 'text.secondary' }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dark ? '#64748b' : '#94a3b8' }} />
              Sem exames
            </Box>
          </Stack>
        </Box>

        {/* COLUNA 2: Detalhes Ricos do Órgão Selecionado */}
        <Box
          ref={detailPanelRef}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            scrollMarginTop: { xs: '84px', md: '24px' },
          }}
        >
          {activeRegion ? (
            <Box
              className={panelFlash ? 'panel-flash-glow' : undefined}
              sx={{
                borderRadius: '16px',
                p: { xs: 2, sm: 2.5 },
                bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(32,178,170,0.03)'),
                border: '1px solid',
                borderColor: (t) => alpha(activeColor, t.palette.mode === 'dark' ? 0.35 : 0.25),
                boxShadow: (t) => `0 4px 20px ${alpha(activeColor, t.palette.mode === 'dark' ? 0.12 : 0.06)}`,
                transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease',
              }}
            >
              {/* Header do Sistema */}
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
                <Stack direction="row" alignItems="center" spacing={1.25}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '12px',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: alpha(activeColor, 0.14),
                      color: activeColor,
                      fontSize: 22,
                    }}
                  >
                    {(() => {
                      const Icon = SYSTEM_ICON[activeRegion.key] || MedicalServicesIcon;
                      return <Icon sx={{ fontSize: 22 }} />;
                    })()}
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>
                      {activeRegion.emoji} {activeRegion.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {activeRegion.markers.length > 0
                        ? `${activeRegion.markers.length} exame${activeRegion.markers.length > 1 ? 's' : ''} mapeado${activeRegion.markers.length > 1 ? 's' : ''}`
                        : 'Nenhum exame relacionado no momento'}
                    </Typography>
                  </Box>
                </Stack>

                <Chip
                  size="small"
                  label={LEVEL_LABEL[activeRegion.level]}
                  sx={{
                    fontWeight: 800,
                    fontSize: 12,
                    bgcolor: alpha(activeColor, 0.12),
                    color: activeColor,
                    borderColor: alpha(activeColor, 0.35),
                    borderWidth: 1,
                    borderStyle: 'solid',
                  }}
                />
              </Stack>

              <Divider sx={{ my: 1.5, borderColor: alpha(activeColor, 0.15) }} />

              {/* Lista de Marcadores Clínicos do Órgão */}
              {activeRegion.markers.length > 0 ? (
                <Stack spacing={1.5} sx={{ mt: 1.5, maxHeight: 380, overflowY: 'auto', pr: 0.5 }}>
                  {activeRegion.markers.map((m) => {
                    const mCol = getLevelColor(m.level);
                    const isAbnormal = m.level === 'alterado' || m.level === 'atencao';
                    const examDate = formatDate(m.performedAt);

                    return (
                      <Box
                        key={m.nameCanonical || m.name}
                        sx={{
                          p: 1.5,
                          borderRadius: '12px',
                          bgcolor: (t) => (t.palette.mode === 'dark' ? '#141e28' : '#ffffff'),
                          border: '1px solid',
                          borderColor: (t) => (isAbnormal ? alpha(mCol, 0.4) : t.palette.divider),
                          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                        }}
                      >
                        {/* Linha 1: Nome do Marcador e Resultado Atual */}
                        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                          <Typography sx={{ fontWeight: 700, fontSize: 14, color: 'text.primary' }}>
                            {m.name}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                            <Typography sx={{ fontWeight: 800, fontSize: 16, color: mCol, fontVariantNumeric: 'tabular-nums' }}>
                              {m.valueText}
                            </Typography>
                            {m.unit && (
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                {m.unit}
                              </Typography>
                            )}
                          </Box>
                        </Box>

                        {/* Linha 2: Faixa de Referência e Data */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5, flexWrap: 'wrap', gap: 0.75 }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {m.refText ? `Referência: ${m.refText}` : 'Sem faixa de referência informada'}
                          </Typography>
                          {examDate && (
                            <Typography variant="caption" sx={{ color: 'text.secondary', opacity: 0.85 }}>
                              {examDate}
                            </Typography>
                          )}
                        </Box>

                        {/* Linha 3: Evolução em Relação ao Exame Anterior */}
                        {m.prior && (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              mt: 1,
                              p: 0.75,
                              borderRadius: '8px',
                              bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
                              fontSize: 12,
                            }}
                          >
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                              Anterior: {m.prior.valueText} {m.unit}
                            </Typography>
                            {m.deltaPct != null && (
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontWeight: 700, color: m.deltaPct > 0 ? SEM.bad.light : SEM.ok.light }}>
                                {m.deltaPct > 0 ? <TrendingUpIcon sx={{ fontSize: 14 }} /> : <TrendingDownIcon sx={{ fontSize: 14 }} />}
                                {Math.abs(m.deltaPct).toFixed(1).replace('.', ',')}%
                              </Box>
                            )}
                          </Box>
                        )}

                        {/* Linha 4: Ações Rápidas (Tendência e Exame Original) */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, mt: 1, pt: 0.75, borderTop: '1px dashed', borderColor: 'divider' }}>
                          {m.examId && (
                            <Button
                              size="small"
                              variant="text"
                              onClick={() => handleGoExam(m.examId!)}
                              sx={{
                                fontSize: 11.5,
                                fontWeight: 700,
                                textTransform: 'none',
                                color: 'text.secondary',
                                py: 0.25,
                                px: 1,
                                minHeight: 28,
                                '&:hover': { color: 'text.primary' },
                              }}
                            >
                              Ver laudo original
                            </Button>
                          )}
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => handleGoTrend(m.nameCanonical)}
                            endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
                            sx={{
                              fontSize: 11.5,
                              fontWeight: 700,
                              textTransform: 'none',
                              color: 'primary.main',
                              py: 0.25,
                              px: 1,
                              minHeight: 28,
                            }}
                          >
                            Ver tendência
                          </Button>
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              ) : (
                /* Estado sem exames para a região */
                <Box sx={{ py: 3, textAlign: 'center' }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 320, mx: 'auto', mb: 2 }}>
                    Ainda não há exames cadastrados para o sistema <strong>{activeRegion.label}</strong>.
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleGoUpload}
                    startIcon={<UploadFileIcon />}
                    sx={{
                      borderRadius: '999px',
                      textTransform: 'none',
                      fontWeight: 700,
                      borderColor: 'primary.main',
                      color: 'primary.main',
                    }}
                  >
                    Enviar exame deste sistema
                  </Button>
                </Box>
              )}
            </Box>
          ) : null}
        </Box>
      </Box>

      {/* Grade Sincronizada de Chips dos Sistemas (Toque Rápido) */}
      <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 1.25 }}>
          TODOS OS SISTEMAS (toque para alternar o órgão):
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          {safeList.map((reg) => {
            const isSelected = reg.key === selectedKey;
            const c = getLevelColor(reg.level);
            return (
              <Chip
                key={reg.key}
                clickable
                onClick={() => handleSelect(reg.key)}
                label={
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}>
                    <Box component="span">{reg.emoji}</Box>
                    <Box component="span" sx={{ fontWeight: isSelected ? 800 : 600 }}>
                      {reg.label}
                    </Box>
                    {reg.level === 'alterado' && (
                      <Box component="span" sx={{ color: c, fontWeight: 800 }}>
                        !
                      </Box>
                    )}
                  </Box>
                }
                sx={{
                  borderRadius: '10px',
                  bgcolor: isSelected
                    ? alpha(c, dark ? 0.25 : 0.15)
                    : (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'),
                  border: '1px solid',
                  borderColor: isSelected ? c : 'transparent',
                  color: isSelected ? c : 'text.primary',
                  fontWeight: 600,
                  fontSize: 12.5,
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    bgcolor: alpha(c, 0.12),
                  },
                }}
              />
            );
          })}
        </Box>
      </Box>

      {/* Disclaimer de Responsabilidade Médica Conforme Diretriz */}
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          color: 'text.disabled',
          textAlign: 'center',
          mt: 2.5,
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}
      >
        * Os destaques mostram regiões relacionadas aos seus exames laboratoriais e não representam um diagnóstico clínico.
      </Typography>
    </AppCard>
  );
};
