import type { ReactNode } from 'react';
import { Box, Card, CardContent, CircularProgress, Typography } from '@mui/material';

// Card de Score de Saúde — 3 estados: carregando / com score / sem score (dica standalone).
// (Redesign visual = task #11; aqui é extração pura do JSX original.)
const scoreColor = (s: number) => (s >= 80 ? '#2e7d32' : s >= 60 ? '#e65100' : '#c62828');

export const HealthScoreCard = ({ loaded, score, abnormalCount, tip }: { loaded: boolean; score: number | null; abnormalCount: number; tip: ReactNode }) => {
  if (!loaded && score === null) {
    return (
      <Card sx={{ mt: 3, borderRadius: 4, minHeight: 144, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
        <CircularProgress size={28} sx={{ color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 600, color: 'text.secondary' }}>Calculando seu score…</Typography>
      </Card>
    );
  }
  if (score !== null) {
    return (
      <Card sx={{ mt: 3, borderRadius: 4, background: 'linear-gradient(135deg, rgba(32,178,170,.06), rgba(32,178,170,.02))' }}>
        <CardContent>
          {/* Score (esquerda) + Dica IA (direita) lado a lado */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap' }}>
            <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
              <CircularProgress variant="determinate" value={score} size={108} thickness={6} sx={{ color: scoreColor(score), '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }} />
              <Box sx={{ top: 0, left: 0, bottom: 0, right: 0, position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1 }}>{score}</Typography>
                <Typography variant="caption" color="text.secondary">/ 100</Typography>
              </Box>
            </Box>
            <Box sx={{ flex: '1 1 190px', minWidth: 0 }}>{tip}</Box>
          </Box>
          <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Seu Score de Saúde</Typography>
            <Typography variant="body2" color="text.secondary">
              {score >= 80 ? 'Tudo bem! A maioria dos seus valores está na faixa.' : score >= 60 ? 'Atenção a alguns valores — converse com seu médico.' : 'Vários valores fora da faixa — procure orientação médica.'}
            </Typography>
            <Typography variant="caption" color="text.secondary">*Educativo, não substitui o médico. {abnormalCount > 0 ? `${abnormalCount} valor(es) alterado(s) — a maioria costuma ser variação leve.` : 'Nenhum valor alterado.'}</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }
  // loaded && score === null → dica IA standalone
  return (
    <Card sx={{ mt: 3, borderRadius: 4, background: 'linear-gradient(135deg, rgba(16,185,129,.14), rgba(16,185,129,.05))', border: '1px solid #6ee7b7' }}>
      <CardContent>{tip}</CardContent>
    </Card>
  );
};
