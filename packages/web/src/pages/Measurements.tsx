import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslate, useNotify } from 'react-admin';
import { Card, CardContent, Typography, Button, TextField, Select, MenuItem, FormControl, InputLabel, Box, Chip, IconButton, Stack, Collapse } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { confirmDialog } from '../components/ConfirmDialog';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeight';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import FavoriteIcon from '@mui/icons-material/Favorite';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import RouteIcon from '@mui/icons-material/Route';
import PushPinIcon from '@mui/icons-material/PushPin';
import TimerIcon from '@mui/icons-material/Timer';
import AddIcon from '@mui/icons-material/Add';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { AppCard } from '../components/AppCard';
import { Sparkline } from '../components/Sparkline';
import { STEPS_GOAL } from '../utils/activityStats';

/** Ícones (sem emoji — leitor de tela lia "coração vermelho" e a linguagem do app é ícone). */
export const TYPES = [
  { v: 'BLOOD_PRESSURE', l: 'Pressão arterial', u: 'mmHg', dual: true, color: '#dc2626', icon: <MonitorHeartIcon sx={{ fontSize: 16 }} /> },
  { v: 'WEIGHT', l: 'Peso', u: 'kg', color: '#178f89', icon: <MonitorWeightIcon sx={{ fontSize: 16 }} /> },
  { v: 'GLUCOSE', l: 'Glicose', u: 'mg/dL', color: '#c2410c', icon: <WaterDropIcon sx={{ fontSize: 16 }} /> },
  { v: 'HEART_RATE', l: 'Freq. cardíaca', u: 'bpm', color: '#ef4444', icon: <FavoriteIcon sx={{ fontSize: 16 }} /> },
  // Atividade (Health Connect): sincronizada do celular — leitura, não entra pelo form manual.
  { v: 'STEPS', l: 'Passos', u: 'passos', color: '#0369a1', icon: <DirectionsWalkIcon sx={{ fontSize: 16 }} />, synced: true },
  { v: 'CALORIES', l: 'Calorias', u: 'kcal', color: '#9a3412', icon: <LocalFireDepartmentIcon sx={{ fontSize: 16 }} />, synced: true },
  { v: 'DISTANCE', l: 'Distância', u: 'km', color: '#047857', icon: <RouteIcon sx={{ fontSize: 16 }} />, synced: true },
  { v: 'EXERCISE_MINUTES', l: 'Exercício', u: 'min', color: '#6d28d9', icon: <TimerIcon sx={{ fontSize: 16 }} />, synced: true },
  { v: 'OTHER', l: 'Outro', u: '', color: '#64748b', icon: <PushPinIcon sx={{ fontSize: 16 }} /> },
];
/** Tiles da central de sinais (peso tem card próprio; OTHER segue só no form/histórico). */
const TILE_TYPES = TYPES.filter((t) => t.v !== 'WEIGHT' && t.v !== 'OTHER');

