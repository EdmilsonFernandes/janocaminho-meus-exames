import { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, TextField, Button, CircularProgress, Stack, Chip, Avatar, Divider, Alert } from '@mui/material';
import { API_URL } from '../config';
import { DrExame } from '../components/DrExame';

const docKey = 'doctorToken';

export const DoctorPortalPage = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem(docKey));
  const [doctor, setDoctor] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [regName, setRegName] = useState(''); const [regCrm, setRegCrm] = useState(''); const [regSpec, setRegSpec] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const docHeaders = () => token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setErr('');
    try {
      const body = mode === 'login' ? { email, password: pwd } : { name: regName, crm: regCrm, specialty: regSpec, email, password: pwd };
      const r = await fetch(`${API_URL}/doctor/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha');
      localStorage.setItem(docKey, d.token); setToken(d.token); setDoctor(d.doctor);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  const logout = () => { localStorage.removeItem(docKey); setToken(null); setDoctor(null); };

  if (token) return <DoctorDashboard token={token} onLogout={logout} />;

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, background: 'linear-gradient(160deg,#f0f9ff,#e6f7f5)' }}>
      <Box sx={{ width: '100%', maxWidth: 420, bgcolor: '#fff', borderRadius: 4, p: { xs: 3, sm: 4 }, boxShadow: '0 8px 40px rgba(11,92,171,.12)' }}>
        <Stack alignItems="center" spacing={1} sx={{ mb: 3 }}>
          <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: '#e6f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DrExame size={44} sx={{ borderRadius: '50%' }} /></Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>Portal do Médico</Typography>
          <Typography variant="caption" color="text.secondary">Acesso restrito a profissionais de saúde</Typography>
        </Stack>
        <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {mode === 'register' && (<>
            <TextField label="Nome completo" required value={regName} onChange={(e) => setRegName(e.target.value)} size="small" fullWidth />
            <TextField label="CRM (ex.: 12345-SP)" required value={regCrm} onChange={(e) => setRegCrm(e.target.value)} size="small" fullWidth />
            <TextField label="Especialidade" value={regSpec} onChange={(e) => setRegSpec(e.target.value)} size="small" fullWidth />
          </>)}
          <TextField label="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} size="small" fullWidth />
          <TextField label="Senha" type="password" required value={pwd} onChange={(e) => setPwd(e.target.value)} size="small" fullWidth />
          {err && <Alert severity="error" sx={{ py: 0.5 }}>{err}</Alert>}
          <Button type="submit" variant="contained" fullWidth disabled={loading} sx={{ borderRadius: 2, py: 1.3, fontWeight: 800, textTransform: 'none', background: 'linear-gradient(135deg,#0b5cab,#1565c0)' }}>
            {loading ? <CircularProgress size={22} color="inherit" /> : mode === 'login' ? 'Entrar' : 'Cadastrar'}
          </Button>
        </Box>
        <Typography align="center" sx={{ mt: 2, fontSize: 13 }}>
          {mode === 'login' ? 'Primeiro acesso?' : 'Já tem conta?'}{' '}
          <Box component="button" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }} sx={{ background: 'none', border: 'none', color: '#0b5cab', fontWeight: 700, cursor: 'pointer' }}>
            {mode === 'login' ? 'Cadastre-se' : 'Fazer login'}
          </Box>
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 2, color: '#9aa7ad' }}>Conteúdo educativo — não substitui avaliação médica.</Typography>
      </Box>
    </Box>
  );
};

const DoctorDashboard = ({ token, onLogout }: { token: string; onLogout: () => void }) => {
  const [patients, setPatients] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctor, setDoctor] = useState<any>(null);
  const h = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch(`${API_URL}/doctor/me`, { headers: h }).then((r) => r.json()).then((d) => setDoctor(d.doctor)).catch(() => {});
    fetch(`${API_URL}/doctor/patients`, { headers: h }).then((r) => r.json()).then((d) => { setPatients(d.items ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const viewExams = async (p: any) => {
    setSelected(p);
    const r = await fetch(`${API_URL}/doctor/patients/${p.patient.id}/exams`, { headers: h });
    const d = await r.json();
    setExams(r.ok ? (d.items ?? []) : []);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
      <Box sx={{ bgcolor: 'linear-gradient(135deg,#0b5cab,#1565c0)', background: 'linear-gradient(135deg,#0b5cab,#1565c0)', color: '#fff', p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box><Typography sx={{ fontWeight: 800 }}>🩺 {doctor?.name || 'Médico'}</Typography>{doctor?.specialty && <Typography variant="caption" sx={{ opacity: .85 }}>{doctor.specialty} • CRM {doctor?.crm}</Typography>}</Box>
        <Button size="small" onClick={onLogout} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.4)' }} variant="outlined">Sair</Button>
      </Box>
      <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, md: 3 } }}>
        {loading && <CircularProgress />}
        {!loading && !selected && (
          <>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 800 }}>Pacientes ({patients.length})</Typography>
            {patients.length === 0 && <Card><CardContent><Typography color="text.secondary">Nenhum paciente compartilhou dados com você ainda.</Typography></CardContent></Card>}
            <Stack spacing={1.5}>
              {patients.map((p) => (
                <Card key={p.shareId} variant="outlined" sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }} onClick={() => viewExams(p)}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar src={p.patient?.photoUrl ? undefined : undefined} sx={{ bgcolor: '#0b5cab' }}>{p.patient?.fullName?.charAt(0)}</Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 700 }}>{p.patient?.fullName}</Typography>
                      <Typography variant="caption" color="text.secondary">{p.patient?.relationship}{p.convenio ? ` • ${p.convenio}` : ' • Particular'}</Typography>
                      <Box sx={{ mt: 0.5 }}>{p.scopes?.map((s: string) => <Chip key={s} size="small" label={s} sx={{ mr: 0.5, height: 18, fontSize: 10, bgcolor: '#e6f3ff', color: '#0b5cab' }} />)}</Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </>
        )}
        {selected && (
          <>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
              <Button size="small" onClick={() => setSelected(null)}>← Voltar</Button>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>{selected.patient?.fullName}</Typography>
            </Stack>
            <Stack spacing={1.5}>
              {exams.length === 0 && <Card><CardContent><Typography color="text.secondary">Sem exames extraídos.</Typography></CardContent></Card>}
              {exams.map((ex: any) => (
                <Card key={ex.id} variant="outlined"><CardContent>
                  <Typography sx={{ fontWeight: 700 }}>{ex.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{new Date(ex.performedAt).toLocaleDateString('pt-BR')}{ex.sourceLab ? ` • ${ex.sourceLab}` : ''} • {ex._count?.items ?? 0} itens</Typography>
                  {ex.items?.length > 0 && <Box sx={{ mt: 1 }}>{ex.items.map((it: any, i: number) => <Chip key={i} size="small" color="error" variant="outlined" label={`${it.name}: ${it.valueText}`} sx={{ mr: 0.5, mb: 0.5 }} />)}</Box>}
                </CardContent></Card>
              ))}
            </Stack>
          </>
        )}
      </Box>
    </Box>
  );
};
