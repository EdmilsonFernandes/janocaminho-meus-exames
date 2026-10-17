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
import { COPPER, copperText, RADIUS, SEM } from '../../theme';

export interface ClinicalRiskCardProps {
  patient?: any;
  abnormalItems?: any[];
  abnormalStats?: { total: number; importante: number; moderada: number; leve: number };
  exams?: any[];
  medsCount?: number;
  criticalMeds?: number;
  onNavigateToAlterados?: () => void;
  loading?: boolean;
}

type RiskLevel = 'Normal' | 'Suspeito' | 'Presuntivo' | 'Confirmado';

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
  loading = false,
}: ClinicalRiskCardProps) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [expanded, setExpanded] = useState(true);

  // Análise clínica computada baseada nos dados reais dos exames do paciente
  const riskAnalysis = useMemo(() => {
    const totalAbnormal = abnormalStats.total || abnormalItems.length;
    const nImp = abnormalStats.importante || 0;
    const nMod = abnormalStats.moderada || 0;
    const nLev = abnormalStats.leve || 0;

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

    let level: RiskLevel = 'Normal';
    let levelColor = theme.palette.success.main;
    let levelBg = alpha(theme.palette.success.main, 0.12);
    let actionBadge = 'Acompanhamento de rotina';
    let severityBadge = 'Parâmetros estáveis';

    if (computedScore >= 75 || nImp >= 2 || (nImp >= 1 && criticalMeds > 0)) {
      level = 'Confirmado';
      levelColor = theme.palette.error.main;
      levelBg = alpha(theme.palette.error.main, 0.14);
      actionBadge = 'Conduta imediata sugerida';
      severityBadge = 'Gravidade elevada';
    } else if (computedScore >= 50 || nImp >= 1 || nMod >= 2) {
      level = 'Presuntivo';
      levelColor = '#f59e0b'; // Amber / Warn
      levelBg = alpha('#f59e0b', 0.14);
      actionBadge = 'Atenção clínica requerida';
      severityBadge = nImp > 0 ? 'Gravidade moderada a alta' : 'Gravidade moderada';
    } else if (computedScore >= 25 || totalAbnormal > 0) {
      level = 'Suspeito';
      levelColor = '#3b82f6'; // Blue / Inquérito
      levelBg = alpha('#3b82f6', 0.14);
      actionBadge = 'Investigação em andamento';
      severityBadge = 'Gravidade leve';
    }

    // Mapeamento de sistemas orgânicos afetados
    const systemsSet = new Set<string>();
    abnormalItems.forEach((item) => {
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
      actions: actions.slice(0, 3), // máx 3 para clareza e escaneabilidade sem sobrecarga
    };
  }, [abnormalItems, abnormalStats, exams, criticalMeds, theme]);

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
  const scaleLevels: RiskLevel[] = ['Normal', 'Suspeito', 'Presuntivo', 'Confirmado'];
  const currentIndex = scaleLevels.indexOf(riskAnalysis.level);

  // SVG Gauge calculations (circunferência = 2 * PI * 44 ≈ 276.46)
  const radius = 42;
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
      {/* CABEÇALHO */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2.5,
          pt: 2.25,
          pb: expanded ? 1.5 : 2.25,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: '10px',
              bgcolor: isDark ? alpha(COPPER.mid, 0.15) : alpha(COPPER.deep, 0.1),
              color: isDark ? COPPER.light : COPPER.deep,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <HealthAndSafetyIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography
                sx={{
                  fontFamily: 'Poppins, sans-serif',
                  fontWeight: 800,
                  fontSize: { xs: 15, sm: 16 },
                  color: 'text.primary',
                  lineHeight: 1.2,
                }}
              >
                Avaliação de Risco Clínico
              </Typography>
              <Chip
                label="Dr. Exame Insight"
                size="small"
                sx={{
                  height: 20,
                  fontSize: 10,
                  fontWeight: 800,
                  bgcolor: isDark ? alpha(COPPER.mid, 0.2) : alpha(COPPER.deep, 0.12),
                  color: (t) => copperText(t.palette.mode),
                  border: '1px solid',
                  borderColor: isDark ? alpha(COPPER.mid, 0.4) : alpha(COPPER.deep, 0.3),
                  display: { xs: 'none', sm: 'inline-flex' },
                }}
              />
            </Stack>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mt: 0.2 }}
            >
              Estratificação integrativa baseada em biomarcadores, gravidade e histórico
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" alignItems="center" spacing={1}>
          {/* Badge de gravidade visível no header se colapsado */}
          {!expanded && (
            <Chip
              label={`${riskAnalysis.level} · ${riskAnalysis.score}/100`}
              size="small"
              sx={{
                fontWeight: 800,
                fontSize: 11,
                bgcolor: riskAnalysis.levelBg,
                color: riskAnalysis.levelColor,
              }}
            />
          )}

          <IconButton
            size="small"
            onClick={() => setExpanded((prev) => !prev)}
            aria-label={expanded ? 'Recolher avaliação de risco' : 'Expandir avaliação de risco'}
            sx={{
              color: 'text.secondary',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            {expanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </Stack>
      </Box>

      {/* CONTEÚDO EXPANDÍVEL */}
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ px: { xs: 2, sm: 2.5 }, pb: 2.5 }}>
          {/* BLOCO CENTRAL: GAUGE CIRCULAR + INFORMAÇÕES DE RISCO */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: { xs: 2, sm: 3 },
              py: 1.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            {/* GAUGE SVG ANIMADO */}
            <Box
              sx={{
                width: 106,
                height: 106,
                position: 'relative',
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <svg
                width="106"
                height="106"
                style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}
              >
                {/* Track de fundo */}
                <circle
                  cx="53"
                  cy="53"
                  r={radius}
                  fill="none"
                  stroke={isDark ? '#263333' : '#e2e8f0'}
                  strokeWidth="8"
                />
                {/* Linha de progresso */}
                <circle
                  cx="53"
                  cy="53"
                  r={radius}
                  fill="none"
                  stroke={riskAnalysis.levelColor}
                  strokeWidth="8"
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
                    fontSize: 28,
                    lineHeight: 1,
                    color: riskAnalysis.levelColor,
                  }}
                >
                  {riskAnalysis.score}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'text.secondary',
                    lineHeight: 1,
                    mt: 0.25,
                  }}
                >
                  DE 100
                </Typography>
              </Box>
            </Box>

            {/* CLASSIFICAÇÃO E BADGES */}
            <Box sx={{ flex: 1, textAlign: { xs: 'center', sm: 'left' } }}>
              <Typography
                sx={{
                  fontFamily: 'Poppins, sans-serif',
                  fontWeight: 800,
                  fontSize: { xs: 20, sm: 22 },
                  color: 'text.primary',
                  mb: 0.75,
                }}
              >
                Risco {riskAnalysis.level}
              </Typography>

              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
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
                {abnormalStats.total > 0 && (
                  <Chip
                    size="small"
                    label={`${abnormalStats.total} ${abnormalStats.total === 1 ? 'marcador fora' : 'marcadores fora'}`}
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
                      {onNavigateToAlterados && act.targetTab && (
                        <Tooltip title="Examinar marcadores relacionados na aba Alterados">
                          <Button
                            size="small"
                            variant="text"
                            onClick={onNavigateToAlterados}
                            endIcon={<ArrowForwardIcon sx={{ fontSize: 14 }} />}
                            sx={{
                              fontSize: 11,
                              fontWeight: 800,
                              textTransform: 'none',
                              color: (t) => copperText(t.palette.mode),
                              p: 0.5,
                              minWidth: 0,
                              display: { xs: 'none', sm: 'inline-flex' },
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
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
};
