import { Box, Typography, Button } from '@mui/material';
import { DrExame } from './DrExame';

/** Empty state premium — mascote Dr. Exame em aura teal (padrão = assinatura da marca em todas as
 *  telas vazias) + título + descrição + CTA opcional. `emoji` opcional pra casos que precisem de
 *  ícone específico (default = mascote, nunca mais "emoji solto" = identidade consistente). */
export const EmptyState = ({ emoji, title, desc, cta, onCta }: { emoji?: string; title: string; desc?: string; cta?: string; onCta?: () => void }) => (
  <Box sx={{ textAlign: 'center', py: { xs: 5, md: 7 }, px: 3 }}>
    <Box sx={{ width: 96, height: 96, mx: 'auto', mb: 2, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 50% 40%, rgba(32,178,170,.22), rgba(32,178,170,.05) 70%)', animation: 'esFloat 2.5s ease-in-out infinite' }}>
      {emoji ? <Box sx={{ fontSize: { xs: 44, md: 56 } }}>{emoji}</Box> : <DrExame size={60} sx={{ borderRadius: '50%' }} />}
    </Box>
    <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.75, fontFamily: 'Poppins, sans-serif' }}>{title}</Typography>
    {desc && <Typography sx={{ color: 'text.secondary', maxWidth: 360, mx: 'auto', lineHeight: 1.6, mb: 2.5, fontSize: 14 }}>{desc}</Typography>}
    {cta && onCta && (
      <Button variant="contained" onClick={onCta} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 800, px: 3, background: 'linear-gradient(180deg,#20b2aa,#009688)', '&:hover': { background: 'linear-gradient(180deg,#1ca39e,#00897b)' } }}>{cta}</Button>
    )}
    <style>{`@keyframes esFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
  </Box>
);
