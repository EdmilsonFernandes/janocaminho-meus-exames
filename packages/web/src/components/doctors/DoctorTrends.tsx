import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, MenuItem, Select, FormControl, Stack, Chip, useMediaQuery, useTheme, alpha } from '@mui/material';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea } from 'recharts';
import { API_URL } from '../../config';
import { ListSkeleton } from '../Skeleton';
import { Flag } from '../Flag';
import { displayStatus } from '../../utils/examStatus';
import { ExplainButton } from '../ExplainItem';
import { TrendsChart } from '../TrendsChart';
import { UnitLabel } from '../UnitLabel';
import { RADIUS } from '../../theme';
import type { Theme } from '@mui/material/styles';

import type { TimeSeriesByName as TS } from '@meus-exames/shared';

/** Title Case pra exibição (ALL CAPS → legível), PRESERVANDO siglas: "CHCM" fica "CHCM"
 *  (não "Chcm"), "TSH_TOTAL_LIVRE" → "TSH Total Livre". */
const prettyName = (n: string) => (n || '').split('_').map((tok) => (tok.length <= 5 && /^[A-Z0-9]+$/.test(tok) ? tok : tok.toLowerCase().replace(/(^|\s)\w/g, (m) => m.toUpperCase()))).join(' ');

/** Valor numérico p/ exibição (4 casas, vírgula decimal) — evita floats longos da conversão (91.33627999...). */
const fmtNum = (n: number | null | undefined) => n == null ? '—' : String(Number(n.toFixed(4))).replace('.', ',');

type Props = { patientId: string; token: string };

/**
 * DoctorTrends — viewer do médico (READ-ONLY) p/ a página de Tendências do paciente.
 * Espelha pages/Trends.tsx (gráfico recharts + cabeçalho + histórico + auto-select) SEM
 * react-admin (sem Title/PageContainer) e SEM hooks do app do paciente (useSelectedPatient/token()).
 * Busca endpoints DOCTOR /doctor/patients/:pid/items/distinct-names + /timeseries c/ Bearer token.
 *
 * Identidade: teal via theme.palette.primary.main + alpha() (sem hex literais). RADIUS token.
 */
