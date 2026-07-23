import { Box, Button, Card, CardContent, IconButton, Popover, Skeleton, Stack, Typography } from '@mui/material';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import FavoriteIcon from '@mui/icons-material/Favorite';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useEffect, useState } from 'react';
import { DrExame } from '../DrExame';

// Componente mais importante do app. Gauge SEMICIRCULAR (meio-arco) em SVG + info LADO A LADO
// (compacto, sem quebrar — preenche a largura do card, igual à referência).
const scoreColor = (s: number) => (s >= 80 ? '#059669' : s >= 60 ? '#f59e0b' : '#ef4444');
// Veredito em linguagem simples — o HERÓI do card. Leigo entende "Em boa forma", não "76".
const verdictFor = (s: number) =>
  s >= 80 ? { emoji: '🌟', text: 'Excepcional', color: '#059669' }
  : s >= 60 ? { emoji: '👍', text: 'Em boa forma', color: '#f59e0b' }
  : { emoji: '⚠️', text: 'Precisa de atenção', color: '#ef4444' };
const descFor = (s: number, n: number) =>
  s >= 80 ? 'A maioria dos seus valores está dentro da faixa.'
  : s >= 60 ? 'Alguns valores merecem atenção — comente com seu médico.'
  : n > 0 ? `${n} valor${n > 1 ? 'es' : ''} fora da faixa de referência — vale revisar com seu médico.`
  : 'Vale revisar seus exames com seu médico.';

// Gauge ANEL COMPLETO (premium) — gradiente teal→cor-do-status, progresso do topo (horário).
// ZONAS coloridas de fundo (0-60 vermelho / 60-80 amber / 80-100 verde, bem sutures) dão glance
// instantâneo de ONDE o paciente está no espectro (padrão Fitbit/Apple Health readiness score).
const Gauge = ({ value, color }: { value: number; color: string }) => {
  const size = 150, stroke = 13;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, value)) / 100;
  // Segmento de zona: fração inicial (0-1) e fração do comprimento, cor.
  const Zone = ({ from, len, fill }: { from: number; len: number; fill: string }) => (
    <circle cx={c} cy={c} r={r} fill="none" stroke={fill} strokeWidth={stroke} strokeLinecap="butt"
      strokeDasharray={`${circ * len} ${circ}`} strokeDashoffset={-circ * from} opacity={0.14}
      transform={`rotate(-90 ${c} ${c})`} />
  );
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#20b2aa" />
          <stop offset="100%" stopColor={color} style={{ transition: 'stop-color .6s ease' }} />
        </linearGradient>
      </defs>
      {/* ZONAS de fundo (sutures): vermelho 0-60, amber 60-80, verde 80-100 */}
      <Zone from={0} len={0.6} fill="#ef4444" />
      <Zone from={0.6} len={0.2} fill="#f59e0b" />
      <Zone from={0.8} len={0.2} fill="#059669" />
      {/* PROGRESSO (gradiente teal→status) por cima das zonas */}
      <circle cx={c} cy={c} r={r} fill="none" stroke="url(#scoreGrad)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - p)} transform={`rotate(-90 ${c} ${c})`} style={{ transition: 'stroke-dashoffset .8s ease' }} />
    </svg>
  );
};

