import { useEffect, useState, useMemo } from 'react';
import { Box, Button, Card, CardContent, Typography, CircularProgress, Chip, Stack, Accordion, AccordionSummary, AccordionDetails, InputBase, Paper } from '@mui/material';
import { Title } from 'react-admin';
import { ResponsiveContainer, LineChart, Line, ReferenceArea, YAxis } from 'recharts';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { useNavigate } from 'react-router-dom';
import { ExplainButton } from '../components/ExplainItem';

interface EvoItem {
  nameCanonical: string; unit: string | null; refLow: number | null; refHigh: number | null;
  firstValue: number; lastValue: number; firstDate: string | null; lastDate: string | null;
  pctChange: number; direction: 'up' | 'down' | 'stable'; predictMonths: number | null;
  inRange: boolean; count: number;
  points: { value: number; date: string | null; flag: string; examId: string; examTitle: string }[];
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 's/d';

// "painel de controle": cada exame ganha um status visual
type Status = 'out' | 'change' | 'stable';
const statusOf = (it: EvoItem): Status => (!it.inRange ? 'out' : it.direction !== 'stable' ? 'change' : 'stable');
const STATUS_META: Record<Status, { emoji: string; label: string; color: string }> = {
  out: { emoji: '🔴', label: 'Fora da faixa', color: '#ef4444' },
  change: { emoji: '🟠', label: 'Em mudança', color: '#f59e0b' },
  stable: { emoji: '✅', label: 'Estável', color: '#10b981' },
};

export const EvolutionPage = () => {
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<EvoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/items/evolution${pid ? `?patientId=${pid}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [pid]);

  const counts = useMemo(() => ({
    out: items.filter((i) => statusOf(i) === 'out').length,
    change: items.filter((i) => statusOf(i) === 'change').length,
    stable: items.filter((i) => statusOf(i) === 'stable').length,
  }), [items]);

  const filtered = useMemo(() => {
    const order = { out: 0, change: 1, stable: 2 };
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => filter === 'all' || statusOf(i) === filter)
      .filter((i) => !q || i.nameCanonical.toLowerCase().includes(q))
      .sort((a, b) => order[statusOf(a)] - order[statusOf(b)]);
  }, [items, filter, query]);

  const CHIPS: { key: Status | 'all'; emoji: string; label: string; color: string; count: number }[] = [
    { key: 'all', emoji: '📋', label: 'Todos', color: '#178f89', count: items.length },
    { key: 'out', emoji: STATUS_META.out.emoji, label: STATUS_META.out.label, color: STATUS_META.out.color, count: counts.out },
    { key: 'change', emoji: STATUS_META.change.emoji, label: STATUS_META.change.label, color: STATUS_META.change.color, count: counts.change },
    { key: 'stable', emoji: STATUS_META.stable.emoji, label: STATUS_META.stable.label, color: STATUS_META.stable.color, count: counts.stable },
  ];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 860, mx: 'auto' }}>
      <Title title="Evolução da minha saúde" />
      <Typography variant="h5" sx={{ fontWeight: 800 }}>📈 Evolução ao longo do tempo</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Como cada exame evoluiu entre as coletas. Toque pra ver o gráfico.</Typography>

      {loading && <CircularProgress />}

      {!loading && items.length > 0 && (
        <>
          {/* Resumo interativo (chips que filtram) */}
          <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
            {CHIPS.map((c) => {
              const on = filter === c.key;
              return (
                <Chip key={c.key} onClick={() => setFilter(c.key)} label={`${c.emoji} ${c.label} (${c.count})`}
                  sx={{ bgcolor: on ? c.color : `${c.color}1a`, color: on ? '#fff' : c.color, fontWeight: 700, border: `1px solid ${c.color}55`, '&:hover': { bgcolor: on ? c.color : `${c.color}2e` } }} />
              );
            })}
          </Stack>

          {/* Busca fixa (sticky) */}
          <Paper variant="outlined" sx={{ p: '2px 12px', mb: 2, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 99, position: 'sticky', top: 60, zIndex: 5, bgcolor: 'rgba(255,255,255,.96)', backdropFilter: 'blur(8px)' }}>
            <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
            <InputBase value={query} onChange={(e: any) => setQuery(e.target.value)} placeholder="Buscar exame (TSH, glicose, colesterol…)" sx={{ flex: 1, fontSize: 14 }} />
            {query && <Chip size="small" label="limpar" onClick={() => setQuery('')} sx={{ height: 22 }} />}
          </Paper>
        </>
      )}

      {!loading && items.length === 0 && (
        <Card><CardContent>
          <Typography color="text.secondary">Envie ao menos 2 exames laboratoriais de datas diferentes pra acompanhar sua evolução.</Typography>
        </CardContent></Card>
      )}

      {!loading && items.length > 0 && filtered.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 2 }}>Nenhum exame nesse filtro.</Typography>
      )}

      {!loading && filtered.length > 0 && (
        <Stack spacing={0.75}>
          {filtered.map((it) => <EvoRow key={it.nameCanonical} it={it} defaultExpanded={filter === 'out' && statusOf(it) === 'out'} />)}
        </Stack>
      )}
    </Box>
  );
};

/** Card recolhido por padrão (nome + valor + tag); expande pro gráfico + detalhes. */
const EvoRow = ({ it, defaultExpanded }: { it: EvoItem; defaultExpanded?: boolean }) => {
  const navigate = useNavigate();
  const st = statusOf(it);
  const meta = STATUS_META[st];
  const up = it.direction === 'up';
  const lineColor = st === 'out' ? '#ef4444' : up ? '#e65100' : '#0b5cab';
  return (
    <Accordion defaultExpanded={defaultExpanded} disableGutters elevation={0}
      sx={{ '&:before': { display: 'none' }, border: `1px solid ${meta.color}33`, borderRadius: '12px !important' }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: '52px !important', '& .MuiAccordionSummary-content': { my: 0.75, flexWrap: 'wrap', gap: 0.5 } }}>
        <Stack direction="row" alignItems="center" spacing={1} useFlexGap sx={{ flex: 1, minWidth: 0, pr: 1, flexWrap: 'wrap', gap: 0.5 }}>
          <Box sx={{ fontSize: 15 }}>{meta.emoji}</Box>
          <Typography sx={{ fontWeight: 700, flex: '1 1 60%', minWidth: 120 }}>{it.nameCanonical}</Typography>
          <Typography sx={{ fontWeight: 800, color: meta.color }}>{it.lastValue}{it.unit ? ` ${it.unit}` : ''}</Typography>
          {st !== 'stable' && it.pctChange !== 0 && <Chip size="small" sx={{ bgcolor: `${lineColor}14`, color: lineColor, fontWeight: 700, height: 20 }} label={`${it.pctChange > 0 ? '+' : ''}${it.pctChange}%`} />}
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {it.firstValue}{it.unit ? ` ${it.unit}` : ''} ({fmtDate(it.firstDate)}) <strong>→</strong> {it.lastValue}{it.unit ? ` ${it.unit}` : ''} ({fmtDate(it.lastDate)})
        </Typography>
        {it.points.length >= 2 && (
          <Box sx={{ height: 92, width: '100%', mb: 1 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={it.points.map((p) => ({ v: p.value }))} margin={{ top: 4, right: 6, bottom: 4, left: 6 }}>
                {it.refLow != null && it.refHigh != null && <ReferenceArea y1={it.refLow} y2={it.refHigh} fill="#10b981" fillOpacity={0.14} />}
                <YAxis hide domain={['auto', 'auto']} />
                <Line type="monotone" dataKey="v" stroke={lineColor} strokeWidth={2.5} dot={{ r: 3, fill: lineColor }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        )}
        <Typography variant="body2" color="text.secondary">
          {st === 'stable' ? 'Estável' : up ? 'Subindo' : 'Caindo'} em {it.count} {it.count === 1 ? 'medição' : 'medições'}.
          {(it.refLow != null || it.refHigh != null) && ` Faixa: ${it.refLow ?? '—'} a ${it.refHigh ?? '—'}${it.unit ? ` ${it.unit}` : ''}.`}
        </Typography>
        {it.predictMonths != null && (
          <Box sx={{ mt: 1, p: 1, borderRadius: 1.5, bgcolor: `${lineColor}0d`, border: `1px solid ${lineColor}33` }}>
            <Typography variant="body2" sx={{ color: lineColor, fontWeight: 600 }}>⏱️ Neste ritmo, {it.nameCanonical} {up ? 'ultrapassa' : 'fica abaixo de'} a faixa em ~{it.predictMonths} {it.predictMonths === 1 ? 'mês' : 'meses'}.</Typography>
          </Box>
        )}
        <Stack direction="row" spacing={1} sx={{ mt: 1 }} useFlexGap flexWrap="wrap" alignItems="center">
          <ExplainButton name={it.nameCanonical} nameCanonical={it.nameCanonical} />
          {(() => { const lp = it.points[it.points.length - 1]; if (!lp?.examId) return null; return <Button size="small" onClick={() => navigate(`/exams/${lp.examId}/show`)}>↗ Exame de origem</Button>; })()}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};
