import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Button, TextField, IconButton, Checkbox, Stack, Chip, Box, Collapse, Accordion, AccordionSummary, AccordionDetails, Alert } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { confirmDialog } from '../components/ConfirmDialog';
import DeleteIcon from '@mui/icons-material/Delete';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import BellIcon from '@mui/icons-material/NotificationsActive';
import AddAlarmIcon from '@mui/icons-material/AddAlarm';
import HistoryIcon from '@mui/icons-material/History';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { API_URL, token } from '../config';
import { hapticSuccess, hapticError } from '../utils/haptic';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';

const pulse = keyframes`0%,100%{transform:scale(1)}50%{transform:scale(1.12)}`;

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
  const timeAgo = (d: string) => {
    const days = Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
    if (days < 0) return null;
    if (days === 0) return 'hoje';
    if (days === 1) return 'amanhã';
    if (days < 7) return `em ${days} dias`;
    if (days < 30) return `em ${Math.floor(days / 7)} sem.`;
    return `em ${Math.floor(days / 30)} mês(es)`;
  };

  // Separa FUTUROS (agendados) de PASSADOS (histórico) — não se misturam.
  const now = new Date();
  const upcoming = items.filter((r) => new Date(r.dueDate) >= now).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const past = items.filter((r) => new Date(r.dueDate) < now).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

  const renderItem = (r: any, _i: number) => {
    const isPast = new Date(r.dueDate) < now;
    const isOverdue = isPast && !r.done;
    const ta = timeAgo(r.dueDate);
    return (
      <Card key={r.id} variant="outlined" sx={{
        borderRadius: '16px', overflow: 'hidden',
        opacity: r.done ? 0.55 : 1,
        borderColor: isOverdue ? 'error.main' : 'divider',
        bgcolor: isOverdue ? 'rgba(239,68,68,.04)' : r.done ? 'rgba(0,0,0,0.02)' : 'background.paper',
        transition: 'all .2s',
        '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,.06)' },
      }}>
        <CardContent sx={{ py: 1.75, px: 2, '&:last-child': { pb: 1.75 } }}>
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <Checkbox checked={r.done} onChange={() => toggle(r)} sx={{ mt: -0.5, color: isOverdue ? 'error.main' : undefined }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                <Typography sx={{
                  fontWeight: 700, fontSize: 15, lineHeight: 1.3,
                  textDecoration: r.done ? 'line-through' : 'none',
                  color: r.done ? 'text.secondary' : 'text.primary',
                }}>{r.title}</Typography>
                {ta && !isPast && (
                  <Chip size="small" label={ta} sx={{
                    height: 22, fontSize: 11, fontWeight: 800,
                    bgcolor: 'rgba(32,178,170,.12)', color: '#178f89',
                  }} />
                )}
                {isOverdue && (
                  <Chip size="small" label="Atrasado" color="error" sx={{ height: 22, fontSize: 11, fontWeight: 800 }} />
                )}
              </Stack>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }}>
                <AccessTimeIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                <Typography variant="caption" color="text.secondary">{fmtDate(r.dueDate)}</Typography>
              </Stack>
              {Array.isArray(r.notifyOffsetsMin) && r.notifyOffsetsMin.length > 0 && (
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
                  <BellIcon sx={{ fontSize: 14, color: 'text.disabled', mt: 0.25 }} />
                  {r.notifyOffsetsMin.map((o: number) => <Chip key={o} size="small" variant="outlined" label={offsetShort(o)} sx={{ height: 22, fontSize: 11, borderColor: 'divider' }} />)}
                </Stack>
              )}
            </Box>
            <IconButton size="small" aria-label={`Excluir lembrete ${r.title}`} onClick={async () => { if (await confirmDialog({ title: 'Excluir lembrete', message: `Apagar "${r.title}"? O aviso programado deixa de ser enviado.`, confirmLabel: 'Excluir' })) del(r); }} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  return (
    <PageContainer width="content" sx={{ pb: { xs: 10, sm: 5 } }}>
      <PageHeader icon={<BellIcon />} title="Lembretes" subtitle="Agende avisos para repetir exames, consultas e medicamentos. Avisamos por push, e-mail e notificação." />

      {/* Resumo COMPACTO acionável (P2): uma linha com os números + CTA à lista — antes
          eram 3 contadores grandes ocupando a 1ª dobra sem ação associada. */}
      <Card sx={{
        mb: 2.5, borderRadius: '16px', overflow: 'hidden',
        background: 'linear-gradient(135deg, #0c4a46 0%, #137a72 50%, #178f89 100%)',
        color: '#fff', position: 'relative',
        boxShadow: '0 10px 26px rgba(15,61,58,.2)',
      }}>
        <CardContent sx={{ py: 1.75, px: { xs: 2, sm: 2.5 }, position: 'relative', zIndex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.25} useFlexGap flexWrap="wrap">
            <BellIcon sx={{ fontSize: 20, opacity: 0.9 }} />
            <Typography sx={{ fontSize: 13, fontWeight: 700, flex: 1, minWidth: 150, lineHeight: 1.45 }}>
              {upcoming.length} agendado{upcoming.length === 1 ? '' : 's'}
              {(() => { const n = past.filter((r) => !r.done).length; return n > 0 ? ` · ${n} atrasado${n > 1 ? 's' : ''}` : ''; })()}
              {(() => { const n = past.filter((r) => r.done).length; return n > 0 ? ` · ${n} concluído${n > 1 ? 's' : ''}` : ''; })()}
            </Typography>
            <Button size="small" disableElevation onClick={() => document.getElementById('proximos')?.scrollIntoView({ behavior: 'smooth' })} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: 'rgba(255,255,255,.16)', color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,.24)' } }}>Ver lembretes</Button>
          </Stack>
        </CardContent>
      </Card>

      {/* PRÓXIMOS primeiro (dado > ferramenta — igual Medições/Vacinas) */}
      <Stack id="proximos" direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <EventAvailableIcon sx={{ color: '#178f89', fontSize: 22 }} />
        <Typography sx={{ fontWeight: 900, fontSize: 16, fontFamily: 'Poppins, sans-serif' }}>Próximos lembretes</Typography>
        {upcoming.length > 0 && <Chip size="small" label={upcoming.length} sx={{ bgcolor: 'rgba(32,178,170,0.15)', color: '#178f89', fontWeight: 800, height: 24 }} />}
      </Stack>

      {upcoming.length === 0 ? (
        <Card variant="outlined" sx={{ borderRadius: '16px', mb: 2.5, borderStyle: 'dashed', borderColor: 'divider' }}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Box sx={{ fontSize: 48, mb: 1, opacity: 0.4, animation: `${pulse} 2s ease infinite` }}>⏰</Box>
            <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 0.5 }}>Nenhum lembrete agendado</Typography>
            <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 320, mx: 'auto', fontSize: 14 }}>
              Ex.: "Refazer hemograma em 6 meses" ou "Consulta cardiologista dia 15"
            </Typography>
            <Button variant="contained" startIcon={<AddAlarmIcon />} onClick={() => setFormOpen(true)} sx={{
              borderRadius: '999px', textTransform: 'none', fontWeight: 800,
              bgcolor: '#20b2aa', px: 3, boxShadow: '0 6px 16px rgba(32,178,170,.3)',
              '&:hover': { bgcolor: '#178f89' },
            }}>Criar lembrete</Button>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={1.25} sx={{ mb: 2.5 }}>
          {upcoming.map((r, i) => renderItem(r, i))}
        </Stack>
      )}

      {/* NOVO LEMBRETE — colapsado, abaixo dos agendados */}
      <Card sx={{ mb: 2.5, borderRadius: '16px', overflow: 'hidden', border: '1px solid', borderColor: formOpen ? '#20b2aa' : 'divider', transition: 'border-color .3s', boxShadow: formOpen ? '0 8px 24px rgba(32,178,170,.1)' : '0 4px 16px rgba(0,0,0,0.03)' }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ width: 36, height: 36, borderRadius: '8px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(32,178,170,.12)', color: '#178f89' }}>
                <AddAlarmIcon fontSize="small" />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>Novo lembrete</Typography>
            </Stack>
            <Button size="small" onClick={() => setFormOpen((o) => !o)} endIcon={<ExpandMoreIcon sx={{ transform: formOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>
              {formOpen ? 'Fechar' : 'Criar'}
            </Button>
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
              <Button variant="contained" onClick={add} disabled={!title.trim() || !date || offsets.length === 0}
                startIcon={<AddAlarmIcon />}
                sx={{
                  alignSelf: 'flex-start', borderRadius: '999px', textTransform: 'none',
                  fontWeight: 800, px: 3, bgcolor: '#20b2aa',
                  boxShadow: '0 6px 16px rgba(32,178,170,.3)',
                  '&:hover': { bgcolor: '#178f89' },
                }}>Adicionar</Button>
            </Stack>
          </Collapse>
        </CardContent>
      </Card>

      {/* HISTÓRICO (passados) — colapsável, não briga com os agendados */}
      {past.length > 0 && (
        <Card sx={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
          <CardContent sx={{ pb: '8px !important' }}>
            <Accordion elevation={0} sx={{ '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 40, '& .MuiAccordionSummary-content': { my: 0 } }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <HistoryIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                  <Typography component="div" sx={{ fontWeight: 800, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1, fontFamily: 'Poppins, sans-serif' }}>
                    Histórico <Chip size="small" label={past.length} sx={{ bgcolor: 'action.hover', color: 'text.secondary', fontWeight: 700 }} />
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0, pt: 0 }}>
                <Stack spacing={1}>
                  {past.map((r, i) => renderItem(r, i))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
};
