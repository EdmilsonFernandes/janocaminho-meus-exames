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
  Collapse,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
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
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
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

// Coordenadas anatômicas no raio-x frontal (%) com numeração 1 a 13 (dentro do contorno do tronco)
const ANATOMICAL_HOTSPOTS: Record<string, { x: number; y: number; side?: 'left' | 'right'; num: number }> = {
  cerebro: { x: 50, y: 9.5, num: 1 },
  tireoide: { x: 50, y: 17.5, num: 2 },
  pulmoes: { x: 38, y: 23.5, side: 'left', num: 3 },
  coracao: { x: 56, y: 27.5, side: 'right', num: 4 },
  figado: { x: 42, y: 34, side: 'left', num: 5 },       // Hipocôndrio direito dentro do tronco (longe do braço)
  estomago: { x: 58, y: 34.5, side: 'right', num: 6 },   // Hipocôndrio esquerdo dentro do tronco
  pancreas: { x: 50, y: 40.5, num: 7 },                 // Região epigástrica central
  rins: { x: 58, y: 44.5, side: 'right', num: 8 },      // Flanco interno / loja renal (longe do braço/punho)
  intestino: { x: 50, y: 49.5, num: 9 },                // Região umbilical/mesogástrica
  hormonios: { x: 50, y: 57, num: 10 },                 // Pélvis e sistema endócrino
  sangue: { x: 26, y: 41, side: 'left', num: 11 },      // Fossa cubital (veia do braço p/ punção laboratorial)
  musculos: { x: 44, y: 67, side: 'left', num: 12 },    // Coxa / quadríceps
  ossos: { x: 56, y: 76, side: 'right', num: 13 },      // Joelho / tíbia
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

interface OrganClinicalAdvice {
  exams: { name: string; type: string; purpose: string }[];
  why: string;
  recommendation: string;
}

const ORGAN_CLINICAL_GUIDE: Record<string, OrganClinicalAdvice> = {
  coracao: {
    exams: [
      { name: 'Perfil Lipídico Completo', type: 'Sangue', purpose: 'Avalia Colesterol Total, LDL, HDL e Triglicerídeos' },
      { name: 'Eletrocardiograma (ECG)', type: 'Cardiológico', purpose: 'Registra o ritmo e a condução elétrica cardíaca' },
      { name: 'PCR Ultra-sensível', type: 'Sangue', purpose: 'Identifica inflamação subclínica nas artérias coronárias' },
    ],
    why: 'As doenças cardiovasculares são a principal causa de mortalidade e evoluem de forma silenciosa por anos. Monitorar o perfil lipídico e a inflamação permite prevenir o entupimento de artérias muito antes de qualquer dor ou sintoma.',
    recommendation: 'Recomendado anualmente para adultos a partir dos 20 anos, ou antes se houver histórico na família.',
  },
  cerebro: {
    exams: [
      { name: 'Vitamina B12 & Ácido Fólico', type: 'Sangue', purpose: 'Proteção da bainha de mielina dos neurônios e síntese de neurotransmissores' },
      { name: 'Homocisteína', type: 'Sangue', purpose: 'Marcador de estresse oxidativo e integridade neurovascular' },
      { name: 'Ferritina Sérica', type: 'Sangue', purpose: 'Estoque de ferro essencial para oxigenação do cérebro' },
    ],
    why: 'Quedas em nutrientes vitais como B12 e folato causam lentidão de raciocínio, esquecimentos, fadiga e formigamentos que são 100% reversíveis se corrigidos a tempo.',
    recommendation: 'Recomendado para quem sente cansaço constante, lapsos de memória ou segue dietas restritivas.',
  },
  tireoide: {
    exams: [
      { name: 'TSH Ultra-sensível', type: 'Sangue', purpose: 'Hormônio regulador do ritmo metabólico do organismo' },
      { name: 'T4 Livre', type: 'Sangue', purpose: 'Hormônio tireoidiano ativo circulante nos tecidos' },
      { name: 'Anti-TPO', type: 'Sangue', purpose: 'Investiga tendência a autoimunidade tireoidiana (Hashimoto)' },
    ],
    why: 'A tireoide é a bateria metabólica do corpo: controla peso, disposição, sono, queda de cabelo e temperatura corporal. Distúrbios leves passam despercebidos por anos.',
    recommendation: 'Rotina anual em check-ups de rotina, especialmente com histórico de alterações de peso ou cansaço.',
  },
  pulmoes: {
    exams: [
      { name: 'Oximetria de Pulso', type: 'Não invasivo', purpose: 'Mede o percentual de oxigênio transportado no sangue' },
      { name: 'Espirometria', type: 'Funcional', purpose: 'Avalia o volume e velocidade do ar nos pulmões' },
      { name: 'Raio-X de Tórax', type: 'Imagem', purpose: 'Visualiza parênquima pulmonar, vasos e mediastino' },
    ],
    why: 'Garante que suas trocas gasosas estão em nível ideal para alimentar os músculos e o cérebro com oxigênio pleno.',
    recommendation: 'Essencial para praticantes de atividade física, pessoas com cansaço ao subir escadas ou tosse recorrente.',
  },
  figado: {
    exams: [
      { name: 'TGO (AST) e TGP (ALT)', type: 'Sangue', purpose: 'Enzimas que indicam lesão ou sobrecarga nas células do fígado' },
      { name: 'Gama-GT e Fosfatase Alcalina', type: 'Sangue', purpose: 'Avaliam fluxo biliar e resposta a medicamentos' },
      { name: 'Ultrassom de Abdome', type: 'Imagem', purpose: 'Verifica textura hepática e presença de gordura (esteatose)' },
    ],
    why: 'O fígado processa toxinas, medicamentos e gorduras. A esteatose hepática (gordura no fígado) não dói, mas pode ser totalmente revertida com dieta quando detectada no início.',
    recommendation: 'Recomendado anualmente para qualquer adulto em rotina preventiva.',
  },
  pancreas: {
    exams: [
      { name: 'Glicemia de Jejum', type: 'Sangue', purpose: 'Mede o nível imediato de açúcar no sangue' },
      { name: 'Hemoglobina Glicada (HbA1c)', type: 'Sangue', purpose: 'Retrato fiel da média glicêmica dos últimos 3 meses' },
      { name: 'Insulina Basal (HOMA-IR)', type: 'Sangue', purpose: 'Detecta resistência insulínica anos antes do diabetes' },
    ],
    why: 'A resistência à insulina começa muito antes da glicose subir. Descobrir cedo protege os vasos, a visão e a longevidade metabólica.',
    recommendation: 'Check-up anual para adultos de todas as idades.',
  },
  rins: {
    exams: [
      { name: 'Creatinina Sérica com TFG', type: 'Sangue', purpose: 'Mede a velocidade exata de filtragem dos rins' },
      { name: 'Ureia Sérica', type: 'Sangue', purpose: 'Avalia a excreção de compostos nitrogenados e hidratação' },
      { name: 'EAS / Urina 1', type: 'Urina', purpose: 'Detecta micro-perda de proteínas, cristais e infecções' },
    ],
    why: 'Os rins filtram centenas de litros de sangue diariamente. A perda de função renal só dá sintomas em fases tardias, tornando exames preventivos simples fundamentais.',
    recommendation: 'Anualmente em qualquer check-up, especialmente para quem pratica musculação ou usa suplementos.',
  },
  intestino: {
    exams: [
      { name: 'Sangue Oculto nas Fezes', type: 'Fezes', purpose: 'Rastreio precoce e preventivo de lesões na mucosa' },
      { name: 'Parasitológico de Fezes', type: 'Fezes', purpose: 'Investiga presença de parasitas e absorção intestinal' },
      { name: 'Calprotectina Fecal', type: 'Fezes', purpose: 'Detecta inflamação intestinal ativa' },
    ],
    why: 'O intestino abriga grande parte do sistema imune e absorve todos os nutrientes. Prevenir desequilíbrios digestivos garante energia e absorção das vitaminas.',
    recommendation: 'A cada 1 a 2 anos, ou sempre que houver desconforto digestivo persistente.',
  },
  sangue: {
    exams: [
      { name: 'Hemograma Completo', type: 'Sangue', purpose: 'Contagem de glóbulos vermelhos, leucócitos e plaquetas' },
      { name: 'Ferritina Sérica', type: 'Sangue', purpose: 'Verifica a reserva real de ferro no organismo' },
      { name: 'Coagulograma Básico', type: 'Sangue', purpose: 'Avalia o tempo e equilíbrio da coagulação sanguínea' },
    ],
    why: 'O sangue transporta oxigênio para todos os órgãos. Pequenas anemias ou alterações de leucócitos causam sonolência, queda de imunidade e indisposição.',
    recommendation: 'O exame mais fundamental da medicina, recomendado a cada 6 ou 12 meses.',
  },
  hormonios: {
    exams: [
      { name: 'Testosterona Total e Livre', type: 'Sangue', purpose: 'Vital para disposição, recuperação muscular e vitalidade' },
      { name: 'Estradiol e Progesterona', type: 'Sangue', purpose: 'Equilíbrio hormonal, humor e densidade óssea' },
      { name: 'Cortisol Basal', type: 'Sangue', purpose: 'Mede a resposta do corpo ao estresse diário' },
    ],
    why: 'Hormônios regulam humor, sono, composição corporal e foco mental. Ajustar déficits traz salto imediato na qualidade de vida.',
    recommendation: 'Adultos que sentem cansaço crônico, alterações no sono ou queda no rendimento físico.',
  },
  musculos: {
    exams: [
      { name: 'CPK (Creatinofosfoquinase)', type: 'Sangue', purpose: 'Mede o desgaste e recuperação das fibras musculares' },
      { name: 'Eletrólitos (Sódio, Potássio, Magnésio)', type: 'Sangue', purpose: 'Essenciais para contração muscular e evitar cãibras' },
      { name: 'Vitamina D (25-OH)', type: 'Sangue', purpose: 'Regula força muscular e síntese de proteínas' },
    ],
    why: 'Massa muscular saudável é o maior escudo contra envelhecimento precoce e diabetes. Acompanhar a recuperação evita sobrecarga (overtraining).',
    recommendation: 'Praticantes de esportes, musculação e adultos preservando mobilidade.',
  },
  ossos: {
    exams: [
      { name: 'Cálcio Total e Iônico', type: 'Sangue', purpose: 'Mineral fundamental da estrutura óssea e dentes' },
      { name: 'Vitamina D (25-OH)', type: 'Sangue', purpose: 'Permite a absorção intestinal eficiente do cálcio' },
      { name: 'Fósforo Sérico', type: 'Sangue', purpose: 'Trabalha junto ao cálcio na mineralização óssea' },
    ],
    why: 'A perda de densidade óssea não avisa até haver uma fratura. Manter níveis ideais de vitamina D e cálcio garante ossos fortes para a vida inteira.',
    recommendation: 'Mulheres a partir dos 40 anos, homens a partir dos 50, ou qualquer pessoa com pouca exposição solar.',
  },
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

  const [selectedKey, setSelectedKey] = useState<string>(() => {
    const firstBad = safeList.find((r) => r.level === 'alterado');
    if (firstBad) return firstBad.key;
    const firstWarn = safeList.find((r) => r.level === 'atencao');
    if (firstWarn) return firstWarn.key;
    const firstWithData = safeList.find((r) => r.markers.length > 0);
    if (firstWithData) return firstWithData.key;
    return safeList[0]?.key || 'coracao';
  });

  // Modo de visualização: Órgãos bioluminescentes 3D ou Raio-X espectral
  const [viewMode, setViewMode] = useState<'bioglow' | 'xray'>('bioglow');

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
  const [showAllMarkers, setShowAllMarkers] = useState(false);
  const [expandedMarker, setExpandedMarker] = useState<string | null>(null);

  // Reset expansão ao trocar de órgão
  useEffect(() => {
    setShowAllMarkers(false);
    setExpandedMarker(null);
  }, [selectedKey]);

  // Ordenação inteligente: marcadores fora da referência/atenção vêm no topo
  const sortedMarkers = useMemo(() => {
    if (!activeRegion?.markers) return [];
    return [...activeRegion.markers].sort((a, b) => {
      const rank = (lvl: MarkerLevel) => (lvl === 'alterado' ? 0 : lvl === 'atencao' ? 1 : 2);
      return rank(a.level) - rank(b.level);
    });
  }, [activeRegion]);

  const visibleMarkers = showAllMarkers ? sortedMarkers : sortedMarkers.slice(0, 3);
  const hiddenCount = Math.max(0, sortedMarkers.length - 3);

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

      {/* Cabeçalho do Card com layout 100% responsivo para mobile sem quebras */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          mb: 2,
          gap: { xs: 1.25, sm: 1.5 },
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography
              component="h2"
              sx={{
                fontFamily: 'Poppins, sans-serif',
                fontWeight: 800,
                fontSize: { xs: 'clamp(15px, 4.2vw, 17.5px)', sm: 18 },
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                lineHeight: 1.2,
                color: 'text.primary',
              }}
            >
              <Box component="span" sx={{ fontSize: { xs: 18, sm: 20 }, lineHeight: 1 }}>🫀</Box>
              Mapa do seu Corpo
            </Typography>
            <Box
              component="span"
              sx={{
                fontSize: 11,
                fontWeight: 800,
                color: dark ? '#5fc9c3' : '#0f766e',
                bgcolor: dark ? 'rgba(32, 178, 170, 0.15)' : 'rgba(32, 178, 170, 0.1)',
                border: '1px solid',
                borderColor: dark ? 'rgba(32, 178, 170, 0.35)' : 'rgba(32, 178, 170, 0.25)',
                px: 1,
                py: 0.25,
                borderRadius: '999px',
                whiteSpace: 'nowrap',
              }}
            >
              13 Regiões
            </Box>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontSize: { xs: 11.5, sm: 12 }, lineHeight: 1.35 }}>
            Toque nos órgãos ou pontos brilhantes para rolar direto aos exames e laudos vinculados.
          </Typography>
        </Box>
        <Chip
          size="small"
          icon={
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: '#20b2aa',
                boxShadow: '0 0 8px #20b2aa',
                animation: 'subtleOrganPulse 2s infinite',
                ml: '8px !important',
              }}
            />
          }
          label="Bio-Scan Clínico"
          sx={{
            fontWeight: 800,
            fontSize: 11,
            bgcolor: dark ? 'rgba(32, 178, 170, 0.15)' : 'rgba(32, 178, 170, 0.12)',
            color: dark ? '#5fc9c3' : '#0f766e',
            border: '1px solid',
            borderColor: dark ? 'rgba(32, 178, 170, 0.35)' : 'rgba(32, 178, 170, 0.3)',
            borderRadius: '999px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            alignSelf: { xs: 'flex-start', sm: 'center' },
          }}
        />
      </Box>

      {/* Seletor Rápido Horizontal de Chips das 13 Regiões Numeradas (Deslize suave sem scrollbar feia) */}
      <Box
        sx={{
          display: 'flex',
          gap: 0.75,
          overflowX: 'auto',
          pb: 0.5,
          mb: 1.5,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {safeList.map((reg) => {
          const spot = ANATOMICAL_HOTSPOTS[reg.key];
          const isSelected = reg.key === selectedKey;
          const col = getLevelColor(reg.level);
          const num = spot?.num || 1;

          return (
            <Chip
              key={reg.key}
              clickable
              size="small"
              onClick={() => handleSelect(reg.key, true)}
              avatar={
                <Box
                  sx={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    bgcolor: isSelected ? 'common.white' : col,
                    color: isSelected ? 'text.primary' : 'common.white',
                    fontSize: 10,
                    fontWeight: 800,
                    display: 'grid',
                    placeItems: 'center',
                    fontFamily: 'Poppins, sans-serif',
                  }}
                >
                  {num}
                </Box>
              }
              label={reg.label.split('&')[0].trim()}
              sx={{
                fontWeight: 700,
                fontSize: 11.5,
                bgcolor: isSelected ? (dark ? '#0f2942' : '#0f172a') : (dark ? 'rgba(255,255,255,0.06)' : '#f8fafc'),
                color: isSelected ? '#ffffff' : 'text.primary',
                border: isSelected ? '1px solid #5fc9c3' : '1px solid',
                borderColor: isSelected ? '#5fc9c3' : 'divider',
                boxShadow: isSelected ? '0 2px 8px rgba(95,201,195,0.3)' : 'none',
                transition: 'all 0.2s',
                flexShrink: 0,
              }}
            />
          );
        })}
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

            {/* Imagem anatômica (Raio-X Clínico em Alta Resolução) */}
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
                opacity: 0.94,
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

                    {/* Núcleo do Hotspot Colorido com Desenho Anatômico do Órgão e Badge com Número */}
                    <Box
                      className={hasAlert ? 'organ-pulse-active' : undefined}
                      sx={{
                        position: 'relative',
                        width: isSelected ? 34 : 28,
                        height: isSelected ? 34 : 28,
                        borderRadius: '50%',
                        background: `radial-gradient(circle, ${alpha(col, 0.4)} 0%, #061428 100%)`,
                        border: `1.5px solid ${col}`,
                        display: 'grid',
                        placeItems: 'center',
                        boxShadow: isSelected
                          ? `0 0 18px 4px ${col}, 0 0 32px ${alpha(col, 0.75)}`
                          : hasData
                          ? `0 0 10px 2px ${alpha(col, 0.65)}`
                          : 'none',
                        transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      }}
                    >
                      {/* Desenho do Órgão com iluminação bioluminescente */}
                      <Typography
                        component="span"
                        sx={{
                          fontSize: isSelected ? 16 : 13,
                          lineHeight: 1,
                          filter: `drop-shadow(0 0 5px ${col})`,
                          userSelect: 'none',
                        }}
                      >
                        {reg.emoji}
                      </Typography>

                      {/* Badge Elegante com o Número 1 a 13 */}
                      <Box
                        sx={{
                          position: 'absolute',
                          top: -3,
                          right: -3,
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          bgcolor: '#0f172a',
                          border: `1.5px solid ${col}`,
                          color: '#ffffff',
                          fontFamily: 'Poppins, sans-serif',
                          fontSize: 8.5,
                          fontWeight: 800,
                          display: 'grid',
                          placeItems: 'center',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.6)',
                          zIndex: 3,
                        }}
                      >
                        {spot.num}
                      </Box>
                    </Box>
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
                border: '2px solid',
                borderColor: (t) => alpha(activeColor, t.palette.mode === 'dark' ? 0.45 : 0.35),
                boxShadow: (t) => `0 6px 24px ${alpha(activeColor, t.palette.mode === 'dark' ? 0.18 : 0.09)}`,
                transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease',
              }}
            >
              {/* Banner Destacado: Órgão Selecionado no Mapa */}
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.8,
                  px: 1.25,
                  py: 0.45,
                  mb: 1.5,
                  borderRadius: '999px',
                  bgcolor: alpha(activeColor, dark ? 0.22 : 0.12),
                  border: '1px solid',
                  borderColor: alpha(activeColor, 0.45),
                  color: activeColor,
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                <Box
                  component="span"
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    bgcolor: activeColor,
                    boxShadow: `0 0 8px ${activeColor}`,
                  }}
                />
                🎯 Exames do Órgão Selecionado: {activeRegion.label}
              </Box>

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

              {/* Lista de Marcadores Clínicos do Órgão — Formato Compacto com Divulgação Progressiva */}
              {sortedMarkers.length > 0 ? (
                <Stack spacing={1} sx={{ mt: 1.5 }}>
                  {visibleMarkers.map((m) => {
                    const mCol = getLevelColor(m.level);
                    const isAbnormal = m.level === 'alterado' || m.level === 'atencao';
                    const examDate = formatDate(m.performedAt);
                    const mKey = m.nameCanonical || m.name;
                    const isExpanded = expandedMarker === mKey;

                    return (
                      <Box
                        key={mKey}
                        sx={{
                          borderRadius: '12px',
                          bgcolor: (t) => (t.palette.mode === 'dark' ? '#141e28' : '#ffffff'),
                          border: '1px solid',
                          borderColor: (t) =>
                            isExpanded ? alpha(activeColor, 0.55) : isAbnormal ? alpha(mCol, 0.35) : t.palette.divider,
                          boxShadow: isExpanded
                            ? `0 4px 14px ${alpha(activeColor, 0.16)}`
                            : '0 1px 4px rgba(0,0,0,0.03)',
                          transition: 'all 0.18s ease',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Linha Compacta Clínica (clicável para expandir) */}
                        <Box
                          onClick={() => setExpandedMarker(isExpanded ? null : mKey)}
                          role="button"
                          tabIndex={0}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            p: { xs: '10px 12px', sm: '10px 14px' },
                            cursor: 'pointer',
                            gap: 1.25,
                            '&:hover': {
                              bgcolor: (t) => alpha(activeColor, t.palette.mode === 'dark' ? 0.08 : 0.04),
                            },
                          }}
                        >
                          {/* Indicador de status + Nome */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, minWidth: 0, flex: 1 }}>
                            <Box
                              sx={{
                                width: 9,
                                height: 9,
                                borderRadius: '50%',
                                bgcolor: mCol,
                                flexShrink: 0,
                                boxShadow: `0 0 6px ${alpha(mCol, 0.65)}`,
                              }}
                            />
                            <Typography
                              sx={{
                                fontWeight: isAbnormal ? 800 : 700,
                                fontSize: { xs: 13, sm: 13.5 },
                                color: 'text.primary',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {m.name}
                            </Typography>
                          </Box>

                          {/* Valor + Unidade + Variação + Seta */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                            <Box sx={{ textAlign: 'right' }}>
                              <Typography
                                sx={{
                                  fontWeight: 800,
                                  fontSize: { xs: 14.5, sm: 15.5 },
                                  color: mCol,
                                  fontVariantNumeric: 'tabular-nums',
                                  lineHeight: 1.1,
                                }}
                              >
                                {m.valueText}
                                {m.unit && (
                                  <Typography
                                    component="span"
                                    variant="caption"
                                    sx={{ ml: 0.5, color: 'text.secondary', fontWeight: 600, fontSize: 11 }}
                                  >
                                    {m.unit}
                                  </Typography>
                                )}
                              </Typography>
                            </Box>

                            {m.deltaPct != null && (
                              <Chip
                                size="small"
                                label={`${m.deltaPct > 0 ? '+' : ''}${m.deltaPct.toFixed(0)}%`}
                                sx={{
                                  height: 20,
                                  fontSize: 10.5,
                                  fontWeight: 800,
                                  bgcolor: m.deltaPct > 0 ? alpha(SEM.bad.light, 0.12) : alpha(SEM.ok.light, 0.12),
                                  color: m.deltaPct > 0 ? SEM.bad.light : SEM.ok.light,
                                  px: 0.25,
                                }}
                              />
                            )}

                            <IconButton
                              size="small"
                              aria-label={isExpanded ? 'Recolher detalhes' : 'Ver detalhes'}
                              sx={{
                                p: 0.25,
                                color: 'text.secondary',
                                transform: isExpanded ? 'rotate(180deg)' : 'none',
                                transition: 'transform 0.2s ease',
                              }}
                            >
                              <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Box>
                        </Box>

                        {/* Detalhes Expansíveis sob Demanda */}
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box
                            sx={{
                              p: { xs: '10px 14px 12px', sm: '10px 16px 14px' },
                              bgcolor: (t) => alpha(activeColor, t.palette.mode === 'dark' ? 0.05 : 0.025),
                              borderTop: '1px solid',
                              borderColor: (t) => alpha(activeColor, 0.12),
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                                <strong>Referência:</strong> {m.refText || 'Não informada pelo laboratório'}
                              </Typography>
                              {examDate && (
                                <Typography variant="caption" sx={{ color: 'text.secondary', opacity: 0.85 }}>
                                  Data: {examDate}
                                </Typography>
                              )}
                            </Box>

                            {/* Variação em relação ao exame anterior */}
                            {m.prior && (
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  mt: 1,
                                  p: '6px 10px',
                                  borderRadius: '8px',
                                  bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)'),
                                  fontSize: 12,
                                }}
                              >
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                  Exame anterior: {m.prior.valueText} {m.unit}
                                </Typography>
                                {m.deltaPct != null && (
                                  <Box
                                    sx={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 0.25,
                                      fontWeight: 800,
                                      fontSize: 11.5,
                                      color: m.deltaPct > 0 ? SEM.bad.light : SEM.ok.light,
                                    }}
                                  >
                                    {m.deltaPct > 0 ? <TrendingUpIcon sx={{ fontSize: 14 }} /> : <TrendingDownIcon sx={{ fontSize: 14 }} />}
                                    {Math.abs(m.deltaPct).toFixed(1).replace('.', ',')}%
                                  </Box>
                                )}
                              </Box>
                            )}

                            {/* Ações Rápidas */}
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, mt: 1.25, pt: 1, borderTop: '1px dashed', borderColor: 'divider' }}>
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
                                Ver evolução
                              </Button>
                            </Box>
                          </Box>
                        </Collapse>
                      </Box>
                    );
                  })}

                  {/* Botão de Ver Mais / Menos para órgãos com 4 ou mais exames */}
                  {hiddenCount > 0 && (
                    <Button
                      size="small"
                      onClick={() => setShowAllMarkers(!showAllMarkers)}
                      endIcon={showAllMarkers ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                      sx={{
                        mt: 0.75,
                        py: 0.9,
                        width: '100%',
                        borderRadius: '10px',
                        textTransform: 'none',
                        fontWeight: 800,
                        fontSize: 12.5,
                        color: activeColor,
                        bgcolor: (t) => alpha(activeColor, t.palette.mode === 'dark' ? 0.12 : 0.07),
                        border: '1px dashed',
                        borderColor: alpha(activeColor, 0.35),
                        transition: 'all 0.2s',
                        '&:hover': {
                          bgcolor: (t) => alpha(activeColor, t.palette.mode === 'dark' ? 0.2 : 0.14),
                          borderColor: activeColor,
                        },
                      }}
                    >
                      {showAllMarkers
                        ? 'Mostrar menos exames ↑'
                        : `Ver mais ${hiddenCount} exame${hiddenCount > 1 ? 's' : ''} normais deste órgão ↓`}
                    </Button>
                  )}
                </Stack>
              ) : (
                /* Estado sem exames para a região com Sugestões Clínicas Preventivas */
                (() => {
                  const advice = ORGAN_CLINICAL_GUIDE[activeRegion.key] || {
                    exams: [
                      { name: 'Check-up Laboratorial Geral', type: 'Sangue', purpose: 'Avaliação bioquímica e metabólica básica' },
                    ],
                    why: `Monitorar o sistema ${activeRegion.label} permite detectar variações precoces antes de qualquer sintoma clínico.`,
                    recommendation: 'Converse com seu médico em sua próxima consulta de rotina.',
                  };

                  return (
                    <Box sx={{ mt: 1.5 }}>
                      <Box
                        sx={{
                          p: { xs: 1.75, sm: 2.25 },
                          borderRadius: '16px',
                          bgcolor: (t) => (t.palette.mode === 'dark' ? '#111c26' : '#ffffff'),
                          border: '1px solid',
                          borderColor: alpha(activeColor, 0.25),
                          boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
                        }}
                      >
                        {/* Header da Sugestão com o Robô */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
                          <Box
                            sx={{
                              width: 36,
                              height: 36,
                              borderRadius: '10px',
                              bgcolor: alpha(activeColor, 0.14),
                              display: 'grid',
                              placeItems: 'center',
                              color: activeColor,
                              flexShrink: 0,
                            }}
                          >
                            <LightbulbOutlinedIcon sx={{ fontSize: 20 }} />
                          </Box>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography sx={{ fontWeight: 800, fontSize: 14, color: 'text.primary', lineHeight: 1.2 }}>
                              Você ainda não tem exames deste órgão
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                              Veja quais exames avaliam o {activeRegion.label} e por quê
                            </Typography>
                          </Box>
                        </Box>

                        {/* O Porquê Clínico Preventivo */}
                        <Box
                          sx={{
                            p: 1.25,
                            borderRadius: '10px',
                            bgcolor: alpha(activeColor, dark ? 0.08 : 0.04),
                            border: '1px solid',
                            borderColor: alpha(activeColor, 0.18),
                            mb: 1.75,
                          }}
                        >
                          <Typography variant="caption" sx={{ fontWeight: 800, color: activeColor, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', mb: 0.3 }}>
                            💡 Por que é importante acompanhar?
                          </Typography>
                          <Typography variant="body2" sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>
                            {advice.why}
                          </Typography>
                        </Box>

                        {/* Lista de Exames Sugeridos */}
                        <Typography sx={{ fontWeight: 800, fontSize: 12.5, color: 'text.primary', mb: 1 }}>
                          Exames mais pedidos pelos médicos para este sistema:
                        </Typography>

                        <Stack spacing={0.9} sx={{ mb: 2 }}>
                          {advice.exams.map((ex, i) => (
                            <Box
                              key={i}
                              sx={{
                                p: '8px 12px',
                                borderRadius: '10px',
                                bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#f8fafc'),
                                border: '1px solid',
                                borderColor: 'divider',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 1,
                              }}
                            >
                              <Box sx={{ minWidth: 0 }}>
                                <Typography sx={{ fontWeight: 700, fontSize: 13, color: 'text.primary', lineHeight: 1.2 }}>
                                  {ex.name}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11 }}>
                                  {ex.purpose}
                                </Typography>
                              </Box>
                              <Chip
                                size="small"
                                label={ex.type}
                                sx={{
                                  height: 20,
                                  fontSize: 10.5,
                                  fontWeight: 800,
                                  bgcolor: alpha(activeColor, 0.12),
                                  color: activeColor,
                                  flexShrink: 0,
                                }}
                              />
                            </Box>
                          ))}
                        </Stack>

                        {/* Ações Práticas */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={handleGoUpload}
                            startIcon={<UploadFileIcon sx={{ fontSize: 16 }} />}
                            sx={{
                              flex: 1,
                              borderRadius: '999px',
                              textTransform: 'none',
                              fontWeight: 800,
                              fontSize: 12.5,
                              py: 0.8,
                              background: 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)',
                              color: '#ffffff',
                              boxShadow: 'none',
                            }}
                          >
                            Já tenho este laudo (Enviar)
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => navigate('/reminders')}
                            sx={{
                              borderRadius: '999px',
                              textTransform: 'none',
                              fontWeight: 700,
                              fontSize: 12,
                              py: 0.8,
                              borderColor: 'divider',
                              color: 'text.secondary',
                            }}
                          >
                            Lembrar no check-up
                          </Button>
                        </Box>
                      </Box>
                    </Box>
                  );
                })()
              )}
            </Box>
          ) : null}
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
