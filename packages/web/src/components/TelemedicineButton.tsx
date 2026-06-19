import { Button } from '@mui/material';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import { TELEMEDICINE_URL } from '../config';

/**
 * Botão "Agendar Telemedicina" — abre a URL configurada (VITE_TELEMEDICINE_URL).
 * Renderiza null se a URL não estiver configurada (não fixa link no código).
 * Usado em resultados alterados (Valores Alterados, detalhe do exame).
 */
export const TelemedicineButton = ({ compact = false }: { compact?: boolean }) => {
  if (!TELEMEDICINE_URL) return null;
  return (
    <Button
      size={compact ? 'small' : 'medium'}
      variant="contained"
      color="primary"
      startIcon={<LocalHospitalIcon />}
      href={TELEMEDICINE_URL}
      target="_blank"
      rel="noopener noreferrer"
      sx={{ mt: 1, borderRadius: 2, textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}
    >
      Agendar Telemedicina
    </Button>
  );
};
