// §18.1/§18.11.3 (Onda 3, 24/10) — FINANCEIRO DO MÉDICO no portal.
// Responde as 4 perguntas em cima da tela: "quanto posso receber agora?", "quanto
// está a caminho?", "quanto já recebi?" e "quando vem o próximo?". Mobile-first
// (390 → amplia): chips de situação com ÍCONE+rótulo (nunca só cor), lista de
// consultas em cards no mobile / tabela CONTIDA (scroll próprio) ≥sm, expande o
// detalhe do split (contratado/descontos/base/% plataforma/honorários/situação).
// Sem jargão financeiro interno em tela (§18.11): nada de "ledger/webhook".
// Nunca R$ 0,00 no lugar de "não carregado" — skeleton até o dado chegar.
import { useState, useEffect, useCallback, useMemo, Fragment, type ReactElement } from 'react';
import {
  Box, Typography, Stack, Chip, Button, IconButton, useMediaQuery, useTheme,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  InputAdornment, Tooltip, Divider, Alert,
} from '@mui/material';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import HourglassBottomOutlinedIcon from '@mui/icons-material/HourglassBottomOutlined';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import DoneAllOutlinedIcon from '@mui/icons-material/DoneAllOutlined';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import WalletOutlinedIcon from '@mui/icons-material/WalletOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import { AppCard } from '../../AppCard';
import { CardSkeleton } from '../../Skeleton';
import { tealText } from '../../../theme';
import { API_URL } from '../../../config';
import { snackbar } from '../../ConfirmDialog';