export const HealthScoreCard = ({ loaded, score, abnormalCount, markerCount, onDetails }: { loaded: boolean; score: number | null; abnormalCount: number; markerCount?: number; onDetails: () => void }) => {
  // Score counter animation (0→score no mount) — sensação premium
  const [displayScore, setDisplayScore] = useState(0);
  const [help, setHelp] = useState<HTMLElement | null>(null); // balão "o que é o score?"
  useEffect(() => {
    if (score == null || score === 0) return;
    setDisplayScore(0);
    const duration = 800;
    const steps = 30;
    const inc = score / steps;
    let i = 0;
    const iv = setInterval(() => { i++; setDisplayScore(Math.round(Math.min(inc * i, score))); if (i >= steps) clearInterval(iv); }, duration / steps);
    return () => clearInterval(iv);
  }, [score]);
  if (!loaded && score === null) {
    // Skeleton (perceived speed 2-3× maior que spinner solto — padrão apps premium).
    return (
      <Card sx={{ mt: 3, overflow: 'hidden' }}>
        <CardContent>
          <Stack direction="row" alignItems="center" gap={2.5}>
            <Skeleton variant="circular" sx={{ width: { xs: 130, sm: 150 }, height: { xs: 130, sm: 150 } }} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width={90} height={20} />
              <Skeleton variant="rectangular" width={70} height={22} sx={{ borderRadius: 99, my: 0.75 }} />
              <Skeleton variant="text" width="90%" />
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="rectangular" width={120} height={32} sx={{ borderRadius: 99, mt: 1 }} />
            </Box>
          </Stack>
        </CardContent>
      </Card>
    );
  }
  if (score === null) {
    // Usuário novo sem exames: NÃO some (antes `return null` deixava BURACO no hero). Onboarding
    // acolhedor com o mascote Dr. Exame + CTA pro 1º exame.
    return (
      <Card sx={{ mt: 3, overflow: 'hidden', background: 'linear-gradient(135deg, rgba(32,178,170,.10), rgba(32,178,170,.03))', border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <Box sx={{ width: 88, height: 88, mx: 'auto', mb: 1.5, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 50% 40%, rgba(32,178,170,.22), rgba(32,178,170,.05) 70%)' }}>
            <DrExame size={54} sx={{ borderRadius: '50%' }} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>Seu Score de Saúde aparece aqui</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 320, mx: 'auto' }}>Envie seu primeiro exame (PDF ou foto) e o Dr. Exame calcula um score personalizado a partir dos seus resultados.</Typography>
          <Button variant="contained" onClick={onDetails} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 800, px: 3 }}>Enviar meu primeiro exame</Button>
        </CardContent>
      </Card>
    );
  }
  const color = scoreColor(score);
  const verdict = verdictFor(score);
  return (
    <Card sx={{ mt: 3, position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, rgba(32,178,170,.10), rgba(32,178,170,.03))', border: '1px solid', borderColor: 'divider', boxShadow: `0 10px 30px ${color}1a`, transition: 'box-shadow .5s ease' }}>
      <FavoriteIcon sx={{ position: 'absolute', right: -18, top: -14, fontSize: 150, color: 'primary.main', opacity: 0.05, pointerEvents: 'none', transform: 'rotate(-12deg)' }} />
      <CardContent sx={{ position: 'relative' }}>
        {/* Cabeçalho: "Score de Saúde" + (?) ajuda — explica o que é esse número pro leigo */}
        <Stack direction="row" alignItems="center" sx={{ mb: 1.25 }}>
          <MonitorHeartIcon sx={{ color: 'primary.main', fontSize: 18, mr: 0.75 }} />
          <Typography variant="overline" sx={{ lineHeight: 1, color: 'text.secondary', fontSize: { xs: 10, sm: 11 } }}>Score de Saúde</Typography>
          <IconButton size="small" onClick={(e) => setHelp(e.currentTarget)} sx={{ ml: 'auto', p: 0.25, color: 'primary.main' }} aria-label="O que é o Score de Saúde?" title="O que é o Score de Saúde?"><HelpOutlineIcon sx={{ fontSize: 16 }} /></IconButton>
        </Stack>
        {/* gauge + VEREDITO (herói) lado a lado. O número 76 apoia; a frase é o que se entende "batendo o olho". */}
        <Stack direction="row" alignItems="center" gap={{ xs: 1.5, sm: 2.5 }} sx={{ flexWrap: 'nowrap' }}>
          <Box sx={{ position: 'relative', width: { xs: 118, sm: 138 }, height: { xs: 118, sm: 138 }, flexShrink: 0 }}>
            <Gauge value={score} color={color} />
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <Typography sx={{ fontWeight: 800, fontSize: { xs: 28, sm: 36 }, lineHeight: 1, color: 'text.primary' }}>{displayScore}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, fontSize: { xs: 9, sm: 11 } }}>de 100</Typography>
            </Box>
          </Box>
          <Box sx={{ flex: '1 1 0', minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: { xs: 17, sm: 20 }, lineHeight: 1.15, color: verdict.color, fontFamily: '"Poppins",sans-serif' }}>{verdict.emoji} {verdict.text}</Typography>
            <Typography variant="body2" sx={{ mt: 0.5, color: 'text.primary', fontSize: { xs: 12.5, sm: 13.5 }, lineHeight: 1.4 }}>{descFor(score, abnormalCount)}</Typography>
          </Box>
        </Stack>
        {/* TRANSPARÊNCIA: baseado em quê? + disclaimer — constrói confiança (sem isso, 76 parece inventado). */}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, fontSize: { xs: 10.5, sm: 11.5 }, lineHeight: 1.45 }}>
          Baseado em {markerCount ? `${markerCount} ` : ''}marcadores dos seus exames mais recentes. *Educativo — não substitui avaliação médica.
        </Typography>
        <Box sx={{ mt: 1.25 }}>
          <Button variant="contained" size="small" onClick={onDetails} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, fontSize: 12, py: 1.1, px: 2.5, boxShadow: 'none' }}>Ver detalhes →</Button>
        </Box>
      </CardContent>
      {/* Balão de ajuda: o que é o Score de Saúde (pra quem não faz ideia do que seja o "76"). */}
      <Popover open={!!help} anchorEl={help} onClose={() => setHelp(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { maxWidth: 340, borderRadius: 3, mt: 0.5 } } }}>
        <Box sx={{ p: 2, maxWidth: 340 }}>
          <Typography sx={{ fontWeight: 800, color: 'primary.dark', fontSize: '1.05rem' }}>O que é o Score de Saúde?</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, lineHeight: 1.5 }}>É um termômetro educativo calculado a partir dos seus exames: a proporção de marcadores <b>dentro da faixa de referência</b>. Quanto mais perto de 100, mais resultados dentro do esperado.</Typography>
          <Typography variant="body2" sx={{ mt: 1, lineHeight: 1.5 }}>Não é diagnóstico nem mede "saúde em geral" — só reflete os exames enviados nos últimos 12 meses.</Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>*Sempre confirme com seu médico.</Typography>
        </Box>
      </Popover>
    </Card>
  );
};
