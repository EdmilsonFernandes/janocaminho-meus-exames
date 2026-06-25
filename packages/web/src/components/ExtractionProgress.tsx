import { useEffect, useState } from 'react';
import { Box, Typography, LinearProgress } from '@mui/material';
import { DrExame } from './DrExame';

const STEPS = [
  'Extraindo o texto do exame…',
  'Identificando os analitos…',
  'Conferindo valores e referências…',
  'Comparando com o exame anterior…',
  'O Dr. Exame está conferindo cada detalhe…',
];

/** Progresso do Dr. Exame durante a extração. Barra INDETERMINADA — não há progresso real
 *  no servidor (extração é um state-machine). Antes a % era simulada e travava em ~97%,
 *  dando sensação de "pendurado" e reiniciava a cada visita. Indeterminado é honesto e
 *  não tem número pra resetar. As mensagens rotativas passam a sensação de atividade. */
export const ExtractionProgress = () => {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const stepTimer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4500);
    return () => clearInterval(stepTimer);
  }, []);
  return (
    <Box sx={{ textAlign: 'center', py: 4, px: 2, mt: 2, borderRadius: 4, background: 'linear-gradient(135deg,#e6f7f6,#eef7f6)', border: '1px solid #cfe9e8' }}>
      <Box sx={{ display: 'inline-block', animation: 'drBob 1.6s ease-in-out infinite' }}>
        <DrExame size={96} sx={{ borderRadius: '20%', boxShadow: '0 6px 18px rgba(32,178,170,.28)' }} />
      </Box>
      <Typography variant="h6" sx={{ mt: 1.5, color: '#178f89', fontWeight: 800 }}>Dr. Exame está analisando…</Typography>
      <Typography color="text.secondary" sx={{ mb: 2.5, minHeight: 22 }}>{STEPS[step]}</Typography>
      <Box sx={{ maxWidth: 380, mx: 'auto' }}>
        <LinearProgress sx={{ height: 12, borderRadius: 6, bgcolor: '#d6efed', '& .MuiLinearProgress-bar': { borderRadius: 6, background: 'linear-gradient(90deg,#20b2aa,#10b981)' } }} />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>Leva menos de 1 minuto. Pode sair e voltar que ele continua.</Typography>
      </Box>
      <style>{`@keyframes drBob{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-8px) rotate(-3deg)}}`}</style>
    </Box>
  );
};
