import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, TextField, Button, Stack, Chip, CircularProgress, MenuItem, Switch, FormControlLabel } from '@mui/material';
import { useNotify, useRefresh, useTranslate } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import LockIcon from '@mui/icons-material/Lock';
import SaveIcon from '@mui/icons-material/Save';
import BadgeIcon from '@mui/icons-material/WorkspacePremium';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { API_URL, token, apiHeaders } from '../config';
import { confirmDialog } from '../components/ConfirmDialog';
import { ReferralCard } from '../components/ReferralCard';
import { useSelectedPatient } from '../patient-context';
import { PhotoUpload } from '../components/PhotoUpload';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { formatCpf, isValidCpf } from '../utils/cpf';
import { DateFieldBR } from '../components/DateFieldBR';

/** Altura: aceita "172" (cm) ou "1.72"/"1,72" (m) → devolve cm inteiro; null se inválido.
 *  <3 entende como metros (1.72 → 172); caso contrário já está em centímetros. */
const parseHeightCm = (s: string): number | null => {
  const n = Number(String(s ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n < 3 ? n * 100 : n);
};

export const ProfilePage = () => {
  const translate = useTranslate();
  const [pid] = useSelectedPatient();
  const notify = useNotify();
  const refresh = useRefresh();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [clinical, setClinical] = useState('');
  const [gender, setGender] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weight, setWeight] = useState('');
  const [weightSaving, setWeightSaving] = useState(false);
  const [ethnicity, setEthnicity] = useState('');
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
      if (pr.ok) { const p = await pr.json(); setPatient(p); setFullName(p.fullName ?? ''); setCpf(p.cpfMasked ?? ''); setPhone(p.phone ?? ''); setClinical(p.clinicalProfile ?? ''); setGender(p.gender ?? ''); setHeightCm(p.heightCm != null ? String(p.heightCm) : ''); setEthnicity(p.ethnicity ?? ''); setBirthDate(p.dateOfBirth ? p.dateOfBirth.split('T')[0] : ''); }
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pid]);

  const saveProfile = async () => {
    if (!pid) return;
    if (!patient?.hasCpf && cpf && !isValidCpf(cpf)) { notify('Informe um CPF válido.', { type: 'error' }); return; }
    setSaving(true);
    const body: any = { fullName, phone, clinicalProfile: clinical, gender, heightCm: parseHeightCm(heightCm), ethnicity, dateOfBirth: birthDate || null };
    if (!patient?.hasCpf && cpf) body.cpf = cpf;
    const r = await fetch(`${API_URL}/patients/${pid}`, { method: 'PUT', headers: apiHeaders(true), body: JSON.stringify(body) });
    setSaving(false);
    notify(r.ok ? 'Perfil atualizado!' : 'Erro ao salvar', { type: r.ok ? 'success' : 'error' });
  };
  // Atalho de peso: registra uma medição WEIGHT (vai pro histórico de Medições e alimenta IMC/cardio).
  const saveWeight = async () => {
    if (!pid) return;
    const w = Number(String(weight).trim().replace(',', '.'));
    if (!Number.isFinite(w) || w <= 0 || w > 500) { notify('Informe um peso válido em kg.', { type: 'error' }); return; }
    setWeightSaving(true);
    const r = await fetch(`${API_URL}/measurements`, { method: 'POST', headers: apiHeaders(true), body: JSON.stringify({ patientId: pid, type: 'WEIGHT', value: w, unit: 'kg', measuredAt: new Date().toISOString().slice(0, 10) }) });
    setWeightSaving(false);
    if (r.ok) { notify('Peso registrado em Medições!', { type: 'success' }); setWeight(''); }
    else { const e = await r.json().catch(() => ({})); notify(e.error || 'Erro ao registrar peso', { type: 'error' }); }
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
    if (!(await confirmDialog({ title: 'Excluir minha conta', message: 'ATENÇÃO: isso apaga TODOS os seus dados (exames, análises, perfil, fotos) definitivamente. NÃO dá pra desfazer.', confirmLabel: 'Excluir conta' }))) return;
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
    if (!(await confirmDialog({ title: 'Importar dados', message: 'Importar cria NOVOS perfis/exames (não sobrescreve os atuais).', confirmLabel: 'Importar', tone: 'primary' }))) { e.target.value = ''; return; }
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
      <PageHeader icon={<AccountCircleIcon />} title={translate('page.profile')} subtitle={translate('page.profile_sub')} />

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
            <TextField label="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} fullWidth size="small" disabled={!!patient?.identityLocked} helperText={patient?.identityLocked ? 'Nome bloqueado após verificação de CPF e e-mail. Correção somente via suporte.' : undefined} />
            <TextField label="CPF" value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} fullWidth size="small" disabled={!!patient?.hasCpf} inputProps={{ inputMode: 'numeric' }} error={!patient?.hasCpf && !!cpf && cpf.length === 14 && !isValidCpf(cpf)} helperText={patient?.hasCpf ? 'CPF verificado e mascarado. Correção somente via suporte auditado.' : 'Usado para confirmar que os exames pertencem a este perfil.'} />
            <TextField label="Telefone / WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth size="small" />
            <TextField select label="Sexo (define a faixa de referência dos exames)" value={gender} onChange={(e) => setGender(e.target.value)} fullWidth size="small" helperText="Mulher usa a coluna 'Mulheres', homem a 'Homens' do laudo.">
              <MenuItem value="">Prefiro não informar (usa Homens)</MenuItem>
              <MenuItem value="female">Feminino</MenuItem>
              <MenuItem value="male">Masculino</MenuItem>
            </TextField>
            <TextField type="number" label="Altura (cm)" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} fullWidth size="small" helperText="Em centímetros (ex.: 172). Aceita 1,72 m — convertemos pra você. Usada no IMC." />
            <TextField select label="Etnia (opcional)" value={ethnicity} onChange={(e) => setEthnicity(e.target.value)} fullWidth size="small" helperText="Dados demográficos ajudam a refinar futuras análises.">
              <MenuItem value="">Prefiro não informar</MenuItem>
              <MenuItem value="branca">Branca</MenuItem>
              <MenuItem value="preta">Preta</MenuItem>
              <MenuItem value="parda">Parda</MenuItem>
              <MenuItem value="amarela">Amarela</MenuItem>
              <MenuItem value="indigena">Indígena</MenuItem>
            </TextField>
            <DateFieldBR label="Data de nascimento" value={birthDate} onChange={setBirthDate} fullWidth size="small" helperText="Usado pra calcular idade e ajustar faixas de referência." />
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

      {/* Peso atual — atalho que registra medição WEIGHT (alimenta IMC + cardiometabólico) */}
      <Card sx={{ mb: 2, borderRadius: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>⚖️ Peso atual</Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField label="Peso (kg)" value={weight} onChange={(e) => setWeight(e.target.value)} size="small" inputProps={{ inputMode: 'decimal' }} sx={{ width: 150 }} onKeyDown={(e) => { if (e.key === 'Enter') saveWeight(); }} />
            <Button variant="contained" onClick={saveWeight} disabled={weightSaving || !weight}>{weightSaving ? 'Salvando…' : 'Registrar peso'}</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Salva como medição — alimenta o IMC e o card de Risco Cardiometabólico. Histórico completo em Medições.</Typography>
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