export const MeasurementsPage = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<any[]>([]);
  const [type, setType] = useState('WEIGHT');
  const [value, setValue] = useState('');
  const [value2, setValue2] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState(false); // formulário colapsável (usuário não quer preencher nada por padrão)
  const formRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!pid) return;
    // take=200: o HC grava 3-4 rows/dia — o default curto truncava o histórico das médias.
    const r = await fetch(`${API_URL}/measurements?patientId=${pid}&take=200`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setItems(await r.json());
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pid]);

  // Atalho "registrar X" = 1 clique: pré-seleciona o tipo, abre o form E rola até ele
  // (antes o form abria lá embaixo sem sinal — parecia que o botão não tinha feito nada).
  const openForm = (typeKey: string) => {
    setType(typeKey);
    setValue(''); setValue2('');
    setOpen(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const add = async () => {
    if (!value || !date) return;
    const t = TYPES.find((x) => x.v === type)!;
    const r = await fetch(`${API_URL}/measurements`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ patientId: pid, type, value: Number(value), valueSecondary: t.dual && value2 ? Number(value2) : null, unit: t.u, measuredAt: date }),
    });
    if (r.ok) { notify(`${t.l} registrada ✓`, { type: 'success' }); setValue(''); setValue2(''); load(); }
    else { const e = await r.json().catch(() => ({})); notify(e.error || 'Erro ao registrar', { type: 'error' }); }
  };
  // Dado de saúde (LGPD): exclusão SEMPRE confirmada — 1 toque acidental não apaga histórico.
  const del = async (id: string) => {
    if (!(await confirmDialog({ title: 'Excluir medição', message: 'Apagar esta medição do histórico?', confirmLabel: 'Excluir' }))) return;
    await fetch(`${API_URL}/measurements/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    load();
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const fmtVal = (m: any) => m.valueSecondary != null ? `${m.value}/${m.valueSecondary}` : `${m.value}`;

  // Separa PESO (com tendência) das demais medições — antes tudo numa lista linear misturado.
  const sorted = [...items].sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime());
  const weights = sorted.filter((m) => m.type === 'WEIGHT');
  const latestWeight = weights[0];
  const prevWeight = weights[1];

  // ── CENTRAL DE SINAIS: consolidação por métrica (dedup por DIA — o Health Connect grava
  // 3-4 rows/dia e a lista crua repetia "Passos/Calorias/Distância" como log de banco de
  // dados). Cada tile mostra último valor + média 7d + sparkline; o histórico completo
  // (gráfico, stats, lista diária e exclusões) mora em /medicoes/historico/:type.
  const byType = useMemo(() => {
    const perType = new Map<string, Map<string, any>>(); // type → dia(YYYY-MM-DD) → row mais recente
    for (const m of sorted) {
      const key = String(m.measuredAt).slice(0, 10);
      const per = perType.get(m.type) ?? new Map<string, any>();
      if (!per.has(key)) per.set(key, m); // sorted desc → 1º visto = mais recente do dia
      perType.set(m.type, per);
    }
    const out = new Map<string, { latest: any; avg7: number | null; series7: { value: number; date: string }[] }>();
    for (const [t, per] of perType) {
      const series = [...per.entries()]
        .map(([date, m]) => ({ date, value: Number(m.value), row: m }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      const last7 = series.slice(-7);
      out.set(t, {
        latest: last7.length ? last7[last7.length - 1].row : null,
        avg7: last7.length ? last7.reduce((s, e) => s + e.value, 0) / last7.length : null,
        series7: last7.map((e) => ({ value: e.value, date: e.date })),
      });
    }
    return out;
  }, [items]);

  const fmtAvg = (n: number, unit: string) => unit === 'km' ? n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : Math.round(n).toLocaleString('pt-BR');
  const tileSub = (t: (typeof TYPES)[number], d?: { latest: any; avg7: number | null }) => {
    if (!d?.latest) return 'Nenhum registro';
    if (t.v === 'STEPS') {
      const pct = Math.min(100, Math.round((Number(d.latest.value) / STEPS_GOAL) * 100));
      return `${pct}% da meta · média 7d ${fmtAvg(d.avg7 ?? 0, t.u)}`;
    }
    return d.avg7 != null ? `média 7d ${fmtAvg(d.avg7, t.u)}` : '';
  };

  return (
    <PageContainer width="content" sx={{ pb: { xs: 10, sm: 5 } }}>
      <PageHeader icon={<MonitorWeightIcon />} title={translate('page.measurements')} />

      {/* PESO — destaque com tendência (vazio COMPACTO: não gasta uma tela com empty state) */}
      <Card sx={{
        mb: 2, borderRadius: '16px', overflow: 'hidden',
        background: (t) => t.palette.mode === 'dark'
          ? 'linear-gradient(135deg, rgba(20,35,35,0.85), rgba(15,25,25,0.75))'
          : 'linear-gradient(135deg, rgba(32,178,170,.08), rgba(255,255,255,.9))',
        backdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid', borderColor: 'rgba(32,178,170,.22)',
        boxShadow: '0 8px 24px rgba(32,178,170,0.06)'
      }}>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: weights.length === 0 ? 0 : 1 }}>
            <MonitorWeightIcon sx={{ fontSize: 18, color: 'primary.dark' }} />
            <Typography variant="h6">Peso</Typography>
          </Stack>
          {weights.length === 0 ? (
            <Stack direction="row" alignItems="center" spacing={1.25} useFlexGap flexWrap="wrap">
              <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Nenhum registro ainda — registre e acompanhe sua tendência.</Typography>
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => openForm('WEIGHT')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Registrar</Button>
            </Stack>
          ) : (
            <>
              <Stack direction="row" alignItems="center" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mb: 0.5 }}>
                <Stack direction="row" alignItems="baseline" spacing={0.5}>
                  <Typography sx={{ fontWeight: 800, fontSize: 32, color: 'primary.dark', lineHeight: 1 }}>{latestWeight.value}</Typography>
                  <Typography component="span" sx={{ fontSize: 14, color: 'text.secondary', fontWeight: 600 }}>kg</Typography>
                </Stack>
                {prevWeight && Number(latestWeight.value) !== Number(prevWeight.value) && (() => {
                  const up = Number(latestWeight.value) > Number(prevWeight.value);
                  const diff = Math.abs(Number(latestWeight.value) - Number(prevWeight.value)).toLocaleString('pt-BR');
                  return <Chip size="small" label={`${up ? '↑' : '↓'} ${diff} kg`} sx={{ height: 22, fontWeight: 700, bgcolor: up ? 'rgba(234,88,12,.12)' : 'rgba(22,163,74,.12)', color: up ? '#9a3412' : '#166534' }} />;
                })()}
                <Sparkline points={[...weights].reverse().slice(-10).map((m) => ({ value: Number(m.value), date: m.measuredAt }))} width={96} height={32} />
              </Stack>
              <Typography variant="caption" color="text.secondary">Última medição em {fmtDate(latestWeight.measuredAt)}</Typography>
              {weights.length > 1 && (
                <Stack spacing={0.5} sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
                  {weights.slice(1, 5).map((m) => (
                    <Stack key={m.id} direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" color="text.secondary">{fmtDate(m.measuredAt)}</Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography sx={{ fontWeight: 700 }}>{m.value} kg</Typography>
                        <IconButton size="small" onClick={() => del(m.id)} sx={{ p: 0.5 }}><DeleteIcon fontSize="small" /></IconButton>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* CENTRAL DE SINAIS — um tile por métrica (último valor + média 7d + sparkline).
          Toque → histórico completo. A lista bruta diária agora mora no detalhe. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.25, mb: 2 }}>
        {TILE_TYPES.map((t) => {
          const d = byType.get(t.v);
          const hasData = !!d?.latest;
          return (
            <AppCard
              key={t.v}
              kind="interactive"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/medicoes/historico/${t.v}`)}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/medicoes/historico/${t.v}`); } }}
              aria-label={`Ver histórico de ${t.l}`}
              sx={{ p: 1.5, height: '100%', display: 'flex', flexDirection: 'column', gap: 0.5, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}
            >
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                <Box aria-hidden="true" sx={{ display: 'inline-flex', color: t.color, flexShrink: 0 }}>{t.icon}</Box>
                <Typography noWrap sx={{ fontSize: 11, fontWeight: 700, color: t.color }}>{t.l}</Typography>
              </Stack>
              {hasData ? (
                <Typography noWrap sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 20, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtVal(d!.latest)}<Typography component="span" sx={{ fontSize: 11, color: 'text.disabled', fontWeight: 600 }}> {t.u}</Typography>
                </Typography>
              ) : (
                <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 20, lineHeight: 1.1, color: 'text.disabled' }}>—</Typography>
              )}
              <Typography noWrap sx={{ fontSize: 11, color: 'text.secondary', minHeight: 13 }}>{tileSub(t, d)}</Typography>
              <Box sx={{ mt: 'auto', minHeight: 26, display: 'flex', alignItems: 'flex-end' }}>
                {d && d.series7.length >= 2 && <Sparkline points={d.series7} width={84} height={24} />}
              </Box>
              {t.synced && hasData && <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>via Health Connect</Typography>}
            </AppCard>
          );
        })}
      </Box>

      {/* REGISTRAR — por último (dado em cima, ferramenta embaixo; colapsado por padrão).
          Enter salva (mobile: tecladoDone = salvar, sem caçar o botão). */}
      <Card sx={{ mt: 2 }} ref={formRef}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Nova medição</Typography>
            <Button size="small" onClick={() => setOpen((o) => !o)} endIcon={<ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}>{open ? 'Fechar' : 'Registrar'}</Button>
          </Stack>
          <Collapse in={open}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }} alignItems={{ xs: 'stretch', sm: 'center' }} onKeyDown={(e) => { if (e.key === 'Enter' && value) add(); }}>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Tipo</InputLabel>
                <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value)}>
                  {TYPES.map((t) => <MenuItem key={t.v} value={t.v}>{t.l}</MenuItem>)}
                </Select>
              </FormControl>
              {TYPES.find((t) => t.v === type)?.dual ? (
                <>
                  <TextField size="small" label="Sistólica" type="number" value={value} onChange={(e) => setValue(e.target.value)} sx={{ width: { xs: '100%', sm: 110 } }} />
                  <TextField size="small" label="Diastólica" type="number" value={value2} onChange={(e) => setValue2(e.target.value)} sx={{ width: { xs: '100%', sm: 110 } }} />
                </>
              ) : (
                <TextField size="small" label="Valor" type="number" value={value} onChange={(e) => setValue(e.target.value)} sx={{ width: { xs: '100%', sm: 130 } }} />
              )}
              <TextField size="small" type="date" label="Data" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 160 } }} />
              <Button variant="contained" onClick={add} disabled={!value} sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}>Adicionar</Button>
            </Stack>
          </Collapse>
        </CardContent>
      </Card>
    </PageContainer>
  );
};