// ── Formatação pt-BR (centavos inteiros → moeda; nunca float no server) ──────────
const brl = (cents: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents ?? 0) / 100);
const dia = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—';
const diaSemana = (iso: string) => {
  const d = new Date(iso);
  const wd = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return `${wd} ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
};
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Situações financeiras — ícone+rótulo DISTINTOS (não só cor; §18.11 acessibilidade).
type StatusFin = 'previsto' | 'em_validacao' | 'liberado' | 'em_processamento' | 'repassado' | 'estornado';
const STATUS_META: Record<StatusFin, { label: string; icon: ReactElement; color: (mode: string) => string; bg: (mode: string) => string }> = {
  previsto: { label: 'Previsto', icon: <ScheduleOutlinedIcon sx={{ fontSize: 18 }} />, color: (m) => (m === 'dark' ? '#7dd3fc' : '#0369a1'), bg: (m) => (m === 'dark' ? 'rgba(14,165,233,.14)' : 'rgba(14,165,233,.10)') },
  em_validacao: { label: 'Em validação', icon: <HourglassBottomOutlinedIcon sx={{ fontSize: 18 }} />, color: (m) => (m === 'dark' ? '#fbbf24' : '#b45309'), bg: (m) => (m === 'dark' ? 'rgba(245,158,11,.15)' : 'rgba(245,158,11,.12)') },
  liberado: { label: 'Liberado', icon: <WalletOutlinedIcon sx={{ fontSize: 18 }} />, color: (m) => tealText(m as any), bg: (m) => (m === 'dark' ? 'rgba(32,178,170,.16)' : 'rgba(32,178,170,.12)') },
  em_processamento: { label: 'Em processamento', icon: <SyncOutlinedIcon sx={{ fontSize: 18 }} />, color: (m) => (m === 'dark' ? '#d4a574' : '#92600c'), bg: (m) => 'rgba(212,165,116,.16)' },
  repassado: { label: 'Repassado', icon: <DoneAllOutlinedIcon sx={{ fontSize: 18 }} />, color: (m) => (m === 'dark' ? '#34d399' : '#047857'), bg: (m) => (m === 'dark' ? 'rgba(16,185,129,.15)' : 'rgba(16,185,129,.12)') },
  estornado: { label: 'Estornado', icon: <UndoOutlinedIcon sx={{ fontSize: 18 }} />, color: (m) => (m === 'dark' ? '#f87171' : '#b91c1c'), bg: (m) => (m === 'dark' ? 'rgba(239,68,68,.13)' : 'rgba(239,68,68,.10)') },
};

const PIX_TYPES: { value: string; label: string }[] = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Celular' },
  { value: 'random', label: 'Chave aleatória' },
];

interface StatementRow {
  reminderId: string; title: string; data: string;
  valorContratadoCents: number; descontosCents: number; baseCents: number;
  platformBps: number; taxaPlataformaCents: number; honorariosCents: number;
  statusFinanceiro: StatusFin; situacao: string;
  liberadoEm: string | null; payoutId: string | null; repassadoEm: string | null;
}

interface Props { token: string }

export const PortalFinanceiro = ({ token }: Props) => {
  const t = useTheme();
  const mode = t.palette.mode as 'light' | 'dark';
  const isWide = useMediaQuery(t.breakpoints.up('sm'));
  const H = { Authorization: `Bearer ${token}` };

  const [range, setRange] = useState<'30' | '90' | '365'>('30');
  const [statusFilter, setStatusFilter] = useState<StatusFin | 'todos'>('todos');
  const [summary, setSummary] = useState<any>(null);
  const [rows, setRows] = useState<StatementRow[] | null>(null);
  const [payout, setPayout] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Dados de recebimento (dialog de troca — auth reforçada)
  const [pixOpen, setPixOpen] = useState(false);
  const [pixPwd, setPixPwd] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [pixType, setPixType] = useState('email');
  const [pixSaving, setPixSaving] = useState(false);
  const [pixErr, setPixErr] = useState('');

  const period = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(range) * 86_400_000);
    return { from: isoDay(from), to: isoDay(to) };
  }, [range]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const qs = `from=${period.from}&to=${period.to}`;
      const [s, st, pd] = await Promise.all([
        fetch(`${API_URL}/doctor/finance/summary?${qs}`, { headers: H }),
        fetch(`${API_URL}/doctor/finance/statement?${qs}`, { headers: H }),
        fetch(`${API_URL}/doctor/finance/payout-details`, { headers: H }),
      ]);
      if (!s.ok || !st.ok) throw new Error('Falha ao carregar o financeiro.');
      setSummary(await s.json());
      setRows((await st.json()).rows ?? []);
      if (pd.ok) setPayout(await pd.json());
    } catch (e: any) {
      setErr(e.message || 'Falha ao carregar o financeiro.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.from, period.to, token]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => (rows ?? []).filter((r) => statusFilter === 'todos' || r.statusFinanceiro === statusFilter),
    [rows, statusFilter],
  );

  const exportCsv = async () => {
    try {
      const r = await fetch(`${API_URL}/doctor/finance/statement?from=${period.from}&to=${period.to}&format=csv`, { headers: H });
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'extrato-financeiro.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch { snackbar({ message: 'Não foi possível exportar o extrato.', severity: 'error' }); }
  };

  const savePix = async () => {
    setPixSaving(true); setPixErr('');
    try {
      const r = await fetch(`${API_URL}/doctor/finance/payout-details`, {
        method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pixPwd, pixKey: pixKey.trim(), pixKeyType: pixType }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao salvar.');
      setPayout((p: any) => ({ ...(p ?? {}), hasPixKey: true, pixKeyMasked: d.pixKeyMasked, pixKeyType: d.pixKeyType }));
      setPixOpen(false); setPixPwd(''); setPixKey('');
      snackbar({ message: 'Chave de recebimento atualizada.', severity: 'success' });
    } catch (e: any) {
      setPixErr(e.message);
    } finally {
      setPixSaving(false);
    }
  };

  // ── Detalhe do split (expansão) — reaproveitado em card mobile e linha da tabela ──
  const SplitDetail = ({ r }: { r: StatementRow }) => {
    const meta = STATUS_META[r.statusFinanceiro];
    const item = (label: string, value: string, strong = false) => (
      <Box key={label} sx={{ minWidth: 96 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>{label}</Typography>
        <Typography sx={{ fontSize: 14, fontWeight: strong ? 800 : 600, color: strong ? tealText(mode) : 'text.primary' }}>{value}</Typography>
      </Box>
    );
    return (
      <Box sx={{ py: 1.5, px: { xs: 0, sm: 2 }, display: 'flex', flexWrap: 'wrap', gap: { xs: 2, sm: 3.5 } }}>
        {item('Valor contratado', brl(r.valorContratadoCents))}
        {item('Descontos', r.descontosCents ? brl(r.descontosCents) : 'R$ 0,00')}
        {item('Base de cálculo', brl(r.baseCents))}
        {item('Plataforma', `${(r.platformBps / 100).toFixed(0)}% · ${brl(r.taxaPlataformaCents)}`)}
        {item('Seus honorários', brl(r.honorariosCents), true)}
        <Box sx={{ minWidth: 150 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>Situação</Typography>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5 }}>
            <Box sx={{ color: meta.color(mode), display: 'flex' }}>{meta.icon}</Box>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: meta.color(mode) }}>{meta.label}</Typography>
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
            {r.situacao}{r.statusFinanceiro === 'em_validacao' && r.liberadoEm ? ` · libera ${dia(r.liberadoEm)}` : ''}
            {r.statusFinanceiro === 'repassado' && r.repassadoEm ? ` · ${dia(r.repassadoEm)}` : ''}
          </Typography>
        </Box>
      </Box>
    );
  };

  if (loading && !summary) {
    return (
      <Box>
        <CardSkeleton lines={1} />
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
      </Box>
    );
  }
  if (err) {
    return (
      <AppCard sx={{ p: 3, textAlign: 'center' }}>
        <Typography sx={{ fontWeight: 700, mb: 1.5 }}>Não foi possível carregar seu financeiro.</Typography>
        <Button onClick={load} variant="contained" startIcon={<RefreshOutlinedIcon />} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 44 }}>Tentar de novo</Button>
      </AppCard>
    );
  }

  const chips: { key: StatusFin; value: number }[] = [
    { key: 'previsto', value: summary?.previstosCents ?? 0 },
    { key: 'em_validacao', value: summary?.emValidacaoCents ?? 0 },
    { key: 'em_processamento', value: summary?.emProcessamentoCents ?? 0 },
    { key: 'repassado', value: summary?.repassadosCents ?? 0 },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* SEM CHAVE PIX = não recebe repasse. Era nota discreta no rodapé (auditoria
          29/10) — vira alerta no topo com ação direta, até a chave ser cadastrada. */}
      {payout && !payout.hasPixKey && (
        <Alert
          severity="warning"
          sx={{ borderRadius: '14px', fontWeight: 600, alignItems: 'center' }}
          action={
            <Button color="inherit" size="small" onClick={() => { setPixErr(''); setPixOpen(true); }} sx={{ fontWeight: 800, textTransform: 'none', minHeight: 40 }}>
              Cadastrar PIX
            </Button>
          }
        >
          Cadastre sua chave PIX para receber os repasses das consultas.
        </Alert>
      )}
      {/* HERO — a pergunta nº1: quanto posso receber agora? */}
      <AppCard kind="tinted" tone="primary" sx={{ p: { xs: 2.25, sm: 3 } }}>
        <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: '0.05em', color: tealText(mode) }}>A RECEBER AGORA</Typography>
        <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: { xs: 34, sm: 40 }, lineHeight: 1.1, mt: 0.5, color: 'text.primary' }}>
          {summary ? brl(summary.liberadosCents) : '—'}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
          liberado para repasse{(summary?.estornadosCents ?? 0) > 0 ? ` · ${brl(summary.estornadosCents)} devolvidos a pacientes no período` : ''}
        </Typography>
        {summary?.proximoRepasse && (
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1.5, flexWrap: 'wrap' }}>
            <EventOutlinedIcon sx={{ fontSize: 17, color: tealText(mode) }} />
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary' }}>
              Próximo repasse: {diaSemana(summary.proximoRepasse.quando)} · {brl(summary.proximoRepasse.valorEstimadoCents)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>(estimativa)</Typography>
          </Stack>
        )}
      </AppCard>

      {/* Chips de situação — ícone + rótulo + valor (distintos além da cor) */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.25 }}>
        {chips.map(({ key, value }) => {
          const meta = STATUS_META[key];
          return (
            <Box key={key} sx={{ p: 1.5, borderRadius: '14px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', minWidth: 0 }}>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ color: meta.color(mode), display: 'flex' }}>{meta.icon}</Box>
                <Typography variant="caption" sx={{ fontWeight: 800, color: meta.color(mode), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.label}</Typography>
              </Stack>
              <Typography sx={{ fontWeight: 800, fontSize: { xs: 16, sm: 18 }, mt: 0.5, color: 'text.primary', fontFamily: '"Poppins",sans-serif' }}>{brl(value)}</Typography>
            </Box>
          );
        })}
      </Box>

      {/* Filtros: período + situação */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }} useFlexGap>
        {(['30', '90', '365'] as const).map((r) => (
          <Chip key={r} label={r === '365' ? 'Ano' : `${r} dias`} onClick={() => setRange(r)}
            sx={{ borderRadius: '10px', fontWeight: 700, minHeight: 32, ...(range === r ? { bgcolor: 'rgba(32,178,170,.16)', color: tealText(mode), border: '1px solid rgba(32,178,170,.4)' } : {}) }} />
        ))}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Extrato em CSV — sem dados clínicos">
          <Button onClick={exportCsv} size="small" startIcon={<DownloadOutlinedIcon />} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 44, color: tealText(mode) }}>
            Exportar CSV
          </Button>
        </Tooltip>
      </Stack>
      <Typography variant="caption" sx={{ color: 'text.secondary', mt: -1.5 }}>
        Período contado pela data da consulta. Valores em honorários (sua parte após a taxa da plataforma).
      </Typography>

      {/* Consultas — filtros por situação */}
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }} useFlexGap>
        <Chip size="small" label="Todas" onClick={() => setStatusFilter('todos')}
          sx={{ borderRadius: '8px', fontWeight: 700, ...(statusFilter === 'todos' ? { bgcolor: 'rgba(32,178,170,.16)', color: tealText(mode) } : {}) }} />
        {(Object.keys(STATUS_META) as StatusFin[]).map((k) => (
          <Chip key={k} size="small" icon={STATUS_META[k].icon} label={STATUS_META[k].label} onClick={() => setStatusFilter(k)}
            sx={{ borderRadius: '8px', fontWeight: 700, '& .MuiChip-icon': { color: STATUS_META[k].color(mode) }, ...(statusFilter === k ? { bgcolor: STATUS_META[k].bg(mode), color: STATUS_META[k].color(mode) } : {}) }} />
        ))}
      </Stack>

      {/* Lista de consultas do período */}
      {rows === null ? (
        <CardSkeleton lines={4} />
      ) : filtered.length === 0 ? (
        <AppCard sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ fontWeight: 700, color: 'text.primary' }}>Nenhuma consulta no período</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
            Consultas pagas aparecem aqui automaticamente.
          </Typography>
        </AppCard>
      ) : isWide ? (
        /* Tabela CONTIDA no componente (scroll próprio — §18.11) */
        <Box sx={{ borderRadius: '16px', border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: 480 }}>
            <Table stickyHeader size="small" aria-label="Consultas do período">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 800 }}>Consulta</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Data</TableCell>
                  <TableCell sx={{ fontWeight: 800 }} align="right">Contratado</TableCell>
                  <TableCell sx={{ fontWeight: 800 }} align="right">Plataforma</TableCell>
                  <TableCell sx={{ fontWeight: 800 }} align="right">Honorários</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Situação</TableCell>
                  <TableCell sx={{ width: 44 }} aria-label="Detalhe" />
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((r) => {
                  const meta = STATUS_META[r.statusFinanceiro];
                  const open = expanded === r.reminderId;
                  return (
                    <Fragment key={r.reminderId}>
                      <TableRow hover onClick={() => setExpanded(open ? null : r.reminderId)} sx={{ cursor: 'pointer' }}>
                        <TableCell sx={{ fontWeight: 700, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{dia(r.data)}</TableCell>
                        <TableCell align="right">{brl(r.valorContratadoCents)}</TableCell>
                        <TableCell align="right" sx={{ color: 'text.secondary' }}>{brl(r.taxaPlataformaCents)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: tealText(mode) }}>{brl(r.honorariosCents)}</TableCell>
                        <TableCell>
                          <Chip size="small" icon={meta.icon} label={meta.label}
                            sx={{ height: 24, fontSize: 11.5, fontWeight: 800, borderRadius: '7px', bgcolor: meta.bg(mode), color: meta.color(mode), '& .MuiChip-icon': { color: meta.color(mode) } }} />
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" aria-label={open ? 'Fechar detalhe' : 'Abrir detalhe'} aria-expanded={open}
                            sx={{ color: 'text.secondary', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                            <ExpandMoreOutlinedIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow>
                          <TableCell colSpan={7} sx={{ bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
                            <SplitDetail r={r} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      ) : (
        /* Mobile: cards expansíveis */
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {filtered.map((r) => {
            const meta = STATUS_META[r.statusFinanceiro];
            const open = expanded === r.reminderId;
            return (
              <AppCard key={r.reminderId} kind="interactive" onClick={() => setExpanded(open ? null : r.reminderId)} sx={{ p: 2 }}>
                <Stack direction="row" alignItems="flex-start" spacing={1}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 15, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{dia(r.data)} · contratado {brl(r.valorContratadoCents)}</Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 15, color: tealText(mode) }}>{brl(r.honorariosCents)}</Typography>
                    <ExpandMoreOutlinedIcon sx={{ fontSize: 20, color: 'text.secondary', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                  </Stack>
                </Stack>
                <Chip size="small" icon={meta.icon} label={meta.label}
                  sx={{ mt: 1, height: 22, fontSize: 11, fontWeight: 800, borderRadius: '7px', bgcolor: meta.bg(mode), color: meta.color(mode), '& .MuiChip-icon': { color: meta.color(mode) } }} />
                {open && (<><Divider sx={{ my: 1.5 }} /><SplitDetail r={r} /></>)}
              </AppCard>
            );
          })}
        </Box>
      )}

      {/* Dados de recebimento — chave PIX mascarada + troca com auth reforçada */}
      <AppCard sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <VisibilityOffOutlinedIcon sx={{ fontSize: 20, color: tealText(mode) }} />
          <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 15.5 }}>Dados de recebimento</Typography>
          <Box sx={{ flex: 1 }} />
          <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => { setPixErr(''); setPixOpen(true); }}
            sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 44, color: tealText(mode) }}>
            Alterar
          </Button>
        </Stack>
        <Divider sx={{ my: 1.5 }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 4 }}>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Chave PIX</Typography>
            <Typography sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 15 }}>
              {payout ? (payout.hasPixKey ? payout.pixKeyMasked : 'Não cadastrada') : '—'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Tipo</Typography>
            <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{payout?.pixKeyType ? PIX_TYPES.find((x) => x.value === payout.pixKeyType)?.label ?? payout.pixKeyType : '—'}</Typography>
          </Box>
        </Stack>
        {(payout?.changes?.length ?? 0) > 0 && (
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1.5 }}>
            Última alteração: {dia(payout.changes[0].when)} — trocas exigem sua senha e ficam registradas.
          </Typography>
        )}
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
          A chave é exibida mascarada e armazenada protegida. Trocar não afeta valores já liberados.
        </Typography>
      </AppCard>

      {/* Dialog de troca da chave PIX — senha atual obrigatória (§18.5) */}
      <Dialog open={pixOpen} onClose={() => setPixOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '20px', p: 1 } }}>
        <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 18 }}>Alterar chave de recebimento</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', bgcolor: 'rgba(245,158,11,.10)', p: 1.25, borderRadius: '10px' }}>
            🔒 Confirmação reforçada: por segurança, a troca pede sua senha atual e fica registrada no histórico.
          </Typography>
          <TextField label="Senha atual" type="password" value={pixPwd} onChange={(e) => setPixPwd(e.target.value)} fullWidth autoComplete="current-password"
            slotProps={{ input: { startAdornment: (<InputAdornment position="start"><VisibilityOffOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>) } }} />
          <TextField label="Nova chave PIX" value={pixKey} onChange={(e) => setPixKey(e.target.value)} fullWidth placeholder="ex.: 11999999999" />
          <TextField label="Tipo da chave" select value={pixType} onChange={(e) => setPixType(e.target.value)} fullWidth>
            {PIX_TYPES.map((o) => (<MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>))}
          </TextField>
          {pixErr && <Typography sx={{ color: 'error.main', fontSize: 13, fontWeight: 600 }}>{pixErr}</Typography>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPixOpen(false)} sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44 }}>Cancelar</Button>
          <Button onClick={savePix} variant="contained" disabled={pixSaving || !pixPwd || pixKey.trim().length < 5} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 44 }}>
            {pixSaving ? 'Salvando…' : 'Confirmar troca'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
