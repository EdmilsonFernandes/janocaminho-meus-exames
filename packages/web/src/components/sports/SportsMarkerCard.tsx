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

export const SportsMarkerCard = ({ it, goals, patientId, ctx }: {
  it: EvolutionAnalyte;
  goals: ClinicalGoalView[];
  patientId?: string | null;
  ctx?: CollectionContextChips | null;
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

  return (
    <AppCard kind="interactive" onClick={() => navigate(`/tendencias?select=${encodeURIComponent(it.nameCanonical)}`)}
      aria-label={`${prettyName(it.nameCanonical)}: ${fmtNum(value)} — ${statusText}. Ver tendência`}
      sx={{ p: 1.75, borderRadius: RADIUS.sectionCard, minWidth: 0 }}>
      {/* Topo: nome + data/método da última coleta */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ minWidth: 0 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
            {prettyName(it.nameCanonical)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
            {fmtDay(it.lastDate)}{it.count > 1 ? ` · ${it.count} medições` : ''}{pts[pts.length - 1]?.method ? ` · ${pts[pts.length - 1].method}` : ''}
          </Typography>
        </Box>
        {/* Tendência entre coletas (seta + % do server — direção ÚNICA, idem TrendsChart) */}
        {it.count > 1 && (
          <Typography variant="caption" sx={{ flexShrink: 0, fontWeight: 800, color: 'text.secondary', mt: 0.5 }}>
            {it.direction === 'up' ? '↑' : it.direction === 'down' ? '↓' : '→'} {it.pctChange != null ? `${it.pctChange > 0 ? '+' : ''}${it.pctChange}%` : ''}
          </Typography>
        )}
      </Stack>

      {/* Valor + status em TEXTO (não-só-cor, E4.2 AC) */}
      <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
        <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 26, lineHeight: 1.05, color: statusColor, fontVariantNumeric: 'tabular-nums' }}>
          {fmtNum(value)}
        </Typography>
        {it.unit && <UnitLabel unit={it.unit} fontSize="0.9rem" />}
        <Box component="span" sx={{ ml: 0.5, px: 1, py: 0.2, borderRadius: '999px', bgcolor: alpha(statusColor, 0.12), border: `1px solid ${alpha(statusColor, 0.3)}` }}>
          <Typography component="span" sx={{ fontSize: 12, fontWeight: 800, color: statusColor }}>{statusText}</Typography>
        </Box>
      </Stack>

      {/* Régua: zona verde sólida (lab) + dots de histórico + banda cobre tracejada (meta) + pin */}
      {hasRuler ? (
        <Box sx={{ mt: 1.25, minWidth: 0 }} role="img"
          aria-label={`Régua: referência do laboratório de ${fmtNum(it.refLow)} a ${fmtNum(it.refHigh)}${goal ? `, meta clínica ${goalRangeText(goal)}` : ''}. ${statusText}.`}>
          <Box sx={{ position: 'relative', height: 14, borderRadius: '999px', background: theme.palette.mode === 'dark' ? '#2a3636' : '#eaeef5' }}>
            {/* Régua do LAB — zona verde SÓLIDA (sempre visível; a meta nunca a substitui) */}
            <Box sx={{ position: 'absolute', left: pct(it.refLow!), width: `calc(${pct(it.refHigh!)} - ${pct(it.refLow!)})`, top: 0, bottom: 0, background: 'rgba(46,125,50,.30)', borderRadius: '999px' }} />
            {/* META clínica — banda COBRE TRACEJADA (só com os 2 limites; meia-banda fica no chip) */}
            {goal && gLow != null && gHigh != null && gHigh > gLow && (
              <Box sx={{ position: 'absolute', left: pct(gLow), width: `calc(${pct(gHigh)} - ${pct(gLow)})`, top: -2, bottom: -2, borderRadius: '999px', background: alpha(GOAL_COLOR, 0.18), border: `1.5px dashed ${GOAL_COLOR}` }} />
            )}
            {/* HISTÓRICO — dots discretos das coletas anteriores */}
            {history.map((h, i) => (
              <Box key={i} sx={{ position: 'absolute', left: pct(h.value), top: '50%', transform: 'translate(-50%,-50%)', width: 6, height: 6, borderRadius: '50%', bgcolor: theme.palette.text.disabled, opacity: 0.6 }} />
            ))}
            {/* Último valor — pin grande (cor = status, borda do papel) */}
            <Box sx={{ position: 'absolute', left: pct(value!), top: '50%', transform: 'translate(-50%,-50%)', width: 15, height: 15, borderRadius: '50%', bgcolor: out ? theme.palette.error.main : theme.palette.success.main, border: '3px solid', borderColor: theme.palette.background.paper, boxShadow: '0 1px 3px rgba(0,0,0,.25)', zIndex: 2 }} />
          </Box>
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
            <Typography variant="caption" sx={{ fontSize: 11.5, color: 'text.secondary', fontWeight: 600 }}>{fmtNum(it.refLow)}</Typography>
            <Typography variant="caption" sx={{ fontSize: 11.5, color: 'text.secondary', fontWeight: 600 }}>Ref. laboratório {fmtNum(it.refLow)}–{fmtNum(it.refHigh)}</Typography>
            <Typography variant="caption" sx={{ fontSize: 11.5, color: 'text.secondary', fontWeight: 600 }}>{fmtNum(it.refHigh)}</Typography>
          </Stack>
        </Box>
      ) : (
        <Typography variant="caption" sx={{ display: 'block', mt: 1.25, color: 'text.secondary' }}>
          Sem faixa de referência informada pelo laboratório.
        </Typography>
      )}

      {/* Chip 🎯 META VIGENTE — autoria no tooltip (idem TrendsChart, E2.4) */}
      {goal && (
        <Tooltip title={
          <Box sx={{ p: 0.5, maxWidth: 280 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 13 }}>{goalRangeText(goal)}</Typography>
            {goal.setBy && <Typography sx={{ fontSize: 12, opacity: 0.85, mt: 0.5 }}>{goal.setBy}</Typography>}
            {goal.justification && <Typography sx={{ fontSize: 12, opacity: 0.85, mt: 0.5 }}>{goal.justification}</Typography>}
            {goal.source && <Typography sx={{ fontSize: 11, opacity: 0.7, mt: 0.5 }}>Fonte: {goal.source}</Typography>}
          </Box>
        } arrow>
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 1, px: 1, py: 0.25, borderRadius: '999px', bgcolor: alpha(GOAL_COLOR, 0.14), border: `1px dashed ${alpha(GOAL_COLOR, 0.7)}`, cursor: 'help' }}>
            <Typography component="span" sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.secondary' }}>
              🎯 Meta {goalRangeText(goal)}{goal.setBy ? ` — ${goal.setBy.split(' (CRM')[0]}` : ''}
            </Typography>
          </Box>
        </Tooltip>
      )}

      {/* Duplo-estado explícito (REGRA DURA §4): meta não "explica" alteração. */}
      {goal && dual && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'text.secondary', fontWeight: 700, lineHeight: 1.35 }}>{dual}</Typography>
      )}

      {/* Chips de CONTEXTO declarado (coleta/treino/última dose) — texto, nunca supressor */}
      {chips.length > 0 && (
        <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
          {chips.map((c) => (
            <Chip key={c} size="small" label={c} sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />
          ))}
        </Stack>
      )}

      {/* Legenda das 3 camadas — pontos lab · histórico · meta (compacta, 1 linha) */}
      <Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap" sx={{ mt: 1.25, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Box sx={{ width: 10, height: 6, borderRadius: '3px', bgcolor: 'rgba(46,125,50,.55)' }} />
          <Typography variant="caption" sx={{ fontSize: 11, color: 'text.secondary' }}>Régua do lab</Typography>
        </Stack>
        {it.count > 1 && (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'text.disabled' }} />
            <Typography variant="caption" sx={{ fontSize: 11, color: 'text.secondary' }}>Histórico ({it.count})</Typography>
          </Stack>
        )}
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Box sx={{ width: 12, height: 0, borderTop: `2px dashed ${GOAL_COLOR}` }} />
          <Typography variant="caption" sx={{ fontSize: 11, color: 'text.secondary' }}>Meta do médico</Typography>
        </Stack>
      </Stack>
    </AppCard>
  );
};
