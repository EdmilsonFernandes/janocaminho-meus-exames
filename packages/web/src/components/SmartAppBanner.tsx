import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, IconButton, Stack } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { DrExame } from './DrExame';
import { isMobileBrowser, isInstalledPwa, isAndroidBrowser, openAppOrPlayStore } from '../utils/playStore';

const DISMISS_KEY = 'dx_smart_banner_dismissed_until';
const DISMISS_DAYS = 7;

interface SmartAppBannerProps {
  /** Rota opcional para navegação interna no app (ex: 'registrar', 'dashboard') */
  targetPath?: string;
  /** Se deve ser fixo no topo ou inline */
  position?: 'top' | 'inline';
}

/**
 * Smart App Banner — Padrão de grandes players (Airbnb, Nubank, Mercado Livre).
 * - Identifica usuários no navegador mobile (especialmente Android).
 * - Se o app já estiver instalado no dispositivo: o Android abre o app nativo instantaneamente.
 * - Se o app não estiver instalado: leva direto para o aplicativo oficial na Google Play Store.
 * - Fica 100% invisível se já estiver dentro do app instalado ou em PWA.
 */
export const SmartAppBanner: React.FC<SmartAppBannerProps> = ({
  targetPath = '',
  position = 'top',
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Não exibe se estiver no app nativo (Capacitor) ou PWA standalone
    if (!isMobileBrowser() || isInstalledPwa()) {
      setVisible(false);
      return;
    }

    // Verifica se foi dispensado recentemente (últimos 7 dias)
    try {
      const dismissedUntil = localStorage.getItem(DISMISS_KEY);
      if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
        setVisible(false);
        return;
      }
    } catch {
      // localStorage indisponível
    }

    setVisible(true);
  }, []);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const expiry = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
      localStorage.setItem(DISMISS_KEY, String(expiry));
    } catch {
      // storage bloqueado
    }
    setVisible(false);
  };

  const handleOpen = () => {
    openAppOrPlayStore(targetPath);
  };

  if (!visible) return null;

  const isAndroid = isAndroidBrowser();

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
        bgcolor: (t) => t.palette.mode === 'dark' ? '#111b1a' : '#ffffff',
        borderBottom: '1px solid',
        borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(32,178,170,0.2)' : 'rgba(0,0,0,0.08)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        py: 0.85,
        px: { xs: 1, sm: 1.5 },
        zIndex: 1200,
        position: 'relative',
        animation: 'slideDownBanner .3s cubic-bezier(0.16, 1, 0.3, 1)',
        '@keyframes slideDownBanner': {
          from: { opacity: 0, transform: 'translateY(-10px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={{ xs: 1, sm: 1.25 }} sx={{ maxWidth: 600, mx: 'auto', width: '100%', overflow: 'hidden' }}>
        {/* Botão Fechar */}
        <IconButton
          size="small"
          onClick={handleDismiss}
          aria-label="Fechar aviso do aplicativo"
          sx={{
            p: 0.5,
            color: 'text.secondary',
            flexShrink: 0,
            '&:hover': { color: 'text.primary' },
          }}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>

        {/* Ícone oficial do Dr. Exame */}
        <Box
          onClick={handleOpen}
          sx={{
            cursor: 'pointer',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <DrExame size={38} sx={{ borderRadius: '10px', boxShadow: '0 2px 8px rgba(23, 143, 137, 0.25)' }} />
        </Box>

        {/* Informações do App & Nota */}
        <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={handleOpen}>
          <Typography
            noWrap
            sx={{
              fontWeight: 800,
              fontSize: 13.5,
              fontFamily: '"Poppins", sans-serif',
              lineHeight: 1.2,
              color: 'text.primary',
            }}
          >
            Dr. Exame
          </Typography>
          <Typography
            noWrap
            variant="caption"
            sx={{
              display: 'block',
              fontSize: 11.5,
              color: 'text.secondary',
              mt: 0.2,
            }}
          >
            {isAndroid ? '★ 5,0 no Google Play · App Oficial' : 'App Oficial · Inteligência Médica'}
          </Typography>
        </Box>

        {/* Botão ABRIR / INSTALAR */}
        <Button
          variant="contained"
          size="small"
          onClick={handleOpen}
          sx={{
            borderRadius: '999px',
            textTransform: 'uppercase',
            fontWeight: 800,
            fontSize: 12,
            px: 2,
            py: 0.6,
            minWidth: 0,
            flexShrink: 0,
            background: 'linear-gradient(135deg, #178f89 0%, #0d5f5a 100%)',
            color: '#ffffff',
            boxShadow: '0 2px 8px rgba(23, 143, 137, 0.3)',
            letterSpacing: '0.04em',
            '&:hover': {
              background: 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)',
            },
          }}
        >
          Abrir
        </Button>
      </Stack>
    </Box>
  );
};
