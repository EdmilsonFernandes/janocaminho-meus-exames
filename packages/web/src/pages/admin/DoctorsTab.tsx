import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip } from '@mui/material';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';
const H = () => ({ Authorization: `Bearer ${token()}` });

/** Gestão de médicos — CRM/UF, validação de e-mail, pacientes compartilhados. */
export const DoctorsTab = () => {
  const [d, setD] = useState<{ doctors: any[]; total: number } | null>(null);
  const [err, setErr] = useState(false);
  const load = () => { setErr(false); fetch(`${API_URL}/admin/doctors`, { headers: H() }).then((r) => r.ok ? r.json() : Promise.reject()).then(setD).catch(() => setErr(true)); };
  useEffect(load, []);
  if (!d && !err) return <TabLoader />;
  if (err) return <SectionError message="Não foi possível carregar os médicos." onRetry={load} />;
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 800 }}>👥 {d!.total} médico(s) cadastrado(s)</Typography>
      <Stack spacing={1}>
        {d!.doctors.map((m: any) => (
          <Card key={m.id} variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', py: 1.5 }}>
              <Box sx={{ flex: '1 1 60%', minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700 }}>{m.name}</Typography>
                <Typography variant="caption" color="text.secondary">🩺 CRM {m.crm}{m.crmUf ? `-${m.crmUf}` : ''}{m.specialty ? ` · ${m.specialty}` : ''}</Typography>
              </Box>
              <Chip size="small" label={`${m._count?.shares ?? 0} paciente(s)`} />
              {m.emailVerified ? <Chip size="small" label="Verificado" color="success" /> : <Chip size="small" label="E-mail pendente" color="warning" />}
            </CardContent>
          </Card>
        ))}
        {d!.doctors.length === 0 && <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>Nenhum médico cadastrado ainda.</Typography>}
      </Stack>
    </Box>
  );
};
