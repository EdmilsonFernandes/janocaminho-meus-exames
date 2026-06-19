import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, MenuItem, Select, FormControl, InputLabel, CircularProgress, Stack, Chip, useMediaQuery, useTheme } from '@mui/material';
import { Title } from 'react-admin';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, Legend } from 'recharts';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { Flag } from '../components/Flag';
import { ExplainButton } from '../components/ExplainItem';
import { PremiumGate } from '../components/PremiumGate';

interface TS { nameCanonical: string; unit: string | null; refLow: number | null; refHigh: number | null;
  points: { performedAt: string | null; valueNumeric: number; flag: string; title: string }[]; }

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
        {d.flag && d.flag !== 'NORMAL' && <Box sx={{ color: '#fca5a5', fontSize: 12, fontWeight: 700 }}>{d.flag === 'HIGH' ? '↑ Acima' : d.flag === 'LOW' ? '↓ Abaixo' : d.flag}</Box>}
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

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 980, mx: 'auto' }}>
      <Title title="Tendências" />
      <Card sx={{ borderRadius: 3 }}><CardContent sx={{ p: { xs: 1.5, md: 3 } }}>
        <Typography variant="h6" gutterBottom>Evolução de um analito</Typography>
        <FormControl fullWidth sx={{ minWidth: { xs: 0, sm: 280 }, mb: 1.5 }}>
          <InputLabel>Escolha o exame/analito</InputLabel>
          <Select value={sel} label="Escolha o exame/analito" onChange={(e) => setSel(e.target.value as string)}>
            {names.map((n) => <MenuItem key={n.nameCanonical} value={n.nameCanonical}>{n.nameCanonical} ({n.count})</MenuItem>)}
          </Select>
        </FormControl>

        {!sel && <Typography color="text.secondary">Envie ao menos um exame laboratorial para ver tendências.</Typography>}
        {loading && <CircularProgress />}

        {!loading && ts && ts.points.length > 0 && (
          <>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#178f89' }}>{ts.nameCanonical}</Typography>
              <ExplainButton name={ts.nameCanonical} nameCanonical={ts.nameCanonical} />
            </Stack>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
              <Chip size="small" color="primary" label={`Último: ${data[data.length - 1].valor}${ts.unit ? ' ' + ts.unit : ''}`} />
              {predict?.dir === 'up' && <Chip size="small" color="warning" label="↑ Subindo" />}
              {predict?.dir === 'down' && <Chip size="small" color="info" label="↓ Caindo" />}
              {predict?.dir === 'stable' && <Chip size="small" color="success" label="→ Estável" />}
              {(ts.refLow != null && ts.refHigh != null) && <Chip size="small" variant="outlined" label={`Faixa ${ts.refLow}–${ts.refHigh}`} />}
            </Stack>
            <ResponsiveContainer width="100%" height={isMobile ? 240 : 340}>
              <LineChart data={data} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 10, left: isMobile ? -10 : 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: isMobile ? 10 : 12 }} /><YAxis tick={{ fontSize: isMobile ? 10 : 12 }} /><Tooltip content={<TooltipBox />} />
                {ts.refLow != null && ts.refHigh != null && (
                  <ReferenceArea y1={ts.refLow} y2={ts.refHigh} fill="#2e7d32" fillOpacity={0.12} />
                )}
                <Line type="monotone" dataKey="valor" stroke="#20b2aa" strokeWidth={3} dot={{ r: 5, fill: '#20b2aa' }} activeDot={{ r: 8, stroke: '#fff', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>

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

            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Pontos (do mais recente)</Typography>
              <Stack spacing={0.5}>
                {[...data].reverse().map((d, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{d.name} — <strong>{d.valor}</strong>{ts?.unit ? ` ${ts.unit}` : ''} <Box component="span" sx={{ color: 'text.secondary' }}>({d.title})</Box></Typography>
                    <Flag flag={d.flag} />
                  </Box>
                ))}
              </Stack>
            </Box>
          </>
        )}
        {!loading && ts && ts.points.length === 0 && <Typography color="text.secondary">Sem pontos numéricos.</Typography>}
      </CardContent></Card>
    </Box>
  );
};
