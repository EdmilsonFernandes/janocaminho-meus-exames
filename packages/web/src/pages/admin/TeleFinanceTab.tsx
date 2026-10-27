// §18.8 (Onda 3, 24/10) — VISÃO FINANCEIRA ADMIN (teleconsultas) + ONDA 4 (§18.5/§18.6):
// REPASSES SUPERVISIONADOS — seção "Repasses a aprovar" (aprovação envia transferência
// PIX REAL), lista de repasses com estados e toggle do modo automático (default OFF).
// Os números derivam do ledger: GMV nunca é receita; margem de contribuição ≠ lucro
// líquido; caixa Asaas real (cache 5min) — null mostra "—", nunca R$ 0,00 falso.
// Mobile-first 390 → amplia; sem scroll horizontal 320-1440; ações de dinheiro sempre
// mostram valor + destinatário (chave PIX sempre MASCARADA — §18.5).
import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Card, TextField, MenuItem, useTheme, Alert,
  Collapse, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Switch, FormControlLabel, Autocomplete, Avatar, InputAdornment, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import PercentOutlinedIcon from '@mui/icons-material/PercentOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { AccountBalanceWalletOutlined } from '@mui/icons-material';
import {
  ResponsiveContainer, AreaChart, Area, Bar, XAxis, YAxis, Tooltip as RTooltip,
  CartesianGrid, ComposedChart, Line,
} from 'recharts';
import { API_URL, token as authToken } from '../../config';
import { tealText } from '../../theme';
import { CommissionRulesCard } from './CommissionRulesCard';

const brl = (cents: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents ?? 0) / 100);
const brlShort = (cents: number) => {
  const v = (cents ?? 0) / 100;
  return v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : brl(cents);
};
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Estados do repasse (§18.6) em linguagem humana — nunca jargão (payout/transfer). */
const PAYOUT_STATUS: Record<string, { label: string; tone: 'amber' | 'blue' | 'teal' | 'red' | 'violet' }> = {
  requested: { label: 'Aguardando aprovação', tone: 'amber' },
  processing: { label: 'Enviando', tone: 'blue' },
  completed: { label: 'Concluído', tone: 'teal' },
  failed: { label: 'Não concluído', tone: 'red' },
  unknown: { label: 'Sem confirmação', tone: 'violet' },
  cancelled: { label: 'Cancelado', tone: 'violet' },
};
const statusTone = (tone: string, mode: 'light' | 'dark') => ({
  amber: mode === 'dark' ? '#fbbf24' : '#b45309',
  blue: mode === 'dark' ? '#60a5fa' : '#1d4ed8',
  teal: mode === 'dark' ? '#5fc9c3' : '#0e7490',
  red: mode === 'dark' ? '#f87171' : '#b91c1c',
  violet: mode === 'dark' ? '#a78bfa' : '#6d28d9',
}[tone] ?? (mode === 'dark' ? '#94a3b8' : '#64748b'));

type RangeKey = '7' | '30' | '90';

/** Tile KPI — label+valor+caption; grupo visual vem do container. */
const Kpi = ({ icon, label, value, caption, tone }: { icon: ReactNode; label: string; value: string; caption?: string; tone?: string }) => {
  const t = useTheme();
  const c = tone ?? (t.palette.mode === 'dark' ? '#e8eef0' : '#2d3748');
  return (
    <Box sx={{ p: 2, borderRadius: '14px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', minWidth: 0 }}>
      <Stack direction="row" spacing={0.75} alignItems="center">
        <Box sx={{ color: c, display: 'flex', '& svg': { fontSize: 18 } }}>{icon}</Box>
        <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</Typography>
      </Stack>
      <Typography sx={{ fontWeight: 800, fontSize: { xs: 19, sm: 21 }, mt: 0.5, fontFamily: '"Poppins",sans-serif', color: 'text.primary' }}>{value}</Typography>
      {caption && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, lineHeight: 1.3 }}>{caption}</Typography>}
    </Box>
  );
};

/** Grupo de KPIs — separação VISUAL por bloco (título + borda lateral). */
const KpiGroup = ({ title, sub, children, accent }: { title: string; sub?: string; children: ReactNode; accent: string }) => (
  <Box sx={{ borderRadius: '16px', border: '1px solid', borderColor: 'divider', borderLeft: { sm: `3px solid ${accent}` }, p: { xs: 1.5, sm: 2 }, bgcolor: 'background.default' }}>
    <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 14, color: 'text.primary' }}>{title}</Typography>
    {sub && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.25 }}>{sub}</Typography>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' }, gap: 1.25, mt: sub ? 0 : 1.25 }}>{children}</Box>
  </Box>
);

