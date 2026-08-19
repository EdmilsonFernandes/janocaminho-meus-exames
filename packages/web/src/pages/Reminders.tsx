import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Button, Box, Collapse, ListItem, ListItemIcon, ListItemText, IconButton, Checkbox, TextField, Stack, Chip, List, Accordion, AccordionSummary, AccordionDetails, Alert } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { confirmDialog } from '../components/ConfirmDialog';
import DeleteIcon from '@mui/icons-material/Delete';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import BellIcon from '@mui/icons-material/NotificationsActive';
import { API_URL, token } from '../config';
import { hapticSuccess, hapticError } from '../utils/haptic';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';

// Antecedências oferecidas (minutos antes) — estilo Agenda do Google. Default: 1 dia + 5h + na hora.
const OFFSET_PALETTE: { o: number; l: string }[] = [
  { o: 10080, l: '1 semana antes' },
  { o: 1440, l: '1 dia antes' },
  { o: 720, l: '12 h antes' },
  { o: 300, l: '5 h antes' },
  { o: 60, l: '1 hora antes' },
  { o: 0, l: 'Na hora' },
];
const DEFAULT_OFFSETS = [1440, 300, 0];
const offsetShort = (o: number) => OFFSET_PALETTE.find((p) => p.o === o)?.l ?? (o >= 1440 ? `${Math.round(o / 1440)} dias antes` : o >= 60 ? `${Math.round(o / 60)} h antes` : 'Na hora');

