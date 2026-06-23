import { Box, Typography, Button } from '@mui/material';

/** Empty state premium — ilustração (emoji grande) + título + descrição + CTA opcional. */
export const EmptyState = ({ emoji, title, desc, cta, onCta }: { emoji: string; title: string; desc?: string; cta?: string; onCta?: () => void }) => (
  <Box sx={{ textAlign: 'center', py: { xs: 5, md: 7 }, px: 3 }}>
    <Box sx={{ fontSize: { xs: 56, md: 72 }, mb: 2, animation: 'esFloat 2.5s ease-in-out infinite' }}>{emoji}</Box>
    <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f3d3a', mb: 0.75, fontFamily: 'Poppins, sans-serif' }}>{title}</Typography>
    {desc && <Typography sx={{ color: '#6b7b80', maxWidth: 360, mx: 'auto', lineHeight: 1.6, mb: 2.5, fontSize: 14 }}>{desc}</Typography>}
    {cta && onCta && (
      <Button variant="contained" onClick={onCta} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 800, px: 3, background: 'linear-gradient(180deg,#20b2aa,#009688)', '&:hover': { background: 'linear-gradient(180deg,#1ca39e,#00897b)' } }}>{cta}</Button>
    )}
    <style>{`@keyframes esFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
  </Box>
);
