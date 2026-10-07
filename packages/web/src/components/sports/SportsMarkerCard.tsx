// SportsMarkerCard (E4.2) — card de marcador do painel esportivo. Composição 100% de
// padrões existentes: AppCard + régua estilo ValueBar (zona verde sólida = régua do
// LAB, SEMPRE visível) + banda de META tracejada em cobre (mesma linguagem do
// ReferenceArea do TrendsChart) + dots de HISTÓRICO + chips de contexto de coleta.
//
// As 3 camadas têm legenda própria (lab · histórico · meta) — nunca só cor: pin de
// valor tem status em TEXTO, meta tem chip 🎯 com autoria no tooltip (padrão E2.4).
import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import type { ClinicalGoalView } from '@meus-exames/shared';
import { AppCard } from '../AppCard';
import { UnitLabel } from '../UnitLabel';
import { SEM, RADIUS } from '../../theme';
import { goalFor, goalRangeText, withinGoal, withinRef, dualStatusText } from '../../utils/clinicalGoals';

/** Cobre da marca — cor da meta clínica (idem TrendsChart.GOAL_COLOR). */
export const GOAL_COLOR = '#d4a574';

/** Cobre AA no LIGHT (júri E4+ #8): a borda tracejada #d4a574 sobre papel claro não
 *  passa no contraste — o padrão do app é o par cobre escuro no light / cobre da
 *  marca no dark (idem Evolution/ExamShow/ReviewControl). */
const goalAccent = (mode: 'light' | 'dark') => (mode === 'dark' ? GOAL_COLOR : '#8a6240');

/** Analito serializado pelo GET /items/evolution (contrato do server — ver item.routes). */
export interface EvolutionPoint {
  value: number | null;
  date: string | null;
  flag?: string | null;
  examId?: string;
  examTitle?: string | null;
  method?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
}
export interface EvolutionAnalyte {
  nameCanonical: string;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  firstValue: number | null;
  lastValue: number | null;
  firstDate: string | null;
  lastDate: string | null;
  pctChange: number | null;
  direction: 'up' | 'down' | 'stable';
  inRange: boolean;
  abnormal: boolean;
  count: number;
  points: EvolutionPoint[];
}

export interface CollectionContextChips {
  jejum?: boolean;
  treino24h?: boolean;
  ultimaDose?: string | null;
}

const fmtNum = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fmtDay = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 's/d';
const prettyName = (n: string) =>
  (n || '').toLowerCase().replace(/_/g, ' ').replace(/(^|\s)\w/g, (m) => m.toUpperCase());

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Chips de contexto por sensibilidade do analito (coleta/treino<24h/última dose —
 *  declarações do paciente em collectionContext; NUNCA suprimem status — são texto). */
function contextChipsFor(name: string, ctx: CollectionContextChips | null): string[] {
  if (!ctx) return [];
  const n = ` ${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')} `;
  const out: string[] = [];
  if (ctx.jejum && (n.includes('glicose') || n.includes('lipid') || n.includes('colesterol') || n.includes('triglic') || n.includes('insulin'))) out.push('Coleta em jejum');
  if (ctx.treino24h && (n.includes('ck ') || n.includes('creatino') || n.includes('creatina quinase') || n.includes('creatinin') || n.includes('ast') || n.includes('alt') || n.includes('tgo') || n.includes('tgp') || n.includes('testosteron') || n.includes('cortisol') || n.includes('tsh'))) out.push('Treino <24h antes');
  if (ctx.ultimaDose && (n.includes('testosteron') || n.includes('estradiol') || n.includes(' lh') || n.includes(' fsh') || n.includes('shbg') || n.includes('hormon'))) out.push(`Última dose: ${ctx.ultimaDose}`);
  return out;
}

