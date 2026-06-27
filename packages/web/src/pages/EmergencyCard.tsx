import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Divider } from '@mui/material';
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
    <PageContainer width="narrow">
      {/* Title removido — header vermelho abaixo já cumpre o papel de título visual */}
      <Card sx={{ borderRadius: 4, overflow: 'hidden', boxShadow: '0 4px 20px rgba(211,47,47,.15)' }}>
        {/* Header vermelho */}
        <Box sx={{ background: 'linear-gradient(135deg,#d32f2f,#b71c1c)', p: 3, color: '#fff', textAlign: 'center' }}>
          <LocalHospitalIcon sx={{ fontSize: 48 }} />
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 1 }}>CARTÃO DE EMERGÊNCIA</Typography>
          <Typography sx={{ opacity: .85 }}>Meus Exames</Typography>
        </Box>
        <CardContent sx={{ p: 3 }}>
          {patient ? (
            <>
              <Box sx={{ textAlign: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{patient.fullName}</Typography>
                {age && <Typography color="text.secondary">{age} anos</Typography>}
              </Box>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontWeight: 700, mb: 0.5, color: '#d32f2f' }}>🩸 Tipo Sanguíneo</Typography>
                <Typography variant="body2" color="text.secondary">{patient.bloodType || 'Não informado — preencha no perfil'}</Typography>
              </Box>
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontWeight: 700, mb: 0.5, color: '#d32f2f' }}>💊 Medicações</Typography>
                <Typography variant="body2" color="text.secondary">{patient.clinicalProfile || 'Não informado'}</Typography>
              </Box>
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontWeight: 700, mb: 0.5, color: '#d32f2f' }}>📞 Contato de emergência</Typography>
                <Typography variant="body2" color="text.secondary">{patient.phone || 'Não informado'}</Typography>
              </Box>
              <Box sx={{ textAlign: 'center', mt: 3 }}>
                <Box sx={{ display: 'inline-block', p: 2, border: '2px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
                  <Typography sx={{ fontSize: 48, fontWeight: 900, lineHeight: 1, color: 'text.primary', letterSpacing: 2 }}>
                    {patient.fullName?.charAt(0)?.toUpperCase() || '?'}{age ?? ''}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">ID emergencial</Typography>
                </Box>
              </Box>
              <Button fullWidth variant="contained" color="error" sx={{ mt: 3 }} onClick={() => printPage('Cartão de Emergência')}>
                🖨️ Imprimir carteirinha
              </Button>
            </>
          ) : (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>Carregando...</Typography>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
};