export const RemindersPage = () => {
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [offsets, setOffsets] = useState<number[]>(DEFAULT_OFFSETS);
  const [err, setErr] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false); // colapsado: agendados primeiro

  const load = async () => {
    if (!pid) return;
    const r = await fetch(`${API_URL}/reminders?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setItems(await r.json());
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pid]);

  const toggleOffset = (o: number) => setOffsets((cur) => (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]));

  const add = async () => {
    if (!title.trim() || !date) return;
    setErr(null);
    // Combina data + hora no fuso do usuário -> instante absoluto (ISO) p/ o job calcular certo.
    const iso = new Date(`${date}T${time || '09:00'}`).toISOString();
    try {
      const r = await fetch(`${API_URL}/reminders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ patientId: pid, title: title.trim(), dueDate: iso, notifyOffsetsMin: offsets }),
      });
      if (!r.ok) {
        // Antes falhava silencioso (limpava o form e o lembrete sumia sem mensagem) — agora mostra o erro.
        const d = await r.json().catch(() => ({}));
        hapticError();
        setErr(d?.message || d?.error || 'Não foi possível salvar o lembrete. Tente novamente.');
        return; // mantém o form preenchido pra não perder o que digitou
      }
      setTitle(''); setDate(''); setTime('09:00'); setOffsets(DEFAULT_OFFSETS); await load();
      hapticSuccess();
    } catch {
      hapticError();
      setErr('Sem conexão — o lembrete não foi salvo. Reconecte e tente novamente.');
    }
  };
  const toggle = async (r: any) => {
    await fetch(`${API_URL}/reminders/${r.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ done: !r.done }),
    });
    load();
  };
  const del = async (r: any) => {
    await fetch(`${API_URL}/reminders/${r.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    load();
  };

  const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const overdue = (d: string) => new Date(d) < new Date();

  // Separa FUTUROS (agendados) de PASSADOS (histórico) — não se misturam.
  const now = new Date();
  const upcoming = items.filter((r) => new Date(r.dueDate) >= now).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const past = items.filter((r) => new Date(r.dueDate) < now).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

  const renderItem = (r: any) => (
    <ListItem key={r.id} sx={{ px: 0, borderBottom: '1px solid', borderColor: 'divider', opacity: r.done ? 0.5 : 1, alignItems: 'flex-start' }}>
      <ListItemIcon sx={{ mt: 0.5 }}><Checkbox checked={r.done} onChange={() => toggle(r)} /></ListItemIcon>
      {/* secondary vira <div>: o Stack/Chip (divs) dentro do <p> padrão era DOM inválido. */}
      <ListItemText
        slotProps={{ secondary: { component: 'div' } }}
        primary={<span style={{ textDecoration: r.done ? 'line-through' : 'none', fontWeight: 600 }}>{r.title}</span>}
        secondary={<>
          <span><EventAvailableIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />{fmtDate(r.dueDate)}</span>
          {Array.isArray(r.notifyOffsetsMin) && r.notifyOffsetsMin.length > 0 && (
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
              {r.notifyOffsetsMin.map((o: number) => <Chip key={o} size="small" variant="outlined" label={offsetShort(o)} sx={{ height: 24, fontSize: 12 }} />)}
            </Stack>
          )}
        </>}
      />
      <IconButton edge="end" aria-label={`Excluir lembrete ${r.title}`} onClick={async () => { if (await confirmDialog({ title: 'Excluir lembrete', message: `Apagar "${r.title}"? O aviso programado deixa de ser enviado.`, confirmLabel: 'Excluir' })) del(r); }}><DeleteIcon /></IconButton>
    </ListItem>
  );

  return (
    <PageContainer width="content">
      <PageHeader icon={<BellIcon />} title="Lembretes" />
      {/* PRÓXIMOS primeiro (dado > ferramenta — igual Medições/Vacinas) */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ pb: '8px !important' }}>
          <Typography component="div" variant="h6" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>Próximos lembretes {upcoming.length > 0 && <Chip size="small" label={upcoming.length} sx={{ bgcolor: 'rgba(32,178,170,0.15)', color: '#178f89', fontWeight: 800 }} />}</Typography>
          {upcoming.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 2.5 }}>
              <Box sx={{ fontSize: 40, mb: 1, opacity: 0.5 }}>⏰</Box>
              <Typography color="text.secondary" sx={{ mb: 1.5 }}>Nenhum lembrete agendado — ex.: "Refazer hemograma em 6 meses".</Typography>
              <Button size="small" variant="outlined" onClick={() => setFormOpen(true)} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Criar lembrete</Button>
            </Box>
          ) : (
            <List>{upcoming.map(renderItem)}</List>
          )}
        </CardContent>
      </Card>

      {/* NOVO LEMBRETE — colapsado, abaixo dos agendados */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Novo lembrete</Typography>
            <Button size="small" onClick={() => setFormOpen((o) => !o)} endIcon={<ExpandMoreIcon sx={{ transform: formOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}>{formOpen ? 'Fechar' : 'Criar'}</Button>
          </Stack>
          <Collapse in={formOpen}>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              <TextField label="O que (ex.: Refazer hemograma)" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
              {/* Data + Hora lado a lado com a MESMA largura (alinhamento — antes desalinhavam no mobile) */}
              <Stack direction={{ xs: 'row', sm: 'row' }} spacing={1}>
                <TextField type="date" label="Data" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
                <TextField type="time" label="Hora" value={time} onChange={(e) => setTime(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
              </Stack>
              <Box>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mb: 0.75 }}>
                  <BellIcon fontSize="small" color="action" sx={{ mr: 0.5 }} />
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Quando avisar?</Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  {OFFSET_PALETTE.map((p) => {
                    const on = offsets.includes(p.o);
                    // Seletor PRINCIPAL do recurso: alvo 40px no touch (piso WCAG p/ dedo) +
                    // semântica de toggle (component button + aria-pressed) p/ leitor de tela.
                    return (
                      <Chip key={p.o} component="button" aria-pressed={on} label={p.l} color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'}
                        onClick={() => toggleOffset(p.o)} sx={{ fontWeight: 700, height: { xs: 40, sm: 32 }, fontSize: 13 }} />
                    );
                  })}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Avisamos por <strong>notificação no app</strong>, <strong>push</strong> e <strong>e-mail</strong> em cada antecedência escolhida.
                </Typography>
              </Box>
              {err && <Alert severity="error" sx={{ py: 0.5, borderRadius: '12px' }} onClose={() => setErr(null)}>{err}</Alert>}
              <Button variant="contained" onClick={add} disabled={!title.trim() || !date || offsets.length === 0} sx={{ alignSelf: 'flex-start' }}>Adicionar</Button>
            </Stack>
          </Collapse>
        </CardContent>
      </Card>

      {/* HISTÓRICO (passados) — colapsável, não briga com os agendados */}
      {past.length > 0 && (
        <Card>
          <CardContent sx={{ pb: '8px !important' }}>
            <Accordion elevation={0} sx={{ '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 40, '& .MuiAccordionSummary-content': { my: 0 } }}>
                <Typography component="div" sx={{ fontWeight: 700, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1 }}>Histórico <Chip size="small" label={past.length} sx={{ bgcolor: 'action.hover', color: 'text.secondary', fontWeight: 700 }} /></Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0, pt: 0 }}>
                <List>{past.map(renderItem)}</List>
              </AccordionDetails>
            </Accordion>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
};
