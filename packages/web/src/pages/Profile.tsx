import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, TextField, Button, Stack, Chip, MenuItem, Switch, FormControlLabel } from '@mui/material';
import { useNotify, useRefresh, useTranslate } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import SaveIcon from '@mui/icons-material/Save';
import BadgeIcon from '@mui/icons-material/WorkspacePremium';
import DownloadIcon from '@mui/icons-material/Download';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LockResetIcon from '@mui/icons-material/LockReset';
import ShieldIcon from '@mui/icons-material/Shield';
import ApiIcon from '@mui/icons-material/Api';
import ScaleIcon from '@mui/icons-material/Scale';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { API_URL, token, apiHeaders } from '../config';
import { ReferralCard } from '../components/ReferralCard';
import { useSelectedPatient } from '../patient-context';
import { PhotoUpload } from '../components/PhotoUpload';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { PageSkeleton } from '../components/PageSkeleton';
import { formatCpf, isValidCpf } from '../utils/cpf';
import { DateFieldBR } from '../components/DateFieldBR';

/** Altura: aceita "172" (cm) ou "1.72"/"1,72" (m) → devolve cm inteiro; null se inválido.
 *  <3 entende como metros (1.72 → 172); caso contrário já está em centímetros. */
const parseHeightCm = (s: string): number | null => {
  const n = Number(String(s ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n < 3 ? n * 100 : n);
};

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '');

/** Linha de atalho p/ outra área da conta (a funcionalidade continua existindo — em outro lugar). */
const AccountLinkRow = ({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) => (
  <Stack direction="row" spacing={1.5} alignItems="center" onClick={onClick} sx={{ py: 1.25, cursor: 'pointer', '&:active': { opacity: 0.7 } }}>
    <Box sx={{ width: 36, height: 36, borderRadius: '10px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(32,178,170,.12)', color: '#178f89', flexShrink: 0 }}>{icon}</Box>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontWeight: 700, fontSize: 15, color: 'text.primary' }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>{desc}</Typography>
    </Box>
    <ChevronRightIcon sx={{ color: 'text.disabled' }} />
  </Stack>
);

