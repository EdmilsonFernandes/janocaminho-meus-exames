import { Box, Typography, Button, IconButton, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import type { SponsorCampaign } from '../../utils/sponsorApi';

/**
 * CARTÃO DE PATROCINADOR (02/11/26 - ReUI Ultra Premium Liquid Glass)
 * Conteúdo PRESENTACIONAL do popup (sem Dialog, sem rede): o mesmo componente renderiza
 * no popup do app e na PRÉVIA do admin.
 * Design ReUI: Superfície de vidro fosco (frosted glass), specular highlight no topo,
 * badge ReUI oficial, tipografia de alta legibilidade e botão primário com inner glow.
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
    <Box data-testid="sponsor-card" data-variant={variant} sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
      {/* Cabeçalho: logo + nome + rótulo ReUI + fechar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.25, pt: 2.25, pb: 1.25 }}>
        <Box sx={{
          width: 46, height: 46, borderRadius: '15px', flexShrink: 0, overflow: 'hidden', display: 'grid', placeItems: 'center',
          bgcolor: dark ? 'rgba(255,255,255,.08)' : '#ffffff',
          border: '1px solid', borderColor: dark ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.9)',
          boxShadow: dark ? '0 4px 12px rgba(0,0,0,.4)' : '0 4px 14px rgba(15,23,42,.06), inset 0 1px 0 rgba(255,255,255,1)',
        }}>
          {logoSrc
            ? <Box component="img" src={logoSrc} alt={`Logo ${campaign.sponsor.name}`} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', color: '#0d9488', fontSize: 20 }}>{initial}</Typography>}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 14.5, lineHeight: 1.2, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {campaign.sponsor.name}
            </Typography>
            <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#0d9488', flexShrink: 0 }} />
          </Box>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              mt: 0.4,
              px: 1,
              py: 0.25,
              borderRadius: '999px',
              bgcolor: dark ? 'rgba(245, 158, 11, 0.14)' : 'rgba(245, 158, 11, 0.10)',
              border: '1px solid',
              borderColor: dark ? 'rgba(245, 158, 11, 0.28)' : 'rgba(245, 158, 11, 0.22)',
              color: dark ? '#fde68a' : '#b45309',
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.01em',
            }}
          >
            <Box component="span" sx={{ fontSize: 9.5 }}>★</Box>
            <Box component="span">Parceiro Oficial · Patrocinado</Box>
          </Box>
        </Box>
        <IconButton
          onClick={onClose}
          aria-label="Fechar anúncio"
          size="small"
          data-testid="sponsor-close"
          sx={{
            width: 32,
            height: 32,
            color: 'text.secondary',
            bgcolor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)',
            border: '1px solid',
            borderColor: dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.9)',
            boxShadow: dark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
            transition: 'all 0.18s ease',
            '&:hover': {
              bgcolor: dark ? 'rgba(255,255,255,0.16)' : '#ffffff',
              color: 'text.primary',
              transform: 'scale(1.05)',
            },
          }}
        >
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      {/* Imagem da campanha (opcional) — 16:9 com borda refinada de vidro */}
      {imageSrc && (
        <Box sx={{
          mx: 2.25, mb: 1.5, borderRadius: '16px', overflow: 'hidden', aspectRatio: '16 / 9',
          bgcolor: dark ? 'rgba(255,255,255,.05)' : 'rgba(15,90,86,.05)',
          border: '1px solid', borderColor: dark ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.8)',
          boxShadow: '0 4px 14px rgba(0,0,0,.06)',
        }}>
          <Box component="img" src={imageSrc} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </Box>
      )}

      {/* Texto */}
      <Box sx={{ px: 2.25, pb: 0.5 }}>
        <Typography component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 17.5, sm: 18.5 }, lineHeight: 1.28, color: 'text.primary', mb: 0.75, overflowWrap: 'anywhere' }}>
          {campaign.title}
        </Typography>
        <Typography sx={{ fontSize: 14, lineHeight: 1.6, color: 'text.secondary', overflowWrap: 'anywhere' }}>
          {campaign.description}
        </Typography>
      </Box>

      {/* Ações: UMA primária ReUI com inner glow + fechar discreto */}
      <Box sx={{ px: 2.25, pt: 2, pb: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {hasCta && (
          <Button
            onClick={onPrimary}
            variant="contained"
            fullWidth
            data-testid="sponsor-cta"
            endIcon={campaign.ctaType === 'external' ? <OpenInNewIcon sx={{ fontSize: 16 }} /> : <ArrowForwardIcon sx={{ fontSize: 16 }} />}
            sx={{
              borderRadius: '14px',
              textTransform: 'none',
              fontWeight: 800,
              fontSize: 14.5,
              py: 1.3,
              minHeight: 46,
              letterSpacing: '-0.01em',
              background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
              color: '#ffffff',
              borderTop: '1px solid rgba(255,255,255,0.3)',
              boxShadow: '0 8px 24px -4px rgba(13, 148, 136, 0.40)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': {
                background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
                boxShadow: '0 12px 28px -4px rgba(13, 148, 136, 0.50)',
                transform: 'translateY(-1px)',
              },
              '&:active': { transform: 'translateY(0)' },
            }}
          >
            {campaign.ctaLabel || 'Saiba mais'}
          </Button>
        )}
        <Button
          onClick={onClose}
          variant="text"
          fullWidth
          data-testid="sponsor-later"
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            color: 'text.secondary',
            minHeight: 38,
            borderRadius: '12px',
            fontSize: 13,
            transition: 'all 0.15s ease',
            '&:hover': {
              bgcolor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              color: 'text.primary',
            },
          }}
        >
          {hasCta ? 'Agora não' : 'Fechar'}
        </Button>
      </Box>

      <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', px: 2.25, pb: 1.75, color: 'text.disabled', fontSize: 10.5, lineHeight: 1.45 }}>
        Conteúdo publicitário de parceiro homologado. Não tem relação com seus exames nem é uma recomendação médica.
      </Typography>
    </Box>
  );
};

