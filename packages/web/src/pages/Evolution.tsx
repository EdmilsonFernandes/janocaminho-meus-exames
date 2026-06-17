import { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Typography, CircularProgress, Chip, Stack } from '@mui/material';
import { Title } from 'react-admin';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { useNavigate } from 'react-router-dom';
import { ExplainButton } from '../components/ExplainItem';

interface EvoItem {
  nameCanonical: string; unit: string | null; refLow: number | null; refHigh: number | null;
  firstValue: number; lastValue: number; firstDate: string | null; lastDate: string | null;
  pctChange: number; direction: 'up' | 'down' | 'stable'; predictMonths: number | null;
  inRange: boolean; count: number;
  points: { value: number; date: string | null; flag: string; examId: string; examTitle: string }[];
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 's/d';

export const EvolutionPage = () => {
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<EvoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/items/evolution${pid ? `?patientId=${pid}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [pid]);

  const changes = items.filter((i) => i.direction !== 'stable');
  const stable = items.filter((i) => i.direction === 'stable');

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Title title="Evolução da minha saúde" />
      <Typography variant="h5" gutterBottom>📈 Evolução ao longo do tempo</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Como cada exame evoluiu entre suas coletas. As maiores variações aparecem primeiro.
      </Typography>

      {loading && <CircularProgress />}
      {!loading && items.length === 0 && (
        <Card><CardContent>
          <Typography color="text.secondary">
            Envie ao menos 2 exames laboratoriais de datas diferentes para acompanhar sua evolução.
          </Typography>
        </CardContent></Card>
      )}

      {!loading && changes.length > 0 && (
        <Stack spacing={2} sx={{ mb: 3 }}>
          {changes.map((it) => <EvoCard key={it.nameCanonical} it={it} />)}
        </Stack>
      )}

      {!loading && stable.length > 0 && (
        <>
          <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>✅ Estáveis</Typography>
          <Stack spacing={1}>
            {stable.map((it) => (
              <Card key={it.nameCanonical} variant="outlined">
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                    <Typography>
                      <strong>{it.nameCanonical}</strong> — {it.lastValue}{it.unit ? ` ${it.unit}` : ''}
                      <TrendingFlatIcon fontSize="small" sx={{ color: '#2e7d32', verticalAlign: 'middle', ml: 0.5 }} />
                      estável desde {fmtDate(it.firstDate)}.
                    </Typography>
                    <Chip size="small" label={`${it.count} medições`} variant="outlined" />
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
};

const EvoCard = ({ it }: { it: EvoItem }) => {
  const navigate = useNavigate();
  const up = it.direction === 'up';
  const Icon = up ? TrendingUpIcon : TrendingDownIcon;
  const color = up ? '#e65100' : '#0b5cab';
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
          <Icon sx={{ color }} />
          <Typography variant="h6">{it.nameCanonical}</Typography>
          <ExplainButton name={it.nameCanonical} nameCanonical={it.nameCanonical} />
          <Chip size="small" sx={{ bgcolor: `${color}14`, color, fontWeight: 700 }} label={`${it.pctChange > 0 ? '+' : ''}${it.pctChange}%`} />
          {!it.inRange && <Chip size="small" color="error" variant="outlined" label="fora da faixa" />}
        </Stack>
        <Typography variant="body1">
          {it.firstValue}{it.unit ? ` ${it.unit}` : ''} ({fmtDate(it.firstDate)}) <strong>→</strong>{' '}
          {it.lastValue}{it.unit ? ` ${it.unit}` : ''} ({fmtDate(it.lastDate)})
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {up ? 'Subindo' : 'Caindo'} ao longo de {it.count} {it.count === 1 ? 'medição' : 'medições'}.
          {(it.refLow != null || it.refHigh != null) &&
            ` Faixa de referência: ${it.refLow ?? '—'} a ${it.refHigh ?? '—'}${it.unit ? ` ${it.unit}` : ''}.`}
        </Typography>
        {it.predictMonths != null && (
          <Box sx={{ mt: 1, p: 1, borderRadius: 1.5, bgcolor: `${color}0d`, border: `1px solid ${color}33` }}>
            <Typography variant="body2" sx={{ color, fontWeight: 600 }}>
              ⏱️ Neste ritmo, {it.nameCanonical} {up ? 'ultrapassa' : 'fica abaixo de'} a faixa em ~{it.predictMonths} {it.predictMonths === 1 ? 'mês' : 'meses'}.
            </Typography>
          </Box>
        )}
        {(() => { const lp = it.points[it.points.length - 1]; if (!lp?.examId) return null; return (
          <Box sx={{ mt: 1 }}>
            <Button size="small" onClick={() => navigate(`/exams/${lp.examId}/show`)}>↗ Ver exame de origem ({lp.examTitle || 'origem'})</Button>
          </Box>
        ); })()}
      </CardContent>
    </Card>
  );
};
