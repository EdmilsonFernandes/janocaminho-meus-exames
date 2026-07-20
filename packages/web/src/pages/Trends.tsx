import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, MenuItem, Select, FormControl, InputLabel, CircularProgress, Stack, Chip, useMediaQuery, useTheme } from '@mui/material';
import { Title } from 'react-admin';
import { PageContainer } from '../components/layout/PageContainer';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, Legend } from 'recharts';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { Flag } from '../components/Flag';
import { displayStatus } from '../utils/examStatus';
import { ExplainButton } from '../components/ExplainItem';
import { PremiumGate } from '../components/PremiumGate';

import type { TimeSeriesByName as TS } from '@meus-exames/shared';

/** Title Case pra exibição (ALL CAPS → legível): "CAPACIDADE_LATENTE" → "Capacidade Latente". */
const prettyName = (n: string) => (n || '').toLowerCase().replace(/_/g, ' ').replace(/(^|\s)\w/g, (m) => m.toUpperCase());

export const TrendsPage = () => {
  const [pid] = useSelectedPatient();
  const [names, setNames] = useState<{ nameCanonical: string; count: number }[]>([]);
  const [sel, setSel] = useState('');
  const [ts, setTs] = useState<TS | null>(null);
  const [loading, setLoading] = useState(false);
  const theme = useTheme() as any;
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    fetch(`${API_URL}/items/distinct-names${pid ? `?patientId=${pid}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then(setNames).catch(() => setNames([]));
  }, [pid]);

  useEffect(() => {
    if (!sel) return;
    setLoading(true);
    const q = new URLSearchParams({ nameCanonical: sel, ...(pid ? { patientId: pid } : {}) });
    fetch(`${API_URL}/items/timeseries?${q}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => setTs(d)).finally(() => setLoading(false));
  }, [sel, pid]);

  const data = (ts?.points ?? []).map((p) => ({
    name: p.performedAt ? new Date(p.performedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 's/d',
    valor: p.valueNumeric, flag: p.flag, title: p.title,
  }));

  // Tooltip premium (mostra data + valor + unidade + flag)
  const TooltipBox = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <Box sx={{ bgcolor: 'rgba(15,23,42,0.92)', color: '#fff', p: 1.25, borderRadius: 2, boxShadow: 4, minWidth: 120 }}>
        <Box sx={{ fontWeight: 700, fontSize: 11, opacity: 0.8 }}>{d.name}</Box>
        <Box sx={{ fontSize: 19, fontWeight: 800 }}>{d.valor}{ts?.unit ? ` ${ts.unit}` : ''}</Box>
        {(() => {
          const s = displayStatus(d.flag as string, d.name, ts?.refLow, ts?.refHigh);
          if (s.tone === 'normal') return null;
          const color = s.tone === 'atencao' || s.tone === 'critico' ? '#fca5a5' : 'rgba(255,255,255,.7)';
          const arrow = d.flag === 'HIGH' ? '↑ ' : d.flag === 'LOW' ? '↓ ' : s.tone === 'critico' ? '⚠ ' : '';
          return <Box sx={{ color, fontSize: 12, fontWeight: 700 }}>{arrow}{s.label}</Box>;
        })()}
      </Box>
    );
  };

  let predict: { dir: string; months?: number } | null = null;
  const pts = ts?.points ?? [];
  if (pts.length >= 2) {
    const t0 = new Date(pts[0].performedAt ?? Date.now()).getTime();
    const xs = pts.map((p) => (new Date(p.performedAt ?? Date.now()).getTime() - t0) / 86400000);
    const ys = pts.map((p) => p.valueNumeric);
    const n = xs.length, sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
    const sxy = xs.reduce((a, _, i) => a + xs[i] * ys[i], 0), sxx = xs.reduce((a, x) => a + x * x, 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    if (Math.abs(slope) < 0.0001) { predict = { dir: 'stable' }; }
    else {
      const intercept = (sy - slope * sx) / n;
      const dir = slope > 0 ? 'up' : 'down';
      const ref = dir === 'up' ? ts?.refHigh : ts?.refLow;
      if (ref != null) {
        const daysExit = (ref - intercept) / slope;
        const daysFromNow = daysExit - xs[xs.length - 1];
        if (daysFromNow > 0 && daysFromNow <= 1825) predict = { dir, months: Math.round(daysFromNow / 30) };
        else predict = { dir };
      } else predict = { dir };
    }
  }

  // Valor atual + variação % + range de datas (cabeçalho igual apps de referência: valor grande + %change + range)
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

  return (
    <PageContainer width="wide">
      <Title title="Tendências" />

      {/* HEADER PREMIUM */}
      <Card sx={{ mb: 2, borderRadius: 4, overflow: 'hidden', background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff' }}>
        <CardContent sx={{ py: 2.5 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>📈 Tendências</Typography>
          <Typography sx={{ opacity: 0.9, mt: 0.5, fontSize: 14 }}>Veja como seus resultados evoluíram ao longo do tempo.</Typography>
        </CardContent>
      </Card>

      {/* ATALHOS (chips dos principais analitos) + DROPDOWN */}
      {multi.length > 0 && (
        <Card sx={{ mb: 2, borderRadius: 3 }}><CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
          {multi.length > 1 && (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
              {multi.slice(0, 10).map((n) => (
                <Chip key={n.nameCanonical} label={prettyName(n.nameCanonical)} onClick={() => setSel(n.nameCanonical)}
                  color={sel === n.nameCanonical ? 'primary' : 'default'} size="small" title={prettyName(n.nameCanonical)}
                  sx={{ fontWeight: 700, borderRadius: 99, maxWidth: 165, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, '&.MuiChip-colorPrimary': { bgcolor: '#20b2aa', color: '#fff' } }} />
              ))}
            </Stack>
          )}
          <FormControl fullWidth size="small">
            <Select value={sel} onChange={(e) => setSel(e.target.value as string)} displayEmpty sx={{ borderRadius: 2 }}>
              <MenuItem value="" disabled><em>Todos os analitos ({multi.length})</em></MenuItem>
              {multi.map((n) => <MenuItem key={n.nameCanonical} value={n.nameCanonical}>{prettyName(n.nameCanonical)} ({n.count} exames)</MenuItem>)}
            </Select>
          </FormControl>
        </CardContent></Card>
      )}

      {/* EMPTY STATE (sem dados) */}
      {!sel && multi.length === 0 && (
        <Card sx={{ borderRadius: 4, textAlign: 'center', py: 5 }}>
          <CardContent>
            <Box sx={{ fontSize: 56, mb: 1 }}>📊</Box>
            <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.5 }}>
              {names.length === 0 ? 'Nada pra comparar ainda' : 'Quase lá!'}
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 340, mx: 'auto' }}>
              {names.length === 0
                ? 'Envie ao menos um exame laboratorial para começar a acompanhar suas tendências.'
                : 'Você já tem exames, mas precisa de um 2º resultado do mesmo tipo para comparar a evolução.'}
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* LOADING */}
      {loading && <Card sx={{ borderRadius: 3, textAlign: 'center', py: 6 }}><CardContent><CircularProgress sx={{ color: '#20b2aa' }} /></CardContent></Card>}

      {/* GRÁFICO + DETALHES */}
      {!loading && ts && ts.points.length > 0 && (
        <Card sx={{ borderRadius: 3 }}><CardContent sx={{ p: { xs: 1.5, md: 3 } }}>
          {/* Título do analito + botão explicar */}
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#178f89' }}>{prettyName(ts.nameCanonical)}</Typography>
            <ExplainButton name={ts.nameCanonical} nameCanonical={ts.nameCanonical} />
          </Stack>

          {/* Cabeçalho (igual apps de referência): valor atual grande + variação % + range de datas + resumo da tendência */}
          <Box sx={{ mb: 1.5 }}>
            <Stack direction="row" alignItems="baseline" spacing={1.25} flexWrap="wrap">
              <Typography sx={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: predict?.dir === 'up' ? '#e65100' : predict?.dir === 'down' ? '#0b5cab' : '#178f89' }}>
                {lastPt?.valueNumeric ?? '—'}{ts?.unit ? ` ${ts.unit}` : ''}
              </Typography>
              {pctChange != null && pctChange !== 0 && (
                <Typography sx={{ fontWeight: 700, color: pctChange > 0 ? '#e65100' : '#0b5cab' }}>
                  {pctChange > 0 ? '↑' : '↓'} {Math.abs(pctChange)}%
                </Typography>
              )}
            </Stack>
            {firstPt && lastPt && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {firstPt.valueNumeric}{ts?.unit ? ` ${ts.unit}` : ''} ({fmt2(firstPt.performedAt)}) → {lastPt.valueNumeric}{ts?.unit ? ` ${ts.unit}` : ''} ({fmt2(lastPt.performedAt)})
              </Typography>
            )}
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {predict?.dir === 'up' ? 'Subindo' : predict?.dir === 'down' ? 'Caindo' : 'Estável'} em {data.length} {data.length === 1 ? 'medição' : 'medições'}.
              {(ts?.refLow != null && ts?.refHigh != null)
                ? ` Faixa de referência: ${ts.refLow}–${ts.refHigh}${ts?.unit ? ` ${ts.unit}` : ''}.`
                : (ts?.refLow != null || ts?.refHigh != null)
                  ? ` Faixa de referência: ${ts.refLow ?? ts.refHigh}${ts?.unit ? ` ${ts.unit}` : ''}.`
                  : ' Sem faixa de referência informada pelo laboratório.'}
            </Typography>
          </Box>

          {/* Gráfico */}
          <ResponsiveContainer width="100%" height={isMobile ? 240 : 340}>
            <LineChart data={data} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 10, left: isMobile ? -10 : 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
              <XAxis dataKey="name" interval="preserveStartEnd" minTickGap={8} tickFormatter={(v: string) => (isMobile ? String(v).slice(0, 5) : v)} tick={{ fontSize: isMobile ? 10 : 12, fill: theme.palette.text.secondary }} axisLine={{ stroke: theme.palette.divider }} />
              <YAxis tick={{ fontSize: isMobile ? 10 : 12, fill: theme.palette.text.secondary }} axisLine={{ stroke: theme.palette.divider }} />
              <Tooltip content={<TooltipBox />} />
              {ts.refLow != null && ts.refHigh != null && (
                <ReferenceArea y1={ts.refLow} y2={ts.refHigh} fill="#22c55e" fillOpacity={0.08} />
              )}
              <Line type="monotone" dataKey="valor" stroke="#20b2aa" strokeWidth={3} dot={{ r: 5, fill: '#20b2aa', strokeWidth: 0 }} activeDot={{ r: 8, stroke: '#fff', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>

          {/* Previsão (premium) */}
          {predict && predict.dir !== 'stable' && predict.months && (
            <PremiumGate>
              <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, background: predict.dir === 'up' ? 'rgba(230,81,0,.08)' : 'rgba(11,92,171,.08)', border: `1px solid ${predict.dir === 'up' ? '#e6510033' : '#0b5cab33'}` }}>
                <Typography sx={{ fontWeight: 700, color: predict.dir === 'up' ? '#e65100' : '#0b5cab' }}>📈 Tendência: {predict.dir === 'up' ? 'subindo' : 'caindo'}</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>Neste ritmo, {ts?.nameCanonical} {predict.dir === 'up' ? 'ultrapassa' : 'fica abaixo de'} a faixa em <strong>~{predict.months} {predict.months === 1 ? 'mês' : 'meses'}</strong>.</Typography>
              </Box>
            </PremiumGate>
          )}
          {predict && predict.dir === 'stable' && (
            <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, background: 'rgba(46,125,50,.08)' }}>
              <Typography sx={{ color: '#2e7d32', fontWeight: 600 }}>✅ Tendência estável.</Typography>
            </Box>
          )}

          {/* Pontos (histórico) — card compacto por ponto: data | título truncado | valor+flag */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Histórico (do mais recente)</Typography>
            <Stack spacing={0.5}>
              {[...data].reverse().map((d, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 0.75, borderRadius: 1.5, bgcolor: 'action.hover' }}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{d.name}</Typography>
                    {d.title && (
                      <Typography variant="caption" title={d.title} sx={{ color: 'text.secondary', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.title}</Typography>
                    )}
                  </Box>
                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flexShrink: 0 }}>
                    <Typography sx={{ fontWeight: 800 }}>{d.valor}{ts?.unit ? ` ${ts.unit}` : ''}</Typography>
                    <Flag flag={d.flag} name={d.name} refLow={ts?.refLow} refHigh={ts?.refHigh} />
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>
        </CardContent></Card>
      )}
      {!loading && ts && ts.points.length === 0 && sel && (
        <Card sx={{ borderRadius: 3, textAlign: 'center', py: 4 }}>
          <CardContent><Typography color="text.secondary">Sem pontos numéricos para este analito.</Typography></CardContent>
        </Card>
      )}
    </PageContainer>
  );
};
