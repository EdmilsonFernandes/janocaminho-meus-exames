import { Button } from '@mui/material';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import { TELEMEDICINE_URL } from '../config';
import { specialtyForMarker, doctoraliaUrl } from './telemedicineMap';

/**
 * Botão "Agendar Telemedicina".
 * - Se receber um `marker` (nameCanonical) mapeado → abre a especialidade certa no Doctoralia.
 * - Senão, se houver `VITE_TELEMEDICINE_URL` → abre o link genérico configurado.
 * - Senão → fica oculto (não fixa link).
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
      color="primary"
      startIcon={<LocalHospitalIcon />}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      sx={{ mt: 1, borderRadius: 2, textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}
    >
      {label}
    </Button>
  );
};
