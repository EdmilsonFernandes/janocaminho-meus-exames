import { Box, Typography, Button } from '@mui/material';
import { DrExame } from './DrExame';

/** Empty state premium — mascote Dr. Exame em aura teal (padrão = assinatura da marca em todas as
 *  telas vazias) + título + descrição + CTA opcional. `emoji` opcional pra casos que precisem de
 *  ícone específico (default = mascote, nunca mais "emoji solto" = identidade consistente).
 *  `bonus` (nº de créditos) mostra um chip "ganhe X ao enviar o 1º exame" — só pra quem ainda
 *  não recebeu o bônus (passar undefined esconde). */
export const EmptyState = ({ emoji, title, desc, cta, onCta, bonus }: { emoji?: string; title: string; desc?: string; cta?: string; onCta?: () => void; bonus?: number }) => (
  <Box sx={{ textAlign: 'center', py: { xs: 5, md: 7 }, px: 3 }}>
    <Box sx={{ width: 96, height: 96, mx: 'auto', mb: 2, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 50% 40%, rgba(32,178,170,.22), rgba(32,178,170,.05) 70%)', animation: 'esFloat 2.5s ease-in-out infinite' }}>
      {emoji ? <Box sx={{ fontSize: { xs: 44, md: 56 } }}>{emoji}</Box> : <DrExame size={60} sx={{ borderRadius: '50%' }} />}
    </Box>
    <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.75, fontFamily: 'Poppins, sans-serif' }}>{title}</Typography>
    {desc && <Typography sx={{ color: 'text.secondary', maxWidth: 360, mx: 'auto', lineHeight: 1.6, mb: bonus != null ? 1.5 : 2.5, fontSize: 14 }}>{desc}</Typography>}
    {bonus != null && (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mb: 2.5, px: 1.75, py: 0.85, borderRadius: 99, bgcolor: 'rgba(32,178,170,.10)', border: '1px solid rgba(32,178,170,.28)' }}>
        <Box sx={{ fontSize: 18 }}>🎁</Box>
        <Typography sx={{ fontWeight: 700, color: '#178f89', fontSize: 13.5 }}>Ganhe <Box component="span" sx={{ fontWeight: 800 }}>{bonus} créditos</Box> ao enviar seu 1º exame</Typography>
      </Box>
    )}
    {cta && onCta && (
      <Button variant="contained" onClick={onCta} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 800, px: 3, background: 'linear-gradient(180deg,#20b2aa,#009688)', '&:hover': { background: 'linear-gradient(180deg,#1ca39e,#00897b)' } }}>{cta}</Button>
    )}
    <style>{`@keyframes esFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
  </Box>
);
