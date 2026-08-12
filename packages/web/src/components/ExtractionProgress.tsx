import { useEffect, useState, useRef } from 'react';
import { Box, Typography, LinearProgress, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { DrExame } from './DrExame';

const STEPS = [
  { msg: 'Lendo o documento…', emoji: '📄' },
  { msg: 'Identificando os analitos…', emoji: '🔍' },
  { msg: 'Conferindo valores e faixas de referência…', emoji: '✅' },
  { msg: 'Comparando com exames anteriores…', emoji: '📈' },
  { msg: 'Calculando score de saúde e idade biológica…', emoji: '🧬' },
  { msg: 'Preparando seu resumo personalizado…', emoji: '✨' },
];

/** Progresso premium da extração: timer decorrido + estágios rotativos + pode sair.
 *  Extração é assíncrona no server (state-machine) — o usuário PODE navegar pra outras
 *  telas e voltar. O timer reduz ansiedade (sabe QUANTO tempo tá passando, não só um spinner).
 *  `startedAt` (createdAt do exame) faz o elapsed/step derivarem do TEMPO REAL desde o envio
 *  → NÃO zera quando o user sai da tela e volta (antes era state local que reiniciava em 0). */
export const ExtractionProgress = ({ startedAt }: { startedAt?: string }) => {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  const mountMs = useRef(Date.now()).current;
  useEffect(() => {
    const elapsedTimer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(elapsedTimer);
  }, []);

  // startMs = tempo do envio (se tiver startedAt) ou do mount (fallback). elapsed = real, persiste.
  const startMs = startedAt ? new Date(startedAt).getTime() : mountMs;
  const elapsed = Math.max(0, Math.floor((now - startMs) / 1000));
  const step = Math.min(Math.floor(elapsed / 5), STEPS.length - 1);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  return (
    <Box sx={{ textAlign: 'center', py: 5, px: 3, mt: 2, borderRadius: '12px', background: 'linear-gradient(135deg, rgba(32,178,170,.06), rgba(99,102,241,.04))', border: '1px solid rgba(0,0,0,.06)' }}>
      <Box sx={{ display: 'inline-block', animation: 'drBob 1.6s ease-in-out infinite' }}>
        <DrExame size={88} sx={{ borderRadius: '20%', boxShadow: '0 6px 18px rgba(32,178,170,.22)' }} />
      </Box>
      <Typography sx={{ mt: 1.5, color: '#178f89', fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 18 }}>Dr. Exame está analisando seu exame</Typography>

      {/* Mensagem do estágio atual (rotativa a cada 5s) */}
      <Typography color="text.secondary" sx={{ mb: 2, minHeight: 24, fontSize: 14 }}>
        {STEPS[step].emoji} {STEPS[step].msg}
      </Typography>

      {/* Timer decorrido — reduz ansiedade (usuário SABE quanto tempo passou) */}
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mb: 1.5, px: 1.5, py: 0.5, borderRadius: '999px', bgcolor: 'rgba(32,178,170,.08)' }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#20b2aa', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: '#178f89', fontFamily: 'monospace' }}>{timeStr}</Typography>
      </Box>

      {/* Barra indeterminada (honesto — não há progresso real) */}
      <Box sx={{ maxWidth: 360, mx: 'auto', mb: 1.5 }}>
        <LinearProgress sx={{ height: 8, borderRadius: '12px', bgcolor: 'rgba(0,0,0,.04)', '& .MuiLinearProgress-bar': { borderRadius: '12px', background: 'linear-gradient(90deg,#20b2aa,#059669)' } }} />
      </Box>

      {/* Mensagem contextual baseada no tempo */}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, lineHeight: 1.5 }}>
        {elapsed < 30 && 'Normalmente leva de 1 a 3 minutos. ⏱️'}
        {elapsed >= 30 && elapsed < 90 && 'Quase lá! O Dr. Exame está conferindo cada detalhe. 🔍'}
        {elapsed >= 90 && 'Tá demorando um pouco mais que o normal, mas continua trabalhando. ⏳'}
        <br />
        <b>Pode usar o app normalmente</b> — ele avisa quando terminar. 🔔
      </Typography>

      {/* Botão: pode sair — extração continua server-side */}
      <Button size="small" onClick={() => navigate('/exams')} sx={{ textTransform: 'none', fontWeight: 700, color: '#178f89', borderRadius: '999px', px: 2.5, py: 0.75, border: '1px solid', borderColor: 'rgba(32,178,170,.3)' }}>
        Ver meus exames →
      </Button>

      <style>{`
        @keyframes drBob{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-8px) rotate(-3deg)}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.7)}}
      `}</style>
    </Box>
  );
};
