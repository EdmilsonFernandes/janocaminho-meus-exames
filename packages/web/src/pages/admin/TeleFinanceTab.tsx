// §18.8 (Onda 3, 24/10) — VISÃO FINANCEIRA ADMIN (teleconsultas).
// Os números derivam do ledger (onda 2): GMV nunca é receita; margem de contribuição
// ≠ lucro líquido (caption obrigatória); caixa Asaas/última conciliação ficam p/
// onda 4 — declarados "—", nunca R$ 0,00 falso. KPIs agrupados por VISÃO: Terceiros
// (pacientes+ médicos) / Plataforma / Caixa. Série diária Recharts (reuso do repo).
// Mobile-first 390 → amplia; sem scroll horizontal 320-1440.
import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Card, TextField, MenuItem, useTheme,
  Tooltip, Collapse, IconButton,
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
import { AccountBalanceWalletOutlined } from '@mui/icons-material';
import {
  ResponsiveContainer, AreaChart, Area, Bar, XAxis, YAxis, Tooltip as RTooltip,
  CartesianGrid, ComposedChart, Line,
} from 'recharts';
import { API_URL, token as authToken } from '../../config';
import { tealText } from '../../theme';

const brl = (cents: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents ?? 0) / 100);
const brlShort = (cents: number) => {
  const v = (cents ?? 0) / 100;
  return v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : brl(cents);
};
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

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
  const [doctors, setDoctors] = useState<{ id: string; name: string; crm: string }[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showDiverg, setShowDiverg] = useState(false);

  const period = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(range) * 86_400_000);
    return { from: isoDay(from), to: isoDay(to) };
  }, [range]);

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

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_URL}/admin/doctors`, { headers: { Authorization: `Bearer ${authToken()}` } });
        if (r.ok) setDoctors(((await r.json()).doctors ?? []).map((d: any) => ({ id: d.id, name: d.name, crm: d.crm })));
      } catch { /* filtro de médico é best-effort */ }
    })();
  }, []);

  const serie = useMemo(
    () => (data?.seriePorDia ?? []).map((d: any) => ({ ...d, diaFmt: dia(d.dia + 'T12:00:00') })),
    [data],
  );

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
        <TextField select size="small" label="Médico" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}
          sx={{ minWidth: { xs: 150, sm: 220 }, '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13.5 } }}>
          <MenuItem value="">Todos os médicos</MenuItem>
          {doctors.map((d) => (<MenuItem key={d.id} value={d.id}>{d.name} · CRM {d.crm}</MenuItem>))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <IconButton onClick={load} aria-label="Atualizar" sx={{ color: 'text.secondary' }}><RefreshOutlinedIcon fontSize="small" /></IconButton>
      </Stack>

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
        <Kpi icon={<AccountBalanceOutlinedIcon />} label="Caixa Asaas" value="—"
          caption="Disponível na onda 4 (repasses automáticos) — saldo externo ≠ lucro" tone={mode === 'dark' ? '#94a3b8' : '#64748b'} />
        <Kpi icon={<RefreshOutlinedIcon />} label="Última conciliação" value="—" caption="Conciliação periódica chega com a onda 4" tone={mode === 'dark' ? '#94a3b8' : '#64748b'} />
        <Kpi icon={<WarningAmberOutlinedIcon />} label="Divergências abertas" value={String(data?.divergenciasAbertas ?? 0)}
          caption={data?.divergenciasAbertas ? 'Requerem triagem humana' : 'Nenhuma pendência financeira'} tone={(data?.divergenciasAbertas ?? 0) > 0 ? (mode === 'dark' ? '#fbbf24' : '#b45309') : undefined} />
      </KpiGroup>

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
                  formatter={((v: any, name: any): [string, string] => [brl(Number(v ?? 0) * 100), String(name) === 'volumeCents' ? 'Volume pago' : 'Receita plataforma'])}
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
    </Stack>
  );
};