/** Estilo "vidro líquido" (Frosted Glass Ultra Premium) — exportado p/ o popup e a prévia do admin.
 *  Blur multicamada, specular highlight no topo, reflexo chanfrado e sombra difusa. */
export function glassPaperSx(dark: boolean, native: boolean) {
  return {
    borderRadius: '26px',
    overflow: 'hidden',
    position: 'relative',
    background: dark
      ? (native ? 'rgba(15, 23, 26, 0.95)' : 'linear-gradient(135deg, rgba(20, 32, 34, 0.82) 0%, rgba(15, 23, 26, 0.90) 100%)')
      : (native ? 'rgba(255, 255, 255, 0.96)' : 'linear-gradient(135deg, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.58) 100%)'),
    backdropFilter: native ? 'blur(8px)' : 'blur(28px) saturate(190%)',
    WebkitBackdropFilter: native ? 'blur(8px)' : 'blur(28px) saturate(190%)',
    border: '1px solid',
    borderColor: dark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.85)',
    boxShadow: dark
      ? '0 30px 60px -12px rgba(0, 0, 0, 0.65), 0 10px 20px -5px rgba(0, 0, 0, 0.35), inset 0 1px 1px 0 rgba(255, 255, 255, 0.20), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.4)'
      : '0 28px 60px -12px rgba(13, 148, 136, 0.20), 0 12px 24px -8px rgba(15, 23, 42, 0.08), inset 0 1px 1px 0 rgba(255, 255, 255, 0.95), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.03)',
    backgroundImage: 'none',
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: '10%',
      right: '10%',
      height: '1px',
      background: dark
        ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)'
        : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent)',
      pointerEvents: 'none',
      zIndex: 1,
    },
    '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))': {
      background: dark ? '#1a2424' : '#ffffff',
    },
  } as const;
}
