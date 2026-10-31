import { Box, Typography, Button } from '@mui/material';
import { DrExame } from './DrExame';
import { tealText } from '../theme';

/** Empty state premium — mascote Dr. Exame em aura teal (padrão = assinatura da marca em todas as
 *  telas vazias) + título + descrição + CTA opcional. `emoji` opcional pra casos que precisem de
 *  ícone específico (default = mascote, nunca mais "emoji solto" = identidade consistente).
 *  `bonus` (nº de créditos) mostra um chip "ganhe X ao enviar o 1º exame" — só pra quem ainda
 *  não recebeu o bônus (passar undefined esconde). */
export const EmptyState = ({ emoji, title, desc, cta, onCta, bonus, variant = 'plain' }: { emoji?: string; title: string; desc?: string; cta?: string; onCta?: () => void; bonus?: number; variant?: 'plain' | 'card' }) => (
  <Box sx={{
    textAlign: 'center', py: { xs: 5, md: 7 }, px: 3,
    // ReUI Empty (dono 30/10): variante 'card' = contêiner tracejado arredondado — o
    // vazio ganha moldura própria em vez de flutuar solto no fundo da página.
    ...(variant === 'card' ? {
      borderRadius: '20px',
      border: '1.5px dashed',
      borderColor: (t: any) => t.palette.mode === 'dark' ? 'rgba(148,163,184,0.3)' : 'rgba(32,178,170,0.3)',
      bgcolor: (t: any) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(240,253,250,0.5)',
    } : {}),
  }}>
    {/* keyframes DENTRO do sx (júri E4+ #12): <style> no meio do Box vazava
        "@keyframes esFloat{…}" no texto acessível do empty state. */}
    <Box className="dx-empty-aura" sx={{
      width: 96, height: 96, mx: 'auto', mb: 2, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 40%, rgba(32,178,170,.22), rgba(32,178,170,.05) 70%)',
      animation: 'esFloat 2.5s ease-in-out infinite',
      '@keyframes esFloat': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
      '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
    }}>
      {emoji ? <Box sx={{ fontSize: { xs: 44, md: 56 } }}>{emoji}</Box> : <DrExame size={60} sx={{ borderRadius: '50%' }} />}
    </Box>
    <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.75, fontFamily: 'Poppins, sans-serif' }}>{title}</Typography>
    {desc && <Typography sx={{ color: 'text.secondary', maxWidth: 360, mx: 'auto', lineHeight: 1.6, mb: bonus != null ? 1.5 : 2.5, fontSize: 14 }}>{desc}</Typography>}
    {bonus != null && (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mb: 2.5, px: 1.75, py: 0.85, borderRadius: '999px', bgcolor: 'rgba(32,178,170,.10)', border: '1px solid rgba(32,178,170,.28)' }}>
        <Box sx={{ fontSize: 18 }}>🎁</Box>
        <Typography sx={{ fontWeight: 700, color: (t) => tealText(t.palette.mode), fontSize: 14 }}>Ganhe <Box component="span" sx={{ fontWeight: 800 }}>{bonus} créditos</Box> ao enviar seu 1º exame</Typography>
      </Box>
    )}
    {cta && onCta && (
      <Button variant="contained" onClick={onCta} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 3, background: 'linear-gradient(180deg,#20b2aa,#178f89)', '&:hover': { background: 'linear-gradient(180deg,#178f89,#178f89)' } }}>{cta}</Button>
    )}
  </Box>
);
