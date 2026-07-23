import { Box, Card, CardContent, Typography, Chip, Stack, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { useEffect, useState } from 'react';

const RISK_META = {
  baixo: { emoji: '🟢', color: '#059669', label: 'Baixo', bg: 'rgba(5,150,105,.08)' },
  moderado: { emoji: '🟠', color: '#ea580c', label: 'Moderado', bg: 'rgba(234,88,12,.08)' },
  alto: { emoji: '🔴', color: '#dc2626', label: 'Alto', bg: 'rgba(220,38,38,.08)' },
};

type CardioRisk = { level: string; score: number; factors: { label: string; risk: boolean }[] };

/** Card Risco Cardiometabólico — score composto (LDL + HbA1c + PA + eGFR + HOMA-IR + IMC).
 *  Aceita `risk` do pai (Dashboard já busca o health-summary → 1 fetch só). Sem a prop, busca sozinho. */
export const CardiometabolicRiskCard = ({ risk: riskProp }: { risk?: CardioRisk | null }) => {
  const [pid] = useSelectedPatient();
  const [riskState, setRiskState] = useState<CardioRisk | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Pai passou o dado? Não busca de novo (evita 2× o health-summary no dashboard).
    if (riskProp !== undefined || !pid) return;
    fetch(`${API_URL}/patients/${pid}/health-summary`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRiskState(d?.cardiometabolicRisk ?? null))
      .catch(() => {});
  }, [pid, riskProp]);

  const risk = riskProp !== undefined ? riskProp : riskState;
  if (!risk) return null;
  const meta = RISK_META[risk.level as keyof typeof RISK_META] || RISK_META.baixo;
  // Fatores só incluem insumos presentes; ausência de "IMC"/"PAS" = peso/pressão não cadastrados.
  const hasImc = risk.factors.some((f) => /^IMC/i.test(f.label));
  const hasPa = risk.factors.some((f) => /^PAS/i.test(f.label));
  const missing: string[] = [];
  if (!hasImc) missing.push('peso');
  if (!hasPa) missing.push('pressão arterial');

  return (
    <Card sx={{ mt: 2, background: `linear-gradient(135deg, ${meta.bg}, transparent)`, border: '1px solid', borderColor: meta.color + '30' }}>
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
        {missing.length > 0 && (
          <Box sx={{ mt: 1.5, p: 1, borderRadius: 2, bgcolor: 'rgba(32,178,170,.07)' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              📋 Pra um cálculo completo, cadastre: <b>{missing.join(' e ')}</b> (em Medições).
            </Typography>
            <Button size="small" onClick={() => navigate('/medicoes')} sx={{ mt: 0.5, px: 0, minWidth: 0, minHeight: 0, fontSize: 12, color: '#20b2aa', fontWeight: 700, textTransform: 'none' }}>Ir para Medições →</Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
