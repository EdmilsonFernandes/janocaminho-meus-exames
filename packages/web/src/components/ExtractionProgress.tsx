import { useEffect, useState } from 'react';
import { Box, Typography, LinearProgress } from '@mui/material';
import { DrExame } from './DrExame';

const STEPS = [
  'Lendo o exame por visão…',
  'Identificando os analitos…',
  'Conferindo valores e referências…',
  'Comparando com o exame anterior…',
  'Montando o resumo…',
];

/** Progresso animado com o Dr. Exame durante a extração — passa credibilidade ao usuário. */
export const ExtractionProgress = () => {
  const [step, setStep] = useState(0);
  const [pct, setPct] = useState(6);
  useEffect(() => {
    const stepTimer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4500);
    const pctTimer = setInterval(() => setPct((p) => Math.min(p + Math.max(0.6, (90 - p) / 7), 93)), 700);
    return () => { clearInterval(stepTimer); clearInterval(pctTimer); };
  }, []);
  return (
    <Box sx={{ textAlign: 'center', py: 4, px: 2, mt: 2, borderRadius: 4, background: 'linear-gradient(135deg,#f0f7ff,#eef5ff)', border: '1px solid #cfe0f5' }}>
      <Box sx={{ display: 'inline-block', animation: 'drBob 1.6s ease-in-out infinite' }}>
        <DrExame size={96} sx={{ borderRadius: '20%', boxShadow: '0 6px 18px rgba(51,104,134,.25)' }} />
      </Box>
      <Typography variant="h6" sx={{ mt: 1.5, color: '#336886', fontWeight: 800 }}>Dr. Exame está analisando…</Typography>
      <Typography color="text.secondary" sx={{ mb: 2.5, minHeight: 22 }}>{STEPS[step]}</Typography>
      <Box sx={{ maxWidth: 380, mx: 'auto' }}>
        <LinearProgress variant="determinate" value={pct}
          sx={{ height: 12, borderRadius: 6, bgcolor: '#e3edf6', '& .MuiLinearProgress-bar': { borderRadius: 6, background: 'linear-gradient(90deg,#336886,#5FD35A)' } }} />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>{Math.round(pct)}%</Typography>
      </Box>
      <style>{`@keyframes drBob{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-8px) rotate(-3deg)}}`}</style>
    </Box>
  );
};