/**
 * Meu Perfil — ARQUITETURA (auditoria 2026-08): o Perfil é IDENTIDADE + DADOS CLÍNICOS +
 * preferências leves. Funções de conta moram nas páginas próprias (nada desapareceu):
 * trocar senha/MFA/biometria → /seguranca · export/import/excluir (LGPD) → /privacidade.
 * Peso: apenas EXIBIÇÃO do valor atual (vem da última medição) + atalho — registro é em Medições
 * (terminou a duplicação de UI: duas telas gravavam peso de jeitos diferentes).
 */
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
  const [ethnicity, setEthnicity] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [photoVer, setPhotoVer] = useState(0); // cache-bust sincronizado entre header
  const [achAlerts, setAchAlerts] = useState(true); // avisar ao desbloquear conquista
  // Libras: preferência LOCAL (o widget vive no index.html, fora do React) — body class + localStorage.
  // OPT-IN (2026-08-19, a pedido do dono): default DESLIGADO — o widget flutuante atrapalhava
  // quem não usa; quem precisa ativa aqui (e o index.html só mostra com 'meus_exames_libras' === '1').
  const [librasOn, setLibrasOn] = useState(() => { try { return localStorage.getItem('meus_exames_libras') === '1'; } catch { return false; } });
  // Card de atividade (Health Connect): a volta de quem ocultou no Dashboard.
  const [activityOn, setActivityOn] = useState(() => { try { return localStorage.getItem('dx_activity_hidden') !== '1'; } catch { return true; } });

  const load = async () => {
    const h = { Authorization: `Bearer ${token()}` };
    const me = await fetch(`${API_URL}/auth/me`, { headers: h });
    if (me.ok) { const mu = (await me.json())?.user; setUser(mu); setAchAlerts(mu?.achievementAlerts ?? true); }
    if (pid) {
      const pr = await fetch(`${API_URL}/patients/${pid}`, { headers: h });
      if (pr.ok) {
        const p = await pr.json();
        setPatient(p); setFullName(p.fullName ?? ''); setCpf(p.cpfMasked ?? ''); setPhone(p.phone ?? '');
        setClinical(p.clinicalProfile ?? ''); setGender(p.gender ?? ''); setHeightCm(p.heightCm != null ? String(p.heightCm) : '');
        setEthnicity(p.ethnicity ?? ''); setBirthDate(p.dateOfBirth ? p.dateOfBirth.split('T')[0] : '');
      }
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
    if (r.ok) { notify('Perfil atualizado!', { type: 'success' }); await load(); refresh(); }
    else notify('Erro ao salvar', { type: 'error' });
  };
  const toggleAchAlerts = async (on: boolean) => {
    setAchAlerts(on);
    const r = await fetch(`${API_URL}/auth/me`, { method: 'PATCH', headers: apiHeaders(true), body: JSON.stringify({ achievementAlerts: on }) });
    if (!r.ok) { setAchAlerts(!on); notify('Erro ao salvar preferência.', { type: 'error' }); }
  };
  const toggleLibras = (on: boolean) => {
    setLibrasOn(on);
    try { localStorage.setItem('meus_exames_libras', on ? '1' : '0'); } catch { /* localStorage indisponível */ }
    document.body.classList.toggle('libras-off', !on);
    // OPT-IN TOTAL (2026-08-24 r3): nada do VLibras existe até ligar — o index.html só
    // injeta script+DOM via __loadVLibras(). "Ligar" carrega tudo na hora (sem reload);
    // "desligar" remove o host inteiro (o widget some de vez, não só esconde por CSS).
    if (on) {
      (window as any).__loadVLibras?.();
    } else {
      document.getElementById('vlibras-host')?.remove();
    }
  };
  const toggleActivity = (on: boolean) => {
    setActivityOn(on);
    try { localStorage.setItem('dx_activity_hidden', on ? '0' : '1'); } catch { /* localStorage indisponível */ }
    if (on) notify('Card de atividade voltou ao início ✨', { type: 'success' });
  };

  if (!pid) return <PageSkeleton cards={4} />;

  const planActive = user?.planExpiresAt && new Date(user.planExpiresAt) > new Date();
  const profilePct: number | null = patient?.profileCompleteness?.pct ?? null;

  return (
    <PageContainer width={780}>
      <PageHeader icon={<AccountCircleIcon />} title={translate('page.profile')} subtitle={translate('page.profile_sub')} />

      {/* Cabeçalho: conta + foto EDITÁVEL (unificado — só uma foto) */}
      <Card sx={{ mb: 2, borderRadius: '12px', overflow: 'hidden', background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff' }}>
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
              {profilePct != null && profilePct < 100 && (
                <Chip size="small" label={`Perfil ${profilePct}%`} sx={{ bgcolor: 'rgba(255,255,255,.22)', color: '#fff', fontWeight: 700 }} />
              )}
            </Stack>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.85 }}>Toque na câmera da foto para trocar a imagem.</Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Dados + perfil clínico */}
      <Card sx={{ mb: 2, borderRadius: '12px' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Dados e perfil clínico</Typography>
          <Stack spacing={2}>
            <TextField label="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} fullWidth size="small" disabled={!!patient?.identityLocked} helperText={patient?.identityLocked ? 'Nome bloqueado após verificação de CPF e e-mail. Correção somente via suporte.' : undefined} />
            <TextField label="CPF" value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} fullWidth size="small" disabled={!!patient?.hasCpf} inputProps={{ inputMode: 'numeric' }} error={!patient?.hasCpf && !!cpf && cpf.length === 14 && !isValidCpf(cpf)} helperText={patient?.hasCpf ? 'CPF verificado e mascarado. Correção somente via suporte auditado.' : 'Usado para confirmar que os exames pertencem a este perfil.'} />
            <TextField label="Telefone / WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth size="small" />
            <TextField
              select label="Sexo" value={gender} onChange={(e) => setGender(e.target.value)} fullWidth size="small"
              helperText={gender
                ? 'Usamos a coluna de referência correspondente do laudo (Homens/Mulheres) e ajustamos IMC, eGFR e idade biológica.'
                : 'Sem sexo informado, os cálculos usam a referência masculina — informe para referências exatas.'}
            >
              <MenuItem value="female">Feminino</MenuItem>
              <MenuItem value="male">Masculino</MenuItem>
              <MenuItem value="">Não informado</MenuItem>
            </TextField>
            <TextField type="number" label="Altura (cm)" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} fullWidth size="small" helperText="Em centímetros (ex.: 172). Aceita 1,72 m — convertemos pra você. Usada no IMC." />
            <TextField select label="Etnia (opcional)" value={ethnicity} onChange={(e) => setEthnicity(e.target.value)} fullWidth size="small" helperText="Opcional de verdade: hoje nenhum cálculo usa etnia (nossas equações são race-free) — guardamos para pesquisas futuras.">
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

      {/* Peso atual — EXIBIÇÃO + atalho (registro é em Medições; acabou a 2ª UI de peso).
          Valor vem da última medição WEIGHT (mesma fonte do IMC no server). */}
      <Card sx={{ mb: 2, borderRadius: '12px' }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ width: 40, height: 40, borderRadius: '11px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(32,178,170,.12)', color: '#178f89', flexShrink: 0 }}><ScaleIcon /></Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6">Peso atual</Typography>
              {patient?.weightKg != null ? (
                <Typography variant="body2" color="text.secondary">
                  <Box component="span" sx={{ fontWeight: 800, fontSize: 18, color: 'text.primary' }}>{String(patient.weightKg).replace('.', ',')} kg</Box>
                  {patient.weightMeasuredAt ? ` · registrado em ${fmtDate(patient.weightMeasuredAt)}` : ''}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">Sem peso registrado ainda — usado no IMC e no risco cardiometabólico.</Typography>
              )}
            </Box>
            <Button variant={patient?.weightKg != null ? 'outlined' : 'contained'} onClick={() => navigate('/medicoes')} sx={{ flexShrink: 0 }}>
              {patient?.weightKg != null ? 'Novo peso' : 'Registrar peso'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Preferências — notificações + acessibilidade juntas (3 toggles não merecem página própria) */}
      <Card sx={{ mb: 2, borderRadius: '12px' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Preferências</Typography>
          <FormControlLabel control={<Switch checked={achAlerts} onChange={(e) => toggleAchAlerts(e.target.checked)} />} label={<Box>🔔 Avisar quando eu desbloquear uma conquista</Box>} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>Você continua ganhando os créditos mesmo com isso desligado — só não recebe o aviso no sino.</Typography>
          <FormControlLabel control={<Switch checked={librasOn} onChange={(e) => toggleLibras(e.target.checked)} />} label="♿ Botão de tradução em Libras" />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>Traduz os textos do app para Língua Brasileira de Sinais. Desligue para remover o botão flutuante da tela.</Typography>
          <FormControlLabel control={<Switch checked={activityOn} onChange={(e) => toggleActivity(e.target.checked)} />} label="🏃 Card de atividade física no início" />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Passos, calorias e distância (Health Connect do celular). Vale no app Android.</Typography>
        </CardContent>
      </Card>

      {/* CONTA — atalhos pras áreas próprias (nada desapareceu; cada coisa no seu lugar) */}
      <Card sx={{ mb: 2, borderRadius: '12px' }}>
        <CardContent sx={{ py: 1 }}>
          <AccountLinkRow icon={<LockResetIcon />} title="Segurança" desc="Trocar senha, 2FA e biometria" onClick={() => navigate('/seguranca')} />
          <AccountLinkRow icon={<ShieldIcon />} title="Privacidade e dados" desc="Baixar seus dados, importar, termos (LGPD) e excluir conta" onClick={() => navigate('/privacidade')} />
          {/* Discreto de propósito (dor do dono: dev NÃO no menu principal do leigo). */}
          <AccountLinkRow icon={<ApiIcon />} title="API para desenvolvedores" desc="Integre preço de remédios e interações no seu produto" onClick={() => navigate('/api')} />
        </CardContent>
      </Card>

      {/* BENEFÍCIOS — convide amigos, ganhe créditos */}
      <ReferralCard code={user?.referralCode} />
    </PageContainer>
  );
};
