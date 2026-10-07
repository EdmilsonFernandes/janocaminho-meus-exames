// SportsAlertBanner (E4.2 + E5 §3) — banner de alerta no TOPO do painel esportivo.
// MESMA fonte do dashboard normal (health-state do /dashboard-summary: byPriority +
// staleWarning + worsening) — o modo esportivo REAPRESENTA, nunca recalcula nem esconde
// (§E6: contexto é texto, nunca supressor). Apresentação: AppCard accent warning +
// ÍCONE + TEXTO (não-só-cor) + tags dos marcadores em piora (padrão do preview §2).
//
// E5 §3 — CONTEXTO EDUCATIVO por trás do chip "📚 contexto" (aparece SÓ quando o dado
// existe): linguagem de DIRETRIZ, nunca teto inventado (o "52% seguro" do mockup é
// PROIBIDO). Chips de marcadores RELACIONADOS: CK×treino recente, HDL×andrógeno —
// cruzamento dado real (items) × declaração real (substâncias/treino HC).
import { useState } from 'react';
import { Box, Button, Chip, Collapse, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useNavigate } from 'react-router-dom';
import { AppCard } from '../AppCard';
import { RADIUS, SEM } from '../../theme';
import { fmtNum } from '../../utils/format';
import { androgenDeclared } from './sportsDomains';
import type { Marker } from '../dashboard/ChangesSinceExam';
import type { EvolutionAnalyte } from './SportsMarkerCard';

/** Linguagem EXATA das diretrizes p/ hematócrito em reposição prescrita (SBEM 2026/ES
 *  2018, RELATORIO §3.1) — o limiar de risco real é desconhecido e o texto diz isso. */
export const HCT_EDU_TEXT = 'Em reposição prescrita, diretrizes recomendam avaliação médica acima de 54%; entre 48-54% é zona de atenção individualizada. O limiar exato de risco não é conhecido.';
/** Padrão TGO-muscular do treino intenso (matriz INTENSA — educativo, NÃO descarta investigação). */
export const TGO_MUSCULAR_TEXT = 'TGO elevada com TGP e GGT normais sugere origem MUSCULAR (a enzima também está no músculo) — padrão descrito após treino intenso. Educativo: não descarta investigação médica.';

interface EduBlock { key: string; title: string; text: string }