export const DoctorTrends = ({ patientId, token }: Props) => {
  const theme = useTheme<Theme>();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [names, setNames] = useState<{ nameCanonical: string; count: number }[]>([]);
  const [sel, setSel] = useState('');
  const [ts, setTs] = useState<TS | null>(null);
  const [loading, setLoading] = useState(false);
  // Período clínico (auditoria: histórico de 6 anos inteiro não deixava isolar o recente).
  const [period, setPeriod] = useState<'all' | '2y' | '1y' | '6m'>('all');
  const PERIODS: { v: 'all' | '2y' | '1y' | '6m'; label: string }[] = [
    { v: '6m', label: '6 meses' }, { v: '1y', label: '1 ano' }, { v: '2y', label: '2 anos' }, { v: 'all', label: 'Todo histórico' },
  ];
  const periodCutoff = period === 'all' ? 0 : Date.now() - (period === '6m' ? 182 : period === '1y' ? 365 : 730) * 86400000;
  const visibleTs: TS | null = ts && period !== 'all'
    ? { ...ts, points: ts.points.filter((p) => new Date(p.performedAt ?? 0).getTime() >= periodCutoff) }
    : ts;

  const authHeaders = { Authorization: `Bearer ${token}` } as const;

  useEffect(() => {
    setNames([]); setSel(''); setTs(null);
    fetch(`${API_URL}/doctor/patients/${patientId}/items/distinct-names`, { headers: authHeaders })
      .then((r) => (r.ok ? r.json() : []))
      .then(setNames)
      .catch(() => setNames([]));
  }, [patientId, token]);

  useEffect(() => {
    if (!sel) { setTs(null); return; }
    setLoading(true);
    const q = new URLSearchParams({ nameCanonical: sel });
    fetch(`${API_URL}/doctor/patients/${patientId}/items/timeseries?${q}`, { headers: authHeaders })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTs(d))
      .catch(() => setTs(null))
      .finally(() => setLoading(false));
  }, [sel, patientId, token]);

  const data = (ts?.points ?? []).map((p) => ({
    name: p.performedAt ? new Date(p.performedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 's/d',
    valor: p.valueNumeric, flag: p.flag, title: p.title,
  }));

  // Tooltip premium (mostra data + valor + unidade + flag)
  const TooltipBox = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <Box sx={{ bgcolor: alpha(theme.palette.background.paper, 0.92), color: theme.palette.text.primary, p: 1.25, borderRadius: '12px', boxShadow: theme.shadows[4], minWidth: 120, border: `1px solid ${theme.palette.divider}` }}>
        <Box sx={{ fontWeight: 700, fontSize: 11, opacity: 0.8 }}>{d.name}</Box>
        <Box sx={{ fontSize: 19, fontWeight: 800 }}>{fmtNum(d.valor)} {ts?.unit ? <UnitLabel unit={ts.unit} fontSize="1.19rem" /> : null}</Box>
        {(() => {
          const s = displayStatus(d.flag as string, d.name, ts?.refLow, ts?.refHigh);
          if (s.tone === 'normal') return null;
          const color = s.tone === 'atencao' || s.tone === 'critico' ? theme.palette.error.light : alpha(theme.palette.text.primary, 0.7);
          const arrow = d.flag === 'HIGH' ? '↑ ' : d.flag === 'LOW' ? '↓ ' : s.tone === 'critico' ? '⚠ ' : '';
          return <Box sx={{ color, fontSize: 12, fontWeight: 700 }}>{arrow}{s.label}</Box>;
        })()}
      </Box>
    );
  };

  // Regressão linear simples p/ indicar direção da tendência.
  let predict: { dir: string; months?: number } | null = null;
  const pts = visibleTs?.points ?? [];
  if (pts.length >= 2) {
    const t0 = new Date(pts[0].performedAt ?? Date.now()).getTime();
    const xs = pts.map((p) => (new Date(p.performedAt ?? Date.now()).getTime() - t0) / 86400000);
    const ys = pts.map((p) => p.valueNumeric);
    const n = xs.length, sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
    const sxy = xs.reduce((a, _, i) => a + xs[i] * ys[i], 0), sxx = xs.reduce((a, x) => a + x * x, 0);
    const denom = n * sxx - sx * sx;
    const slope = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
    if (Math.abs(slope) < 0.0001) { predict = { dir: 'stable' }; }
    else {
      const intercept = (sy - slope * sx) / n;
      const dir = slope > 0 ? 'up' : 'down';
      const ref = dir === 'up' ? ts?.refHigh : ts?.refLow;
      if (ref != null && slope !== 0) {
        const daysExit = (ref - intercept) / slope;
        const daysFromNow = daysExit - xs[xs.length - 1];
        if (daysFromNow > 0 && daysFromNow <= 1825) predict = { dir, months: Math.round(daysFromNow / 30) };
        else predict = { dir };
      } else predict = { dir };
    }
  }

  // Valor atual + variação % + range de datas (cabeçalho igual apps de referência)
  const pts2 = visibleTs?.points ?? [];
  const firstPt = pts2[0];
  const lastPt = pts2[pts2.length - 1];
  const pctChange = firstPt && lastPt && firstPt.valueNumeric ? Math.round(((lastPt.valueNumeric - firstPt.valueNumeric) / Math.abs(firstPt.valueNumeric)) * 100) : null;
  const fmt2 = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 's/d');

  // Tendência precisa de ≥2 pontos p/ comparar — esconde analitos com só 1 resultado do dropdown.
  const multi = names.filter((n) => n.count >= 2);

  // AUTO-SELECT: abre já com o 1º analito selecionado (gráfico visível, sem espaço em branco)
  useEffect(() => {
    if (!sel && multi.length > 0) setSel(multi[0].nameCanonical);
  }, [multi.length]);

  const tealMain = theme.palette.primary.main;
  const tealDark = theme.palette.primary.dark;

  return (
    <Box>
      {/* HEADER PREMIUM (teal via token) */}
      <Card sx={{ mb: 2, borderRadius: RADIUS.sectionCard, overflow: 'hidden', background: `linear-gradient(135deg, ${tealMain}, ${tealDark})`, color: theme.palette.primary.contrastText }}>
        <CardContent sx={{ py: 2.5 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: theme.typography.h5.fontFamily }}>📈 Tendências</Typography>
          <Typography sx={{ opacity: 0.9, mt: 0.5, fontSize: 14 }}>Evolução dos marcadores laboratoriais do paciente ao longo do tempo.</Typography>
        </CardContent>
      </Card>

      {/* DROPDOWN + ATALHOS */}
      {multi.length > 0 && (
        <Card sx={{ mb: 2, borderRadius: RADIUS.sectionCard }}><CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
          {/* Desktop: atalhos (máx 6) + dropdown. Mobile: só dropdown (sem parede de chips). */}
          {!isMobile && multi.length > 1 && (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
              {multi.slice(0, 6).map((n) => (
                <Chip key={n.nameCanonical} label={prettyName(n.nameCanonical)} onClick={() => setSel(n.nameCanonical)}
                  color={sel === n.nameCanonical ? 'primary' : 'default'} size="small" title={prettyName(n.nameCanonical)}
                  sx={{ fontWeight: 700, borderRadius: RADIUS.pill, maxWidth: 165, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }} />
              ))}
              {multi.length > 6 && <Chip size="small" variant="outlined" label={`+${multi.length - 6}`} title="Ver todos no seletor abaixo" sx={{ fontWeight: 700, borderRadius: RADIUS.pill }} />}
            </Stack>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
            <FormControl fullWidth size="small">
              <Select value={sel} onChange={(e) => setSel(e.target.value as string)} displayEmpty sx={{ borderRadius: RADIUS.button }}>
                <MenuItem value="" disabled><em>Selecione um marcador ({multi.length})</em></MenuItem>
                {multi.map((n) => <MenuItem key={n.nameCanonical} value={n.nameCanonical}>{prettyName(n.nameCanonical)} ({n.count} exames)</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select value={period} onChange={(e) => setPeriod(e.target.value as 'all' | '2y' | '1y' | '6m')} sx={{ borderRadius: RADIUS.button }}>
                {PERIODS.map((p) => <MenuItem key={p.v} value={p.v}>{p.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
        </CardContent></Card>
      )}

      {/* EMPTY STATE (sem dados) */}
      {!sel && multi.length === 0 && (
        <Card sx={{ borderRadius: RADIUS.card, textAlign: 'center', py: 5 }}>
          <CardContent>
            <Box sx={{ fontSize: 56, mb: 1 }}>📊</Box>
            <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.5 }}>
              Sem marcadores com histórico suficiente
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 340, mx: 'auto' }}>
              Sem marcadores com histórico suficiente para tendências. São necessários pelo menos dois resultados do mesmo analito em datas diferentes para mostrar a evolução.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* LOADING */}
      {loading && <Card sx={{ borderRadius: RADIUS.sectionCard }}><CardContent><ListSkeleton count={4} /></CardContent></Card>}

            {/* GRÁFICO + DETALHES — primitiva compartilhada (dedup paciente↔médico). */}
      {!loading && visibleTs && visibleTs.points.length > 0 && (
        <TrendsChart ts={visibleTs} />
      )}
      {!loading && visibleTs && visibleTs.points.length === 0 && sel && (
        <Card sx={{ borderRadius: RADIUS.sectionCard, textAlign: 'center', py: 4 }}>
          <CardContent><Typography color="text.secondary">Sem pontos numéricos para este analito.</Typography></CardContent>
        </Card>
      )}
    </Box>
  );
};
