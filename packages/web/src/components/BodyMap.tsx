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

// Coordenadas anatômicas no raio-x frontal (%) calibradas para o design v2
const ANATOMICAL_HOTSPOTS: Record<string, { x: number; y: number; side?: 'left' | 'right'; num: number }> = {
  cerebro: { x: 50, y: 9.5, num: 1 },
  tireoide: { x: 50, y: 17.5, num: 2 },
  pulmoes: { x: 37, y: 24, side: 'left', num: 3 },
  coracao: { x: 57, y: 28, side: 'right', num: 4 },
  figado: { x: 41, y: 34, side: 'left', num: 5 },
  estomago: { x: 60, y: 35, side: 'right', num: 6 },
  pancreas: { x: 50, y: 41, num: 7 },
  rins: { x: 59, y: 45.5, side: 'right', num: 8 },
  intestino: { x: 50, y: 51, num: 9 },
  hormonios: { x: 50, y: 58, num: 10 },
  sangue: { x: 25, y: 41, side: 'left', num: 11 },
  musculos: { x: 44, y: 67, side: 'left', num: 12 },
  ossos: { x: 57, y: 77, side: 'right', num: 13 },
};

const withUnit = (val: string | number | null | undefined, unit: string | null | undefined): string => {
  if (val == null || val === '') return '—';
  const valStr = String(val).trim();
  if (!unit || !unit.trim()) return valStr;
  const u = unit.trim();
  if (valStr.toLowerCase().endsWith(u.toLowerCase())) return valStr;
  return `${valStr} ${u}`;
};

const parseNum = (str: string | null | undefined): number | null => {
  if (!str) return null;
  const clean = str.replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : null;
};

interface RangePositionResult {
  bandLo: number;
  bandHi: number;
  value: number;
}

