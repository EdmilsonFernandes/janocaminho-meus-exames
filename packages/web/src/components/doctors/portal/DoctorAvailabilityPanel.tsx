import { useEffect, useState } from 'react';
import {
  Box, Stack, Typography, Button, IconButton, TextField, MenuItem, Chip, CircularProgress, Alert,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { API_URL, token as userToken } from '../../../config';
import { tealText } from '../../../theme';

/**
 * MOTOR DE SLOTS (item 7, peça 4/4) — painel de disponibilidade do médico.
 * Janelas semanais recorrentes (ex.: ter+qui, 14:00–18:00, 30min). O paciente vê
 * a grade derivada (janelas − ocupados) e escolhe. PUT atômico no servidor
 * (a semana inteira num salvar — transação server-side).
 */

const DOCTOR_TOKEN_KEY = 'doctorToken';
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem(DOCTOR_TOKEN_KEY) || userToken()}` });

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const SLOTS = [15, 20, 30, 45, 60];

interface Window { weekday: number; start: string; end: string; slot: number }

const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMinutes = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

export const DoctorAvailabilityPanel = () => {
  const [windows, setWindows] = useState<Window[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/doctor/availability`, { headers: authHeader() })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => {
        setWindows((d.items ?? []).map((w: any) => ({ weekday: w.weekday, start: toHHMM(w.startMinutes), end: toHHMM(w.endMinutes), slot: w.slotMinutes ?? 30 })));
        setLoaded(true);
      })
      .catch(() => { setWindows([]); setLoaded(true); });
  }, []);

  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const r = await fetch(`${API_URL}/doctor/availability`, {
        method: 'PUT',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: windows.map((w) => ({
            weekday: w.weekday,
            startMinutes: toMinutes(w.start),
            endMinutes: toMinutes(w.end),
            slotMinutes: w.slot,
          })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'Falha ao salvar');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const setW = (i: number, patch: Partial<Window>) => setWindows((ws) => ws.map((w, j) => (j === i ? { ...w, ...patch } : w)));

  return (
    <Box sx={{ mb: 3, p: { xs: 2, sm: 2.5 }, borderRadius: '20px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 0.5 }}>
        <Box sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: 'rgba(15,118,110,0.12)', display: 'grid', placeItems: 'center', color: (t) => tealText(t.palette.mode) }}>
          <EventAvailableIcon />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: { xs: 17, sm: 19 }, color: 'text.primary' }}>
            Horários que você atende
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Janelas semanais recorrentes — seus pacientes veem só os horários livres desta grade.
          </Typography>
        </Box>
      </Stack>

      {error && <Alert severity="error" sx={{ mt: 1.5, borderRadius: '12px' }}>{error}</Alert>}
      {saved && <Alert severity="success" sx={{ mt: 1.5, borderRadius: '12px' }}>Grade salva ✓ — já vale para seus pacientes.</Alert>}

      {!loaded ? (
        <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={24} /></Stack>
      ) : (
        <>
          <Stack spacing={1.25} sx={{ mt: 2 }}>
            {windows.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 1.5, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: '14px' }}>
                Nenhum horário configurado — seus pacientes agendam por link/manual.
                Adicione janelas para habilitar a grade de horários.
              </Typography>
            )}
            {windows.map((w, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ p: 1.25, borderRadius: '14px', border: '1px solid', borderColor: 'divider' }}>
                <TextField select size="small" label="Dia" value={w.weekday} onChange={(e) => setW(i, { weekday: Number(e.target.value) })} sx={{ minWidth: 120 }}>
                  {WEEKDAYS.map((d, di) => <MenuItem key={di} value={di}>{d}</MenuItem>)}
                </TextField>
                <TextField size="small" type="time" label="Início" value={w.start} onChange={(e) => setW(i, { start: e.target.value })} sx={{ minWidth: 110 }} inputProps={{ step: 300 }} />
                <TextField size="small" type="time" label="Fim" value={w.end} onChange={(e) => setW(i, { end: e.target.value })} sx={{ minWidth: 110 }} inputProps={{ step: 300 }} />
                <TextField select size="small" label="Duração" value={w.slot} onChange={(e) => setW(i, { slot: Number(e.target.value) })} sx={{ minWidth: 100 }}>
                  {SLOTS.map((s) => <MenuItem key={s} value={s}>{s} min</MenuItem>)}
                </TextField>
                <Chip size="small" label={`${Math.max(0, Math.floor((toMinutes(w.end) - toMinutes(w.start)) / w.slot))} horários`} sx={{ fontWeight: 700, bgcolor: 'rgba(15,118,110,0.1)', color: (t) => tealText(t.palette.mode) }} />
                <Box sx={{ flex: 1 }} />
                <IconButton size="small" aria-label="Remover janela" onClick={() => setWindows((ws) => ws.filter((_, j) => j !== i))}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </Stack>

          <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
            <Button
              startIcon={<AddCircleOutlineIcon />}
              onClick={() => setWindows((ws) => [...ws, { weekday: 2, start: '14:00', end: '18:00', slot: 30 }])}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '999px' }}
            >
              Adicionar janela
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained" disabled={busy || !loaded}
              onClick={() => void save()}
              sx={{ textTransform: 'none', fontWeight: 800, borderRadius: '999px', px: 3, background: 'linear-gradient(135deg,#20b2aa,#178f89)' }}
            >
              {busy ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Salvar grade'}
            </Button>
          </Stack>
        </>
      )}
    </Box>
  );
};