export const SportsAlertBanner = ({ loaded, exams, importante, moderada, staleWarning, worsened, items, substances, training }: {
  loaded: boolean;
  exams: number;
  importante: number;
  moderada: number;
  staleWarning: string;
  worsened: Marker[];
  /** Analitos do painel (mesma fonte dos cards) — alimenta o conhecimento educativo. */
  items?: EvolutionAnalyte[];
  /** Substâncias declaradas — cruzamento CK×treino, HDL×andrógeno (dado real). */
  substances?: { name: string }[];
  /** Treinos HC recentes — contexto do chip CK (só com treino de verdade). */
  training?: { date: string; min: number }[];
}) => {
  const navigate = useNavigate();
  const [openEdu, setOpenEdu] = useState<string | null>(null);
  if (!loaded) return null;
  const attention = importante + moderada;

  // Sem exames → o banner vazio não existe (EmptyState geral cuida do estado vazio).
  if (exams === 0) return null;

  const findItem = (rx: RegExp) => (items ?? []).find((it) => rx.test(it.nameCanonical));
  const isHigh = (it?: EvolutionAnalyte) => !!(it && it.lastValue != null && (it.abnormal || (it.refHigh != null && it.lastValue > it.refHigh)));
  const isLow = (it?: EvolutionAnalyte) => !!(it && it.lastValue != null && (it.abnormal || (it.refLow != null && it.lastValue < it.refLow)));

  // ── Blocos educativos (SÓ com dado real; linguagem aprovada — ver constantes) ──
  const edu: EduBlock[] = [];
  const hct = findItem(/hematocrito/i);
  if (hct?.lastValue != null && (hct.lastValue >= 48 || isHigh(hct))) {
    edu.push({
      key: 'hct',
      title: `Hematócrito ${fmtNum(hct.lastValue)}%${hct.unit && hct.unit !== '%' ? ` ${hct.unit}` : ''}`,
      text: HCT_EDU_TEXT,
    });
  }
  // Padrão TGO-muscular: TGO alta com TGP E GGG normais (matriz INTENSA — dado real).
  const tgo = findItem(/tgo|\bast\b/i);
  const tgp = findItem(/tgp|\balt\b/i);
  const ggt = findItem(/gama\s?gt|ggt/i);
  if (isHigh(tgo) && tgo?.lastValue != null && tgp && !isHigh(tgp) && ggt && !isHigh(ggt)) {
    edu.push({
      key: 'tgo',
      title: `TGO ${fmtNum(tgo.lastValue)}${tgo.unit ? ` ${tgo.unit}` : ''} com TGP/GGT normais`,
      text: TGO_MUSCULAR_TEXT,
    });
  }

  // ── Chips de marcadores RELACIONADOS (declaração × exame — preview §2 "tags") ──
  const related: string[] = [];
  const ck = findItem(/creatino quinase|creatina quinase|ck total/i);
  const lastTraining = training && training.length > 0 ? training[training.length - 1] : null;
  const trainedRecently = !!(lastTraining && Date.now() - new Date(lastTraining.date).getTime() < 3 * 86400000);
  if (isHigh(ck) && trainedRecently) related.push('CK alto · treino recente');
  const hdl = findItem(/hdl/i);
  if (isLow(hdl) && androgenDeclared(substances)) related.push('HDL baixo · andrógeno declarado');

  // Nada pedindo atenção → linha positiva curta (não some sem dizer nada).
  // Nada pedindo atenção → linha positiva curta (não some sem dizer nada).
  if (attention === 0) {
    return (
      <AppCard
        kind="accent"
        tone="success"
        sx={{
          p: { xs: 1.75, sm: 2 },
          mb: 2,
          borderRadius: RADIUS.card,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          bgcolor: (t) => alpha(SEM.ok[t.palette.mode], 0.05),
          border: (t) => `1px solid ${alpha(SEM.ok[t.palette.mode], 0.22)}`,
        }}
      >
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: '12px',
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            bgcolor: (t) => alpha(SEM.ok[t.palette.mode], 0.12),
            color: (t) => SEM.ok[t.palette.mode],
          }}
        >
          <CheckCircleOutlineIcon sx={{ fontSize: 22 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 14.5, color: 'text.primary' }}>
            Marcadores dentro do esperado
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.2, fontSize: 12 }}>
            Nenhum analito crítico fora da referência no momento.
            {staleWarning && ` · ⏳ ${staleWarning}`}
          </Typography>
        </Box>
      </AppCard>
    );
  }

  return (
    <AppCard
      kind="accent"
      tone="warning"
      sx={{
        p: { xs: 2, sm: 2.25 },
        mb: 2,
        borderRadius: RADIUS.card,
        bgcolor: (t) => alpha(SEM.warn[t.palette.mode], 0.05),
        border: (t) => `1px solid ${alpha(SEM.warn[t.palette.mode], 0.25)}`,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '12px',
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            bgcolor: (t) => alpha(SEM.warn[t.palette.mode], 0.14),
            color: (t) => SEM.warn[t.palette.mode],
            mt: 0.25,
          }}
        >
          <WarningAmberIcon sx={{ fontSize: 22 }} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: 15, sm: 16 }, lineHeight: 1.25, color: 'text.primary' }}>
            {attention} {attention === 1 ? 'marcador pede' : 'marcadores pedem'} atenção
            {importante > 0 ? ` · ${importante} importante${importante > 1 ? 's' : ''}` : ''}
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5, lineHeight: 1.45 }}>
            {importante > 0
              ? 'Os marcadores importantes merecem prioridade na sua próxima consulta médica.'
              : 'Ajustes moderados — acompanhe a evolução e comente na sua consulta.'}
          </Typography>

          {/* Tags dos que pioraram ou estão relacionados com treino/substâncias */}
          {(worsened.length > 0 || related.length > 0) && (
            <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap" sx={{ mt: 1.2 }}>
              {worsened.slice(0, 3).map((m, i) => {
                const v = m.latest?.valueNumeric ?? null;
                const dir = v != null && m.refHigh != null && v > m.refHigh ? '↑'
                  : v != null && m.refLow != null && v < m.refLow ? '↓'
                    : m.flag === 'HIGH' ? '↑' : '↓';
                return (
                  <Chip
                    key={`${m.nameCanonical || m.name}-${i}`}
                    size="small"
                    label={`${m.name}${v != null ? ` ${fmtNum(v)}${m.unit ? ' ' + m.unit : ''}` : ''} ${dir}`}
                    onClick={() => navigate(`/tendencias?select=${encodeURIComponent(m.nameCanonical || m.name)}`)}
                    sx={{
                      height: 24,
                      fontSize: 11.5,
                      fontWeight: 700,
                      bgcolor: (t) => alpha(SEM.warn[t.palette.mode], 0.12),
                      color: (t) => SEM.warn[t.palette.mode],
                      border: (t) => `1px solid ${alpha(SEM.warn[t.palette.mode], 0.25)}`,
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                      '&:active': { transform: 'scale(0.97)' },
                    }}
                  />
                );
              })}
              {related.map((r) => (
                <Chip
                  key={r}
                  size="small"
                  label={r}
                  sx={{
                    height: 24,
                    fontSize: 11.5,
                    fontWeight: 700,
                    bgcolor: 'action.hover',
                    color: 'text.secondary',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                />
              ))}
            </Stack>
          )}

          {/* CONTEXTO EDUCATIVO (E5 §3): diretrizes clínicas de referência */}
          {edu.length > 0 && (
            <Stack spacing={0.75} sx={{ mt: 1.5 }}>
              {edu.map((b) => (
                <Box
                  key={b.key}
                  sx={{
                    p: 1,
                    borderRadius: '10px',
                    bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.7)'),
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Chip
                    component="button"
                    size="small"
                    aria-expanded={openEdu === b.key}
                    label={`📚 Diretriz clínica: ${b.title}`}
                    onClick={() => setOpenEdu((cur) => (cur === b.key ? null : b.key))}
                    sx={{
                      height: 26,
                      fontSize: 12,
                      fontWeight: 700,
                      bgcolor: 'action.hover',
                      color: 'text.secondary',
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                      '&:hover': { bgcolor: 'action.selected' },
                    }}
                  />
                  <Collapse in={openEdu === b.key} timeout="auto" unmountOnExit>
                    <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5, mt: 0.75, pl: 0.5 }}>
                      {b.text}
                    </Typography>
                  </Collapse>
                </Box>
              ))}
            </Stack>
          )}

          {staleWarning && (
            <Box sx={{ mt: 1 }}>
              <Chip size="small" label={`⏳ ${staleWarning}`} sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />
            </Box>
          )}

          <Box sx={{ mt: 1.5 }}>
            <Button
              size="small"
              onClick={() => navigate('/alterados')}
              sx={{
                textTransform: 'none',
                fontWeight: 800,
                borderRadius: '999px',
                px: 2,
                py: 0.5,
                fontSize: 12.5,
                color: (t) => SEM.warn[t.palette.mode],
                bgcolor: (t) => alpha(SEM.warn[t.palette.mode], 0.1),
                border: (t) => `1px solid ${alpha(SEM.warn[t.palette.mode], 0.3)}`,
                touchAction: 'manipulation',
                '&:hover': { bgcolor: (t) => alpha(SEM.warn[t.palette.mode], 0.18) },
                '&:active': { transform: 'scale(0.98)' },
              }}
            >
              Ver todos os alterados →
            </Button>
          </Box>
        </Box>
      </Stack>
    </AppCard>
  );
};
