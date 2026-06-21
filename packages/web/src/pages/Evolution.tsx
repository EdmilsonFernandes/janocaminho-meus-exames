import { useEffect, useState, useMemo } from 'react';
import { Box, Button, Card, CardContent, Typography, CircularProgress, Chip, Stack, Grid, Accordion, AccordionSummary, AccordionDetails, InputBase, Paper } from '@mui/material';
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

// Agrupamento por categoria médica (estilo laudo: Hemograma, Função Hepática, etc.)
const CATS: { key: string; cat: string; emoji: string; color: string; keys: string[] }[] = [
  { key: 'hemo', cat: 'Hemograma', emoji: '🩸', color: '#e11d48', keys: ['hemoglo', 'hematoc', 'eritroc', 'eritróc', 'leucoc', 'leucóc', 'plaque', 'vcm', 'hcm', 'chcm', 'rdw', 'neutro', 'linfoc', 'linfóc', 'monoc', 'eosinofi', 'basofi', 'hemácia', 'hemacia', 'reticuloc', 'vpm', 'cgm', 'rhc'] },
  { key: 'glic', cat: 'Glicemia e Diabetes', emoji: '🍩', color: '#db2777', keys: ['glicose', 'glicemi', 'glicosilada', 'hba1c', 'insulina', 'homa', 'frutosam'] },
  { key: 'lipi', cat: 'Lipídios e Colesterol', emoji: '🧈', color: '#d97706', keys: ['colesterol', 'ldl', 'hdl', 'vldl', 'triglic', 'apolipo', 'castelli', 'nao-hdl', 'não-hdl'] },
  { key: 'hepa', cat: 'Função Hepática', emoji: '🫀', color: '#16a34a', keys: ['tgo', 'tgp', 'ast', 'alt', 'gama-gt', 'gama gt', 'ggt', 'gamagt', 'fosfatase alcalin', 'bilirrub', 'transamin', 'albumina'] },
  { key: 'renal', cat: 'Função Renal', emoji: '🫘', color: '#7c3aed', keys: ['creatinina', 'ureia', 'uréia', 'acido urico', 'ácido úrico', 'tfg', 'egfr', 'depura', 'clearance', 'cistatina'] },
  { key: 'horm', cat: 'Hormônios', emoji: '⚗️', color: '#0891b2', keys: ['tsh', 't4 livre', 't3 livre', 'tiroxina', 'triiodo', 'tireotropina', 'tireo', 'paratorm', 'testosterona', 'cortisol', 'prolactina', 'estradiol', 'androst', 'dhea', 'progester', 'hormônio', 'hormonio'] },
  { key: 'card', cat: 'Marcadores Cardíacos', emoji: '❤️', color: '#dc2626', keys: ['troponina', 'creatino quinase', 'ck-mb', 'ck mb', 'ckmb', 'ldh', 'desidrogenase', 'bnp', 'pro-bnp', 'mioglo'] },
  { key: 'elet', cat: 'Eletrólitos e Minerais', emoji: '⚡', color: '#0d9488', keys: ['sodio', 'sódio', 'potassio', 'potássio', 'calcio', 'cálcio', 'magnesio', 'magnésio', 'cloro', 'cloret', 'fosforo', 'fósforo'] },
  { key: 'infl', cat: 'Inflamação e Ferro', emoji: '🛡️', color: '#ea580c', keys: ['pcr', 'vhs', 'proteina c reativa', 'proteína c reativa', 'ferritina', 'ferro', 'saturacao', 'saturação', 'transferr', 'tibc', 'uibc'] },
  { key: 'coag', cat: 'Coagulação', emoji: '🩹', color: '#9333ea', keys: ['protrombina', 'inr', 'ttpa', 'fibrinogen', 'fibrinogên', 'tromboplastina', 'tempo de tromb', 'coagul'] },
  { key: 'vita', cat: 'Vitaminas e Ácido Fólico', emoji: '💊', color: '#2563eb', keys: ['vitamina', 'acido folico', 'ácido fólico', 'folato', 'homociste'] },
  { key: 'other', cat: 'Outros exames', emoji: '📋', color: '#64748b', keys: [] },
];
const CAT_ORDER = CATS.map((c) => c.key);
const categorize = (name: string) => {
  const n = (name || '').toLowerCase();
  for (const c of CATS) if (c.key !== 'other' && c.keys.some((k) => n.includes(k))) return c;
  return CATS.find((c) => c.key === 'other')!;
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

  // Agrupa os itens filtrados por categoria médica (ordem fixa do laudo)
  const groups = useMemo(() => {
    const order = { out: 0, change: 1, stable: 2 };
    const map = new Map<string, { cat: string; emoji: string; color: string; items: EvoItem[] }>();
    for (const it of filtered) {
      const c = categorize(it.nameCanonical);
      if (!map.has(c.key)) map.set(c.key, { cat: c.cat, emoji: c.emoji, color: c.color, items: [] });
      map.get(c.key)!.items.push(it);
    }
    for (const g of map.values()) g.items.sort((a, b) => order[statusOf(a)] - order[statusOf(b)]);
    return [...map.entries()].sort((a, b) => CAT_ORDER.indexOf(a[0]) - CAT_ORDER.indexOf(b[0])).map(([, g]) => g);
  }, [filtered]);

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
          {/* Resumo interativo — Grid 2x2 no mobile, 4 colunas no desktop (mobile-first, nunca estoura) */}
          <Grid container spacing={1} sx={{ mb: 2 }}>
            {CHIPS.map((c) => {
              const on = filter === c.key;
              return (
                <Grid key={c.key} size={{ xs: 6, sm: 3 }}>
                  <Chip onClick={() => setFilter(c.key)} label={`${c.emoji} ${c.label} (${c.count})`}
                    sx={{ width: '100%', height: 38, borderRadius: 2, bgcolor: on ? c.color : `${c.color}1a`, color: on ? '#fff' : c.color, fontWeight: 700, border: `1px solid ${c.color}55`, '&:hover': { bgcolor: on ? c.color : `${c.color}2e` } }} />
                </Grid>
              );
            })}
          </Grid>

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
        <Stack spacing={1.5}>
          {groups.map((g) => <CategoryGroup key={g.cat} group={g} expandOuts={filter === 'out'} />)}
        </Stack>
      )}
    </Box>
  );
};