const rangePosition = (
  valueText: string | null | undefined,
  refText: string | null | undefined
): RangePositionResult | null => {
  if (!valueText || !refText) return null;
  const val = parseNum(valueText);
  if (val == null) return null;

  let lo: number | null = null;
  let hi: number | null = null;

  const rangeMatch = refText.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:a|-|–|até|ate)\s*([0-9]+(?:[.,][0-9]+)?)/i);
  if (rangeMatch) {
    lo = parseNum(rangeMatch[1]);
    hi = parseNum(rangeMatch[2]);
  } else {
    const lessMatch = refText.match(/(?:<|inferior a|menor que|até|ate)\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if (lessMatch) {
      lo = 0;
      hi = parseNum(lessMatch[1]);
    } else {
      const greaterMatch = refText.match(/(?:>|superior a|maior que)\s*([0-9]+(?:[.,][0-9]+)?)/i);
      if (greaterMatch) {
        lo = parseNum(greaterMatch[1]);
        if (lo != null) hi = lo * 2;
      }
    }
  }

  if (lo == null || hi == null || hi <= lo) return null;

  const span = hi - lo;
  const dmin = lo === 0 ? 0 : lo - span * 0.6;
  const dmax = hi + span * 0.6;
  const total = dmax - dmin;
  if (total <= 0) return null;

  const clamp = (pct: number) => Math.max(3, Math.min(97, pct));
  const bandLo = clamp(((lo - dmin) / total) * 100);
  const bandHi = clamp(((hi - dmin) / total) * 100);
  const valPos = clamp(((val - dmin) / total) * 100);

  return { bandLo, bandHi, value: valPos };
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

  const nAlt = useMemo(() => safeList.filter((r) => r.level === 'alterado').length, [safeList]);
  const nAtn = useMemo(() => safeList.filter((r) => r.level === 'atencao').length, [safeList]);

  const attentionMarkers = useMemo(
    () => sortedMarkers.filter((m) => m.level === 'alterado' || m.level === 'atencao'),
    [sortedMarkers]
  );
  const normalMarkers = useMemo(
    () => sortedMarkers.filter((m) => m.level === 'ok'),
    [sortedMarkers]
  );
  const initialNormalLimit = attentionMarkers.length > 0 ? Math.max(1, 3 - attentionMarkers.length) : 3;
  const visibleNormalMarkers = showAllMarkers ? normalMarkers : normalMarkers.slice(0, initialNormalLimit);
  const hiddenNormalCount = Math.max(0, normalMarkers.length - visibleNormalMarkers.length);

  const activeColor = activeRegion ? getLevelColor(activeRegion.level) : '#20b2aa';

  return (
    <AppCard
      sx={{
        p: { xs: 2, sm: 2.5 },
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Keyframes de pulso sutil e aceleração GPU */}
      <style>{`
        @keyframes subtleOrganPulse {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          50% { transform: scale(1.15); opacity: 0.7; }
        }
        @keyframes organRingPing {
          0% { transform: scale(0.85); opacity: 0.9; }
          75%, 100% { transform: scale(2.0); opacity: 0; }
        }
        @keyframes bioScanLaser {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 0.85; }
          90% { opacity: 0.85; }
          100% { top: 98%; opacity: 0; }
        }
        @keyframes panelGlowFlash {
          0% { transform: scale(0.995); box-shadow: 0 0 0 3px rgba(95,201,195,0.5); }
          50% { transform: scale(1.005); box-shadow: 0 0 0 5px rgba(95,201,195,0.25); }
          100% { transform: scale(1); }
        }
        .organ-ring-ping {
          animation: organRingPing 2.2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        .bio-scan-laser-beam {
          animation: bioScanLaser 4.5s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
        .panel-flash-glow {
          animation: panelGlowFlash 0.5s ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .organ-ring-ping, .bio-scan-laser-beam, .panel-flash-glow {
            animation: none !important;
          }
        }
      `}</style>

      {/* Cabeçalho do Card v2 — Resumo de status clínico real sem quebras em mobile */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          mb: 1.75,
          gap: { xs: 1, sm: 1.5 },
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            component="h2"
            sx={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 800,
              fontSize: { xs: 17, sm: 18.5 },
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              lineHeight: 1.2,
              color: 'text.primary',
            }}
          >
            <Box component="span" sx={{ fontSize: { xs: 19, sm: 21 }, lineHeight: 1 }}>🩺</Box>
            Mapa do seu Corpo
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              display: 'block',
              mt: 0.35,
              fontSize: { xs: 12, sm: 12.5 },
              lineHeight: 1.35,
            }}
          >
            Toque num órgão para ver os exames ligados a ele.
          </Typography>
        </Box>

        {/* Pílulas de resumo com contadores clínicos reais */}
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', flexShrink: 0, gap: 0.5 }}>
          {nAlt > 0 && (
            <Chip
              size="small"
              icon={
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    bgcolor: dark ? SEM.bad.dark : SEM.bad.light,
                    ml: '8px !important',
                  }}
                />
              }
              label={`${nAlt} fora da faixa`}
              sx={{
                fontWeight: 700,
                fontSize: 11.5,
                bgcolor: dark ? 'rgba(239, 68, 68, 0.16)' : '#fef2f2',
                color: dark ? '#fca5a5' : '#dc2626',
                border: '1px solid',
                borderColor: dark ? 'rgba(239, 68, 68, 0.35)' : '#fecaca',
                borderRadius: '999px',
                height: 26,
              }}
            />
          )}
          {nAtn > 0 && (
            <Chip
              size="small"
              icon={
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    bgcolor: dark ? SEM.warn.dark : SEM.warn.light,
                    ml: '8px !important',
                  }}
                />
              }
              label={`${nAtn} em atenção`}
              sx={{
                fontWeight: 700,
                fontSize: 11.5,
                bgcolor: dark ? 'rgba(245, 158, 11, 0.16)' : '#fff7ed',
                color: dark ? '#fcd34d' : '#b45309',
                border: '1px solid',
                borderColor: dark ? 'rgba(245, 158, 11, 0.35)' : '#fed7aa',
                borderRadius: '999px',
                height: 26,
              }}
            />
          )}
        </Stack>
      </Box>

      {/* Seletor Rápido Horizontal de Abas — Com contador de alertas e scroll suave */}
      <Box
        sx={{
          position: 'relative',
          mx: { xs: -2, sm: -2.5 },
          px: { xs: 2, sm: 2.5 },
          mb: 2,
          '&::after': {
            content: '""',
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 32,
            background: (t) =>
              `linear-gradient(90deg, transparent, ${t.palette.mode === 'dark' ? '#0f172a' : '#ffffff'})`,
            pointerEvents: 'none',
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            gap: 0.75,
            overflowX: 'auto',
            pb: 0.75,
            pt: 0.25,
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {safeList.map((reg) => {
            const isSelected = reg.key === selectedKey;
            const col = getLevelColor(reg.level);
            const alertCount = reg.markers.filter((m) => m.level === 'alterado' || m.level === 'atencao').length;

            return (
              <Box
                key={reg.key}
                component="button"
                type="button"
                onClick={() => handleSelect(reg.key, true)}
                sx={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.35,
                  py: 0.7,
                  borderRadius: '999px',
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: isSelected
                    ? (dark ? '#5fc9c3' : '#0f172a')
                    : (dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'),
                  bgcolor: isSelected
                    ? (dark ? '#0f2942' : '#0f172a')
                    : (dark ? 'rgba(255,255,255,0.04)' : '#f8fafc'),
                  color: isSelected
                    ? '#ffffff'
                    : (reg.level === 'sem_dados' ? 'text.secondary' : 'text.primary'),
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: isSelected ? 700 : 600,
                  fontSize: 12.5,
                  lineHeight: 1,
                  boxShadow: isSelected ? '0 2px 8px rgba(15,23,42,0.25)' : 'none',
                  transition: 'all 0.15s ease',
                  outline: 'none',
                  '&:hover': {
                    borderColor: isSelected ? undefined : (dark ? 'rgba(255,255,255,0.25)' : '#cbd5e1'),
                  },
                }}
              >
                <Box
                  sx={{
                    width: 7.5,
                    height: 7.5,
                    borderRadius: '50%',
                    bgcolor: col,
                    flexShrink: 0,
                  }}
                />
                <span>{reg.label.split('&')[0].trim()}</span>
                {alertCount > 0 && (
                  <Box
                    component="span"
                    sx={{
                      minWidth: 17,
                      height: 17,
                      px: 0.5,
                      borderRadius: '999px',
                      bgcolor: col,
                      color: '#ffffff',
                      fontSize: 10,
                      fontWeight: 800,
                      display: 'inline-grid',
                      placeItems: 'center',
                      lineHeight: 1,
                    }}
                  >
                    {alertCount}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Grade Principal: Corpo Anatômico + Detalhes do Órgão */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(250px, 290px) 1fr' },
          gap: { xs: 2.5, md: 3 },
          alignItems: 'start',
        }}
      >
        {/* COLUNA 1: Ilustração Anatômica de Raio-X com Pins Limpos e Calibrados */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              maxWidth: { xs: 230, sm: 275 },
              aspectRatio: '720/964',
              borderRadius: '20px',
              overflow: 'hidden',
              background: '#04101f',
              boxShadow: '0 14px 34px rgba(4,16,31,0.35), 0 0 0 1px rgba(95,201,195,0.25)',
              userSelect: 'none',
              touchAction: 'manipulation',
            }}
          >
            {/* Imagem anatômica (Raio-X Clínico) */}
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
                opacity: 0.93,
              }}
            />

            {/* Feixe Laser sutil */}
            <Box
              className="bio-scan-laser-beam"
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: '2px',
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(95,201,195,0.2) 20%, #ffffff 50%, rgba(95,201,195,0.2) 80%, transparent 100%)',
                boxShadow: '0 0 12px 2px rgba(95,201,195,0.8)',
                pointerEvents: 'none',
                zIndex: 6,
              }}
            />

            {/* Vinheta cônica/radial suave */}
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(2, 8, 20, 0.6))',
                pointerEvents: 'none',
              }}
            />

            {/* Hotspots dos Órgãos: Pins limpos, tamanho uniforme e tag inteligente anti-corte */}
            {safeList.map((reg) => {
              const spot = ANATOMICAL_HOTSPOTS[reg.key];
              if (!spot) return null;

              const isSelected = reg.key === selectedKey;
              const col = getLevelColor(reg.level);
              const isSemDados = reg.level === 'sem_dados';

              return (
                <Tooltip
                  key={reg.key}
                  title={`${reg.emoji} ${reg.label} — ${LEVEL_LABEL[reg.level]}`}
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
                      width: 32,
                      height: 32,
                      border: 0,
                      background: 'none',
                      p: 0,
                      cursor: 'pointer',
                      zIndex: isSelected ? 12 : 5,
                      display: 'grid',
                      placeItems: 'center',
                      transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      '&:hover': {
                        transform: 'translate(-50%, -50%) scale(1.15)',
                      },
                      '&:focus-visible': {
                        outline: `2px solid #5fc9c3`,
                        outlineOffset: 2,
                      },
                    }}
                  >
                    {/* Anel de pulso no selecionado */}
                    {isSelected && (
                      <Box
                        className="organ-ring-ping"
                        sx={{
                          position: 'absolute',
                          inset: -2,
                          borderRadius: '50%',
                          border: `2px solid ${col}`,
                          pointerEvents: 'none',
                        }}
                      />
                    )}

                    {/* Núcleo do Pin anatômico */}
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        bgcolor: '#071a30',
                        border: `2px ${isSemDados ? 'dashed' : 'solid'} ${col}`,
                        opacity: isSemDados ? 0.6 : 1,
                        display: 'grid',
                        placeItems: 'center',
                        transform: isSelected ? 'scale(1.18)' : 'scale(1)',
                        boxShadow: isSelected
                          ? `0 0 0 3px rgba(255,255,255,0.9), 0 0 14px 2px ${col}`
                          : 'none',
                        transition: 'all 0.18s ease',
                      }}
                    >
                      <Typography
                        component="span"
                        sx={{
                          fontSize: 12,
                          lineHeight: 1,
                          userSelect: 'none',
                        }}
                      >
                        {reg.emoji}
                      </Typography>
                    </Box>

                    {/* Tag de nome inteligente: alinhamento lateral adaptativo para evitar corte em mobile */}
                    {isSelected && (
                      <Box
                        sx={{
                          position: 'absolute',
                          whiteSpace: 'nowrap',
                          bgcolor: 'rgba(255,255,255,0.96)',
                          color: '#0f172a',
                          fontFamily: 'Inter, sans-serif',
                          fontWeight: 700,
                          fontSize: 11,
                          px: 1,
                          py: 0.35,
                          borderRadius: '8px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                          pointerEvents: 'none',
                          zIndex: 10,
                          top: spot.y < 14 ? 34 : 'auto',
                          bottom: spot.y < 14 ? 'auto' : 34,
                          left: spot.x < 30 ? -4 : spot.x > 70 ? 'auto' : '50%',
                          right: spot.x > 70 ? -4 : 'auto',
                          transform: spot.x < 30 || spot.x > 70 ? 'none' : 'translateX(-50%)',
                        }}
                      >
                        {reg.label.split('&')[0].trim()}
                      </Box>
                    )}
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
                borderRadius: '18px',
                p: { xs: 2, sm: 2.5 },
                bgcolor: (t) =>
                  t.palette.mode === 'dark'
                    ? alpha(activeColor, 0.08)
                    : activeRegion.level === 'alterado'
                    ? '#fff5f5'
                    : activeRegion.level === 'atencao'
                    ? '#fffaf4'
                    : activeRegion.level === 'ok'
                    ? '#f4fbf8'
                    : '#f8fafc',
                border: '1.5px solid',
                borderColor: (t) =>
                  alpha(
                    activeColor,
                    t.palette.mode === 'dark' ? 0.45 : activeRegion.level === 'alterado' ? 0.35 : 0.25
                  ),
                boxShadow: (t) => `0 4px 18px ${alpha(activeColor, t.palette.mode === 'dark' ? 0.15 : 0.06)}`,
                transition: 'all 0.2s ease',
              }}
            >
              {/* Header do Sistema */}
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
                <Stack direction="row" alignItems="center" spacing={1.25}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: '14px',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: dark ? 'rgba(255,255,255,0.08)' : '#ffffff',
                      border: '1px solid',
                      borderColor: alpha(activeColor, 0.3),
                      color: activeColor,
                      fontSize: 22,
                      flexShrink: 0,
                    }}
                  >
                    {(() => {
                      const Icon = SYSTEM_ICON[activeRegion.key] || MedicalServicesIcon;
                      return <Icon sx={{ fontSize: 22 }} />;
                    })()}
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 16.5, lineHeight: 1.2 }}>
                      {activeRegion.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>
                      {activeRegion.markers.length > 0
                        ? `${activeRegion.markers.length} exame${activeRegion.markers.length > 1 ? 's' : ''} mapeado${activeRegion.markers.length > 1 ? 's' : ''}`
                        : 'Nenhum exame vinculado no momento'}
                    </Typography>
                  </Box>
                </Stack>

                <Chip
                  size="small"
                  label={LEVEL_LABEL[activeRegion.level]}
                  sx={{
                    fontWeight: 800,
                    fontSize: 12,
                    bgcolor: alpha(activeColor, dark ? 0.2 : 0.12),
                    color: activeColor,
                    borderColor: alpha(activeColor, 0.35),
                    borderWidth: 1,
                    borderStyle: 'solid',
                  }}
                />
              </Stack>

              <Divider sx={{ my: 1.5, borderColor: alpha(activeColor, 0.15) }} />

              {/* Lista de Marcadores Clínicos por Gravidade */}
              {sortedMarkers.length > 0 ? (
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                  {/* Seção 1: Marcadores que precisam de atenção */}
                  {attentionMarkers.length > 0 && (
                    <Box>
                      <Typography
                        sx={{
                          fontFamily: 'Inter, sans-serif',
                          fontWeight: 700,
                          fontSize: 11,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: 'text.secondary',
                          mb: 1,
                          px: 0.5,
                        }}
                      >
                        Precisa de atenção · {attentionMarkers.length}
                      </Typography>
                      <Stack spacing={1}>
                        {attentionMarkers.map((m) => {
                          const mCol = getLevelColor(m.level);
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
                                borderColor: isExpanded ? alpha(activeColor, 0.55) : alpha(mCol, 0.35),
                                borderLeft: `4px solid ${mCol}`,
                                boxShadow: isExpanded
                                  ? `0 4px 14px ${alpha(activeColor, 0.16)}`
                                  : '0 1px 3px rgba(0,0,0,0.03)',
                                transition: 'all 0.18s ease',
                                overflow: 'hidden',
                              }}
                            >
                              <Box
                                onClick={() => setExpandedMarker(isExpanded ? null : mKey)}
                                role="button"
                                tabIndex={0}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  p: { xs: '10px 12px', sm: '11px 14px' },
                                  cursor: 'pointer',
                                  gap: 1.25,
                                  '&:hover': {
                                    bgcolor: (t) => alpha(activeColor, t.palette.mode === 'dark' ? 0.08 : 0.04),
                                  },
                                }}
                              >
                                <Typography
                                  sx={{
                                    fontWeight: 700,
                                    fontSize: { xs: 13, sm: 13.5 },
                                    color: 'text.primary',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    minWidth: 0,
                                    flex: 1,
                                  }}
                                >
                                  {m.name}
                                </Typography>

                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                                  <Typography
                                    sx={{
                                      fontWeight: 800,
                                      fontSize: { xs: 14.5, sm: 15.5 },
                                      color: mCol,
                                      fontVariantNumeric: 'tabular-nums',
                                      lineHeight: 1.1,
                                    }}
                                  >
                                    {withUnit(m.valueText, m.unit)}
                                  </Typography>

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

                              <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                <Box
                                  sx={{
                                    p: { xs: '10px 14px 12px', sm: '10px 16px 14px' },
                                    bgcolor: (t) => alpha(activeColor, t.palette.mode === 'dark' ? 0.05 : 0.025),
                                    borderTop: '1px dashed',
                                    borderColor: 'divider',
                                  }}
                                >
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.25 }}>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, minWidth: 0 }}>
                                      <strong>Referência:</strong> {m.refText || 'Não informada pelo laboratório'}
                                    </Typography>
                                    {examDate && (
                                      <Typography variant="caption" sx={{ color: 'text.secondary', opacity: 0.85, whiteSpace: 'nowrap' }}>
                                        Data: {examDate}
                                      </Typography>
                                    )}
                                  </Box>

                                  {(() => {
                                    const pos = rangePosition(m.valueText, m.refText);
                                    if (!pos) return null;
                                    return (
                                      <Box
                                        aria-hidden
                                        sx={{
                                          position: 'relative',
                                          height: 8,
                                          borderRadius: 999,
                                          mt: 1.25,
                                          mb: 0.5,
                                          bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)'),
                                        }}
                                      >
                                        <Box
                                          sx={{
                                            position: 'absolute',
                                            top: 0,
                                            bottom: 0,
                                            left: `${pos.bandLo}%`,
                                            width: `${pos.bandHi - pos.bandLo}%`,
                                            borderRadius: 999,
                                            bgcolor: alpha(dark ? SEM.ok.dark : SEM.ok.light, 0.45),
                                          }}
                                        />
                                        <Box
                                          sx={{
                                            position: 'absolute',
                                            top: -3,
                                            left: `${pos.value}%`,
                                            width: 14,
                                            height: 14,
                                            ml: '-7px',
                                            borderRadius: '50%',
                                            bgcolor: mCol,
                                            border: '2px solid',
                                            borderColor: 'background.paper',
                                            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                                          }}
                                        />
                                      </Box>
                                    );
                                  })()}

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
                                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, minWidth: 0 }}>
                                        Anterior: {withUnit(m.prior.valueText, m.unit)}
                                        {formatDate(m.prior.performedAt) ? ` · ${formatDate(m.prior.performedAt)}` : ''}
                                      </Typography>
                                      {m.deltaPct != null && (
                                        <Box
                                          sx={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 0.25,
                                            fontWeight: 800,
                                            fontSize: 11.5,
                                            color: 'text.secondary',
                                            whiteSpace: 'nowrap',
                                            flexShrink: 0,
                                          }}
                                        >
                                          {m.deltaPct > 0 ? <TrendingUpIcon sx={{ fontSize: 14 }} /> : <TrendingDownIcon sx={{ fontSize: 14 }} />}
                                          {Math.abs(m.deltaPct).toFixed(1).replace('.', ',')}%
                                        </Box>
                                      )}
                                    </Box>
                                  )}

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
                      </Stack>
                    </Box>
                  )}

                  {/* Seção 2: Marcadores dentro da faixa normal */}
                  {normalMarkers.length > 0 && (
                    <Box>
                      <Typography
                        sx={{
                          fontFamily: 'Inter, sans-serif',
                          fontWeight: 700,
                          fontSize: 11,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: 'text.secondary',
                          mb: 1,
                          px: 0.5,
                        }}
                      >
                        Dentro da faixa · {normalMarkers.length}
                      </Typography>
                      <Stack spacing={1}>
                        {visibleNormalMarkers.map((m) => {
                          const mCol = getLevelColor(m.level);
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
                                borderColor: isExpanded ? alpha(activeColor, 0.55) : t.palette.divider,
                                borderLeft: `4px solid ${mCol}`,
                                boxShadow: isExpanded
                                  ? `0 4px 14px ${alpha(activeColor, 0.16)}`
                                  : '0 1px 3px rgba(0,0,0,0.03)',
                                transition: 'all 0.18s ease',
                                overflow: 'hidden',
                              }}
                            >
                              <Box
                                onClick={() => setExpandedMarker(isExpanded ? null : mKey)}
                                role="button"
                                tabIndex={0}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  p: { xs: '10px 12px', sm: '11px 14px' },
                                  cursor: 'pointer',
                                  gap: 1.25,
                                  '&:hover': {
                                    bgcolor: (t) => alpha(activeColor, t.palette.mode === 'dark' ? 0.08 : 0.04),
                                  },
                                }}
                              >
                                <Typography
                                  sx={{
                                    fontWeight: 600,
                                    fontSize: { xs: 13, sm: 13.5 },
                                    color: 'text.primary',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    minWidth: 0,
                                    flex: 1,
                                  }}
                                >
                                  {m.name}
                                </Typography>

                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                                  <Typography
                                    sx={{
                                      fontWeight: 700,
                                      fontSize: { xs: 14.5, sm: 15.5 },
                                      color: mCol,
                                      fontVariantNumeric: 'tabular-nums',
                                      lineHeight: 1.1,
                                    }}
                                  >
                                    {withUnit(m.valueText, m.unit)}
                                  </Typography>

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

                              <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                <Box
                                  sx={{
                                    p: { xs: '10px 14px 12px', sm: '10px 16px 14px' },
                                    bgcolor: (t) => alpha(activeColor, t.palette.mode === 'dark' ? 0.05 : 0.025),
                                    borderTop: '1px dashed',
                                    borderColor: 'divider',
                                  }}
                                >
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.25 }}>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, minWidth: 0 }}>
                                      <strong>Referência:</strong> {m.refText || 'Não informada pelo laboratório'}
                                    </Typography>
                                    {examDate && (
                                      <Typography variant="caption" sx={{ color: 'text.secondary', opacity: 0.85, whiteSpace: 'nowrap' }}>
                                        Data: {examDate}
                                      </Typography>
                                    )}
                                  </Box>

                                  {(() => {
                                    const pos = rangePosition(m.valueText, m.refText);
                                    if (!pos) return null;
                                    return (
                                      <Box
                                        aria-hidden
                                        sx={{
                                          position: 'relative',
                                          height: 8,
                                          borderRadius: 999,
                                          mt: 1.25,
                                          mb: 0.5,
                                          bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)'),
                                        }}
                                      >
                                        <Box
                                          sx={{
                                            position: 'absolute',
                                            top: 0,
                                            bottom: 0,
                                            left: `${pos.bandLo}%`,
                                            width: `${pos.bandHi - pos.bandLo}%`,
                                            borderRadius: 999,
                                            bgcolor: alpha(dark ? SEM.ok.dark : SEM.ok.light, 0.45),
                                          }}
                                        />
                                        <Box
                                          sx={{
                                            position: 'absolute',
                                            top: -3,
                                            left: `${pos.value}%`,
                                            width: 14,
                                            height: 14,
                                            ml: '-7px',
                                            borderRadius: '50%',
                                            bgcolor: mCol,
                                            border: '2px solid',
                                            borderColor: 'background.paper',
                                            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                                          }}
                                        />
                                      </Box>
                                    );
                                  })()}

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
                                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, minWidth: 0 }}>
                                        Anterior: {withUnit(m.prior.valueText, m.unit)}
                                        {formatDate(m.prior.performedAt) ? ` · ${formatDate(m.prior.performedAt)}` : ''}
                                      </Typography>
                                      {m.deltaPct != null && (
                                        <Box
                                          sx={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 0.25,
                                            fontWeight: 800,
                                            fontSize: 11.5,
                                            color: 'text.secondary',
                                            whiteSpace: 'nowrap',
                                            flexShrink: 0,
                                          }}
                                        >
                                          {m.deltaPct > 0 ? <TrendingUpIcon sx={{ fontSize: 14 }} /> : <TrendingDownIcon sx={{ fontSize: 14 }} />}
                                          {Math.abs(m.deltaPct).toFixed(1).replace('.', ',')}%
                                        </Box>
                                      )}
                                    </Box>
                                  )}

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
                      </Stack>
                    </Box>
                  )}

                  {/* Botão para expandir os exames normais */}
                  {hiddenNormalCount > 0 && (
                    <Button
                      size="small"
                      onClick={() => setShowAllMarkers(!showAllMarkers)}
                      endIcon={showAllMarkers ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                      sx={{
                        mt: 0.5,
                        py: 0.9,
                        width: '100%',
                        borderRadius: '10px',
                        textTransform: 'none',
                        fontWeight: 700,
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
                        : `Ver mais ${hiddenNormalCount} exame${hiddenNormalCount > 1 ? 's' : ''} normais deste órgão ↓`}
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
