import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  Stack,
  Collapse,
  IconButton,
  Tooltip,
  Skeleton,
  useTheme,
  alpha,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import { COPPER, copperText, RADIUS, SEM } from '../../theme';

export interface ClinicalRiskCardProps {
  patient?: any;
  abnormalItems?: any[];
  abnormalStats?: { total: number; importante: number; moderada: number; leve: number };
  exams?: any[];
  medsCount?: number;
  criticalMeds?: number;
  onNavigateToAlterados?: (targetTab?: string) => void;
  onRefreshAnalysis?: () => void;
  refreshing?: boolean;
  loading?: boolean;
}

/** Níveis de PRIORIDADE — vocabulário NÃO-diagnóstico (feedback do dono 18/10:
 *  "Confirmado/Presuntivo" sugeria diagnóstico e dois pacientes distintos exibiam
 *  conteúdo visualmente igual; guardrail da casa: o app educa, o médico decide). */
type RiskLevel = 'Estável' | 'Observar' | 'Atenção' | 'Prioridade alta';

interface RiskAction {
  id: string;
  title: string;
  detail: string;
  timeframe: 'agora' | 'semanas' | 'rotina';
  targetTab?: string;
}

export const ClinicalRiskCard = ({
  patient,
  abnormalItems = [],
  abnormalStats = { total: 0, importante: 0, moderada: 0, leve: 0 },
  exams = [],
  medsCount = 0,
  criticalMeds = 0,
  onNavigateToAlterados,
  onRefreshAnalysis,
  refreshing = false,
  loading = false,
}: ClinicalRiskCardProps) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [expanded, setExpanded] = useState(false);

  // Filtra apenas biomarcadores ATUAIS (exclui medições antigas que já normalizaram em exame mais recente)
  const currentAbnormalItems = useMemo(() => {
    const byKey = new Map<string, any>();
    for (const it of abnormalItems) {
      if (it.isCurrent === false || it.isNormalizedInNewerExam) continue;
      const key = (it.nameCanonical || it.name || '').trim().toLowerCase().replace(/\s*\([^)]*\)\s*$/, '');
      if (!key) continue;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, it);
      } else {
        const exDate = new Date(existing.examDate || existing.performedAt || existing.createdAt || 0).getTime();
        const itDate = new Date(it.examDate || it.performedAt || it.createdAt || 0).getTime();
        if (itDate >= exDate) byKey.set(key, it);
      }
    }
    return Array.from(byKey.values());
  }, [abnormalItems]);

  // Top 5 destaques atuais ordenados por magnitude do desvio da faixa de referência
  const topCurrentHighlights = useMemo(() => {
    const sev = (it: any): number => {
      const v = Number(it.valueNumeric);
      const lo = Number(it.refLow), hi = Number(it.refHigh);
      if (Number.isFinite(v) && Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
        const mid = (lo + hi) / 2, half = (hi - lo) / 2 || 1;
        return Math.abs(v - mid) / half;
      }
      return 0;
    };
    return [...currentAbnormalItems].sort((a, b) => sev(b) - sev(a)).slice(0, 5);
  }, [currentAbnormalItems]);

  // Análise clínica computada baseada nos dados ATUAIS dos exames do paciente
  const riskAnalysis = useMemo(() => {
    const totalAbnormal = currentAbnormalItems.length;
    const nImp = Math.min(abnormalStats.importante || 0, totalAbnormal);
    const nMod = Math.min(abnormalStats.moderada || 0, Math.max(0, totalAbnormal - nImp));
    const nLev = Math.max(0, totalAbnormal - nImp - nMod);

    // Cálculo ponderado do Score Clínico (0 a 100)
    // - Sem alterações e com exames: score de risco baixo (10-18)
    // - Com alterações: pondera por severidade + interações medicamentosas
    let computedScore = 14;
    if (totalAbnormal > 0 || criticalMeds > 0) {
      computedScore = 20 + nImp * 22 + nMod * 12 + nLev * 5 + criticalMeds * 14;
      if (computedScore > 100) computedScore = 100;
    } else if (exams.length === 0) {
      computedScore = 0;
    }

    let level: RiskLevel = 'Estável';
    let levelColor = theme.palette.success.main;
    let levelBg = alpha(theme.palette.success.main, 0.12);
    let actionBadge = 'Acompanhamento de rotina';
    let severityBadge = 'Parâmetros estáveis';

    if (computedScore >= 75 || nImp >= 2 || (nImp >= 1 && criticalMeds > 0)) {
      level = 'Prioridade alta';
      levelColor = theme.palette.error.main;
      levelBg = alpha(theme.palette.error.main, 0.14);
      actionBadge = 'Revisar prioridades na consulta';
      severityBadge = 'Múltiplos marcadores relevantes';
    } else if (computedScore >= 50 || nImp >= 1 || nMod >= 2) {
      level = 'Atenção';
      levelColor = '#f59e0b'; // Amber / Warn
      levelBg = alpha('#f59e0b', 0.14);
      actionBadge = 'Atenção clínica requerida';
      severityBadge = nImp > 0 ? 'Marcador relevante presente' : 'Alterações moderadas';
    } else if (computedScore >= 25 || totalAbnormal > 0) {
      level = 'Observar';
      levelColor = '#3b82f6'; // Blue / Inquérito
      levelBg = alpha('#3b82f6', 0.14);
      actionBadge = 'Acompanhar na próxima bateria';
      severityBadge = 'Alterações leves';
    }

    // Mapeamento de sistemas orgânicos afetados (apenas marcadores atuais)
    const systemsSet = new Set<string>();
    currentAbnormalItems.forEach((item) => {
      const name = (item.nameCanonical || item.name || '').toUpperCase();
      if (/COLESTEROL|LDL|HDL|TRIGLICER|LIPID|APO/i.test(name)) systemsSet.add('Cardiovascular / Lipídico');
      else if (/GLICOSE|HBA1C|GLICADA|INSULINA|HOMA/i.test(name)) systemsSet.add('Metabólico / Glicêmico');
      else if (/CREATININA|UREIA|TFG|FILTRA|URINA|MICROALBUM/i.test(name)) systemsSet.add('Renal');
      else if (/TGO|TGP|GGT|GAMA|BILIRRUB|TRANSAM/i.test(name)) systemsSet.add('Hepático');
      else if (/HEMOGLOB|HEMATOC|LEUCOC|PLAQUET|FERRIT/i.test(name)) systemsSet.add('Hematológico');
      else if (/TSH|T4|TESTOST|HORMON|CORTISOL/i.test(name)) systemsSet.add('Endócrino');
      else systemsSet.add('Geral / Metabólico');
    });

    const systems = Array.from(systemsSet);

    // Geração de Ações Clínicas Recomendadas para o Médico
    const actions: RiskAction[] = [];

    if (criticalMeds > 0) {
      actions.push({
        id: 'meds-crit',
        title: 'Revisar interações medicamentosas críticas identificadas',
        detail: `${criticalMeds} interação(ões) potencial(is) detectada(s) no histórico do paciente.`,
        timeframe: 'agora',
      });
    }

    if (systemsSet.has('Cardiovascular / Lipídico')) {
      actions.push({
        id: 'cardio-eval',
        title: 'Estratificar risco cardiovascular e reavaliar metas terapêuticas (LDL / Não-HDL)',
        detail: 'Diretrizes SBC: individualizar alvo lipídico e considerar repetição em 60-90 dias.',
        timeframe: nImp > 0 ? 'agora' : 'semanas',
        targetTab: 'alterados',
      });
    }

    if (systemsSet.has('Metabólico / Glicêmico')) {
      actions.push({
        id: 'metab-eval',
        title: 'Aprofundar investigação de resistência insulínica e controle glicêmico',
        detail: 'Diretriz SBD: correlacionar HbA1c com glicemia de jejum e perfil ponderal.',
        timeframe: 'semanas',
        targetTab: 'alterados',
      });
    }

    if (systemsSet.has('Renal')) {
      actions.push({
        id: 'renal-eval',
        title: 'Acompanhar taxa de filtração glomerular e balanço hidroeletrolítico',
        detail: 'Repetir dosagem sérica com intervalo de 30 a 60 dias para confirmação de trajetória.',
        timeframe: nImp > 0 ? 'agora' : 'rotina',
        targetTab: 'alterados',
      });
    }

    if (actions.length === 0) {
      if (totalAbnormal > 0) {
        actions.push({
          id: 'general-followup',
          title: 'Monitorar biomarcadores alterados e checar sintomas associados',
          detail: 'Reavaliar parâmetros na consulta de retorno ou próximo ciclo laboratorial.',
          timeframe: 'rotina',
          targetTab: 'alterados',
        });
      } else {
        actions.push({
          id: 'routine-ok',
          title: 'Manter acompanhamento preventivo e rastreamento periódico',
          detail: 'Nenhum biomarcador em faixa de alerta detectado na extração recente.',
          timeframe: 'rotina',
        });
      }
    }

    return {
      score: computedScore,
      level,
      levelColor,
      levelBg,
      actionBadge,
      severityBadge,
      systems,
      totalCurrentAbnormal: totalAbnormal,
      actions: actions.slice(0, 3), // máx 3 para clareza e escaneabilidade sem sobrecarga
    };
  }, [currentAbnormalItems, abnormalStats, exams, criticalMeds, theme]);

  if (loading) {
    return (
      <Box
        sx={{
          bgcolor: 'background.paper',
          borderRadius: RADIUS.card,
          border: '1px solid',
          borderColor: 'divider',
          p: 2.5,
          mb: 2,
        }}
      >
        <Stack spacing={1.5}>
          <Skeleton variant="text" width="40%" height={28} />
          <Skeleton variant="rectangular" height={100} sx={{ borderRadius: '12px' }} />
        </Stack>
      </Box>
    );
  }

  // Se não houver nenhum exame cadastrado para este paciente
  if (exams.length === 0 && abnormalItems.length === 0) {
    return null;
  }

  // Constantes de escala para a régua
  const scaleLevels: RiskLevel[] = ['Estável', 'Observar', 'Atenção', 'Prioridade alta'];
  const currentIndex = scaleLevels.indexOf(riskAnalysis.level);

  // SVG Gauge calculations (circunferência = 2 * PI * 34 ≈ 213.63)
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (riskAnalysis.score / 100) * circumference;

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        borderRadius: RADIUS.card,
        border: '1.5px solid',
        borderColor: isDark ? alpha(COPPER.mid, 0.3) : alpha(COPPER.deep, 0.2),
        boxShadow: isDark
          ? '0 6px 20px rgba(0,0,0,0.45)'
          : '0 6px 24px rgba(180, 83, 9, 0.08), 0 1px 4px rgba(0,0,0,0.04)',
        position: 'relative',
        overflow: 'hidden',
        mb: 2,
        transition: 'all 0.25s ease-in-out',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${COPPER.deep}, ${theme.palette.warning.main}, ${theme.palette.success.main})`,
        },
      }}
    >
      {/* CABEÇALHO RESPONSIVO REUI — Sem quebras no mobile */}
      <Box
        sx={{
          px: { xs: 2, sm: 2.5 },
          pt: 2,
          pb: expanded ? 1.5 : 1.75,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          {/* LADO ESQUERDO: Ícone + Título Prioridade Clínica */}
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ minWidth: 0, flex: 1 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '10px',
                bgcolor: isDark ? alpha(COPPER.mid, 0.18) : alpha(COPPER.deep, 0.1),
                color: isDark ? COPPER.light : COPPER.deep,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <HealthAndSafetyIcon sx={{ fontSize: 20 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography
                  sx={{
                    fontFamily: 'Poppins, sans-serif',
                    fontWeight: 800,
                    fontSize: { xs: 15, sm: 16 },
                    color: 'text.primary',
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Prioridade Clínica
                </Typography>
                <Chip
                  label="Triagem"
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: 10,
                    fontWeight: 800,
                    bgcolor: isDark ? alpha(COPPER.mid, 0.2) : alpha(COPPER.deep, 0.12),
                    color: (t) => copperText(t.palette.mode),
                    border: '1px solid',
                    borderColor: isDark ? alpha(COPPER.mid, 0.4) : alpha(COPPER.deep, 0.3),
                    display: { xs: 'none', md: 'inline-flex' },
                  }}
                />
              </Stack>
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', fontWeight: 600, display: { xs: 'none', sm: 'block' }, mt: 0.2 }}
              >
                Triagem por biomarcadores alterados — apoia a priorização
              </Typography>
            </Box>
          </Stack>

          {/* LADO DIREITO: Badge no desktop + Ações */}
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flexShrink: 0 }}>
            {/* No sm+ o badge fica inline com os botões */}
            {!expanded && (
              <Chip
                label={`${riskAnalysis.level} · ${riskAnalysis.score}/100`}
                size="small"
                sx={{
                  fontWeight: 800,
                  fontSize: 11,
                  bgcolor: riskAnalysis.levelBg,
                  color: riskAnalysis.levelColor,
                  display: { xs: 'none', sm: 'inline-flex' },
                }}
              />
            )}

            {onRefreshAnalysis && (
              <Tooltip title="Atualizar prioridade e reavaliar com exames recentes">
                <Box>
                  {/* Desktop: botão com texto */}
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={onRefreshAnalysis}
                    disabled={loading || refreshing}
                    startIcon={<AutorenewIcon sx={{ fontSize: 16, animation: (loading || refreshing) ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } } }} />}
                    sx={{
                      height: 28,
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'none',
                      borderRadius: '14px',
                      color: (t) => copperText(t.palette.mode),
                      borderColor: isDark ? alpha(COPPER.mid, 0.4) : alpha(COPPER.deep, 0.3),
                      display: { xs: 'none', sm: 'inline-flex' },
                      '&:hover': {
                        borderColor: isDark ? COPPER.mid : COPPER.deep,
                        bgcolor: isDark ? alpha(COPPER.mid, 0.1) : alpha(COPPER.deep, 0.05),
                      },
                    }}
                  >
                    Atualizar
                  </Button>
                  {/* Mobile: icon button compacto p/ nunca estourar largura */}
                  <IconButton
                    size="small"
                    onClick={onRefreshAnalysis}
                    disabled={loading || refreshing}
                    aria-label="Atualizar análise clínica"
                    sx={{
                      display: { xs: 'inline-flex', sm: 'none' },
                      width: 32,
                      height: 32,
                      color: (t) => copperText(t.palette.mode),
                      border: '1px solid',
                      borderColor: isDark ? alpha(COPPER.mid, 0.4) : alpha(COPPER.deep, 0.3),
                    }}
                  >
                    <AutorenewIcon sx={{ fontSize: 16, animation: (loading || refreshing) ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } } }} />
                  </IconButton>
                </Box>
              </Tooltip>
            )}

            <IconButton
              size="small"
              onClick={() => setExpanded((prev) => !prev)}
              aria-label={expanded ? 'Recolher prioridade clínica' : 'Expandir prioridade clínica'}
              sx={{
                width: 32,
                height: 32,
                color: 'text.secondary',
                border: '1px solid',
                borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
            </IconButton>
          </Stack>
        </Box>

        {/* Linha 2 Mobile xs: Badge com total respiro e largura adaptável */}
        {!expanded && (
          <Box sx={{ display: { xs: 'flex', sm: 'none' }, alignItems: 'center', justifyContent: 'space-between', mt: 1.25, pt: 1, borderTop: '1px dashed', borderColor: 'divider' }}>
            <Chip
              label={`${riskAnalysis.level} · ${riskAnalysis.score}/100`}
              size="small"
              sx={{
                fontWeight: 800,
                fontSize: 11,
                bgcolor: riskAnalysis.levelBg,
                color: riskAnalysis.levelColor,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
            />
            <Button
              size="small"
              onClick={() => setExpanded(true)}
              endIcon={<KeyboardArrowDownIcon sx={{ fontSize: 14 }} />}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                fontSize: 11,
                p: 0,
                minWidth: 'auto',
                color: (t) => copperText(t.palette.mode),
              }}
            >
              Ver estratificação
            </Button>
          </Box>
        )}
      </Box>

      {/* LISTA DE ATENÇÃO PADRONIZADA (PADRÃO HEALTHTECH CLEAN) */}
      {!expanded && topCurrentHighlights.length > 0 && (
        <Box
          sx={{
            px: { xs: 2, sm: 2.5 },
            pb: 2,
            pt: 0,
          }}
        >
          <Box
            sx={{
              p: 1.5,
              borderRadius: '14px',
              bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
              border: '1px solid',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
            }}
          >
            {/* Cabeçalho da Lista de Atenção */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, pb: 0.75, borderBottom: '1px solid', borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'error.main', display: 'inline-block' }} />
                Lista de Atenção · Principais Marcadores
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'error.main', fontSize: 11.5 }}>
                {riskAnalysis.totalCurrentAbnormal} fora da faixa
              </Typography>
            </Box>

            {/* Linhas limpas (List.Item) escaneáveis em segundos */}
            <Stack spacing={0.75}>
              {topCurrentHighlights.slice(0, 3).map((it: any) => {
                const rawVal = String(it.valueText ?? it.valueNumeric ?? '').trim();
                const rawUnit = String(it.unit ?? '').trim();
                const valHasLetters = /[a-zA-Z%µ]/.test(rawVal);
                const valAlreadyHasUnit = !!(rawUnit && rawVal.toLowerCase().includes(rawUnit.toLowerCase()));
                const displayVal = (rawUnit && !valHasLetters && !valAlreadyHasUnit) ? `${rawVal} ${rawUnit}` : rawVal;

                const vNum = Number(it.valueNumeric);
                const rHi = Number(it.refHigh);
                const rLo = Number(it.refLow);
                const isHigh = Number.isFinite(vNum) && Number.isFinite(rHi) && vNum > rHi;
                const isLow = Number.isFinite(vNum) && Number.isFinite(rLo) && vNum < rLo;

                return (
                  <Box
                    key={it.id || it.name}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      py: 0.65,
                      px: 1.25,
                      borderRadius: '8px',
                      bgcolor: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff',
                      border: '1px solid',
                      borderColor: isDark ? 'rgba(255,255,255,0.04)' : '#edf2f7',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, pr: 1 }}>
                      <Box
                        component="span"
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          flexShrink: 0,
                          bgcolor: isHigh ? 'error.main' : isLow ? 'warning.main' : 'error.main',
                        }}
                      />
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          fontSize: 13,
                          color: 'text.primary',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {it.name}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, color: isHigh ? 'error.main' : 'text.primary' }}>
                        {displayVal}
                      </Typography>
                      {isHigh && <Typography component="span" sx={{ fontSize: 13, fontWeight: 800, color: 'error.main', lineHeight: 1 }}>↑</Typography>}
                      {isLow && <Typography component="span" sx={{ fontSize: 13, fontWeight: 800, color: 'warning.main', lineHeight: 1 }}>↓</Typography>}
                    </Box>
                  </Box>
                );
              })}
            </Stack>

            {/* Ação clean para ver todos sem poluição */}
            <Box sx={{ mt: 1.25, pt: 0.75, borderTop: '1px solid', borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onNavigateToAlterados) {
                    onNavigateToAlterados('alterados');
                  } else {
                    setExpanded(true);
                  }
                }}
                endIcon={<ArrowForwardIcon sx={{ fontSize: 15 }} />}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: 12.5,
                  color: '#0d9488',
                  p: '2px 8px',
                  borderRadius: '6px',
                  '&:hover': {
                    bgcolor: 'rgba(13, 148, 136, 0.08)',
                  },
                }}
              >
                Ver todos os {riskAnalysis.totalCurrentAbnormal} exames alterados
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* CONTEÚDO EXPANDÍVEL */}
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ px: { xs: 2, sm: 2.5 }, pb: 2.5 }}>
          {/* BLOCO CENTRAL: GAUGE CIRCULAR COMPACTO + INFORMAÇÕES DE RISCO */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexDirection: 'row',
              gap: { xs: 2, sm: 2.5 },
              py: 1.25,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            {/* GAUGE SVG ANIMADO */}
            <Box
              sx={{
                width: 76,
                height: 76,
                position: 'relative',
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <svg
                width="76"
                height="76"
                style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}
              >
                {/* Track de fundo */}
                <circle
                  cx="38"
                  cy="38"
                  r={radius}
                  fill="none"
                  stroke={isDark ? '#263333' : '#e2e8f0'}
                  strokeWidth="6"
                />
                {/* Linha de progresso */}
                <circle
                  cx="38"
                  cy="38"
                  r={radius}
                  fill="none"
                  stroke={riskAnalysis.levelColor}
                  strokeWidth="6"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  style={{
                    transition: 'stroke-dashoffset 1.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
                  }}
                />
              </svg>

              {/* Valor numérico no centro */}
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography
                  sx={{
                    fontFamily: 'Poppins, sans-serif',
                    fontWeight: 900,
                    fontSize: 22,
                    lineHeight: 1,
                    color: riskAnalysis.levelColor,
                  }}
                >
                  {riskAnalysis.score}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'text.secondary',
                    lineHeight: 1,
                    mt: 0.2,
                  }}
                >
                  DE 100
                </Typography>
              </Box>
            </Box>

            {/* CLASSIFICAÇÃO E BADGES */}
            <Box sx={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
              <Typography
                sx={{
                  fontFamily: 'Poppins, sans-serif',
                  fontWeight: 800,
                  fontSize: { xs: 17, sm: 20 },
                  color: 'text.primary',
                  mb: 0.5,
                  lineHeight: 1.2,
                }}
              >
                {riskAnalysis.level.startsWith('Prioridade') ? riskAnalysis.level : `Prioridade ${riskAnalysis.level}`}
              </Typography>

              <Stack
                direction="row"
                alignItems="center"
                spacing={0.75}
                flexWrap="wrap"
                useFlexGap
                justifyContent={{ xs: 'center', sm: 'flex-start' }}
              >
                <Chip
                  size="small"
                  label={riskAnalysis.actionBadge}
                  sx={{
                    bgcolor: riskAnalysis.levelBg,
                    color: riskAnalysis.levelColor,
                    fontWeight: 800,
                    fontSize: 11.5,
                    border: '1px solid',
                    borderColor: alpha(riskAnalysis.levelColor, 0.3),
                  }}
                />
                <Chip
                  size="small"
                  label={riskAnalysis.severityBadge}
                  sx={{
                    bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                    color: 'text.secondary',
                    fontWeight: 700,
                    fontSize: 11.5,
                  }}
                />
                {riskAnalysis.totalCurrentAbnormal > 0 && (
                  <Chip
                    size="small"
                    label={`${riskAnalysis.totalCurrentAbnormal} ${riskAnalysis.totalCurrentAbnormal === 1 ? 'marcador atual fora' : 'marcadores atuais fora'}`}
                    sx={{
                      bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                      color: 'text.secondary',
                      fontWeight: 700,
                      fontSize: 11,
                    }}
                  />
                )}
              </Stack>
            </Box>
          </Box>

          {/* RÉGUA VISUAL DE ESTRATIFICAÇÃO (ESCALA CLÍNICA) */}
          <Box sx={{ py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                position: 'relative',
                px: { xs: 1, sm: 2 },
              }}
            >
              {scaleLevels.map((lvl, idx) => {
                const isActive = idx <= currentIndex;
                const isCurrent = idx === currentIndex;

                return (
                  <Box
                    key={lvl}
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 0.75,
                      flex: 1,
                      minWidth: 0, // círculo/rótulo não estoura a régua no 390px
                      position: 'relative',
                      zIndex: 2,
                    }}
                  >
                    {/* Marcador circular da régua */}
                    <Box
                      sx={{
                        width: isCurrent ? 16 : 12,
                        height: isCurrent ? 16 : 12,
                        borderRadius: '50%',
                        bgcolor: isCurrent
                          ? riskAnalysis.levelColor
                          : isActive
                            ? theme.palette.success.main
                            : isDark
                              ? '#334155'
                              : '#cbd5e1',
                        border: '2px solid',
                        borderColor: isCurrent
                          ? '#ffffff'
                          : isActive
                            ? theme.palette.success.main
                            : isDark
                              ? '#1e293b'
                              : '#ffffff',
                        boxShadow: isCurrent
                          ? `0 0 0 3px ${alpha(riskAnalysis.levelColor, 0.35)}`
                          : 'none',
                        transition: 'all 0.3s ease',
                      }}
                    />

                    {/* Rótulo do estágio */}
                    <Typography
                      sx={{
                        fontSize: { xs: 10, sm: 11.5 },
                        fontWeight: isCurrent ? 800 : 700,
                        color: isCurrent
                          ? riskAnalysis.levelColor
                          : isActive
                            ? 'text.primary'
                            : 'text.secondary',
                        textAlign: 'center',
                        wordBreak: 'break-word',
                        lineHeight: 1.3,
                        px: 0.25,
                      }}
                    >
                      {lvl}
                    </Typography>
                  </Box>
                );
              })}

              {/* Linha conectora de fundo */}
              <Box
                sx={{
                  position: 'absolute',
                  top: { xs: 5, sm: 6 },
                  left: '12%',
                  right: '12%',
                  height: 2,
                  bgcolor: isDark ? '#334155' : '#e2e8f0',
                  zIndex: 1,
                }}
              />
            </Box>
          </Box>

          {/* DESTAQUES ATUAIS DESTE PACIENTE — filtra apenas a medição mais recente NÃO normalizada */}
          {topCurrentHighlights.length > 0 && (
            <Box sx={{ pt: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary', display: 'block', mb: 1 }}>
                Destaques atuais deste paciente (último exame de cada marcador)
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {topCurrentHighlights.map((it: any) => {
                  const rawVal = String(it.valueText ?? it.valueNumeric ?? '').trim();
                  const rawUnit = String(it.unit ?? '').trim();
                  const valHasLetters = /[a-zA-Z%µ]/.test(rawVal);
                  const valAlreadyHasUnit = !!(rawUnit && rawVal.toLowerCase().includes(rawUnit.toLowerCase()));
                  const displayVal = (rawUnit && !valHasLetters && !valAlreadyHasUnit) ? `${rawVal} ${rawUnit}` : rawVal;
                  return (
                    <Chip
                      key={it.id || it.name}
                      size="small"
                      label={`${it.name}: ${displayVal}`.trim()}
                      sx={{ fontSize: 12, fontWeight: 700, bgcolor: alpha(theme.palette.warning.main, 0.10), color: 'text.primary', border: '1px solid', borderColor: alpha(theme.palette.warning.main, 0.35) }}
                    />
                  );
                })}
              </Box>
            </Box>
          )}

          {/* LISTA DE AÇÕES CLÍNICAS RECOMENDADAS */}
          <Box sx={{ pt: 2 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'text.secondary',
                display: 'block',
                mb: 1.25,
              }}
            >
              Ações Clínicas Recomendadas para Decisão Médica
            </Typography>

            <Stack spacing={1}>
              {riskAnalysis.actions.map((act) => {
                const isUrgent = act.timeframe === 'agora';

                return (
                  <Box
                    key={act.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1.5,
                      p: 1.35,
                      borderRadius: '12px',
                      bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc',
                      border: '1px solid',
                      borderColor: isUrgent
                        ? alpha(theme.palette.error.main, 0.25)
                        : 'divider',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        borderColor: isUrgent
                          ? theme.palette.error.main
                          : (t) => copperText(t.palette.mode),
                        bgcolor: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                      },
                    }}
                  >
                    <Stack direction="row" alignItems="flex-start" spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
                      <Box
                        sx={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          bgcolor: isUrgent
                            ? alpha(theme.palette.error.main, 0.12)
                            : alpha(theme.palette.success.main, 0.12),
                          color: isUrgent ? theme.palette.error.main : theme.palette.success.main,
                          display: 'grid',
                          placeItems: 'center',
                          mt: 0.2,
                          flexShrink: 0,
                        }}
                      >
                        <CheckCircleIcon sx={{ fontSize: 16 }} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          sx={{
                            fontWeight: 700,
                            fontSize: 13.5,
                            color: 'text.primary',
                            lineHeight: 1.3,
                          }}
                        >
                          {act.title}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'text.secondary',
                            display: 'block',
                            mt: 0.25,
                            lineHeight: 1.35,
                          }}
                        >
                          {act.detail}
                        </Typography>
                      </Box>
                    </Stack>

                    {/* Botão de ação rápida / Badge temporal */}
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
                      <Chip
                        size="small"
                        label={isUrgent ? 'Agora' : act.timeframe === 'semanas' ? 'Em semanas' : 'Rotina'}
                        color={isUrgent ? 'error' : act.timeframe === 'semanas' ? 'warning' : 'default'}
                        variant={isUrgent ? 'filled' : 'outlined'}
                        sx={{
                          height: 22,
                          fontWeight: 800,
                          fontSize: 10.5,
                        }}
                      />
                      {onNavigateToAlterados && (
                        <Tooltip title="Examinar marcadores relacionados na aba Alterados">
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => onNavigateToAlterados(act.targetTab || 'alterados')}
                            endIcon={<ArrowForwardIcon sx={{ fontSize: 14 }} />}
                            sx={{
                              fontSize: 11,
                              fontWeight: 800,
                              textTransform: 'none',
                              color: (t) => copperText(t.palette.mode),
                              p: 0.5,
                              minWidth: 0,
                              display: 'inline-flex',
                            }}
                          >
                            Ver dados
                          </Button>
                        </Tooltip>
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>

            {/* RODAPÉ INFORMATIVO: CRUZAMENTO DE SISTEMAS ORGÂNICOS */}
            {riskAnalysis.systems.length > 0 && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  mt: 1.5,
                  p: 1.25,
                  borderRadius: '10px',
                  bgcolor: isDark ? alpha(COPPER.mid, 0.08) : alpha(COPPER.deep, 0.05),
                  border: '1px dashed',
                  borderColor: isDark ? alpha(COPPER.mid, 0.25) : alpha(COPPER.deep, 0.2),
                }}
              >
                <InfoOutlinedIcon
                  sx={{
                    fontSize: 17,
                    color: (t) => copperText(t.palette.mode),
                    flexShrink: 0,
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    color: (t) => copperText(t.palette.mode),
                    fontWeight: 600,
                    lineHeight: 1.35,
                  }}
                >
                  Alterações cruzadas detectadas em{' '}
                  <strong>
                    {riskAnalysis.systems.length}{' '}
                    {riskAnalysis.systems.length === 1 ? 'sistema orgânico' : 'sistemas orgânicos'}
                  </strong>{' '}
                  ({riskAnalysis.systems.join(' · ')}).
                </Typography>
              </Box>
            )}

            {/* GUARDRAIL: a conduta é do médico — sem linguagem diagnóstica no card. */}
            <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.disabled', lineHeight: 1.4 }}>
              Priorização educativa gerada a partir das faixas de referência dos exames compartilhados. Não substitui julgamento clínico nem estabelece diagnóstico.
            </Typography>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
};
