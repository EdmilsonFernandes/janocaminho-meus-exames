import { useEffect, useState } from 'react';
import { useTranslate } from 'react-admin';
import { Card, CardContent, Typography, Button, TextField, Select, MenuItem, FormControl, InputLabel, List, ListItem, Box, Chip, IconButton, Stack, Collapse } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { confirmDialog } from '../components/ConfirmDialog';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeight';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';

const TYPES = [
  { v: 'BLOOD_PRESSURE', l: 'Pressão arterial', u: 'mmHg', dual: true, color: '#dc2626', emoji: '🩸' },
  { v: 'WEIGHT', l: 'Peso', u: 'kg', color: '#178f89', emoji: '⚖️' },
  { v: 'GLUCOSE', l: 'Glicose', u: 'mg/dL', color: '#ea580c', emoji: '🍬' },
  { v: 'HEART_RATE', l: 'Frequência cardíaca', u: 'bpm', color: '#ef4444', emoji: '❤️' },
  { v: 'OTHER', l: 'Outro', u: '', color: '#64748b', emoji: '📌' },
];

export const MeasurementsPage = () => {
  const translate = useTranslate();
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<any[]>([]);
  const [type, setType] = useState('WEIGHT');
  const [value, setValue] = useState('');
  const [value2, setValue2] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState(false); // formulário colapsável (usuário não quer preencher nada por padrão)

  const load = async () => {
    if (!pid) return;
    const r = await fetch(`${API_URL}/measurements?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setItems(await r.json());
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pid]);

  const add = async () => {
    if (!value || !date) return;
    const t = TYPES.find((x) => x.v === type)!;
    await fetch(`${API_URL}/measurements`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ patientId: pid, type, value: Number(value), valueSecondary: t.dual && value2 ? Number(value2) : null, unit: t.u, measuredAt: date }),
    });
    setValue(''); setValue2(''); load();
  };
  // Dado de saúde (LGPD): exclusão SEMPRE confirmada — 1 toque acidental não apaga histórico.
  const del = async (id: string) => {
    if (!(await confirmDialog({ title: 'Excluir medição', message: 'Apagar esta medição do histórico?', confirmLabel: 'Excluir' }))) return;
    await fetch(`${API_URL}/measurements/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    load();
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const fmtVal = (m: any) => m.valueSecondary != null ? `${m.value}/${m.valueSecondary}` : `${m.value}`;

  // Separa PESO (com tendência) das demais medições vitais — antes tudo numa lista linear misturado.
  const sorted = [...items].sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime());
  const weights = sorted.filter((m) => m.type === 'WEIGHT');
  const vitals = sorted.filter((m) => m.type !== 'WEIGHT');
  const latestWeight = weights[0];
  const prevWeight = weights[1];

  // Sparkline do peso (SVG inline, ~120×36): recompensa visual por registrar — a tendência
  // importa mais que a lista. Cronológica (esquerda→direita = mais antigo→novo).
  const WeightSpark = ({ data }: { data: number[] }) => {
    if (data.length < 2) return null;
    const w = 120, h = 36, pad = 3;
    const min = Math.min(...data), max = Math.max(...data);
    const span = max - min || 1;
    const pts = data.map((v, i) => `${pad + (i * (w - 2 * pad)) / (data.length - 1)},${h - pad - ((v - min) / span) * (h - 2 * pad)}`);
    return (
      <Box component="svg" viewBox={`0 0 ${w} ${h}`} sx={{ width: 120, height: 36, flexShrink: 0 }} aria-hidden="true">
        <polyline points={pts.join(' ')} fill="none" stroke="#178f89" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="3" fill="#178f89" />
      </Box>
    );
  };

  return (
    <PageContainer width="content">
      <PageHeader icon={<MonitorWeightIcon />} title={translate('page.measurements')} />
      {/* DADO PRIMEIRO, ferramenta depois (audit: form-first dava cara de planilha). */}
      {/* PESO — bloco em destaque com tendência + sparkline */}
      <Card sx={{ mb: 2, border: '1px solid', borderColor: 'rgba(32,178,170,.25)', background: 'linear-gradient(135deg, rgba(32,178,170,.08), transparent)' }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>⚖️ Peso</Typography>
          {weights.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 2.5 }}>
              <Box sx={{ fontSize: 40, mb: 1, opacity: 0.5 }}>⚖️</Box>
              <Typography color="text.secondary" sx={{ mb: 1.5 }}>Registre seu peso e acompanhe a tendência aqui.</Typography>
              <Button size="small" variant="outlined" onClick={() => { setType('WEIGHT'); setOpen(true); }} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Registrar peso</Button>
            </Box>
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
                <WeightSpark data={[...weights].reverse().slice(-10).map((m) => Number(m.value))} />
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

      {/* MEDIÇÕES VITAIS — pressão, glicose, FC... com chip colorido por tipo */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Medições vitais</Typography>
          {vitals.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 2.5 }}>
              <Box sx={{ fontSize: 40, mb: 1, opacity: 0.5 }}>🩺</Box>
              <Typography color="text.secondary" sx={{ mb: 1.5 }}>Pressão, glicose e frequência cardíaca que você medir aparecem aqui.</Typography>
              <Button size="small" variant="outlined" onClick={() => { setType('BLOOD_PRESSURE'); setOpen(true); }} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Registrar medição</Button>
            </Box>
          ) : (
            <List>
              {vitals.map((m) => {
                const t = TYPES.find((x) => x.v === m.type) ?? TYPES[TYPES.length - 1];
                return (
                  <ListItem key={m.id} sx={{ px: 0, borderBottom: '1px solid', borderColor: 'divider' }}
                    secondaryAction={<IconButton edge="end" aria-label={`Excluir medição de ${t.l}`} onClick={() => del(m.id)}><DeleteIcon /></IconButton>}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                      <Box sx={{ width: 36, height: 36, borderRadius: '12px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: t.color + '18', color: t.color, fontSize: 18 }}>{t.emoji}</Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700 }}>{t.l}: <Box component="span" sx={{ color: t.color, fontWeight: 800 }}>{fmtVal(m)} {m.unit}</Box></Typography>
                        <Typography variant="caption" color="text.secondary">{fmtDate(m.measuredAt)}{m.note ? ` — ${m.note}` : ''}</Typography>
                      </Box>
                    </Box>
                  </ListItem>
                );
              })}
            </List>
          )}
        </CardContent>
      </Card>

      {/* REGISTRAR — por último (dado em cima, ferramenta embaixo; colapsado por padrão) */}
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Nova medição</Typography>
            <Button size="small" onClick={() => setOpen((o) => !o)} endIcon={<ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}>{open ? 'Fechar' : 'Registrar'}</Button>
          </Stack>
          <Collapse in={open}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }} alignItems={{ xs: 'stretch', sm: 'center' }}>
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
