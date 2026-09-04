import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useNotify } from 'react-admin';
import { Box, Stack, Typography, ToggleButtonGroup, ToggleButton, Chip, IconButton, Button, Alert } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip, ReferenceLine } from 'recharts';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { AppCard } from '../components/AppCard';
import { ListSkeleton } from '../components/Skeleton';
import { confirmDialog } from '../components/ConfirmDialog';
import { TYPES } from './Measurements';

/**
 * Histórico por métrica (/medicoes/historico/:type) — detalhe da "central de sinais".
 * SUB-ROTA (não dialog): o back-gesture/botão voltar do Android funciona nativo
 * (history pop), e gráfico + períodos + tabela diária não cabem num dialog 360×640
 * sem virar scroll-trap. Precedentes de param route: /convite/:token, /suporte/:id.
 *
 * Princípios: o gráfico usa série DEDUP por dia (1 valor/dia); a tabela lista TODAS as
 * rows (manuais + Health Connect convivem no mesmo dia — proveniência visível). FC não
 * tem faixa "normal" (a IA não diagnostica) — só a média do período como referência.
 */
type Period = 'today' | '7d' | '30d' | '90d';
const PERIODS: Array<{ v: Period; l: string; days: number }> = [
  { v: 'today', l: 'Hoje', days: 1 },
  { v: '7d', l: '7 dias', days: 7 },
  { v: '30d', l: '30 dias', days: 30 },
  { v: '90d', l: '90 dias', days: 90 },
];

const fmtDate = (d: string) => new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const fmtVal = (m: any) => m.valueSecondary != null ? `${m.value}/${m.valueSecondary}` : `${m.value}`;

