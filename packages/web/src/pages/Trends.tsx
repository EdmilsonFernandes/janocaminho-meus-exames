import { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Typography, MenuItem, Select, FormControl, InputLabel, Stack, Chip, useMediaQuery, useTheme } from '@mui/material';
import { Title } from 'react-admin';
import { PageContainer } from '../components/layout/PageContainer';
import { ListSkeleton } from '../components/Skeleton';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, Legend } from 'recharts';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { useNavigate, useLocation } from 'react-router-dom';
import { Flag } from '../components/Flag';
import { displayStatus } from '../utils/examStatus';
import { ExplainButton } from '../components/ExplainItem';
import { TrendsChart } from '../components/TrendsChart';
import { UnitLabel } from '../components/UnitLabel';
import { PremiumGate } from '../components/PremiumGate';

import type { TimeSeriesByName as TS } from '@meus-exames/shared';

/** Title Case pra exibição (ALL CAPS → legível): "ACIDO URICO" → "Acido Urico". */
const prettyName = (n: string) => {
  if (!n) return '';
  const tokens = n.split(/[_\s]+/);
  return tokens.map((tok) => {
    if (tok.length <= 4 && /^[A-Z0-9]+$/.test(tok) && !['ACIDO', 'URICO', 'BILIRRUBINA', 'DIRETA', 'INDIRETA', 'TOTAL'].includes(tok)) return tok;
    return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
  }).join(' ');
};

/** Valor numérico p/ exibição (4 casas, vírgula decimal) — evita floats longos da conversão (91.33627999...). */
const fmtNum = (n: number | null | undefined) => n == null ? '—' : String(Number(n.toFixed(4))).replace('.', ',');