export const TeleFinanceTab = () => {
  const t = useTheme();
  const mode = t.palette.mode as 'light' | 'dark';
  const [range, setRange] = useState<RangeKey>('30');
  const [doctorId, setDoctorId] = useState('');
  const [doctors, setDoctors] = useState<{ id: string; name: string; crm: string; crmUf?: string; specialty?: string; photoUrl?: string }[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showDiverg, setShowDiverg] = useState(false);
  // ── Onda 4: repasses supervisionados ──
  const [payouts, setPayouts] = useState<any[]>([]);
  const [autoOn, setAutoOn] = useState(false);
  const [payoutsBusy, setPayoutsBusy] = useState(false);
  const [approveTarget, setApproveTarget] = useState<any | null>(null); // dialog de confirmação
  const [autoConfirmOpen, setAutoConfirmOpen] = useState(false); // confirm do toggle auto
  const [feedback, setFeedback] = useState<string | null>(null); // resultado da ação (sem jargão)
  const [doctorModalOpen, setDoctorModalOpen] = useState(false);
  const [doctorSearch, setDoctorSearch] = useState('');

  const period = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(range) * 86_400_000);
    return { from: isoDay(from), to: isoDay(to) };
  }, [range]);

  const loadPayouts = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/admin/payouts`, { headers: { Authorization: `Bearer ${authToken()}` } });
      if (!r.ok) return; // seção best-effort — o erro principal é do overview
      const j = await r.json();
      setPayouts(j.payouts ?? []);
      setAutoOn(!!j.auto);
    } catch { /* best-effort */ }
  }, []);

  // ── ONDA 4 (dono 26/10): consultas PAGAS + estorno em 1 clique ──────────────────
  const [paidList, setPaidList] = useState<any[]>([]);
  const [refundTarget, setRefundTarget] = useState<any | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundNote, setRefundNote] = useState<string | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);
  const loadPaid = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/admin/teleconsulta/paid`, { headers: { Authorization: `Bearer ${authToken()}` } });
      if (!r.ok) return;
      const j = await r.json();
      setPaidList(j.items ?? []);
    } catch { /* best-effort */ }
  }, []);
  const doRefund = async () => {
    if (!refundTarget) return;
    setRefundBusy(true);
    setRefundError(null);
    try {
      const r = await fetch(`${API_URL}/admin/teleconsulta/${refundTarget.id}/refund`, { method: 'POST', headers: { Authorization: `Bearer ${authToken()}` } });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        const cents = d?.refundedValueCents ?? refundTarget.priceCents;
        const fee = d?.feeCents ?? 0;
        setRefundNote(
          fee > 0
            ? `Estorno parcial de ${brl(cents)} confirmado (tarifa de ${brl(fee)} não é devolvida pelo provedor) — paciente e médico avisados.`
            : `Estorno de ${brl(cents)} confirmado — paciente e médico avisados.`,
        );
        setRefundTarget(null);
        loadPaid(); load(); // atualiza lista + KPIs (a devolver/devolvidos)
      } else {
        // Erro DENTRO do dialog (bug 26/10: ficava atrás do overlay e o admin só via
        // no DevTools) + também na seção quando fechar. Nada foi alterado no sistema.
        setRefundError(d?.error || d?.detail || 'O provedor recusou o estorno — tente de novo.');
      }
    } catch {
      setRefundError('Sem conexão pra estornar agora.');
    } finally { setRefundBusy(false); }
  };

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const qs = new URLSearchParams({ from: period.from, to: period.to });
      if (doctorId) qs.set('doctorId', doctorId);
      const r = await fetch(`${API_URL}/admin/finance/overview?${qs}`, { headers: { Authorization: `Bearer ${authToken()}` } });
      if (!r.ok) throw new Error('Falha ao carregar a visão financeira.');
      setData(await r.json());
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [period.from, period.to, doctorId]);

  useEffect(() => { load(); loadPayouts(); loadPaid(); }, [load, loadPayouts, loadPaid]);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_URL}/admin/doctors`, { headers: { Authorization: `Bearer ${authToken()}` } });
        if (r.ok) {
          const list = (await r.json()).doctors ?? [];
          setDoctors(list.map((d: any) => ({
            id: d.id,
            name: d.name,
            crm: d.crm,
            crmUf: d.crmUf,
            specialty: d.specialty,
            photoUrl: d.photoUrl,
          })));
        }
      } catch { /* filtro de médico é best-effort */ }
    })();
  }, []);

  const serie = useMemo(
    () => (data?.seriePorDia ?? []).map((d: any) => ({ ...d, diaFmt: dia(d.dia + 'T12:00:00') })),
    [data],
  );

  const pendentes = useMemo(() => payouts.filter((p) => p.status === 'requested'), [payouts]);
  const recentes = useMemo(() => payouts.filter((p) => p.status !== 'requested').slice(0, 8), [payouts]);

  // Onda 4 — aprovação: envia transferência PIX REAL (confirm dialog já mostrou
  // valor + destinatário mascarado). Resultado em linguagem humana, sem jargão.
  const approve = useCallback(async () => {
    if (!approveTarget) return;
    setPayoutsBusy(true);
    try {
      const r = await fetch(`${API_URL}/admin/payouts/${approveTarget.id}/approve`, {
        method: 'POST', headers: { Authorization: `Bearer ${authToken()}`, 'Content-Type': 'application/json' },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? 'Falha ao aprovar repasse.');
      setFeedback(
        j?.payout?.status === 'completed' ? 'Repasse enviado e confirmado.'
          : j?.payout?.status === 'unknown' ? 'Enviado sem confirmação — o sistema vai conciliar com o banco automaticamente (não reenvia).'
          : `Repasse não concluído: ${j?.error ?? 'falha no provedor'}. A equipe recebeu o aviso.`,
      );
    } catch (e: any) {
      setFeedback(e?.message ?? 'Falha ao aprovar repasse.');
    } finally {
      setApproveTarget(null);
      setPayoutsBusy(false);
      await loadPayouts();
      load();
    }
  }, [approveTarget, loadPayouts, load]);

  // Onda 4 — toggle do modo automático (default OFF; decisão do dono, com aviso).
  const toggleAuto = useCallback(async (next: boolean) => {
    setAutoConfirmOpen(false);
    setPayoutsBusy(true);
    try {
      const r = await fetch(`${API_URL}/admin/payouts/auto`, {
        method: 'POST', headers: { Authorization: `Bearer ${authToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? 'Falha ao salvar.');
      setAutoOn(!!j.auto);
      setFeedback(next ? 'Repasse automático LIGADO — os próximos repasses elegíveis serão enviados sem aprovação.' : 'Repasse automático desligado — cada repasse volta a exigir aprovação.');
    } catch (e: any) {
      setFeedback(e?.message ?? 'Falha ao salvar.');
    } finally {
      setPayoutsBusy(false);
    }
  }, []);

  if (loading && !data) {
    return <Typography sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>Carregando visão financeira…</Typography>;
  }
  if (err) {
    return (
      <Card sx={{ p: 3, textAlign: 'center', borderRadius: '16px' }}>
        <Typography sx={{ fontWeight: 700, mb: 1.5 }}>{err}</Typography>
        <Button onClick={load} variant="contained" startIcon={<RefreshOutlinedIcon />} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 44 }}>Tentar de novo</Button>
      </Card>
    );
  }

  const totalVolume = (data?.seriePorDia ?? []).reduce((a: number, d: any) => a + d.volumeCents, 0);
  const hasSerie = serie.length > 0;

  return (
    <Stack spacing={2.5}>
      {/* Filtros: período + médico */}
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
        {(['7', '30', '90'] as RangeKey[]).map((r) => (
          <Chip key={r} label={r === '7' ? '7 dias' : r === '30' ? '30 dias' : '90 dias'} onClick={() => setRange(r)}
            sx={{ borderRadius: '10px', fontWeight: 700, minHeight: 32, ...(range === r ? { bgcolor: 'rgba(32,178,170,.16)', color: tealText(mode), border: '1px solid rgba(32,178,170,.4)' } : {}) }} />
        ))}
        <Autocomplete
          size="small"
          options={doctors}
          value={doctors.find((d) => d.id === doctorId) ?? null}
          onChange={(_e, val) => setDoctorId(val?.id ?? '')}
          getOptionLabel={(option) => `${option.name} · CRM ${option.crm}${option.crmUf ? `-${option.crmUf}` : ''}`}
          isOptionEqualToValue={(option, val) => option.id === val.id}
          noOptionsText="Nenhum médico encontrado"
          sx={{ minWidth: { xs: 200, sm: 280 } }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Filtrar por Médico"
              placeholder="Digite nome ou CRM..."
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13.5 } }}
            />
          )}
          renderOption={(props, option) => (
            <Box component="li" {...props} key={option.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1 }}>
              <Avatar
                src={option.photoUrl}
                sx={{ width: 30, height: 30, fontSize: 12, fontWeight: 700, bgcolor: 'primary.main', color: '#fff' }}
              >
                {option.name[0]}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {option.name}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                  CRM {option.crm}{option.crmUf ? `-${option.crmUf}` : ''}{option.specialty ? ` · ${option.specialty}` : ''}
                </Typography>
              </Box>
            </Box>
          )}
        />

        {/* Botão para Relação Completa de Médicos em Tabela */}
        <Button
          size="small"
          variant="outlined"
          startIcon={<TableChartOutlinedIcon sx={{ fontSize: 16 }} />}
          onClick={() => setDoctorModalOpen(true)}
          sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700, fontSize: 12.5, minHeight: 38 }}
        >
          Relação de Médicos ({doctors.length})
        </Button>

        {doctorId && (
          <Chip
            avatar={<Avatar src={doctors.find((d) => d.id === doctorId)?.photoUrl}>{doctors.find((d) => d.id === doctorId)?.name[0] ?? 'M'}</Avatar>}
            label={`${doctors.find((d) => d.id === doctorId)?.name ?? 'Médico'} (Filtro Ativo)`}
            onDelete={() => setDoctorId('')}
            sx={{ borderRadius: '10px', fontWeight: 700, bgcolor: 'rgba(32,178,170,.14)', color: tealText(mode) }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        <IconButton onClick={load} aria-label="Atualizar" sx={{ color: 'text.secondary' }}><RefreshOutlinedIcon fontSize="small" /></IconButton>
      </Stack>

      {/* ── §18.2 (Onda 2): CONDIÇÃO COMERCIAL — UI do GET/POST commission-rules ── */}
      <CommissionRulesCard doctors={doctors} selectedDoctorId={doctorId} onSelectDoctor={setDoctorId} />


      {/* GMV — topo, com a verdade anti-dúbia: NÃO é receita */}
      <KpiGroup title="Volume movimentado" sub="Total pago por pacientes nas teleconsultas do período" accent="#20b2aa">
        <Kpi icon={<PaidOutlinedIcon />} label="Volume bruto (GMV)" value={brl(data?.volumeBrutoCents)} caption="Total pago por pacientes — não é receita da plataforma" tone={tealText(mode)} />
        <Kpi icon={<UndoOutlinedIcon />} label="A devolver a pacientes" value={brl(data?.aDevolverCents)} caption={`Reservado p/ estorno${data?.devolvidosCents ? ` · ${brl(data.devolvidosCents)} já devolvidos` : ''}`} tone={mode === 'dark' ? '#f87171' : '#b91c1c'} />
      </KpiGroup>

      <KpiGroup title="Terceiros" sub="O que sai da plataforma: pacientes e médicos" accent="#d4a574">
        <Kpi icon={<MedicalServicesOutlinedIcon />} label="Obrigações com médicos" value={brl(data?.obrigacoesMedicosCents)} caption="Honorários a repassar (a liberar + liberados)" />
      </KpiGroup>

      <KpiGroup title="Plataforma" sub="Receita da comissão nas teleconsultas" accent="#20b2aa">
        <Kpi icon={<AccountBalanceWalletOutlined />} label="Receita da plataforma" value={brl(data?.receitaPlataformaCents)} caption="Só a fatia da comissão (20% padrão)" tone={tealText(mode)} />
        <Kpi icon={<PercentOutlinedIcon />} label="Taxas de pagamento" value={brl(data?.taxasCents)} caption="Custos do provedor reconhecidos no período" />
        <Kpi icon={<TrendingUpOutlinedIcon />} label="Margem de contribuição" value={brl(data?.margemContribuicaoCents)} caption="≠ lucro líquido — não inclui custos fixos, impostos e equipe" tone={mode === 'dark' ? '#34d399' : '#047857'} />
      </KpiGroup>

      <KpiGroup title="Caixa" sub="Disponibilidade de saldo externo" accent="#64748b">
        <Kpi icon={<AccountBalanceOutlinedIcon />} label="Caixa Asaas" value={data?.caixaAsaasCents == null ? '—' : brl(data.caixaAsaasCents)}
          caption="Saldo disponível na conta (atualiza a cada 5 min) — caixa externo ≠ lucro"
          tone={data?.caixaAsaasCents == null ? (mode === 'dark' ? '#94a3b8' : '#64748b') : tealText(mode)} />
        <Kpi icon={<RefreshOutlinedIcon />} label="Última conciliação" value={data?.ultimaConciliacao ? dia(data.ultimaConciliacao) + ' ' + new Date(data.ultimaConciliacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}
          caption="Checagem automática a cada 10 min (consultas × extrato × caixa)" tone={mode === 'dark' ? '#94a3b8' : '#64748b'} />
        <Kpi icon={<WarningAmberOutlinedIcon />} label="Divergências abertas" value={String(data?.divergenciasAbertas ?? 0)}
          caption={data?.divergenciasAbertas ? 'Requerem triagem humana' : 'Nenhuma pendência financeira'} tone={(data?.divergenciasAbertas ?? 0) > 0 ? (mode === 'dark' ? '#fbbf24' : '#b45309') : undefined} />
      </KpiGroup>

      {/* ── Onda 4 (§18.5/§18.6): REPASSES — aprovação supervisionada ── */}
      <Box sx={{ borderRadius: '16px', border: '1px solid', borderColor: 'divider', p: { xs: 1.5, sm: 2 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 1.5 }} alignItems={{ sm: 'center' }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
            <SendOutlinedIcon sx={{ fontSize: 20, color: tealText(mode) }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 14 }}>Repasses a aprovar</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                {pendentes.length
                  ? `${pendentes.length} repasse(s) aguardando — aprovar envia a transferência PIX ao médico na hora`
                  : 'Nenhum repasse aguardando aprovação'}
              </Typography>
            </Box>
          </Stack>
          {/* Auto GATED: default OFF — ligar é decisão do dono (confirm + audit) */}
          <FormControlLabel
            control={<Switch checked={autoOn} disabled={payoutsBusy} size="small"
              onChange={(_e, v) => { if (v) setAutoConfirmOpen(true); else toggleAuto(false); }} />}
            label={<Typography variant="caption" sx={{ fontWeight: 700 }}>Automático</Typography>}
            sx={{ m: 0 }}
          />
        </Stack>

        {pendentes.length > 0 && (
          <Stack spacing={1.25} sx={{ mt: 1.5 }}>
            {pendentes.map((p: any) => (
              <Card key={p.id} variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: '14px', bgcolor: 'background.default', borderColor: 'rgba(245,158,11,.35)' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }} alignItems={{ sm: 'center' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 14.5 }}>{p.doctor?.name ?? 'Médico'}{p.doctor?.crm ? ` · CRM ${p.doctor.crm}` : ''}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                      {p.reminder ? `${p.reminder.title} · ${dia(p.reminder.dueDate)}` : 'Consulta'} · chave PIX {p.pixKeyMasked ?? 'não cadastrada'}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontWeight: 800, fontSize: 17, color: tealText(mode), whiteSpace: 'nowrap' }}>{brl(p.amountCents)}</Typography>
                  <Button variant="contained" startIcon={<SendOutlinedIcon />} disabled={payoutsBusy || !p.pixKeyMasked}
                    onClick={() => setApproveTarget(p)}
                    sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 44, px: 2.5 }}>
                    Aprovar e enviar
                  </Button>
                </Stack>
              </Card>
            ))}
          </Stack>
        )}

        {/* Histórico recente — estados com cor (nunca sucesso antes da confirmação) */}
        {recentes.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 13, mb: 1 }}>Repasses recentes</Typography>
            <Stack spacing={0.75}>
              {recentes.map((p: any) => {
                const st = PAYOUT_STATUS[p.status] ?? { label: p.status, tone: 'violet' as const };
                return (
                  <Stack key={p.id} direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0, sm: 1.5 }} alignItems={{ sm: 'center' }} sx={{ fontSize: 13 }}>
                    <Chip label={st.label} size="small" sx={{ borderRadius: 8, fontWeight: 700, minHeight: 26, color: statusTone(st.tone, mode), border: `1px solid ${statusTone(st.tone, mode)}55`, bgcolor: 'transparent', width: { xs: '100%', sm: 190 }, justifyContent: 'flex-start' }} />
                    <Typography component="span" sx={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: { sm: 'nowrap' } }}>
                      {p.doctor?.name ?? 'Médico'} · {brl(p.amountCents)}
                    </Typography>
                    <Typography component="span" sx={{ fontSize: 12.5, color: 'text.secondary', whiteSpace: 'nowrap' }}>{dia(p.requestedAt)}</Typography>
                  </Stack>
                );
              })}
            </Stack>
          </Box>
        )}

        {feedback && (
          <Card variant="outlined" sx={{ mt: 2, p: 1.5, borderRadius: '12px', bgcolor: 'transparent', borderColor: 'rgba(32,178,170,.4)' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography sx={{ fontSize: 13.5, flex: 1 }}>{feedback}</Typography>
              <IconButton size="small" aria-label="Fechar aviso" onClick={() => setFeedback(null)} sx={{ color: 'text.secondary' }}>
                <ExpandMoreOutlinedIcon sx={{ transform: 'rotate(90deg)' }} fontSize="small" />
              </IconButton>
            </Stack>
          </Card>
        )}
      </Box>

      {/* Confirmação da aprovação — valor + destinatário ANTES de mover dinheiro (§18.5) */}
      {/* ── ONDA 4 (dono 26/10): consultas pagas — estorno em 1 clique ──────────── */}
      <Card variant="outlined" sx={{ borderRadius: '16px', bgcolor: 'background.paper', mt: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2.5, pt: 2, pb: 1 }}>
          <UndoOutlinedIcon sx={{ fontSize: 20, color: '#e11d48' }} />
          <Typography sx={{ fontWeight: 800, fontSize: 15, fontFamily: '"Poppins",sans-serif', flex: 1 }}>
            Consultas pagas — estorno em 1 clique
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {paidList.filter((p) => !p.refundedAt).length} pagas · {paidList.filter((p) => p.refundedAt).length} estornadas
          </Typography>
        </Stack>
        {refundNote && (
          <Alert severity={refundNote.startsWith('Estorno de') ? 'success' : 'warning'} sx={{ mx: 2.5, mb: 1, borderRadius: '12px', fontSize: 13 }} onClose={() => setRefundNote(null)}>
            {refundNote}
          </Alert>
        )}
        {paidList.length === 0 ? (
          <Typography sx={{ px: 2.5, pb: 2, fontSize: 13, color: 'text.secondary' }}>
            Nenhuma teleconsulta paga ainda — pagamentos aparecem aqui em tempo real (webhook Asaas).
          </Typography>
        ) : (
          <TableContainer sx={{ maxHeight: 360, px: 1.5, pb: 1.5 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 800, fontSize: 12 }}>Paciente</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: 12 }}>Médico</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, fontSize: 12 }}>Valor</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: 12 }}>Pago em</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: 12 }}>Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, fontSize: 12 }}>Ação</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paidList.map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell sx={{ fontSize: 13, fontWeight: 700, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.patientName}</TableCell>
                    <TableCell sx={{ fontSize: 12.5, color: 'text.secondary', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.doctorName || '—'}</TableCell>
                    <TableCell align="right" sx={{ fontSize: 13, fontWeight: 800 }}>{brl(p.priceCents)}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>
                      {p.paidAt ? new Date(p.paidAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>
                      {p.refundedAt ? (
                        <Chip size="small" label="Estornada ✓" sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(139,92,246,0.12)', color: '#7c3aed' }} />
                      ) : p.teleStatus === 'completed' ? (
                        <Chip size="small" label="Realizada" sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(16,185,129,0.15)', color: '#059669' }} />
                      ) : p.teleStatus === 'no_show' ? (
                        <Chip size="small" label={`Não realizada${p.noShowBy === 'doctor' ? ' (médico ausente)' : ''}`} sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(245,158,11,0.14)', color: '#b45309' }} />
                      ) : p.teleStatus === 'cancelled' ? (
                        <Chip size="small" label="Cancelada" sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(100,116,139,0.15)', color: '#64748b' }} />
                      ) : (
                        <Chip size="small" label="Agendada (paga)" sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(13,148,136,0.14)', color: '#0d9488' }} />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {p.refundedAt ? (
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11 }}>
                          {new Date(p.refundedAt).toLocaleDateString('pt-BR')}
                        </Typography>
                      ) : (
                        <Button
                          size="small" color="error" variant="outlined"
                          onClick={() => { setRefundNote(null); setRefundTarget(p); }}
                          sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, fontSize: 12, height: 28 }}
                        >
                          Estornar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {/* Confirmação do estorno (dinheiro real — nunca sem confirmar) */}
      <Dialog open={!!refundTarget} onClose={() => { if (!refundBusy) { setRefundTarget(null); setRefundError(null); } }}>
        <DialogTitle>Estornar pagamento</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.6 }}>
            Devolver <strong>{refundTarget ? brl(refundTarget.priceCents) : ''}</strong> pagos por{' '}
            <strong>{refundTarget?.patientName}</strong>
            {refundTarget?.doctorName ? ` (consulta do Dr. ${String(refundTarget.doctorName).replace(/^Dr\.?\s*/i, '')})` : ''}?
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.6, mt: 1 }}>
            O valor volta pro PIX do paciente via Asaas (até 2 dias úteis). Paciente e médico são avisados e a consulta é encerrada como cancelada.
          </Typography>
          {refundError && (
            <Alert severity="error" sx={{ mt: 1.5, borderRadius: '12px', fontSize: 13 }} role="alert">
              {refundError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button disabled={refundBusy} onClick={() => setRefundTarget(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Voltar</Button>
          <Button color="error" variant="contained" disabled={refundBusy} onClick={() => void doRefund()} sx={{ textTransform: 'none', fontWeight: 800, borderRadius: '999px' }}>
            {refundBusy ? 'Estornando…' : 'Estornar agora'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!approveTarget} onClose={() => setApproveTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif' }}>Aprovar repasse</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontWeight: 800, fontSize: 24, color: tealText(mode), my: 1 }}>{brl(approveTarget?.amountCents)}</Typography>
          <Typography variant="body2" sx={{ mb: 0.5 }}>Para: <strong>{approveTarget?.doctor?.name ?? 'médico'}</strong>{approveTarget?.doctor?.crm ? ` (CRM ${approveTarget.doctor.crm})` : ''}</Typography>
          <Typography variant="body2" sx={{ mb: 0.5 }}>Chave PIX ({approveTarget?.pixKeyType ?? '—'}): <strong>{approveTarget?.pixKeyMasked ?? '—'}</strong></Typography>
          <Typography variant="body2" sx={{ mb: 1.5 }}>Consulta: {approveTarget?.reminder ? `${approveTarget.reminder.title} · ${dia(approveTarget.reminder.dueDate)}` : '—'}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Ao confirmar, a transferência PIX é enviada pelo banco agora. Confira valor e destinatário — a operação é definitiva.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setApproveTarget(null)} disabled={payoutsBusy} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 44 }}>Cancelar</Button>
          <Button variant="contained" onClick={approve} disabled={payoutsBusy} startIcon={<SendOutlinedIcon />} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 44 }}>Aprovar e enviar</Button>
        </DialogActions>
      </Dialog>

      {/* Confirmação do modo automático — default OFF; ligar muda fluxo de dinheiro */}
      <Dialog open={autoConfirmOpen} onClose={() => setAutoConfirmOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif' }}>Ligar repasse automático?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Com o modo automático, todo repasse elegível é <strong>enviado sem aprovação</strong>, na checagem de 10 minutos.
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Recomendado só depois de alguns repasses manuais validados. Você pode desligar a qualquer momento (fica registrado quem mudou).
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAutoConfirmOpen(false)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 44 }}>Manter manual</Button>
          <Button variant="contained" color="warning" onClick={() => toggleAuto(true)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 44 }}>Ligar automático</Button>
        </DialogActions>
      </Dialog>

      {/* Divergências (Exceções financeiras) — expansível */}
      {(data?.divergenciasAbertas ?? 0) > 0 && (
        <Box sx={{ borderRadius: '16px', border: '1px solid rgba(245,158,11,.35)', p: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ cursor: 'pointer' }} onClick={() => setShowDiverg((v) => !v)}>
            <WarningAmberOutlinedIcon sx={{ fontSize: 20, color: mode === 'dark' ? '#fbbf24' : '#b45309' }} />
            <Typography sx={{ fontWeight: 800, flex: 1 }}>Exceções financeiras · {data.divergenciasAbertas} aberta(s)</Typography>
            <IconButton size="small" aria-label="Expandir exceções" aria-expanded={showDiverg} sx={{ color: 'text.secondary', transform: showDiverg ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
              <ExpandMoreOutlinedIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Collapse in={showDiverg}>
            <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {(data.divergencias ?? []).map((d: any) => (
                <Stack key={d.id} direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0, sm: 1.5 }} sx={{ fontSize: 13, color: 'text.secondary' }}>
                  <Typography component="span" sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>{dia(d.createdAt)}</Typography>
                  <Typography component="span" sx={{ fontSize: 13 }}>Divergência de escrituração em consulta já registrada (triagem manual)</Typography>
                  {d.reminderId && <Typography component="code" sx={{ fontSize: 12, fontFamily: 'monospace' }}>{d.reminderId.slice(0, 12)}…</Typography>}
                </Stack>
              ))}
            </Box>
          </Collapse>
        </Box>
      )}

      {/* Série diária — volume x receita (Recharts, reuso do repo) */}
      <Box sx={{ borderRadius: '16px', border: '1px solid', borderColor: 'divider', p: { xs: 1.5, sm: 2 } }}>
        <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 14 }}>Movimento por dia</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
          Volume pago (barras) × receita da plataforma (linha){totalVolume ? ` · volume no gráfico: ${brlShort(totalVolume)}` : ''}
        </Typography>
        {hasSerie ? (
          <Box sx={{ width: '100%', height: { xs: 220, sm: 260 } }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={mode === 'dark' ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'} />
                <XAxis dataKey="diaFmt" tick={{ fontSize: 11, fill: mode === 'dark' ? '#94a3b8' : '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v: number) => brlShort(v * 100)} tick={{ fontSize: 11, fill: mode === 'dark' ? '#94a3b8' : '#64748b' }} tickLine={false} axisLine={false} width={70} />
                <RTooltip
                  formatter={((v: any, name: any): [string, string] => [brl(Number(v ?? 0)), String(name) === 'volumeCents' ? 'Volume pago' : 'Receita plataforma'])}
                  labelStyle={{ color: mode === 'dark' ? '#e8eef0' : '#2d3748', fontWeight: 700 }}
                  contentStyle={{ borderRadius: 10, border: '1px solid rgba(0,0,0,.1)', background: mode === 'dark' ? '#1a2424' : '#fff' }}
                />
                <Bar dataKey="volumeCents" name="volumeCents" fill="#20b2aa" radius={[6, 6, 0, 0]} maxBarSize={34} />
                <Line dataKey="receitaCents" name="receitaCents" stroke="#d4a574" strokeWidth={2.5} dot={false} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Typography sx={{ py: 3, textAlign: 'center', color: 'text.secondary', fontSize: 14 }}>
            Sem movimentação financeira no período.
          </Typography>
        )}
      </Box>

      {/* Dialog: Relação Completa de Médicos com Fotos e CRM */}
      <Dialog
        open={doctorModalOpen}
        onClose={() => setDoctorModalOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: '20px', p: 1 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 18 }}>
                Relação de Médicos da Plataforma ({doctors.length})
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Selecione um médico para ver o extrato financeiro exclusivo ou configurar taxas específicas.
              </Typography>
            </Box>
            <IconButton onClick={() => setDoctorModalOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Buscar por nome, CRM ou especialidade..."
            value={doctorSearch}
            onChange={(e) => setDoctorSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
          />
          <TableContainer sx={{ maxHeight: 420 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 800, fontSize: 13 }}>Médico</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: 13 }}>CRM</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: 13 }}>Especialidade</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, fontSize: 13 }}>Ação</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {doctors
                  .filter((d) => {
                    if (!doctorSearch) return true;
                    const q = doctorSearch.toLowerCase();
                    return d.name.toLowerCase().includes(q) || d.crm.toLowerCase().includes(q) || (d.specialty && d.specialty.toLowerCase().includes(q));
                  })
                  .map((doc) => (
                    <TableRow key={doc.id} hover selected={doc.id === doctorId}>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={1.25}>
                          <Avatar src={doc.photoUrl} sx={{ width: 34, height: 34, fontSize: 13, fontWeight: 700, bgcolor: 'primary.main', color: '#fff' }}>
                            {doc.name[0]}
                          </Avatar>
                          <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>{doc.name}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
                        {doc.crm}{doc.crmUf ? `-${doc.crmUf}` : ''}
                      </TableCell>
                      <TableCell sx={{ fontSize: 13, color: 'text.secondary' }}>
                        {doc.specialty || 'Clínica Geral'}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant={doc.id === doctorId ? 'contained' : 'outlined'}
                          onClick={() => {
                            setDoctorId(doc.id);
                            setDoctorModalOpen(false);
                          }}
                          sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, fontSize: 12 }}
                        >
                          {doc.id === doctorId ? 'Filtro Ativo' : 'Ver Extrato'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {doctorId && (
            <Button color="inherit" onClick={() => { setDoctorId(''); setDoctorModalOpen(false); }} sx={{ textTransform: 'none', fontWeight: 700 }}>
              Limpar Filtro (Ver Todos)
            </Button>
          )}
          <Button variant="contained" onClick={() => setDoctorModalOpen(false)} sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700 }}>
            Fechar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};
