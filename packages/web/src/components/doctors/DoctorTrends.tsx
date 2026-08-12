import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, MenuItem, Select, FormControl, Stack, Chip, useMediaQuery, useTheme, alpha } from '@mui/material';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea } from 'recharts';
import { API_URL } from '../../config';
import { ListSkeleton } from '../Skeleton';
import { Flag } from '../Flag';
import { displayStatus } from '../../utils/examStatus';
import { ExplainButton } from '../ExplainItem';
import { UnitLabel } from '../UnitLabel';
import { RADIUS } from '../../theme';
import type { Theme } from '@mui/material/styles';

import type { TimeSeriesByName as TS } from '@meus-exames/shared';

/** Title Case pra exibição (ALL CAPS → legível): "CAPACIDADE_LATENTE" → "Capacidade Latente". */
const prettyName = (n: string) => (n || '').toLowerCase().replace(/_/g, ' ').replace(/(^|\s)\w/g, (m) => m.toUpperCase());

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
  const pts = ts?.points ?? [];
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
  const pts2 = ts?.points ?? [];
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
          <FormControl fullWidth size="small">
            <Select value={sel} onChange={(e) => setSel(e.target.value as string)} displayEmpty sx={{ borderRadius: RADIUS.button }}>
              <MenuItem value="" disabled><em>Selecione um marcador ({multi.length})</em></MenuItem>
              {multi.map((n) => <MenuItem key={n.nameCanonical} value={n.nameCanonical}>{prettyName(n.nameCanonical)} ({n.count} exames)</MenuItem>)}
            </Select>
          </FormControl>
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

      {/* GRÁFICO + DETALHES */}
      {!loading && ts && ts.points.length > 0 && (
        <Card sx={{ borderRadius: RADIUS.sectionCard }}><CardContent sx={{ p: { xs: 1.5, md: 3 } }}>
          {/* Título do analito + botão explicar — minWidth:0 + truncation evita cortar o nome no mobile. */}
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: tealDark, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prettyName(ts.nameCanonical)}</Typography>
            <ExplainButton name={ts.nameCanonical} nameCanonical={ts.nameCanonical} />
          </Stack>

          {/* Cabeçalho empilhado (hierarquia clara, não comprimido): valor → tendência → última data → referência. */}
          <Box sx={{ mb: 1.5, minWidth: 0 }}>
            <Stack direction="row" alignItems="baseline" spacing={1.25} flexWrap="wrap" sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: predict?.dir === 'up' ? theme.palette.error.dark : predict?.dir === 'down' ? theme.palette.info.dark : tealDark }}>
                {fmtNum(lastPt?.valueNumeric)} {ts?.unit ? <UnitLabel unit={ts.unit} fontSize="1.875rem" /> : null}
              </Typography>
              {pctChange != null && pctChange !== 0 && (
                <Typography sx={{ fontWeight: 700, color: pctChange > 0 ? theme.palette.error.dark : theme.palette.info.dark }}>
                  {pctChange > 0 ? '↑' : '↓'} {Math.abs(pctChange)}%
                </Typography>
              )}
            </Stack>
            {/* Tendência em TEXTO + seta (não depende só de cor). */}
            <Typography sx={{ fontWeight: 700, mt: 0.25, color: predict?.dir === 'up' ? theme.palette.error.dark : predict?.dir === 'down' ? theme.palette.info.dark : theme.palette.success.dark }}>
              {predict?.dir === 'up' ? '↑ Tendência de alta' : predict?.dir === 'down' ? '↓ Tendência de queda' : '→ Estável'} · {data.length} {data.length === 1 ? 'medição' : 'medições'}
            </Typography>
            {lastPt && (
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>Última medição: <strong>{fmt2(lastPt.performedAt)}</strong></Typography>
            )}
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {(ts?.refLow != null && ts?.refHigh != null)
                ? `Referência: ${ts.refLow}–${ts.refHigh}${ts?.unit ? ` ${ts.unit}` : ''}`
                : (ts?.refLow != null || ts?.refHigh != null)
                  ? `Referência: ${ts.refLow ?? ts.refHigh}${ts?.unit ? ` ${ts.unit}` : ''}`
                  : 'Sem faixa de referência informada'}
            </Typography>
          </Box>

          {/* Gráfico — linha teal + área verde (faixa de referência) */}
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

          {/* Previsão de sair da faixa (linar) — informativo, médico valida */}
          {predict && predict.dir !== 'stable' && predict.months && (
            <Box sx={{ mt: 2, p: 1.5, borderRadius: '12px', background: predict.dir === 'up' ? alpha(theme.palette.error.dark, 0.08) : alpha(theme.palette.info.dark, 0.08), border: `1px solid ${predict.dir === 'up' ? alpha(theme.palette.error.dark, 0.2) : alpha(theme.palette.info.dark, 0.2)}` }}>
              <Typography sx={{ fontWeight: 700, color: predict.dir === 'up' ? theme.palette.error.dark : theme.palette.info.dark }}>📈 Tendência: {predict.dir === 'up' ? 'subindo' : 'caindo'}</Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>Neste ritmo, {ts?.nameCanonical} {predict.dir === 'up' ? 'ultrapassa' : 'fica abaixo de'} a faixa em <strong>~{predict.months} {predict.months === 1 ? 'mês' : 'meses'}</strong>.</Typography>
            </Box>
          )}
          {predict && predict.dir === 'stable' && (
            <Box sx={{ mt: 2, p: 1.5, borderRadius: '12px', background: alpha(theme.palette.success.main, 0.08) }}>
              <Typography sx={{ color: theme.palette.success.dark, fontWeight: 600 }}>✅ Tendência estável.</Typography>
            </Box>
          )}

          {/* Pontos (histórico) — card compacto por ponto: data | título truncado | valor+flag */}
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
                    <Typography sx={{ fontWeight: 800 }}>{fmtNum(d.valor)} {ts?.unit ? <UnitLabel unit={ts.unit} /> : null}</Typography>
                    <Flag flag={d.flag} name={d.name} refLow={ts?.refLow} refHigh={ts?.refHigh} />
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>
        </CardContent></Card>
      )}
      {!loading && ts && ts.points.length === 0 && sel && (
        <Card sx={{ borderRadius: RADIUS.sectionCard, textAlign: 'center', py: 4 }}>
          <CardContent><Typography color="text.secondary">Sem pontos numéricos para este analito.</Typography></CardContent>
        </Card>
      )}
    </Box>
  );
};
