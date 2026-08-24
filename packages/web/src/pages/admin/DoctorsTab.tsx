import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip, Avatar } from '@mui/material';
import { API_URL, token, doctorPhotoUrl } from '../../config';
import { TabLoader, SectionError } from './parts';
const H = () => ({ Authorization: `Bearer ${token()}` });

/** Gestão de médicos — CRM/UF, foto, validação, pacientes compartilhados. Premium cards. */
export const DoctorsTab = () => {
  const [d, setD] = useState<{ doctors: any[]; total: number } | null>(null);
  const [err, setErr] = useState(false);
  const load = () => { setErr(false); fetch(`${API_URL}/admin/doctors`, { headers: H() }).then((r) => r.ok ? r.json() : Promise.reject()).then(setD).catch(() => setErr(true)); };
  useEffect(load, []);
  if (!d && !err) return <TabLoader />;
  if (err) return <SectionError message="Não foi possível carregar os médicos." onRetry={load} />;
  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>🩺 Médicos ({d!.total})</Typography>
      <Stack spacing={1.5}>
        {d!.doctors.map((m: any, idx: number) => (
          <Card key={m.id} variant="outlined" sx={{
            borderRadius: '16px',
            boxShadow: '0 1px 2px rgba(0,0,0,.03), 0 2px 8px rgba(0,0,0,.04), 0 8px 20px rgba(0,0,0,.03)',
            transition: 'box-shadow .15s, border-color .15s',
            '&:hover': { borderColor: 'rgba(32,178,170,.3)', boxShadow: '0 2px 4px rgba(32,178,170,.06), 0 8px 24px rgba(32,178,170,.1)' },
            animation: `docCardIn .3s ease ${idx * 0.05}s both`,
            '@keyframes docCardIn': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
          }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.75, py: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Avatar src={m.photoUrl ? doctorPhotoUrl(m.id) : undefined} sx={{ width: 48, height: 48, borderRadius: '12px', bgcolor: 'rgba(32,178,170,.1)', color: '#178f89', fontWeight: 800, fontSize: 18, fontFamily: 'Poppins, sans-serif', flexShrink: 0 }}>
                {(m.name || '?').charAt(0).toUpperCase()}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 15, fontFamily: 'Poppins, sans-serif' }}>{m.name}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  CRM {m.crm}{m.crmUf && !String(m.crm).includes('-') ? `-${m.crmUf}` : ''}{m.specialty ? ` · ${m.specialty}` : ''}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>{m.email}</Typography>
              </Box>
              <Stack spacing={0.5} alignItems="flex-end">
                <Chip size="small" label={`${m._count?.shares ?? 0} paciente${m._count?.shares === 1 ? '' : 's'}`} sx={{ fontWeight: 700, height: 22 }} />
                {m.emailVerified
                  ? <Chip size="small" label="✓ Verificado" color="success" sx={{ height: 20, fontSize: 10 }} />
                  : <Chip size="small" label="pendente" color="warning" sx={{ height: 20, fontSize: 10 }} />}
              </Stack>
            </CardContent>
          </Card>
        ))}
        {d!.doctors.length === 0 && <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>Nenhum médico cadastrado ainda.</Typography>}
      </Stack>
    </Box>
  );
};
