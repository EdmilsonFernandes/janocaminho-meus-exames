import { useEffect, useState } from 'react';
import { Box, Stack, Typography, Skeleton, alpha, useTheme } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { API_URL, token } from '../../config';
import { AppCard } from '../AppCard';

/**
 * CorrelationSection — "Hábitos e sinais que contextualizam seus exames".
 * Mostra correlações detectadas pelo CorrelationEngine com a linguagem
 * 4-camadas: Observação → Contexto → Evidência → Próxima ação.
 * Só aparece quando há correlações com confiança suficiente.
 */

interface Correlation {
  biomarker: string;
  hcMetricLabel: string;
  biomarkerDelta: number;
  hcDelta: number;
  biomarkerFrom: number;
  biomarkerTo: number;
  hcFrom: number;
  hcTo: number;
  direction: string;
  evidenceLevel: 'HIGH' | 'MODERATE' | 'EXPLORATORY';
  confidenceScore: number;
  evidenceSource: string;
  evidenceStatement: string;
  windowDays: number;
}

const EVIDENCE_LABEL: Record<string, string> = {
  HIGH: 'Evidência forte',
  MODERATE: 'Evidência moderada',
  EXPLORATORY: 'Exploratório',
};

export const CorrelationSection = ({ patientId }: { patientId?: string }) => {
  const theme = useTheme();
  const [findings, setFindings] = useState<Correlation[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url = `${API_URL}/measurements/correlations${patientId ? `?patientId=${patientId}` : ''}`;
    fetch(url, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : { findings: [] }))
      .then((d) => setFindings(d.findings ?? []))
      .catch(() => setFindings([]))
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) {
    return (
      <AppCard sx={{ p: 2, mb: 2 }}>
        <Skeleton variant="rounded" width={220} height={20} sx={{ mb: 1.5 }} />
        <Skeleton variant="rounded" height={60} />
      </AppCard>
    );
  }
  if (!findings?.length) return null;

  return (
    <AppCard kind="tinted" tone="primary" sx={{ p: 2, mb: 2 }}>
      {/* Header */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <TrendingUpIcon sx={{ fontSize: 19, color: 'primary.dark' }} />
        <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 700, fontSize: 15 }}>
          Hábitos e sinais que contextualizam seus exames
        </Typography>
      </Stack>

      {findings.slice(0, 3).map((f, i) => (
        <Box key={i} sx={{
          mb: i < Math.min(findings.length, 3) - 1 ? 1.5 : 0,
          pb: i < Math.min(findings.length, 3) - 1 ? 1.5 : 0,
          borderBottom: i < Math.min(findings.length, 3) - 1 ? `1px solid ${alpha(theme.palette.primary.main, 0.12)}` : 'none',
        }}>
          {/* 1. OBSERVAÇÃO */}
          <Stack direction="row" spacing={2} sx={{ mb: 0.75, flexWrap: 'wrap', rowGap: 0.5 }}>
            <Stack direction="row" spacing={0.5} alignItems="center"
              sx={{ px: 1, py: 0.4, borderRadius: '99px', bgcolor: alpha(theme.palette.primary.main, 0.08) }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'primary.dark' }}>
                {f.hcMetricLabel}
              </Typography>
              {f.hcDelta > 0
                ? <TrendingUpIcon sx={{ fontSize: 13, color: 'success.main' }} />
                : <TrendingDownIcon sx={{ fontSize: 13, color: 'primary.main' }} />}
              <Typography sx={{ fontSize: 12, fontWeight: 800 }}>
                {f.hcDelta > 0 ? '+' : ''}{f.hcDelta}%
              </Typography>
            </Stack>
            <Stack direction="row" spacing={0.5} alignItems="center"
              sx={{ px: 1, py: 0.4, borderRadius: '99px', bgcolor: alpha(theme.palette.primary.main, 0.08) }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'primary.dark' }}>
                🧪 {f.biomarker}
              </Typography>
              {f.biomarkerDelta < 0
                ? <TrendingDownIcon sx={{ fontSize: 13, color: 'success.main' }} />
                : <TrendingUpIcon sx={{ fontSize: 13, color: f.direction === 'both_worsened' ? 'error.main' : 'primary.main' }} />}
              <Typography sx={{ fontSize: 12, fontWeight: 800 }}>
                {f.biomarkerFrom}→{f.biomarkerTo} ({f.biomarkerDelta > 0 ? '+' : ''}{f.biomarkerDelta}%)
              </Typography>
            </Stack>
          </Stack>

          {/* 2+3. CONTEXTO + EVIDÊNCIA */}
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.55 }}>
            {f.evidenceStatement}
          </Typography>

          {/* Evidência badge */}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
            <Typography sx={{
              fontSize: 10, fontWeight: 700, px: 0.75, py: 0.25, borderRadius: '8px',
              bgcolor: f.evidenceLevel === 'HIGH'
                ? alpha('#059669', 0.12) : alpha('#b45309', 0.12),
              color: f.evidenceLevel === 'HIGH' ? '#047857' : '#92400e',
            }}>
              {EVIDENCE_LABEL[f.evidenceLevel]} · {f.evidenceSource}
            </Typography>
          </Stack>
        </Box>
      ))}

      {/* 4. PRÓXIMA AÇÃO */}
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1.5, fontStyle: 'italic' }}>
        Estas mudanças ocorreram no mesmo período — não é possível determinar quanto cada fator contribuiu. Continue acompanhando e converse com seu médico sobre seus resultados.
      </Typography>
    </AppCard>
  );
};