export const SportsMarkerCard = ({ it, goals, patientId, ctx, showLegend = false }: {
  it: EvolutionAnalyte;
  goals: ClinicalGoalView[];
  patientId?: string | null;
  ctx?: CollectionContextChips | null;
  /** Se deve exibir a legenda detalhada no rodapé deste card (padrão false para manter visual limpo no grid) */
  showLegend?: boolean;
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const goal = goalFor(goals, it.nameCanonical, patientId);
  const value = it.lastValue;
  const inRef = withinRef(value, it.refLow, it.refHigh);
  const out = value != null && it.refLow != null && it.refHigh != null && (value > it.refHigh || value < it.refLow);
  const statusText = value == null ? 'Sem valor numérico'
    : it.refLow != null && it.refHigh != null
      ? (value > it.refHigh ? '↑ Acima da referência' : value < it.refLow ? '↓ Abaixo da referência' : 'Na referência')
      : (it.abnormal ? 'Fora da referência' : 'Na referência');
  const statusColor = out ? SEM.bad[theme.palette.mode] : inRef === false ? SEM.warn[theme.palette.mode] : SEM.ok[theme.palette.mode];

  // ── Régua de 3 camadas: escala cobre valor + histórico + meta (nunca corta banda) ──
  const pts = it.points.filter((p) => p.value != null) as (EvolutionPoint & { value: number })[];
  const history = pts.slice(0, -1); // tudo menos o último (o último é o PIN grande)
  const hasRuler = value != null && it.refLow != null && it.refHigh != null && it.refHigh > it.refLow;
  const gLow = goal?.targetLow ?? null;
  const gHigh = goal?.targetHigh ?? null;
  const nums = [value, it.refLow, it.refHigh, gLow, gHigh, ...history.map((h) => h.value)].filter((v): v is number => v != null);
  let pct: (v: number) => string = () => '50%';
  if (hasRuler) {
    const range = it.refHigh! - it.refLow!;
    const pad = Math.max(range * 0.4, range * 0.2);
    const lo = Math.min(it.refLow! - pad, ...nums);
    const hi = Math.max(it.refHigh! + pad, ...nums);
    const span = Math.max(hi - lo, range * 0.001);
    pct = (v: number) => `${((clamp(v, lo, hi) - lo) / span) * 100}%`;
  }
  const dual = dualStatusText(withinGoal(value, goal), inRef);
  const chips = contextChipsFor(it.nameCanonical, ctx ?? null);
  const accent = goalAccent(theme.palette.mode);

  return (
    <AppCard
      kind="interactive"
      onClick={() => navigate(`/tendencias?select=${encodeURIComponent(it.nameCanonical)}`)}
      aria-label={`${prettyName(it.nameCanonical)}: ${fmtNum(value)} — ${statusText}. Ver tendência`}
      sx={{
        p: { xs: 2, sm: 2.25 },
        borderRadius: RADIUS.card,
        minWidth: 0,
        position: 'relative',
        transition: 'transform 0.14s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease',
        touchAction: 'manipulation',
        '&:active': { transform: 'scale(0.985)' },
      }}
    >
      {/* Topo: Nome do analito + Tendência / data da última coleta */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ minWidth: 0, mb: 1 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: { xs: 14.5, sm: 15.5 },
              lineHeight: 1.25,
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              color: 'text.primary',
            }}
          >
            {prettyName(it.nameCanonical)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, fontSize: 11.5 }}>
            {fmtDay(it.lastDate)}{it.count > 1 ? ` · ${it.count} medições` : ''}{pts[pts.length - 1]?.method ? ` · ${pts[pts.length - 1].method}` : ''}
          </Typography>
        </Box>

        {/* Badge de tendência entre coletas */}
        {it.count > 1 && (
          <Box
            sx={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              px: 1,
              py: 0.3,
              borderRadius: '999px',
              bgcolor: it.direction === 'up'
                ? (out ? alpha(theme.palette.error.main, 0.1) : alpha(theme.palette.success.main, 0.1))
                : it.direction === 'down'
                ? alpha(theme.palette.info.main, 0.1)
                : 'action.hover',
              color: it.direction === 'up'
                ? (out ? SEM.bad[theme.palette.mode] : SEM.ok[theme.palette.mode])
                : 'text.secondary',
              fontWeight: 800,
              fontSize: 11.5,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {it.direction === 'up' ? '↑' : it.direction === 'down' ? '↓' : '→'} {it.pctChange != null ? `${it.pctChange > 0 ? '+' : ''}${it.pctChange}%` : ''}
          </Box>
        )}
      </Stack>

      {/* Valor numérico em destaque + Unidade + Badge de status em texto */}
      <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ mb: 1.25, flexWrap: 'wrap', rowGap: 0.5 }}>
        <Typography
          sx={{
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 800,
            fontSize: { xs: 26, sm: 30 },
            lineHeight: 1,
            color: statusColor,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
          }}
        >
          {fmtNum(value)}
        </Typography>
        {it.unit && <UnitLabel unit={it.unit} fontSize="0.95rem" />}
        <Box
          component="span"
          sx={{
            ml: 0.5,
            px: 1.1,
            py: 0.25,
            borderRadius: '999px',
            bgcolor: alpha(statusColor, 0.12),
            border: `1px solid ${alpha(statusColor, 0.25)}`,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <Typography component="span" sx={{ fontSize: 11.5, fontWeight: 800, color: statusColor }}>
            {statusText}
          </Typography>
        </Box>
      </Stack>

      {/* Régua de 3 camadas: Lab (verde sólida) + Meta tracejada cobre + Histórico + Pin atual */}
      {hasRuler ? (
        <Box
          sx={{ mt: 1.25, minWidth: 0 }}
          role="img"
          aria-label={`Régua: referência do laboratório de ${fmtNum(it.refLow)} a ${fmtNum(it.refHigh)}${goal ? `, meta clínica ${goalRangeText(goal)}` : ''}. ${statusText}.`}
        >
          <Box
            sx={{
              position: 'relative',
              height: 12,
              borderRadius: '999px',
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              overflow: 'visible',
            }}
          >
            {/* Faixa de referência do LABORATÓRIO — zona verde sólida sutil */}
            <Box
              sx={{
                position: 'absolute',
                left: pct(it.refLow!),
                width: `calc(${pct(it.refHigh!)} - ${pct(it.refLow!)})`,
                top: 0,
                bottom: 0,
                background: 'rgba(46, 125, 50, 0.32)',
                borderRadius: '999px',
              }}
            />

            {/* Faixa de META clínica — banda cobre tracejada com preenchimento leve */}
            {goal && gLow != null && gHigh != null && gHigh > gLow && (
              <Box
                sx={{
                  position: 'absolute',
                  left: pct(gLow),
                  width: `calc(${pct(gHigh)} - ${pct(gLow)})`,
                  top: -2,
                  bottom: -2,
                  borderRadius: '999px',
                  background: alpha(accent, 0.22),
                  border: `1.5px dashed ${accent}`,
                  zIndex: 1,
                }}
              />
            )}

            {/* HISTÓRICO — dots sutis de medições anteriores */}
            {history.map((h, i) => (
              <Box
                key={i}
                sx={{
                  position: 'absolute',
                  left: pct(h.value),
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  bgcolor: theme.palette.text.disabled,
                  opacity: 0.7,
                  zIndex: 2,
                }}
              />
            ))}

            {/* PIN do valor atual — círculo destacado com sombra */}
            <Box
              sx={{
                position: 'absolute',
                left: pct(value!),
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 14,
                height: 14,
                borderRadius: '50%',
                bgcolor: out ? theme.palette.error.main : theme.palette.success.main,
                border: '2.5px solid',
                borderColor: theme.palette.background.paper,
                boxShadow: '0 2px 5px rgba(0,0,0,0.25)',
                zIndex: 3,
              }}
            />
          </Box>

          {/* Marcadores numéricos de limite da régua */}
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.6 }}>
            <Typography variant="caption" sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {fmtNum(it.refLow)}
            </Typography>
            <Typography variant="caption" sx={{ fontSize: 10.5, color: 'text.secondary', fontWeight: 600, opacity: 0.85 }}>
              Faixa laboratório
            </Typography>
            <Typography variant="caption" sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {fmtNum(it.refHigh)}
            </Typography>
          </Stack>
        </Box>
      ) : (
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: out ? statusColor : 'text.secondary', fontWeight: out ? 700 : 500, fontSize: 11.5 }}>
          {out ? 'Alterado — faixa não informada pelo laboratório.' : 'Sem faixa de referência informada pelo laboratório.'}
        </Typography>
      )}

      {/* Meta Clínica e Contextos em linha compacta */}
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 1.25 }}>
        {/* Chip 🎯 META VIGENTE com autoria no tooltip */}
        {goal && (
          <Tooltip
            title={
              <Box sx={{ p: 0.5, maxWidth: 280 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 13 }}>🎯 Meta Clínica: {goalRangeText(goal)}</Typography>
                {goal.setBy && <Typography sx={{ fontSize: 12, opacity: 0.9, mt: 0.5 }}>Definida por: {goal.setBy}</Typography>}
                {goal.justification && <Typography sx={{ fontSize: 12, opacity: 0.9, mt: 0.5 }}>Justificativa: {goal.justification}</Typography>}
                {goal.source && <Typography sx={{ fontSize: 11, opacity: 0.75, mt: 0.5 }}>Diretriz: {goal.source}</Typography>}
              </Box>
            }
            arrow
          >
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                py: 0.25,
                borderRadius: '999px',
                bgcolor: alpha(accent, 0.12),
                border: `1px dashed ${alpha(accent, 0.7)}`,
                cursor: 'help',
              }}
            >
              <Typography component="span" sx={{ fontSize: 11.5, fontWeight: 700, color: accent }}>
                🎯 Meta {goalRangeText(goal)}
              </Typography>
            </Box>
          </Tooltip>
        )}

        {/* Chips de contexto declarado (coleta, treino <24h, última dose) */}
        {chips.map((c) => (
          <Chip
            key={c}
            size="small"
            label={c}
            sx={{
              height: 22,
              fontSize: 11,
              fontWeight: 700,
              bgcolor: 'action.hover',
              color: 'text.secondary',
              border: '1px solid',
              borderColor: 'divider',
            }}
          />
        ))}
      </Stack>

      {/* Duplo-status explícito quando há meta vigente */}
      {goal && dual && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'text.secondary', fontWeight: 700, fontSize: 11.5, lineHeight: 1.35 }}>
          {dual}
        </Typography>
      )}

      {/* Legenda individual opcional (se solicitada explicitamente via prop showLegend) */}
      {showLegend && hasRuler && (
        <Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap" sx={{ mt: 1.25, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 10, height: 6, borderRadius: '3px', bgcolor: 'rgba(46,125,50,.55)' }} />
            <Typography variant="caption" sx={{ fontSize: 11, color: 'text.secondary' }}>Régua lab</Typography>
          </Stack>
          {it.count > 1 && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'text.disabled' }} />
              <Typography variant="caption" sx={{ fontSize: 11, color: 'text.secondary' }}>Histórico ({it.count})</Typography>
            </Stack>
          )}
          {goal && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Box sx={{ width: 12, height: 0, borderTop: `2px dashed ${accent}` }} />
              <Typography variant="caption" sx={{ fontSize: 11, color: accent }}>Meta clínica</Typography>
            </Stack>
          )}
        </Stack>
      )}
    </AppCard>
  );
};
