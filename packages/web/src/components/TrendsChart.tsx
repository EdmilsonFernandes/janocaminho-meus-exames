import { Card, CardContent, Box, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea } from 'recharts';
import { displayStatus } from '../utils/examStatus';
import { ExplainButton } from './ExplainItem';
import { UnitLabel } from './UnitLabel';
import { Flag } from './Flag';
import { RADIUS } from '../theme';
import type { Theme } from '@mui/material/styles';
import type { TimeSeriesByName as TS } from '@meus-exames/shared';

/**
 * TrendsChart — card de tendência de um marcador (primitiva compartilhada).
 *
 * Dedup do gráfico de Tendências, que era ~80% copy-paste entre pages/Trends.tsx
 * (paciente) e components/doctors/DoctorTrends.tsx (médico). Ambos buscam o `ts`
 * (TimeSeriesByName) à sua maneira e renderizam <TrendsChart ts={ts} />.
 *
 * Contém: regressão linear (predict), variação %, tooltip premium, header empilhado
 * (valor → tendência → última data → referência), gráfico recharts responsivo (minWidth:0,
 * sem margin negativa → nunca sangra nem corta), previsão de sair da faixa, histórico.
 *
 * Puro: sem fetch, sem hooks de app (react-admin/patient-context). Só recebe `ts`.
 */
const prettyName = (n: string) => (n || '').toLowerCase().replace(/_/g, ' ').replace(/(^|\s)\w/g, (m) => m.toUpperCase());
const fmtNum = (n: number | null | undefined) => n == null ? '—' : String(Number(n.toFixed(4))).replace('.', ',');
const fmt2 = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 's/d');

