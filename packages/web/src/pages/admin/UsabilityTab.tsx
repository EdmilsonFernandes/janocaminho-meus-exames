import { useEffect, useState, useMemo } from 'react';
import {
  Box, Typography, Stack, Card, CardContent, IconButton, LinearProgress,
  TextField, InputAdornment, Button, Chip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import InsightsIcon from '@mui/icons-material/Insights';
import { useTable, type ColumnDef } from '@tanstack/react-table';
import { DataGrid, DataGridContainer, dataGridFeatures } from '@/components/reui/data-grid/data-grid';
import { DataGridTable, DataGridTableRowExpand } from '@/components/reui/data-grid/data-grid-table';
import { DataGridColumnHeader } from '@/components/reui/data-grid/data-grid-column-header';
import { Badge } from '@/components/reui/badge';
import { API_URL, token } from '../../config';
import '../../doctor-v2/tw.css';
import { ListEmpty } from '@/components/reui/list-empty';
import { tealText } from '../../theme';

type Category = 'clinico' | 'ia' | 'rotina' | 'conta';
interface RecentUser { email: string; name: string; at: string | null }
interface FeatureRow {
  key: string; label: string; category?: Category;
  users: number; users30?: number; pct: number; lastAt: string | null; recent: RecentUser[];
}
interface UsageData {
  funnel: { signups: number; verified: number; firstExam: number; usedAI: number; premium: number };
  activity: { active7: number; active30: number };
  features: FeatureRow[];
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const CATEGORY: Record<Category, { label: string; variant: 'primary-light' | 'info-light' | 'success-light' | 'warning-light' }> = {
  clinico: { label: 'Clínico & Família', variant: 'success-light' },
  ia: { label: 'IA', variant: 'primary-light' },
  rotina: { label: 'Rotina & Saúde', variant: 'info-light' },
  conta: { label: 'Conta & Engajamento', variant: 'warning-light' },
};

const FILTERS: { id: 'all' | Category; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'clinico', label: CATEGORY.clinico.label },
  { id: 'ia', label: 'IA & Chat' },
  { id: 'rotina', label: CATEGORY.rotina.label },
  { id: 'conta', label: CATEGORY.conta.label },
];

/** Linha expandida: as últimas PESSOAS (distintas) que usaram a funcionalidade. */
const RecentUsers = ({ feat }: { feat: FeatureRow }) => (
  <div className="bg-muted/30 px-4 py-3">
    <p className="mb-2 text-xs font-bold text-muted-foreground">
      {feat.recent.length === 0
        ? 'Nenhum uso registrado na base verificada.'
        : `Últimas ${feat.recent.length} pessoa(s) — ${feat.label}`}
    </p>
    {feat.recent.length > 0 && (
      <div className="flex flex-col gap-1.5">
        {feat.recent.map((u) => (
          <div key={u.email} className="flex flex-col gap-0.5 rounded-lg border border-border bg-background px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
            <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-foreground">{u.name || u.email}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{u.email}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmt(u.at)}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

/** ReUI DataGrid — adoção por funcionalidade: ordenável por coluna, linha expande os últimos usuários. */
function AdoptionGrid({ rows }: { rows: FeatureRow[] }) {
  const columns = useMemo<ColumnDef<any, any>[]>(() => [
    {
      id: 'expand', header: '', size: 44, enableSorting: false,
      cell: (c) => <DataGridTableRowExpand row={c.row as any} />,
      meta: { expandedContent: (row: FeatureRow) => <RecentUsers feat={row} /> },
    },
    {
      accessorKey: 'label', size: 240,
      header: (c) => <DataGridColumnHeader column={c.column as any} title="Funcionalidade" />,
      cell: (c) => {
        const f = c.row.original as FeatureRow;
        const cat = f.category ? CATEGORY[f.category] : null;
        return (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-bold text-foreground">{f.label}</span>
            {cat && <Badge variant={cat.variant} size="xs">{cat.label}</Badge>}
          </div>
        );
      },
    },
    {
      accessorKey: 'users', size: 100,
      header: (c) => <DataGridColumnHeader column={c.column as any} title="Usuários" />,
      cell: (c) => <span className="text-[13.5px] font-extrabold tabular-nums text-foreground">{(c.getValue() as number).toLocaleString('pt-BR')}</span>,
    },
    {
      id: 'users30', size: 110, accessorFn: (r: FeatureRow) => r.users30 ?? 0,
      header: (c) => <DataGridColumnHeader column={c.column as any} title="Ativos 30d" />,
      cell: (c) => <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">{(c.getValue() as number).toLocaleString('pt-BR')}</span>,
    },
    {
      accessorKey: 'pct', size: 170,
      header: (c) => <DataGridColumnHeader column={c.column as any} title="% da base" />,
      cell: (c) => {
        const pct = c.getValue() as number;
        return (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-primary/15">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <span className="w-12 text-right text-xs font-bold tabular-nums text-muted-foreground">
              {pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
            </span>
          </div>
        );
      },
    },
    {
      id: 'lastAt', size: 150, accessorFn: (r: FeatureRow) => (r.lastAt ? new Date(r.lastAt).getTime() : 0),
      header: (c) => <DataGridColumnHeader column={c.column as any} title="Último uso" />,
      cell: (c) => <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{fmt((c.row.original as FeatureRow).lastAt)}</span>,
    },
  ], []);

  const table = useTable({
    features: dataGridFeatures,
    data: rows as any[],
    columns,
    getRowId: (r: any) => r.key,
    getRowCanExpand: () => true,
    initialState: { sorting: [{ id: 'users', desc: true }] },
  });

  if (rows.length === 0) {
    return <ListEmpty title="Nenhuma funcionalidade encontrada" description="Ajuste a busca ou a categoria." />;
  }
  return (
    <DataGrid
      table={table}
      recordCount={rows.length}
      onRowClick={(r: any) => table.getRow(r.key)?.toggleExpanded()}
      tableLayout={{ headerBackground: true, rowBorder: true }}
    >
      <DataGridContainer><DataGridTable /></DataGridContainer>
    </DataGrid>
  );
}

export const UsabilityTab = () => {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | Category>('all');

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/admin/feature-usage`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const handleExportCSV = () => {
    if (!data?.features) return;
    const headers = ['Chave', 'Funcionalidade', 'Categoria', 'Total Usuarios', 'Ativos 30d', 'Percentual Base Verificada', 'Ultimo Uso'];
    const rows = data.features.map((f) => [
      `"${f.key}"`,
      `"${f.label.replace(/"/g, '""')}"`,
      `"${f.category ? CATEGORY[f.category].label : ''}"`,
      f.users,
      f.users30 ?? 0,
      `"${f.pct.toFixed(1)}%"`,
      `"${f.lastAt || ''}"`,
    ]);
    const csvContent = '﻿' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `adocao-features-dr-exame-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Categoria vem do servidor (antes o filtro casava chaves que o servidor nunca enviou → vazio).
  const filteredFeatures = useMemo(() => {
    if (!data?.features) return [];
    const q = searchQuery.toLowerCase().trim();
    return data.features.filter((f) => {
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
      if (!q) return true;
      return f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q);
    });
  }, [data, searchQuery, categoryFilter]);

  if (loading) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <LinearProgress sx={{ borderRadius: 2, height: 6, bgcolor: 'rgba(32,178,170,0.12)', '& .MuiLinearProgress-bar': { bgcolor: '#20b2aa' } }} />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Carregando usabilidade...</Typography>
      </Box>
    );
  }

  if (!data) {
    return <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>Não foi possível carregar os dados de usabilidade.</Typography>;
  }

  const { funnel: f, activity } = data;
  const steps = [
    { label: 'Contas criadas', value: f.signups, base: f.signups, color: '#178f89' },
    { label: 'E-mail verificado', value: f.verified, base: f.signups, color: '#178f89' },
    { label: 'Subiu 1º exame', value: f.firstExam, base: f.verified, color: '#0369a1' },
    { label: 'Usou IA (chat/resumo)', value: f.usedAI, base: f.firstExam, color: '#7c3aed' },
    { label: 'Premium ativo', value: f.premium, base: f.verified, color: '#d4a574' },
  ];

  return (
    <Stack spacing={2.5}>
      {/* HEADER & EXPORTAR */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 1.5 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <InsightsIcon sx={{ color: (t) => tealText(t.palette.mode), fontSize: 28 }} />
            <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif' }}>
              Adoção de Funcionalidades
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            O que os pacientes realmente usam — contas de teste e e-mails não verificados ficam de fora.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          onClick={handleExportCSV}
          startIcon={<DownloadIcon />}
          sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700, borderColor: 'divider' }}
        >
          Exportar Relatório CSV
        </Button>
      </Box>

      {/* FUNIL DE ATIVAÇÃO */}
      <Card variant="outlined" sx={{ borderRadius: '16px' }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Typography sx={{ fontWeight: 800, fontSize: 15, mb: 0.5 }}>🎯 Funil de Ativação do Usuário</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Cada etapa mostra o percentual em relação à anterior — descubra onde os usuários abandonam o fluxo.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(5, 1fr)' }, gap: 1.5 }}>
            {steps.map((s, i) => {
              const pct = s.base ? Math.round((s.value / s.base) * 100) : 0;
              return (
                <Box key={s.label} sx={{ p: 1.5, borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                  <Typography sx={{ fontWeight: 800, fontSize: { xs: 22, sm: 26 }, lineHeight: 1.1, color: s.color }}>
                    {s.value.toLocaleString('pt-BR')}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600, mt: 0.25 }}>{s.label}</Typography>
                  {i > 0 && (
                    <Typography sx={{ fontSize: 12, fontWeight: 800, mt: 0.5, color: pct >= 60 ? '#047857' : pct >= 30 ? '#b45309' : '#c2410c' }}>
                      {pct}% da etapa anterior
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        </CardContent>
      </Card>

      {/* ATIVIDADE RECENTE */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr' }, gap: 2 }}>
        {[
          { label: 'Ativos nos últimos 7 dias', value: activity.active7 },
          { label: 'Ativos nos últimos 30 dias', value: activity.active30 },
        ].map((a) => (
          <Card key={a.label} variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper' }}>
            <CardContent sx={{ p: 2.25 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block' }}>{a.label}</Typography>
              <Typography sx={{ fontSize: { xs: 26, sm: 30 }, fontWeight: 800, color: (t) => tealText(t.palette.mode), lineHeight: 1.1 }}>
                {a.value.toLocaleString('pt-BR')}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* ADOÇÃO POR FEATURE — ReUI DataGrid */}
      <Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-end' }} justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 15 }}>📦 Adoção por Funcionalidade</Typography>
            <Typography variant="caption" color="text.secondary">
              % sobre as {f.verified.toLocaleString('pt-BR')} contas verificadas. Clique no cabeçalho para ordenar e na linha para ver as últimas pessoas.
            </Typography>
          </Box>
          <TextField
            size="small"
            placeholder="Buscar funcionalidade..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton size="small" aria-label="Limpar busca" onClick={() => setSearchQuery('')}>
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              },
            }}
            sx={{ width: { xs: '100%', sm: 280 }, '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }}
          />
        </Stack>

        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
          {FILTERS.map((opt) => {
            const count = opt.id === 'all' ? data.features.length : data.features.filter((x) => x.category === opt.id).length;
            const active = categoryFilter === opt.id;
            return (
              <Chip
                key={opt.id}
                label={`${opt.label} (${count})`}
                size="small"
                onClick={() => setCategoryFilter(opt.id)}
                color={active ? 'primary' : 'default'}
                variant={active ? 'filled' : 'outlined'}
                sx={{ fontWeight: 700 }}
              />
            );
          })}
        </Stack>

        <div className="dx-island"><AdoptionGrid rows={filteredFeatures} /></div>
      </Box>
    </Stack>
  );
};
