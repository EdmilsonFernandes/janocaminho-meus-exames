import { Box, Card, CardContent, Typography, Chip, Stack } from '@mui/material';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { useEffect, useState } from 'react';

const RISK_META = {
  baixo: { emoji: '🟢', color: '#059669', label: 'Baixo', bg: 'rgba(5,150,105,.08)' },
  moderado: { emoji: '🟠', color: '#ea580c', label: 'Moderado', bg: 'rgba(234,88,12,.08)' },
  alto: { emoji: '🔴', color: '#dc2626', label: 'Alto', bg: 'rgba(220,38,38,.08)' },
};

/** Card Risco Cardiometabólico — score composto (LDL + HbA1c + PA + eGFR + HOMA-IR + IMC). */
export const CardiometabolicRiskCard = () => {
  const [pid] = useSelectedPatient();
  const [risk, setRisk] = useState<{ level: string; score: number; factors: { label: string; risk: boolean }[] } | null>(null);

  useEffect(() => {
    if (!pid) return;
    fetch(`${API_URL}/patients/${pid}/health-summary`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRisk(d?.cardiometabolicRisk ?? null))
      .catch(() => {});
  }, [pid]);

  if (!risk) return null;
  const meta = RISK_META[risk.level as keyof typeof RISK_META] || RISK_META.baixo;

  return (
    <Card sx={{ mt: 2, borderRadius: 4, background: `linear-gradient(135deg, ${meta.bg}, transparent)`, border: '1px solid', borderColor: meta.color + '30' }}>
      <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Box sx={{ fontSize: 36, lineHeight: 1 }}>{meta.emoji}</Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: meta.color, display: 'block', mb: 0.25 }}>❤️ RISCO CARDIOMETABÓLICO</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: 20, fontFamily: 'Poppins, sans-serif', lineHeight: 1.2, color: 'text.primary' }}>
              {meta.label} <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>({risk.score}/100)</Typography>
            </Typography>
          </Box>
        </Stack>
        {risk.factors.filter((f) => f.risk).length > 0 && (
          <Box sx={{ mt: 1.25, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {risk.factors.filter((f) => f.risk).map((f, i) => (
              <Chip key={i} size="small" label={f.label} sx={{ bgcolor: meta.color + '15', color: meta.color, fontWeight: 600, height: 22, fontSize: 11 }} />
            ))}
          </Box>
        )}
        {risk.factors.filter((f) => f.risk).length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>✅ Nenhum fator de risco identificado nos marcadores disponíveis.</Typography>
        )}
      </CardContent>
    </Card>
  );
};
