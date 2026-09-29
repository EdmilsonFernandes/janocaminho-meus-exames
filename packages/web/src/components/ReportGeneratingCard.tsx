import { useEffect, useState } from 'react';
import { Box, Typography, LinearProgress, Button } from '@mui/material';
import { DrExame } from './DrExame';
import { tealText } from '../theme';

const STAGES = [
  { msg: 'Reunindo seus exames mais recentes…', emoji: '📚' },
  { msg: 'Cruzando valores e faixas de referência…', emoji: '🔬' },
  { msg: 'Identificando tendências ao longo do tempo…', emoji: '📈' },
  { msg: 'Redigindo seu resumo completo…', emoji: '✍️' },
];

/**
 * ReportGeneratingCard — progresso do relatório NO CONTEXTO da página (decisão sênior
 * 27/09: o usuário QUER o relatório; a geração não pode tomar a tela com um splash
 * full-screen — ele mora no lugar onde o resultado vai aparecer, e o app continua
 * usável: voltar é navegação normal, o robô avisa que salva sozinho).
 * Mesma linguagem visual do ExtractionProgress (robô + estágios + timer real).
 */
export const ReportGeneratingCard = ({ startedAt, onLeave }: { startedAt?: number; onLeave?: () => void }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const start = startedAt ?? Date.now();
  const elapsed = Math.max(0, Math.floor((now - start) / 1000));
  const stage = Math.min(Math.floor(elapsed / 8), STAGES.length - 1);
  const mm = Math.floor(elapsed / 60);
  const ss = (elapsed % 60).toString().padStart(2, '0');

  return (
    <Box sx={{ mt: 2, py: { xs: 4, md: 6 }, px: 3, borderRadius: '20px', textAlign: 'center', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
      <Box sx={{ display: 'inline-block', animation: 'rGCbob 1.6s ease-in-out infinite', '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }}>
        <DrExame size={84} sx={{ borderRadius: '20%', boxShadow: '0 6px 18px rgba(32,178,170,.22)' }} />
      </Box>
      <Typography sx={{ mt: 1.5, color: (t) => tealText(t.palette.mode), fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: { xs: 17, md: 19 } }}>
        Montando seu relatório completo
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2, minHeight: 24, fontSize: 14 }}>
        {STAGES[stage].emoji} {STAGES[stage].msg}
      </Typography>

      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mb: 1.5, px: 1.5, py: 0.5, borderRadius: '999px', bgcolor: 'rgba(32,178,170,.08)' }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#20b2aa', animation: 'rGCpulse 1.5s ease-in-out infinite', '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: (t) => tealText(t.palette.mode), fontFamily: 'monospace' }}>{mm}:{ss}</Typography>
      </Box>

      <Box sx={{ maxWidth: 360, mx: 'auto', mb: 1.5 }}>
        <LinearProgress sx={{ height: 8, borderRadius: '12px', bgcolor: 'rgba(0,0,0,.05)', '& .MuiLinearProgress-bar': { borderRadius: '12px', background: 'linear-gradient(90deg,#20b2aa,#059669)' } }} />
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, lineHeight: 1.5 }}>
        Normalmente leva de 30s a 2min.<br />
        <b>Pode continuar usando o app</b> — o relatório fica salvo aqui automaticamente. 🔒
      </Typography>

      {onLeave && (
        <Button size="small" onClick={onLeave} sx={{ textTransform: 'none', fontWeight: 700, color: (t) => tealText(t.palette.mode), borderRadius: '999px', px: 2.5, py: 0.75, border: '1px solid', borderColor: 'rgba(32,178,170,.3)' }}>
          Voltar ao painel →
        </Button>
      )}

      <style>{`
        @keyframes rGCbob{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-7px) rotate(-2deg)}}
        @keyframes rGCpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.7)}}
      `}</style>
    </Box>
  );
};
