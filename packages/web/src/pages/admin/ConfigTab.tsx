import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip, Alert, CircularProgress } from '@mui/material';
import { API_URL, token } from '../../config';
const H = () => ({ Authorization: `Bearer ${token()}` });

/** Configurações — regras do sistema (custos de IA, limites). Leitura; edição rica na próxima fase. */
export const ConfigTab = () => {
  const [s, setS] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch(`${API_URL}/admin/config`, { headers: H() }).then((r) => r.ok ? r.json() : null).then(setS).catch(() => {}).finally(() => setLoading(false)); }, []);
  const creditCosts = s?.creditCosts ?? {};
  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>Configuração avançada (categorias de exame, faixas de referência, prompts da IA, templates, textos legais) vem na próxima fase. Hoje: custos de créditos.</Alert>
      {loading ? <CircularProgress size={20} /> : (
        <Card variant="outlined" sx={{ borderRadius: 2 }}><CardContent>
          <Typography sx={{ fontWeight: 800, mb: 1.5 }}>💎 Custos de créditos (IA)</Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {Object.entries(creditCosts).map(([k, v]) => <Chip key={k} size="small" label={`${k}: ${String(v)} créd.`} />)}
            {Object.keys(creditCosts).length === 0 && <Typography variant="body2" color="text.secondary">Sem config de custos.</Typography>}
          </Stack>
        </CardContent></Card>
      )}
    </Box>
  );
};
