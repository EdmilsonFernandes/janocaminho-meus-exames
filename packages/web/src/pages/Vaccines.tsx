import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Button, TextField, IconButton, Stack, Chip, Box, Collapse } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { confirmDialog } from '../components/ConfirmDialog';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import VaccinesIcon from '@mui/icons-material/Vaccines';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';

const fadeUp = keyframes`from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}`;

export const VaccinesPage = () => {
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [nextDate, setNextDate] = useState('');
  const [lot, setLot] = useState('');
  const [formOpen, setFormOpen] = useState(false); // colapsado: a CARTEIRA é a protagonista

  const load = async () => {
    if (!pid) return;
    const r = await fetch(`${API_URL}/vaccines?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setItems(await r.json());
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pid]);

  const add = async () => {
    if (!name.trim() || !date) return;
    await fetch(`${API_URL}/vaccines`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ patientId: pid, name: name.trim(), dateApplied: date, nextDoseDate: nextDate || null, lot: lot || null }),
    });
    setName(''); setNextDate(''); setLot(''); load();
  };
  // Carteira de vacinação: exclusão confirmada (dado de saúde — sem delete de 1 toque).
  const del = async (id: string) => {
    if (!(await confirmDialog({ title: 'Excluir vacina', message: 'Apagar este registro da carteira de vacinação?', confirmLabel: 'Excluir' }))) return;
    await fetch(`${API_URL}/vaccines/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    load();
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const overdue = (d: string) => new Date(d) < new Date();
  const overdueCount = items.filter((v) => v.nextDoseDate && overdue(v.nextDoseDate)).length;

  return (
    <PageContainer width="content" sx={{ pb: { xs: 10, sm: 5 } }}>
      <PageHeader icon={<VaccinesIcon />} title="Carteira de Vacinação" subtitle="Registre suas vacinas e próximas doses — útil na consulta e na viagem." />

      {/* Resumo COMPACTO acionável (P2): antes eram 3 contadores gigantes ocupando a área
          de destaque sem informação nova. Uma linha com os números + CTA direto à carteira. */}
      <Card sx={{ mb: 2.5, borderRadius: '16px', overflow: 'hidden', background: 'linear-gradient(135deg, #0c4a46 0%, #137a72 50%, #178f89 100%)', color: '#fff', position: 'relative', boxShadow: '0 10px 26px rgba(15,61,58,.2)' }}>
        <CardContent sx={{ py: 1.75, px: { xs: 2, sm: 2.5 }, position: 'relative', zIndex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.25} useFlexGap flexWrap="wrap">
            <VaccinesIcon sx={{ fontSize: 20, opacity: 0.9 }} />
            <Typography sx={{ fontSize: 13, fontWeight: 700, flex: 1, minWidth: 150, lineHeight: 1.45 }}>
              {items.length} vacina{items.length === 1 ? '' : 's'} registrada{items.length === 1 ? '' : 's'}
              {overdueCount > 0 ? ` · ${overdueCount} vencida${overdueCount > 1 ? 's' : ''}` : ''}
              {(() => { const n = items.filter((v) => v.nextDoseDate && !overdue(v.nextDoseDate)).length; return n > 0 ? ` · ${n} próxima${n > 1 ? 's' : ''} dose${n > 1 ? 's' : ''}` : ''; })()}
            </Typography>
            <Button size="small" disableElevation onClick={() => document.getElementById('carteira')?.scrollIntoView({ behavior: 'smooth' })} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: 'rgba(255,255,255,.16)', color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,.24)' } }}>Ver carteira</Button>
          </Stack>
        </CardContent>
      </Card>

      {/* CARTEIRA primeiro (consulta > cadastro — audit: form-first dava cara de planilha). */}
      <Stack id="carteira" direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <VaccinesIcon sx={{ color: '#178f89', fontSize: 22 }} />
        <Typography sx={{ fontWeight: 900, fontSize: 16, fontFamily: 'Poppins, sans-serif' }}>Histórico de vacinas</Typography>
      </Stack>

      {items.length === 0 ? (
        <Card variant="outlined" sx={{ borderRadius: '20px', mb: 2.5, borderStyle: 'dashed', borderColor: 'divider' }}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Box sx={{ fontSize: 48, mb: 1, opacity: 0.4 }}>💉</Box>
            <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 0.5 }}>Carteira vazia</Typography>
            <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 340, mx: 'auto', fontSize: 14 }}>
              Sua carteira de vacinas fica aqui — útil na consulta e na viagem.
            </Typography>
            <Button variant="contained" startIcon={<AddCircleOutlineIcon />} onClick={() => setFormOpen(true)} sx={{
              borderRadius: '999px', textTransform: 'none', fontWeight: 800,
              bgcolor: 'primary.main', px: 3, boxShadow: '0 6px 16px rgba(32,178,170,.3)',
              '&:hover': { bgcolor: 'primary.dark' },
            }}>Registrar primeira vacina</Button>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={1.25} sx={{ mb: 2.5 }}>
          {items.map((v, i) => {
            const hasNext = !!v.nextDoseDate;
            const isOverdue = hasNext && overdue(v.nextDoseDate);
            return (
              <Card key={v.id} variant="outlined" sx={{
                borderRadius: '16px', overflow: 'hidden',
                borderColor: isOverdue ? '#ef4444' : 'divider',
                bgcolor: isOverdue ? 'rgba(239,68,68,.03)' : 'background.paper',
                transition: 'all .2s',
                animation: `${fadeUp} .4s ease both`,
                animationDelay: `${i * 50}ms`,
                '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,.06)', transform: 'translateY(-1px)' },
              }}>
                <CardContent sx={{ py: 1.75, px: 2, '&:last-child': { pb: 1.75 } }}>
                  <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                    <Box sx={{
                      width: 40, height: 40, borderRadius: '12px', flexShrink: 0,
                      display: 'grid', placeItems: 'center',
                      bgcolor: isOverdue ? 'rgba(239,68,68,.1)' : 'rgba(32,178,170,.1)',
                      color: isOverdue ? '#ef4444' : '#178f89',
                    }}>
                      <VaccinesIcon fontSize="small" />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, fontSize: 15, lineHeight: 1.3 }}>{v.name}</Typography>
                      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                        <CalendarMonthIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                        <Typography variant="caption" color="text.secondary">Aplicada: {fmt(v.dateApplied)}</Typography>
                        {v.lot && <Chip size="small" label={`Lote: ${v.lot}`} sx={{ height: 20, fontSize: 11, bgcolor: 'rgba(0,0,0,.05)', fontWeight: 600 }} />}
                      </Stack>
                      {hasNext && (
                        <Chip
                          size="small"
                          icon={isOverdue ? <WarningAmberIcon sx={{ fontSize: '14px !important' }} /> : <CheckCircleIcon sx={{ fontSize: '14px !important' }} />}
                          label={`Próxima: ${fmt(v.nextDoseDate)}${isOverdue ? ' (vencida!)' : ''}`}
                          color={isOverdue ? 'error' : 'warning'}
                          sx={{ mt: 0.75, fontWeight: 800, height: 26 }}
                        />
                      )}
                    </Box>
                    <IconButton size="small" aria-label={`Excluir vacina ${v.name}`} onClick={() => del(v.id)} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* REGISTRAR — colapsado, embaixo (ferramenta, não protagonista) */}
      <Card sx={{
        borderRadius: '20px', overflow: 'hidden',
        border: '1px solid', borderColor: formOpen ? 'primary.main' : 'divider',
        transition: 'border-color .3s',
        boxShadow: formOpen ? '0 8px 24px rgba(32,178,170,.1)' : '0 4px 16px rgba(0,0,0,0.03)',
      }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ width: 36, height: 36, borderRadius: '10px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(32,178,170,.12)', color: 'primary.dark' }}>
                <AddCircleOutlineIcon fontSize="small" />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>Registrar vacina</Typography>
            </Stack>
            <Button size="small" onClick={() => setFormOpen((o) => !o)} endIcon={<ExpandMoreIcon sx={{ transform: formOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>
              {formOpen ? 'Fechar' : 'Registrar'}
            </Button>
          </Stack>
          <Collapse in={formOpen}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <TextField size="small" label="Vacina" placeholder="Influenza, COVID-19..." value={name} onChange={(e) => setName(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />
              <TextField size="small" type="date" label="Aplicada em" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 170 } }} />
              <TextField size="small" type="date" label="Próxima dose" value={nextDate} onChange={(e) => setNextDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 170 } }} />
              <TextField size="small" label="Lote" value={lot} onChange={(e) => setLot(e.target.value)} sx={{ width: { xs: '100%', sm: 100 } }} />
              <Button variant="contained" onClick={add} disabled={!name.trim()} startIcon={<AddCircleOutlineIcon />}
                sx={{
                  alignSelf: { xs: 'stretch', sm: 'center' },
                  borderRadius: '999px', textTransform: 'none', fontWeight: 800,
                  bgcolor: 'primary.main', boxShadow: '0 6px 16px rgba(32,178,170,.3)',
                  '&:hover': { bgcolor: 'primary.dark' },
                }}>Adicionar</Button>
            </Stack>
          </Collapse>
        </CardContent>
      </Card>
    </PageContainer>
  );
};
