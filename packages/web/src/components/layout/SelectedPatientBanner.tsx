import { useEffect, useState } from 'react';
import { alpha } from '@mui/material/styles';
import FavoriteIcon from '@mui/icons-material/Favorite';
import PersonIcon from '@mui/icons-material/Person';
import { Box, Chip, Skeleton, Stack, Typography } from '@mui/material';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';

interface PatientLite {
  id: string;
  fullName: string;
  relationship: string | null;
}

/**
 * Faixa única de contexto do perfil ativo.
 * Objetivo: o Titular e o Dependente entram nas mesmas telas com a mesma estrutura visual;
 * muda só o conteúdo do perfil selecionado.
 */
export const SelectedPatientBanner = ({
  title = 'Perfil em foco',
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) => {
  const [pid] = useSelectedPatient();
  const [patient, setPatient] = useState<PatientLite | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pid) {
      setPatient(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`${API_URL}/patients`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setPatient(list.find((row: any) => row.id === pid) ?? null);
      })
      .catch(() => { if (!cancelled) setPatient(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pid]);

  if (!pid) return null;

  return (
    <Stack
      direction="row"
      spacing={1.25}
      alignItems="center"
      sx={{
        mb: 2,
        px: 1.5,
        py: 1.1,
        borderRadius: '14px',
        bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
        border: '1px solid',
        borderColor: (t) => alpha(t.palette.primary.main, 0.22),
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: '12px',
          display: 'grid',
          placeItems: 'center',
          bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
          color: 'primary.dark',
          flexShrink: 0,
        }}
      >
        {patient?.relationship === 'Titular' ? <PersonIcon sx={{ fontSize: 19 }} /> : <FavoriteIcon sx={{ fontSize: 19 }} />}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>{title}</Typography>
        {loading ? (
          <Skeleton variant="text" width={180} height={22} />
        ) : (
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: 'text.primary', lineHeight: 1.25 }}>
            {patient?.fullName ?? 'Perfil selecionado'}
          </Typography>
        )}
        {(subtitle || patient?.relationship) && !loading && (
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.35, mt: 0.15 }}>
            {subtitle ?? (patient?.relationship === 'Titular'
              ? 'Você está vendo seus próprios dados de saúde.'
              : 'Você está vendo os dados deste dependente em seu modo cuidador.')}
          </Typography>
        )}
      </Box>
      {!loading && patient?.relationship && (
        <Chip
          size="small"
          label={patient.relationship}
          sx={{
            height: 22,
            fontWeight: 800,
            bgcolor: patient.relationship === 'Titular' ? 'rgba(32,178,170,0.14)' : 'rgba(212,165,116,0.16)',
            color: patient.relationship === 'Titular' ? '#178f89' : '#b88a54',
            flexShrink: 0,
          }}
        />
      )}
    </Stack>
  );
};