export const TrendsPage = () => {
  const [pid] = useSelectedPatient();
  const navigate = useNavigate();
  const location = useLocation();
  const queryParamSelect = new URLSearchParams(location.search).get('select');
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
      <Box sx={{ bgcolor: 'rgba(15,23,42,0.92)', color: '#fff', p: 1.25, borderRadius: '12px', boxShadow: 4, minWidth: 120 }}>
        <Box sx={{ fontWeight: 700, fontSize: 11, opacity: 0.8 }}>{d.name}</Box>
        <Box sx={{ fontSize: 19, fontWeight: 800 }}>{fmtNum(d.valor)} {ts?.unit ? <UnitLabel unit={ts.unit} fontSize="1.19rem" /> : null}</Box>
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

  // AUTO-SELECT inteligente (auditoria: default alfabético abria em "Basofilos" — irrelevante).
  // Prioridade: (1) analito recebido no query param ?select=..., (2) 1º marcador ALTERADO, (3) mais medições.
  const [abnNames, setAbnNames] = useState<string[]>([]);
  const [toneByName, setToneByName] = useState<Record<string, 'atencao' | 'critico'>>({});
  useEffect(() => {
    fetch(`${API_URL}/items/abnormal?_start=0&_end=100`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => {
        const items: any[] = d.items ?? [];
        setAbnNames([...new Set(items.map((i) => String(i.nameCanonical)).filter(Boolean))] as string[]);
        // 1º item por nome = mais recente (lista ordenada por data desc) → tom do ÚLTIMO valor
        const tones: Record<string, 'atencao' | 'critico'> = {};
        for (const it of items) {
          const k = String(it.nameCanonical ?? '');
          if (!k || tones[k]) continue;
          const t = displayStatus(String(it.flag ?? ''), k, it.refLow, it.refHigh).tone;
          if (t === 'atencao' || t === 'critico') tones[k] = t;
        }
        setToneByName(tones);
      })
      .catch(() => setAbnNames([]));
  }, []);
  useEffect(() => {
    if (sel || names.length === 0) return;
    if (queryParamSelect && names.some((n) => n.nameCanonical === queryParamSelect)) {
      setSel(queryParamSelect);
      return;
    }
    if (multi.length === 0) return;
    const abn = multi.find((n) => abnNames.includes(n.nameCanonical));
    const best = abn ?? [...multi].sort((a, b) => b.count - a.count)[0];
    setSel(best?.nameCanonical ?? '');
  }, [multi.length, abnNames, queryParamSelect, names, sel]);

  return (
    <PageContainer width="wide" sx={{ pb: { xs: 10, sm: 5 } }}>
      <Title title="Tendências" />

      {/* HEADER PREMIUM */}
      <Card sx={{ mb: 2, borderRadius: '12px', overflow: 'hidden', background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff' }}>
        <CardContent sx={{ py: 2.5 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>📈 Tendências</Typography>
          <Typography sx={{ opacity: 0.9, mt: 0.5, fontSize: 14 }}>Veja como seus resultados evoluíram ao longo do tempo.</Typography>
        </CardContent>
      </Card>

      {/* ATALHOS (chips dos principais analitos) + DROPDOWN */}
      {multi.length > 0 && (
        <Card sx={{ mb: 2, borderRadius: '12px' }}><CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
          {multi.length > 1 && (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
              {multi.slice(0, 10).map((n) => {
                const tone = toneByName[n.nameCanonical];
                return (
                  <Chip key={n.nameCanonical} onClick={() => setSel(n.nameCanonical)}
                    color={sel === n.nameCanonical ? 'primary' : 'default'} size="small" title={prettyName(n.nameCanonical)}
                    label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {tone && <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone === 'critico' ? '#ef4444' : '#f59e0b', boxShadow: `0 0 6px ${tone === 'critico' ? '#ef4444' : '#f59e0b'}66` }} />}
                      {prettyName(n.nameCanonical)}
                    </span>}
                    sx={{ height: 36, fontWeight: 700, borderRadius: '999px', maxWidth: 185, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, '&.MuiChip-colorPrimary': { bgcolor: '#20b2aa', color: '#fff' } }} />
                );
              })}
            </Stack>
          )}
          <FormControl fullWidth size="small">
            <Select value={sel} onChange={(e) => setSel(e.target.value as string)} displayEmpty
              MenuProps={{ PaperProps: { sx: { maxWidth: { sm: 480 }, '& .MuiMenuItem-root': { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } } } }}
              sx={{ borderRadius: '12px', maxWidth: '100%', '& .MuiSelect-select': { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 1 } }}>
              <MenuItem value="" disabled><em>Todos os analitos ({multi.length})</em></MenuItem>
              {multi.map((n) => {
                const tone = toneByName[n.nameCanonical];
                return (
                  <MenuItem key={n.nameCanonical} value={n.nameCanonical}>
                    {tone && <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginRight: 8, background: tone === 'critico' ? '#ef4444' : '#f59e0b' }} />}
                    {prettyName(n.nameCanonical)} ({n.count} exames)
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        </CardContent></Card>
      )}

      {/* EMPTY STATE (sem dados) */}
      {!sel && multi.length === 0 && (
        <Card sx={{ borderRadius: '12px', textAlign: 'center', py: 5 }}>
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
            <Button variant="contained" onClick={() => navigate('/exams/create')} sx={{ mt: 2, borderRadius: '999px', textTransform: 'none', fontWeight: 800 }}>{names.length === 0 ? 'Enviar exame' : 'Enviar outro exame'}</Button>
          </CardContent>
        </Card>
      )}

      {/* LOADING */}
      {loading && <Card sx={{ borderRadius: '12px' }}><CardContent><ListSkeleton count={4} /></CardContent></Card>}

            {/* GRÁFICO + DETALHES — primitiva compartilhada (dedup paciente↔médico). */}
      {!loading && ts && ts.points.length > 0 && (
        <TrendsChart ts={ts} />
      )}
      {!loading && ts && ts.points.length === 0 && sel && (
        <Card sx={{ borderRadius: '12px', textAlign: 'center', py: 4 }}>
          <CardContent><Typography color="text.secondary">Sem pontos numéricos para este analito.</Typography></CardContent>
        </Card>
      )}
    </PageContainer>
  );
};
