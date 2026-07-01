import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, TextField, Button, Stack, Chip, CircularProgress, MenuItem, Switch, FormControlLabel } from '@mui/material';
import { useNotify, useRefresh } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import LockIcon from '@mui/icons-material/Lock';
import SaveIcon from '@mui/icons-material/Save';
import BadgeIcon from '@mui/icons-material/WorkspacePremium';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { API_URL, token, apiHeaders } from '../config';
import { ReferralCard } from '../components/ReferralCard';
import { useSelectedPatient } from '../patient-context';
import { PhotoUpload } from '../components/PhotoUpload';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';

export const ProfilePage = () => {
  const [pid] = useSelectedPatient();
  const notify = useNotify();
  const refresh = useRefresh();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [clinical, setClinical] = useState('');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [photoVer, setPhotoVer] = useState(0); // cache-bust sincronizado entre header
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const [cf, setCf] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [achAlerts, setAchAlerts] = useState(true); // avisar ao desbloquear conquista

  const load = async () => {
    const h = { Authorization: `Bearer ${token()}` };
    const me = await fetch(`${API_URL}/auth/me`, { headers: h });
    if (me.ok) { const mu = (await me.json())?.user; setUser(mu); setAchAlerts(mu?.achievementAlerts ?? true); }
    if (pid) {
      const pr = await fetch(`${API_URL}/patients/${pid}`, { headers: h });
      if (pr.ok) { const p = await pr.json(); setPatient(p); setFullName(p.fullName ?? ''); setPhone(p.phone ?? ''); setClinical(p.clinicalProfile ?? ''); setGender(p.gender ?? ''); setBirthDate(p.dateOfBirth ? p.dateOfBirth.split('T')[0] : ''); }
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pid]);

  const saveProfile = async () => {
    if (!pid) return;
    setSaving(true);
    const r = await fetch(`${API_URL}/patients/${pid}`, { method: 'PUT', headers: apiHeaders(true), body: JSON.stringify({ fullName, phone, clinicalProfile: clinical, gender, dateOfBirth: birthDate || null }) });
    setSaving(false);
    notify(r.ok ? 'Perfil atualizado!' : 'Erro ao salvar', { type: r.ok ? 'success' : 'error' });
  };
  const toggleAchAlerts = async (on: boolean) => {
    setAchAlerts(on);
    const r = await fetch(`${API_URL}/auth/me`, { method: 'PATCH', headers: apiHeaders(true), body: JSON.stringify({ achievementAlerts: on }) });
    if (!r.ok) { setAchAlerts(!on); notify('Erro ao salvar preferência.', { type: 'error' }); }
  };
  const changePw = async () => {
    if (nw !== cf) { notify('A nova senha e a confirmação não conferem.', { type: 'error' }); return; }
    if (nw.length < 6) { notify('Nova senha mín. 6 caracteres.', { type: 'error' }); return; }
    setPwLoading(true);
    const r = await fetch(`${API_URL}/auth/change-password`, { method: 'POST', headers: apiHeaders(true), body: JSON.stringify({ currentPassword: cur, newPassword: nw }) });
    setPwLoading(false);
    if (r.ok) { notify('Senha alterada com sucesso!', { type: 'success' }); setCur(''); setNw(''); setCf(''); }
    else { const e = await r.json().catch(() => ({})); notify(e.error || 'Erro ao trocar senha', { type: 'error' }); }
  };
  const delAccount = async () => {
    if (!window.confirm('ATENÇÃO: excluir a conta apaga TODOS os seus dados (exames, análises, perfil, fotos) definitivamente. NÃO dá pra desfazer. Continuar?')) return;
    if (!window.confirm('Tem certeza ABSOLUTA? Todos os exames e análises serão perdidos para sempre.')) return;
    const r = await fetch(`${API_URL}/auth/account`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { localStorage.clear(); navigate('/landing', { replace: true }); }
    else notify('Falha ao excluir conta. Tente novamente.', { type: 'error' });
  };
  const exportData = async () => {
    const r = await fetch(`${API_URL}/data/export`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!r.ok) { notify('Falha ao exportar', { type: 'error' }); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'meus-exames-backup.json'; a.click();
    URL.revokeObjectURL(url);
    notify('Backup exportado!', { type: 'success' });
  };
  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (!window.confirm('Importar cria NOVOS perfis/exames (não sobrescreve os atuais). Continuar?')) { e.target.value = ''; return; }
    try {
      const r = await fetch(`${API_URL}/data/import`, { method: 'POST', headers: apiHeaders(true), body: await f.text() });
      const d = await r.json();
      if (r.ok) {
        notify(`Importado! ${d.counts?.patients || 0} perfil(is), ${d.counts?.exams || 0} exame(s).`, { type: 'success' });
        window.dispatchEvent(new Event('selPatientChanged'));
        refresh();
        await load();
      }
      else notify(d.error || 'Falha ao importar', { type: 'error' });
    } catch { notify('Arquivo inválido', { type: 'error' }); }
    e.target.value = '';
  };

  if (!pid) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

  const planActive = user?.planExpiresAt && new Date(user.planExpiresAt) > new Date();

  return (
    <PageContainer width={780}>
      <PageHeader icon={<AccountCircleIcon />} title="Meu perfil" subtitle="Sua conta, dados e preferências" />

      {/* Cabeçalho: conta + foto EDITÁVEL (unificado — só uma foto) */}
      <Card sx={{ mb: 2, borderRadius: 4, overflow: 'hidden', background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff' }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap', py: 3 }}>
          <PhotoUpload patientId={pid} photoUrl={patient?.photoUrl} size={76} hideLabel version={photoVer}
            fallback={(fullName || user?.name || '').trim().charAt(0).toUpperCase()}
            onUploaded={() => { setPhotoVer((v) => v + 1); void load(); }} />
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>{fullName || '—'}</Typography>
            <Typography sx={{ opacity: 0.92 }}>✉️ {user?.email ?? '—'}</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }} useFlexGap flexWrap="wrap">
              {patient?.relationship && <Chip size="small" label={patient.relationship} sx={{ bgcolor: 'rgba(255,255,255,.18)', color: '#fff', fontWeight: 700 }} />}
              {planActive
                ? <Chip size="small" icon={<BadgeIcon sx={{ color: '#fff !important' }} />} label="Premium ativo" sx={{ bgcolor: 'rgba(255,255,255,.18)', color: '#fff', fontWeight: 700 }} />
                : <Chip size="small" label="Plano grátis" sx={{ bgcolor: 'rgba(255,255,255,.12)', color: '#fff' }} />}
            </Stack>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.85 }}>Toque na câmera da foto para trocar a imagem.</Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Dados + perfil clínico */}
      <Card sx={{ mb: 2, borderRadius: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Dados e perfil clínico</Typography>
          <Stack spacing={2}>
            <TextField label="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} fullWidth size="small" />
            <TextField label="Telefone / WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth size="small" />
            <TextField select label="Sexo (define a faixa de referência dos exames)" value={gender} onChange={(e) => setGender(e.target.value)} fullWidth size="small" helperText="Mulher usa a coluna 'Mulheres', homem a 'Homens' do laudo.">
              <MenuItem value="">Prefiro não informar (usa Homens)</MenuItem>
              <MenuItem value="female">Feminino</MenuItem>
              <MenuItem value="male">Masculino</MenuItem>
            </TextField>
            <TextField type="date" label="Data de nascimento" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} helperText="Usado pra calcular idade e ajustar faixas de referência." />
            <TextField
              label="Perfil clínico (condições, medicações, histórico)"
              value={clinical} onChange={(e) => setClinical(e.target.value)} multiline minRows={4} fullWidth
              helperText="Ex.: 'Sem tireoide; usa levotiroxina; usa testosterona.' Isso contextualiza a IA — nunca substitui o médico."
            />
          </Stack>
          <Box sx={{ mt: 2 }}>
            <Button variant="contained" startIcon={<SaveIcon />} onClick={saveProfile} disabled={saving}>{saving ? 'Salvando…' : 'Salvar perfil'}</Button>
          </Box>
        </CardContent>
      </Card>

      {/* Notificações de conquista */}
      <Card sx={{ mb: 2, borderRadius: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>🔔 Notificações</Typography>
          <FormControlLabel control={<Switch checked={achAlerts} onChange={(e) => toggleAchAlerts(e.target.checked)} />} label="Avisar quando eu desbloquear uma conquista" />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Você continua ganhando os créditos mesmo com isso desligado — só não recebe o aviso no sino.</Typography>
        </CardContent>
      </Card>

      {/* Trocar senha */}
      <Card sx={{ borderRadius: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><LockIcon color="action" /> Trocar senha</Typography>
          <Stack spacing={2}>
            <TextField type="password" label="Senha atual" value={cur} onChange={(e) => setCur(e.target.value)} fullWidth size="small" />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="password" label="Nova senha" value={nw} onChange={(e) => setNw(e.target.value)} fullWidth size="small" />
              <TextField type="password" label="Confirmar nova senha" value={cf} onChange={(e) => setCf(e.target.value)} fullWidth size="small" />
            </Stack>
          </Stack>
          <Box sx={{ mt: 2 }}>
            <Button variant="outlined" startIcon={<LockIcon />} onClick={changePw} disabled={pwLoading || !cur || !nw}> {pwLoading ? 'Alterando…' : 'Alterar senha'}</Button>
          </Box>
        </CardContent>
      </Card>

      {/* INDICAÇÃO — convide amigos, ganhe créditos */}
      <ReferralCard code={user?.referralCode} />

      {/* Dados e conta (exportar/importar/excluir — termos e LGPD estão em /privacidade) */}
      <Card sx={{ borderRadius: 4, mt: 2, borderColor: 'error.main' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Meus dados</Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button variant="outlined" color="error" onClick={delAccount}>Excluir minha conta</Button>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportData}>Exportar dados</Button>
            <Button variant="outlined" component="label" startIcon={<UploadIcon />}>Importar dados
              <input type="file" hidden accept="application/json" onChange={importData} />
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>A exclusão apaga definitivamente todos os exames, análises e dados. Termos e LGPD em "Privacidade".</Typography>
        </CardContent>
      </Card>
    </PageContainer>
  );
};
