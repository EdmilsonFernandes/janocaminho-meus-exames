import { Button } from '@mui/material';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import { TELEMEDICINE_URL } from '../config';
import { specialtyForMarker, doctoraliaUrl } from './telemedicineMap';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

/**
 * Botão "Agendar Telemedicina" — visual ultra-premium (gradiente esmeralda +
 * sombra profunda + hover com leve elevação, estilo Stripe/Apple).
 * - marker mapeado → especialidade certa no Doctoralia.
 * - senão, se houver VITE_TELEMEDICINE_URL → link genérico.
 * - senão → oculto.
 */
export const TelemedicineButton = ({
  marker,
  compact = false,
}: {
  marker?: string | null;
  compact?: boolean;
}) => {
  const sp = specialtyForMarker(marker);
  const url = sp ? doctoraliaUrl(sp.slug) : TELEMEDICINE_URL;
  if (!url) return null;

  const label = sp ? `Agendar com ${sp.label}` : 'Agendar Telemedicina';

  return (
    <Button
      size={compact ? 'small' : 'medium'}
      variant="contained"
      startIcon={<LocalHospitalIcon />}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      disableElevation
      onClick={(e) => { if (Capacitor.isNativePlatform()) { e.preventDefault(); Browser.open({ url }); } }}
      sx={{
        mt: 1,
        borderRadius: 14,
        textTransform: 'none',
        fontWeight: 800,
        color: '#fff',
        px: compact ? 1.75 : 2.75,
        py: 0.85,
        gap: 1,
        background: 'linear-gradient(180deg, #047857 0%, #065f46 100%)', // emerald-700 → 800
        border: '1px solid rgba(255,255,255,.14)',
        boxShadow: '0 10px 22px rgba(4,120,87,.30), 0 2px 6px rgba(15,23,42,.10)',
        transition: 'all .18s ease',
        '&:hover': {
          background: 'linear-gradient(180deg, #065f46 0%, #064e3b 100%)',
          boxShadow: '0 14px 28px rgba(4,120,87,.38), 0 3px 8px rgba(15,23,42,.12)',
          transform: 'translateY(-1px)',
        },
        '&:active': { transform: 'translateY(0)' },
      }}
    >
      {label}
    </Button>
  );
};
