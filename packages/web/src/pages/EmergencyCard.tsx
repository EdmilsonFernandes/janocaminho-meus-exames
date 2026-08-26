import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Divider, Skeleton, Stack } from '@mui/material';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { printPage } from '../utils/nativeDoc';
import { PageContainer } from '../components/layout/PageContainer';

export const EmergencyCardPage = () => {
  const [pid] = useSelectedPatient();
  const [patient, setPatient] = useState<any>(null);

  useEffect(() => {
    if (!pid) return;
    fetch(`${API_URL}/patients/${pid}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then(setPatient).catch(() => {});
  }, [pid]);

  const age = patient?.dateOfBirth
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  return (
    <PageContainer width="narrow" sx={{ pb: { xs: 10, sm: 5 } }}>
      {/* Title removido — header vermelho abaixo já cumpre o papel de título visual */}
      <Card sx={{
        borderRadius: '24px', overflow: 'hidden',
        border: '1px solid rgba(239,68,68,0.22)',
        boxShadow: '0 10px 36px rgba(239,68,68,0.12)'
      }}>
        {/* Header vermelho */}
        <Box sx={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', p: 3, color: '#fff', textAlign: 'center' }}>
          <LocalHospitalIcon sx={{ fontSize: 48 }} />
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 1, fontFamily: 'Poppins, sans-serif' }}>CARTÃO DE EMERGÊNCIA</Typography>
          <Typography sx={{ opacity: 0.85, fontWeight: 500 }}>Meus Exames</Typography>
        </Box>
        <CardContent sx={{ p: 3 }}>
          {patient ? (
            <>
              <Box sx={{ textAlign: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>{patient.fullName}</Typography>
                {age && <Typography color="text.secondary" sx={{ fontWeight: 600 }}>{age} anos</Typography>}
              </Box>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontWeight: 700, mb: 0.5, color: '#ef4444' }}>🩸 Tipo Sanguíneo</Typography>
                <Typography variant="body2" color="text.secondary">{patient.bloodType || 'Não informado — preencha no perfil'}</Typography>
              </Box>
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontWeight: 700, mb: 0.5, color: '#ef4444' }}>💊 Medicações</Typography>
                <Typography variant="body2" color="text.secondary">{patient.clinicalProfile || 'Não informado'}</Typography>
              </Box>
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontWeight: 700, mb: 0.5, color: '#ef4444' }}>📞 Contato de emergência</Typography>
                <Typography variant="body2" color="text.secondary">{patient.phone || 'Não informado'}</Typography>
              </Box>
              <Box sx={{ textAlign: 'center', mt: 3 }}>
                <Box sx={{ display: 'inline-block', p: 2, border: '2px dashed rgba(239,68,68,0.3)', borderRadius: '16px', bgcolor: 'rgba(239,68,68,0.04)' }}>
                  <Typography sx={{ fontSize: 48, fontWeight: 900, lineHeight: 1, color: '#dc2626', letterSpacing: 2, fontFamily: 'Poppins, sans-serif' }}>
                    {patient.fullName?.charAt(0)?.toUpperCase() || '?'}{age ?? ''}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>ID emergencial</Typography>
                </Box>
              </Box>
              <Button fullWidth variant="contained" sx={{ mt: 3, borderRadius: '999px', py: 1.25, fontWeight: 800, textTransform: 'none', bgcolor: '#ef4444', '&:hover': { bgcolor: '#dc2626' } }} onClick={() => printPage('Cartão de Emergência')}>
                🖨️ Imprimir carteirinha
              </Button>
            </>
          ) : (
            <Stack spacing={1.5} sx={{ py: 1 }}>
              <Box sx={{ textAlign: 'center', mb: 1 }}>
                <Skeleton variant="circular" width={56} height={56} sx={{ mx: 'auto' }} />
                <Skeleton variant="text" sx={{ fontSize: '1.25rem', width: '60%', mx: 'auto' }} />
                <Skeleton variant="text" sx={{ fontSize: '0.875rem', width: '40%', mx: 'auto' }} />
              </Box>
              <Divider sx={{ my: 1 }} />
              <Skeleton variant="text" sx={{ fontSize: '0.95rem', width: '40%' }} />
              <Skeleton variant="text" sx={{ fontSize: '0.875rem', width: '80%' }} />
              <Skeleton variant="text" sx={{ fontSize: '0.95rem', width: '40%' }} />
              <Skeleton variant="text" sx={{ fontSize: '0.875rem', width: '80%' }} />
              <Skeleton variant="text" sx={{ fontSize: '0.95rem', width: '40%' }} />
              <Skeleton variant="text" sx={{ fontSize: '0.875rem', width: '80%' }} />
            </Stack>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
};
