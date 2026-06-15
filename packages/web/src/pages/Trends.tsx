import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Typography, MenuItem, Select, FormControl, InputLabel, CircularProgress,
} from '@mui/material';
import { Title } from 'react-admin';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, Legend,
} from 'recharts';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { Flag } from '../components/Flag';

interface TS {
  nameCanonical: string;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  points: { performedAt: string | null; valueNumeric: number; flag: string; title: string }[];
}

export const TrendsPage = () => {
  const [pid] = useSelectedPatient();
  const [names, setNames] = useState<{ nameCanonical: string; count: number }[]>([]);
  const [sel, setSel] = useState('');
  const [ts, setTs] = useState<TS | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/items/distinct-names${pid ? `?patientId=${pid}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then(setNames)
      .catch(() => setNames([]));
  }, [pid]);

  useEffect(() => {
    if (!sel) return;
    setLoading(true);
    const q = new URLSearchParams({ nameCanonical: sel, ...(pid ? { patientId: pid } : {}) });
    fetch(`${API_URL}/items/timeseries?${q}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setTs(d))
      .finally(() => setLoading(false));
  }, [sel, pid]);

  const data = (ts?.points ?? []).map((p) => ({
    name: p.performedAt ? new Date(p.performedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 's/d',
    valor: p.valueNumeric,
    flag: p.flag,
    title: p.title,
  }));

  return (
    <Box>
      <Title title="Tendências" />
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Evolução de um analito</Typography>
          <FormControl sx={{ minWidth: 280, mb: 2 }}>
            <InputLabel>Escolha o exame/analito</InputLabel>
            <Select
              value={sel}
              label="Escolha o exame/analito"
              onChange={(e) => setSel(e.target.value as string)}
            >
              {names.map((n) => (
                <MenuItem key={n.nameCanonical} value={n.nameCanonical}>
                  {n.nameCanonical} ({n.count})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {!sel && <Typography color="text.secondary">Envie ao menos um exame laboratorial para ver tendências.</Typography>}
          {loading && <CircularProgress />}
          {!loading && ts && ts.points.length > 0 && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Faixa de referência destacada em verde {ts.unit ? `(${ts.unit})` : ''}.
              </Typography>
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {ts.refLow != null && ts.refHigh != null && (
                    <ReferenceArea y1={ts.refLow} y2={ts.refHigh} fill="#2e7d32" fillOpacity={0.12} />
                  )}
                  <Line type="monotone" dataKey="valor" stroke="#1565c0" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2">Pontos</Typography>
                {data.map((d, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>{d.name} — {d.title}: <strong>{d.valor}</strong></span>
                    <Flag flag={d.flag} />
                  </Box>
                ))}
              </Box>
            </>
          )}
          {!loading && ts && ts.points.length === 0 && (
            <Typography color="text.secondary">Sem pontos numéricos para este analito.</Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};