export const MeasurementHistoryPage = () => {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const notify = useNotify();
  const theme = useTheme();
  const [pid] = useSelectedPatient();
  const [rows, setRows] = useState<any[] | null>(null);
  const [period, setPeriod] = useState<Period>('30d');

  const t = TYPES.find((x) => x.v === type);

  const load = async () => {
    if (!pid || !t) { setRows([]); return; }
    const r = await fetch(`${API_URL}/measurements?patientId=${pid}&type=${t.v}&take=400`, { headers: { Authorization: `Bearer ${token()}` } });
    setRows(r.ok ? await r.json() : []);
  };
  useEffect(() => { setRows(null); load(); /* eslint-disable-next-line */ }, [pid, type]);

  const del = async (id: string) => {
    if (!(await confirmDialog({ title: 'Excluir medição', message: 'Apagar esta medição do histórico?', confirmLabel: 'Excluir' }))) return;
    await fetch(`${API_URL}/measurements/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    load();
  };

  // Série do GRÁFICO: dedup por dia (valor mais recente do dia) — 1 ponto/dia.
  const series = useMemo(() => {
    if (!rows) return [];
    const per = new Map<string, any>();
    for (const m of [...rows].sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime())) {
      const key = String(m.measuredAt).slice(0, 10);
      if (!per.has(key)) per.set(key, m);
    }
    return [...per.entries()].map(([date, m]) => ({ date, value: Number(m.value) })).sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [rows]);

  const daysN = PERIODS.find((p) => p.v === period)!.days;
  const todayISO = new Date().toISOString().slice(0, 10);
  const inWindow = (isoDate: string) => period === 'today'
    ? isoDate.slice(0, 10) === todayISO
    : new Date(`${isoDate.slice(0, 10)}T12:00:00Z`).getTime() >= Date.now() - daysN * 86400000;
  const cur = series.filter((e) => inWindow(e.date));
  const prev = period === 'today' ? [] : series.filter((e) => !inWindow(e.date)).slice(-daysN);
  const avg = (arr: { value: number }[]) => (arr.length ? arr.reduce((s, e) => s + e.value, 0) / arr.length : null);
  const avgCur = avg(cur);
  const avgPrev = avg(prev);
  const deltaPct = avgCur != null && avgPrev && avgPrev > 0 ? Math.round(((avgCur - avgPrev) / avgPrev) * 100) : null;
  const fmt = (n: number) => t?.u === 'km' ? n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : Math.round(n).toLocaleString('pt-BR');

  // Tabela diária: TODAS as rows do período (manuais + HC no mesmo dia convivem).
  const tableRows = useMemo(() => {
    if (!rows) return [];
    return [...rows].filter((m) => inWindow(String(m.measuredAt))).sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime());
  }, [rows, period]);

  if (!t) {
    return (
      <PageContainer width="content" sx={{ pb: { xs: 10, sm: 5 } }}>
        <Alert severity="warning" sx={{ borderRadius: '12px' }}>Métrica desconhecida.</Alert>
        <Button onClick={() => navigate('/medicoes')} sx={{ mt: 2, borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Voltar às medições</Button>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="content" sx={{ pb: { xs: 10, sm: 5 } }}>
      <PageHeader
        icon={<Box sx={{ display: 'inline-flex', color: t.color }}>{t.icon}</Box>}
        title={t.l}
        subtitle={rows ? `${tableRows.length} registro${tableRows.length === 1 ? '' : 's'} no período` : undefined}
        actions={(
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => navigate('/medicoes')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, flexShrink: 0 }}>Registrar</Button>
        )}
      />

      <ToggleButtonGroup
        exclusive
        size="small"
        value={period}
        onChange={(_, v) => { if (v) setPeriod(v as Period); }}
        aria-label="Período do histórico"
        sx={{ mb: 2, '& .MuiToggleButton-root': { px: 1.5, py: { xs: 0.75, sm: 0.4 }, minHeight: { xs: 40, sm: 0 }, borderRadius: '99px !important', border: '1px solid', borderColor: 'divider', textTransform: 'none', fontWeight: 700, fontSize: 13, color: 'text.secondary', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.15), color: 'primary.dark', borderColor: alpha(theme.palette.primary.main, 0.4) } } }}
      >
        {PERIODS.map((p) => <ToggleButton key={p.v} value={p.v} aria-pressed={period === p.v}>{p.l}</ToggleButton>)}
      </ToggleButtonGroup>

      {rows === null && <ListSkeleton count={4} />}

      {rows !== null && rows.length === 0 && (
        <AppCard sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', mb: 0.5 }}>Nenhum registro de {t.l.toLowerCase()}</Typography>
          <Typography color="text.secondary" sx={{ mb: 2, fontSize: 14 }}>
            {t.synced ? 'Os dados chegam pelo Health Connect — abra o app Dr. Exame no celular para sincronizar.' : 'Registre pela página de Medições e a tendência aparece aqui.'}
          </Typography>
          <Button size="small" variant="outlined" onClick={() => navigate('/medicoes')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Ir às medições</Button>
        </AppCard>
      )}

      {rows !== null && rows.length > 0 && (
        <>
          {/* Gráfico do período + média tracejada (sem faixa "normal": métricas de sinais
              não têm range clínico único — a IA informa, não diagnostica). */}
          {cur.length >= 2 && (
            <AppCard sx={{ p: 2, mb: 2 }}>
              <Box sx={{ height: { xs: 150, sm: 190 }, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cur.map((e) => ({ v: e.value, date: fmtDate(e.date) }))} margin={{ top: 8, right: 10, bottom: 4, left: 8 }}>
                    <YAxis hide domain={['auto', 'auto']} />
                    {avgCur != null && <ReferenceLine y={Math.round(avgCur * 100) / 100} stroke={t.color} strokeDasharray="4 4" strokeOpacity={0.45} ifOverflow="extendDomain" />}
                    <Tooltip
                      cursor={{ stroke: t.color, strokeWidth: 1, strokeDasharray: '4 3' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as { v: number; date: string };
                        return (
                          <Box sx={{ bgcolor: 'background.paper', border: `1px solid ${t.color}`, borderRadius: '8px', px: 1.25, py: 0.75, boxShadow: 2 }}>
                            <Typography sx={{ fontWeight: 800, color: t.color, lineHeight: 1.1 }}>{fmt(d.v)} {t.u}</Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{d.date}</Typography>
                          </Box>
                        );
                      }}
                    />
                    <Line type="monotone" dataKey="v" stroke={t.color} strokeWidth={2.5} dot={{ r: 2.5, fill: t.color, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </AppCard>
          )}

          {/* Stats do período: média · máx · mín · Δ vs período anterior */}
          {cur.length > 0 && (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
              {[
                avgCur != null && { l: 'média', v: fmt(avgCur) },
                { l: 'máx', v: fmt(Math.max(...cur.map((e) => e.value))) },
                { l: 'mín', v: fmt(Math.min(...cur.map((e) => e.value))) },
                deltaPct != null && { l: 'vs período anterior', v: `${deltaPct > 0 ? '+' : ''}${deltaPct}%`, tone: deltaPct > 0 ? '#b45309' : '#047857' },
              ].filter(Boolean).map((s: any) => (
                <Chip key={s.l} size="small" variant="outlined" label={<Box component="span">{s.l}: <strong>{s.v}</strong></Box>} sx={{ height: 26, fontWeight: 600, borderRadius: '999px', borderColor: 'divider', color: s.tone ?? 'text.secondary', '& strong': { color: s.tone ?? 'text.primary' } }} />
              ))}
            </Stack>
          )}

          {/* Tabela diária — a antiga "lista bruta", agora no lugar dela (detalhe). */}
          <AppCard sx={{ p: 0 }}>
            {tableRows.length === 0 ? (
              <Typography sx={{ p: 3, textAlign: 'center', color: 'text.secondary', fontSize: 14 }}>Nenhum registro neste período.</Typography>
            ) : (
              tableRows.map((m) => (
                <Stack key={m.id} direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 'none' } }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 14, color: 'text.primary' }}>
                      {fmtVal(m)} <Typography component="span" sx={{ fontSize: 11, color: 'text.disabled' }}>{m.unit}</Typography>
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                      {new Date(m.measuredAt).toLocaleDateString('pt-BR')}{m.note ? ` — ${m.note}` : ''}
                    </Typography>
                  </Box>
                  <IconButton size="small" aria-label={`Excluir medição de ${t.l} de ${new Date(m.measuredAt).toLocaleDateString('pt-BR')}`} onClick={() => del(m.id)} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))
            )}
          </AppCard>

          <Alert severity="info" icon={false} sx={{ mt: 2, borderRadius: '12px', '& .MuiAlert-message': { fontSize: 13 } }}>
            Estes dados informam, não diagnosticam — converse com seu médico sobre o que significam no seu caso.
          </Alert>
        </>
      )}
    </PageContainer>
  );
};
