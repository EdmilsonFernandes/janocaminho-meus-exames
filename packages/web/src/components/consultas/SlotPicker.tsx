import { useEffect, useState } from 'react';
import { Box, Stack, Typography, CircularProgress, Chip } from '@mui/material';
import { API_URL, token } from '../../config';

/**
 * MOTOR DE SLOTS (item 7, peça 4/4 — lado paciente): grade de horários do médico
 * para o dia selecionado. Só renderiza quando o médico TEM grade (hasAvailability);
 * sem grade o formulário segue com o fluxo manual (a promo maquete nunca engana).
 * Toque num horário livre → onSelect(ISO no fuso -03:00 do Dr. Exame, 100% BR).
 */
export const SlotPicker = ({ doctorId, date, selectedIso, onSelect }: {
  doctorId: string;
  /** YYYY-MM-DD do dia escolhido no form */
  date: string | null;
  selectedIso: string | null;
  onSelect: (iso: string) => void;
}) => {
  const [data, setData] = useState<{ hasAvailability: boolean; slots: { time: string; minutes: number; available: boolean }[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!doctorId || !date) { setData(null); return; }
    setLoading(true);
    fetch(`${API_URL.replace('/api', '')}/api/doctor/availability/${doctorId}/slots?date=${date}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : { hasAvailability: false, slots: [] }))
      .then((d) => setData({ hasAvailability: !!d.hasAvailability, slots: d.slots ?? [] }))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [doctorId, date]);

  if (loading) return <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}><CircularProgress size={16} /><Typography variant="caption" color="text.secondary">buscando horários…</Typography></Stack>;
  if (!data || !data.hasAvailability) return null; // médico sem grade → fluxo manual preservado

  const free = data.slots.filter((s) => s.available);
  return (
    <Box sx={{ mt: 1.25 }}>
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.75 }}>
        Horários do médico neste dia {free.length === 0 && '(nenhum livre — escolha outro dia)'}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {data.slots.map((s) => {
          const iso = `${date}T${String(Math.floor(s.minutes / 60)).padStart(2, '0')}:${String(s.minutes % 60).padStart(2, '0')}:00-03:00`;
          const selected = selectedIso === iso;
          return (
            <Chip
              key={s.time}
              label={s.time}
              disabled={!s.available}
              clickable={s.available}
              color={selected ? 'primary' : 'default'}
              variant={selected ? 'filled' : 'outlined'}
              onClick={() => onSelect(iso)}
              sx={{
                height: 36, minWidth: 64, fontWeight: 800, fontSize: 13, fontVariantNumeric: 'tabular-nums',
                ...(selected ? { bgcolor: 'primary.main', color: '#fff' } : {}),
                ...(s.available && !selected ? { borderColor: 'rgba(32,178,170,.45)', color: '#0f766e' } : {}),
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
};
