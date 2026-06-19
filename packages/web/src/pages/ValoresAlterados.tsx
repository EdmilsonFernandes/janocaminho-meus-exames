import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, CircularProgress, Stack, Chip } from '@mui/material';
import { Title } from 'react-admin';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { ExplainButton } from '../components/ExplainItem';
import { TelemedicineButton } from '../components/TelemedicineButton';

/** Mostra SÓ os valores fora da faixa (mapeados), do exame mais recente ao mais antigo. */
export const ValoresAlteradosPage = () => {
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/items/abnormal${pid ? `?patientId=${pid}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [pid]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
      <Title title="Valores alterados" />
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <WarningAmberIcon sx={{ color: 'error.main' }} />
        <Typography variant="h5" sx={{ fontWeight: 800 }}>Valores fora da faixa</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Todos os valores alterados, do mais recente — toque em <strong>Agendar</strong> para o especialista daquele marcador.</Typography>

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
      ) : items.length === 0 ? (
        <Card><CardContent><Typography color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>Nenhum valor alterado — tudo dentro da faixa. ✅</Typography></CardContent></Card>
      ) : (
        <Stack spacing={1}>
          {items.map((it) => (
            <Card key={it.id} variant="outlined" sx={{ borderLeft: '5px solid', borderColor: 'error.main', borderRadius: 3 }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ flex: '1 1 55%', minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                    <Typography sx={{ fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{it.name}</Typography>
                    <ExplainButton name={it.name} nameCanonical={it.nameCanonical} />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{it.examTitle} • {it.performedAt ? new Date(it.performedAt).toLocaleDateString('pt-BR') : 's/d'}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography component="span" sx={{ fontSize: '1.4rem', fontWeight: 800, color: 'error.main' }}>{it.valueText}</Typography>
                  {it.unit ? <Typography component="span" sx={{ color: 'text.secondary', ml: 0.5, fontSize: '0.8rem' }}>{it.unit}</Typography> : null}
                </Box>
                <Chip size="small" color="error" variant="outlined" label={`Ref: ${it.refText || '—'}`} />
                <TelemedicineButton marker={it.nameCanonical} compact />
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>*Educativo. Sempre confirme com seu médico.</Typography>
    </Box>
  );
};