/** Grupo colapsável por categoria médica — header com emoji, nome, pior status e contagem; dentro ficam os cards de cada analito. */
const CategoryGroup = ({ group, expandOuts }: { group: { cat: string; emoji: string; color: string; items: EvoItem[] }; expandOuts?: boolean }) => {
  // Recolhido por padrão. Exceção: no filtro "Fora da faixa", abre só os grupos que têm alerta.
  const [open, setOpen] = useState(!!expandOuts && group.items.some((i) => statusOf(i) === 'out'));
  const worst: Status = group.items.some((i) => statusOf(i) === 'out') ? 'out' : group.items.some((i) => statusOf(i) === 'change') ? 'change' : 'stable';
  return (
    <Card sx={{ borderRadius: 3, border: `1px solid ${group.color}26`, overflow: 'hidden' }}>
      <Box onClick={() => setOpen((o) => !o)} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1.25, cursor: 'pointer', bgcolor: `${group.color}0a`, '&:hover': { bgcolor: `${group.color}14` } }}>
        <Box sx={{ fontSize: 19 }}>{group.emoji}</Box>
        <Typography sx={{ fontWeight: 800, flex: 1, color: '#0f3d3a', fontSize: 15 }}>{group.cat}</Typography>
        <Box title={STATUS_META[worst].label} sx={{ fontSize: 14 }}>{STATUS_META[worst].emoji}</Box>
        <Chip size="small" label={group.items.length} sx={{ bgcolor: `${group.color}1a`, color: group.color, fontWeight: 700, height: 22, minWidth: 28 }} />
        <ExpandMoreIcon sx={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .2s', color: group.color, fontSize: 20 }} />
      </Box>
      {open && (
        <Stack spacing={0.75} sx={{ p: 1 }}>
          {group.items.map((it) => <EvoRow key={it.nameCanonical} it={it} defaultExpanded={!!expandOuts && statusOf(it) === 'out'} />)}
        </Stack>
      )}
    </Card>
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