export const TrendsChart = ({ ts }: { ts: TS }) => {
  const theme = useTheme<Theme>();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const tealMain = theme.palette.primary.main;
  const tealDark = theme.palette.primary.dark;

  const data = (ts.points ?? []).map((p) => ({
    name: p.performedAt ? new Date(p.performedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 's/d',
    valor: p.valueNumeric, flag: p.flag, title: p.title,
  }));

  const TooltipBox = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <Box sx={{ bgcolor: alpha(theme.palette.background.paper, 0.92), color: theme.palette.text.primary, p: 1.25, borderRadius: '12px', boxShadow: theme.shadows[4], minWidth: 120, border: `1px solid ${theme.palette.divider}` }}>
        <Box sx={{ fontWeight: 700, fontSize: 11, opacity: 0.8 }}>{d.name}</Box>
        <Box sx={{ fontSize: 19, fontWeight: 800 }}>{fmtNum(d.valor)} {ts.unit ? <UnitLabel unit={ts.unit} fontSize="1.19rem" /> : null}</Box>
        {(() => {
          const s = displayStatus(d.flag as string, d.name, ts.refLow, ts.refHigh);
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
  const pts = ts.points ?? [];
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
      const ref = dir === 'up' ? ts.refHigh : ts.refLow;
      if (ref != null && slope !== 0) {
        const daysExit = (ref - intercept) / slope;
        const daysFromNow = daysExit - xs[xs.length - 1];
        if (daysFromNow > 0 && daysFromNow <= 1825) predict = { dir, months: Math.round(daysFromNow / 30) };
        else predict = { dir };
      } else predict = { dir };
    }
  }

  const firstPt = pts[0];
  const lastPt = pts[pts.length - 1];
  const pctChange = firstPt && lastPt && firstPt.valueNumeric ? Math.round(((lastPt.valueNumeric - firstPt.valueNumeric) / Math.abs(firstPt.valueNumeric)) * 100) : null;

  return (
    <Card sx={{ borderRadius: RADIUS.sectionCard }}><CardContent sx={{ p: { xs: 1.5, md: 3 } }}>
      {/* Título do analito — minWidth:0 + truncation evita cortar o nome no mobile. */}
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, color: tealDark, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prettyName(ts.nameCanonical)}</Typography>
        <ExplainButton name={ts.nameCanonical} nameCanonical={ts.nameCanonical} />
      </Stack>

      {/* Cabeçalho empilhado: valor → tendência → última data → referência. */}
      <Box sx={{ mb: 1.5, minWidth: 0 }}>
        <Stack direction="row" alignItems="baseline" spacing={1.25} flexWrap="wrap" sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: predict?.dir === 'up' ? theme.palette.error.dark : predict?.dir === 'down' ? theme.palette.info.dark : tealDark }}>
            {fmtNum(lastPt?.valueNumeric)} {ts.unit ? <UnitLabel unit={ts.unit} fontSize="1.875rem" /> : null}
          </Typography>
          {pctChange != null && pctChange !== 0 && (
            <Typography sx={{ fontWeight: 700, color: pctChange > 0 ? theme.palette.error.dark : theme.palette.info.dark }}>
              {pctChange > 0 ? '↑' : '↓'} {Math.abs(pctChange)}%
            </Typography>
          )}
        </Stack>
        <Typography sx={{ fontWeight: 700, mt: 0.25, color: predict?.dir === 'up' ? theme.palette.error.dark : predict?.dir === 'down' ? theme.palette.info.dark : theme.palette.success.dark }}>
          {predict?.dir === 'up' ? '↑ Tendência de alta' : predict?.dir === 'down' ? '↓ Tendência de queda' : '→ Estável'} · {data.length} {data.length === 1 ? 'medição' : 'medições'}
        </Typography>
        {lastPt && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>Última medição: <strong>{fmt2(lastPt.performedAt)}</strong></Typography>
        )}
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {(ts.refLow != null && ts.refHigh != null)
            ? `Referência: ${ts.refLow}–${ts.refHigh}${ts.unit ? ` ${ts.unit}` : ''}`
            : (ts.refLow != null || ts.refHigh != null)
              ? `Referência: ${ts.refLow ?? ts.refHigh}${ts.unit ? ` ${ts.unit}` : ''}`
              : 'Sem faixa de referência informada'}
        </Typography>
      </Box>

      {/* Gráfico — linha teal + área verde (faixa de referência). Sem margin negativa (não sangra). */}
      <ResponsiveContainer width="100%" height={isMobile ? 240 : 340}>
        <LineChart data={data} margin={{ top: 10, right: isMobile ? 12 : 20, bottom: 10, left: isMobile ? 0 : 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
          <XAxis dataKey="name" interval="preserveStartEnd" minTickGap={8} tickFormatter={(v: string) => (isMobile ? String(v).slice(0, 5) : v)} tick={{ fontSize: isMobile ? 10 : 12, fill: theme.palette.text.secondary }} axisLine={{ stroke: theme.palette.divider }} />
          <YAxis tick={{ fontSize: isMobile ? 10 : 12, fill: theme.palette.text.secondary }} axisLine={{ stroke: theme.palette.divider }} />
          <Tooltip content={<TooltipBox />} />
          {ts.refLow != null && ts.refHigh != null && (
            <ReferenceArea y1={ts.refLow} y2={ts.refHigh} fill={theme.palette.success.main} fillOpacity={0.08} />
          )}
          <Line type="monotone" dataKey="valor" stroke={tealMain} strokeWidth={3} dot={{ r: 5, fill: tealMain, strokeWidth: 0 }} activeDot={{ r: 8, stroke: theme.palette.background.paper, strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>

      {/* Previsão de sair da faixa (linear) — informativo, médico valida. */}
      {predict && predict.dir !== 'stable' && predict.months && (
        <Box sx={{ mt: 2, p: 1.5, borderRadius: '12px', background: predict.dir === 'up' ? alpha(theme.palette.error.dark, 0.08) : alpha(theme.palette.info.dark, 0.08), border: `1px solid ${predict.dir === 'up' ? alpha(theme.palette.error.dark, 0.2) : alpha(theme.palette.info.dark, 0.2)}` }}>
          <Typography sx={{ fontWeight: 700, color: predict.dir === 'up' ? theme.palette.error.dark : theme.palette.info.dark }}>📈 Tendência: {predict.dir === 'up' ? 'subindo' : 'caindo'}</Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>Neste ritmo, {ts.nameCanonical} {predict.dir === 'up' ? 'ultrapassa' : 'fica abaixo de'} a faixa em <strong>~{predict.months} {predict.months === 1 ? 'mês' : 'meses'}</strong>.</Typography>
        </Box>
      )}
      {predict && predict.dir === 'stable' && (
        <Box sx={{ mt: 2, p: 1.5, borderRadius: '12px', background: alpha(theme.palette.success.main, 0.08) }}>
          <Typography sx={{ color: theme.palette.success.dark, fontWeight: 600 }}>✅ Tendência estável.</Typography>
        </Box>
      )}

      {/* Histórico (do mais recente). */}
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Histórico (do mais recente)</Typography>
        <Stack spacing={0.5}>
          {[...data].reverse().map((d, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 0.75, borderRadius: '8px', bgcolor: 'action.hover' }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{d.name}</Typography>
                {d.title && (
                  <Typography variant="caption" title={d.title} sx={{ color: 'text.secondary', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.title}</Typography>
                )}
              </Box>
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flexShrink: 0 }}>
                <Typography sx={{ fontWeight: 800 }}>{fmtNum(d.valor)} {ts.unit ? <UnitLabel unit={ts.unit} /> : null}</Typography>
                <Flag flag={d.flag} name={d.name} refLow={ts.refLow} refHigh={ts.refHigh} />
              </Stack>
            </Box>
          ))}
        </Stack>
      </Box>
    </CardContent></Card>
  );
};
