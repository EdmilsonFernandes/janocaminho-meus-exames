import { Box, Typography, Button, IconButton, Chip, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import type { SponsorCampaign } from '../../utils/sponsorApi';

/**
 * CARTÃO DE PATROCINADOR (02/11/26) — conteúdo PRESENTACIONAL do popup (sem Dialog, sem
 * rede): o mesmo componente renderiza no popup do app e na PRÉVIA do admin (que por isso
 * nunca conta impressão). Regras visuais do dono: logo bem enquadrado, título curto,
 * descrição objetiva, UMA ação principal, rótulo "Patrocinado" visível, fechamento
 * evidente, sem contagem regressiva, conteúdo publicitário separado do clínico.
 */
export interface SponsorCardProps {
  campaign: SponsorCampaign;
  logoSrc: string | null;
  imageSrc: string | null;
  onPrimary: () => void;
  onClose: () => void;
  /** 'dialog' = popup real; 'preview' = prévia do admin (mesma aparência). */
  variant?: 'dialog' | 'preview';
}

export const SponsorCard = ({ campaign, logoSrc, imageSrc, onPrimary, onClose, variant = 'dialog' }: SponsorCardProps) => {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const hasCta = campaign.ctaType !== 'none' && !!campaign.ctaTarget;
  const initial = campaign.sponsor.name.trim().charAt(0).toUpperCase() || '•';

  return (
    <Box data-testid="sponsor-card" data-variant={variant} sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* Cabeçalho: logo + nome + rótulo de patrocínio + fechar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2.25, pt: 2, pb: 1.25 }}>
        <Box sx={{
          width: 46, height: 46, borderRadius: '13px', flexShrink: 0, overflow: 'hidden', display: 'grid', placeItems: 'center',
          bgcolor: dark ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.9)', border: '1px solid', borderColor: dark ? 'rgba(255,255,255,.12)' : 'rgba(15,90,86,.12)',
          boxShadow: dark ? 'none' : '0 2px 8px rgba(15,90,86,.08)',
        }}>
          {logoSrc
            ? <Box component="img" src={logoSrc} alt={`Logo ${campaign.sponsor.name}`} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', color: '#178f89', fontSize: 20 }}>{initial}</Typography>}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {campaign.sponsor.name}
          </Typography>
          <Chip
            size="small" label="Parceiro do Dr. Exame · Patrocinado"
            sx={{ mt: 0.5, height: 20, fontSize: 11, fontWeight: 700, letterSpacing: '.01em', bgcolor: dark ? 'rgba(212,165,116,.16)' : 'rgba(212,165,116,.18)', color: dark ? '#e0bc97' : '#8a5a1e', '& .MuiChip-label': { px: 1 } }}
          />
        </Box>
        <IconButton onClick={onClose} aria-label="Fechar anúncio" size="small" data-testid="sponsor-close"
          sx={{ color: 'text.secondary', bgcolor: dark ? 'rgba(255,255,255,.06)' : 'rgba(15,90,86,.06)', '&:hover': { bgcolor: dark ? 'rgba(255,255,255,.12)' : 'rgba(15,90,86,.12)' } }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Imagem da campanha (opcional) — 16:9, sem cortes do conteúdo textual */}
      {imageSrc && (
        <Box sx={{ mx: 2.25, mb: 1.5, borderRadius: '14px', overflow: 'hidden', aspectRatio: '16 / 9', bgcolor: dark ? 'rgba(255,255,255,.05)' : 'rgba(15,90,86,.05)' }}>
          <Box component="img" src={imageSrc} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </Box>
      )}

      {/* Texto */}
      <Box sx={{ px: 2.25, pb: 0.5 }}>
        <Typography component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 19, lineHeight: 1.25, color: 'text.primary', mb: 0.75, overflowWrap: 'anywhere' }}>
          {campaign.title}
        </Typography>
        <Typography sx={{ fontSize: 14.5, lineHeight: 1.55, color: 'text.secondary', overflowWrap: 'anywhere' }}>
          {campaign.description}
        </Typography>
      </Box>

      {/* Ações: UMA primária + fechar discreto. Nunca obriga a clicar no anúncio. */}
      <Box sx={{ px: 2.25, pt: 2, pb: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {hasCta && (
          <Button
            onClick={onPrimary} variant="contained" fullWidth data-testid="sponsor-cta"
            endIcon={campaign.ctaType === 'external' ? <OpenInNewIcon /> : <ArrowForwardIcon />}
            sx={{
              borderRadius: '14px', textTransform: 'none', fontWeight: 800, fontSize: 15, py: 1.25, minHeight: 48,
              background: 'linear-gradient(135deg,#20b2aa,#178f89)', boxShadow: '0 8px 20px rgba(32,178,170,.28)',
              '&:hover': { background: 'linear-gradient(135deg,#178f89,#14655f)' },
            }}
          >
            {campaign.ctaLabel || 'Saiba mais'}
          </Button>
        )}
        <Button onClick={onClose} variant="text" fullWidth data-testid="sponsor-later"
          sx={{ textTransform: 'none', fontWeight: 700, color: 'text.secondary', minHeight: 40, borderRadius: '12px' }}>
          {hasCta ? 'Agora não' : 'Fechar'}
        </Button>
      </Box>

      <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', px: 2.25, pb: 1.75, color: 'text.disabled', fontSize: 11, lineHeight: 1.4 }}>
        Conteúdo publicitário. Não tem relação com seus exames nem é uma recomendação médica.
      </Typography>
    </Box>
  );
};

/** Estilo "vidro" do papel do popup — exportado p/ a prévia do admin usar o mesmo. Blur forte
 *  só fora do WebView nativo (Android pode engasgar); no app nativo, superfície translúcida
 *  quase sólida com blur leve. Fallback sem backdrop-filter = papel sólido (legibilidade). */
export function glassPaperSx(dark: boolean, native: boolean) {
  return {
    borderRadius: '22px',
    overflow: 'hidden',
    background: dark ? (native ? 'rgba(26,36,36,.96)' : 'rgba(26,36,36,.82)') : (native ? 'rgba(255,255,255,.96)' : 'rgba(255,255,255,.80)'),
    backdropFilter: native ? 'blur(6px)' : 'blur(22px) saturate(140%)',
    WebkitBackdropFilter: native ? 'blur(6px)' : 'blur(22px) saturate(140%)',
    border: '1px solid',
    borderColor: dark ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.75)',
    boxShadow: dark ? '0 24px 60px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06)' : '0 24px 60px rgba(15,90,86,.20), inset 0 1px 0 rgba(255,255,255,.9)',
    backgroundImage: 'none',
    '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))': {
      background: dark ? '#1a2424' : '#ffffff',
    },
  } as const;
}
