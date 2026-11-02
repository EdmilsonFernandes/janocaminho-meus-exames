import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button, Stack, Chip, MenuItem, Switch,
  FormControlLabel, Tabs, Tab, Divider, Grid, useTheme, Tooltip, IconButton
} from '@mui/material';
import { useNotify, useRefresh, useTranslate } from 'react-admin';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SaveIcon from '@mui/icons-material/Save';
import { usePrivacyMode } from '../hooks/usePrivacyMode';
import { diagShare } from '../utils/diag';
import BadgeIcon from '@mui/icons-material/WorkspacePremium';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LockResetIcon from '@mui/icons-material/LockReset';
import ShieldIcon from '@mui/icons-material/Shield';
import ApiIcon from '@mui/icons-material/Api';
import ScaleIcon from '@mui/icons-material/Scale';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import StarIcon from '@mui/icons-material/Star';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import BugReportIcon from '@mui/icons-material/BugReport';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import TuneIcon from '@mui/icons-material/Tune';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import HeightIcon from '@mui/icons-material/Height';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { PLAY_URL } from '../components/ReviewPrompt';
import { API_URL, token, apiHeaders } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PhotoUpload } from '../components/PhotoUpload';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { PageSkeleton } from '../components/PageSkeleton';
import { formatCpf, isValidCpf } from '../utils/cpf';
import { parseHeightCm, maskHeightInput, fmtHeight } from '../utils/height';
import { buildProfilePatch, profileFormFromPatient, type ProfileFormValues } from '../utils/profilePatch';
import { DateFieldBR } from '../components/DateFieldBR';
import { SportsModeCard } from '../components/SportsModeCard';
import { tealText } from '../theme';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import SignLanguageIcon from '@mui/icons-material/SignLanguage';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import { Badge } from '@/components/reui/badge';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { SettingRow } from '@/components/reui/setting-row';
import { FieldLabelWithHint } from '@/components/reui/field-label';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '');

/** Linha de atalho p/ outra área da conta (estilo iOS settings) */
const AccountLinkRow = ({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) => (
  <Stack
    direction="row"
    spacing={1.75}
    alignItems="center"
    onClick={onClick}
    sx={{
      py: 1.5,
      cursor: 'pointer',
      borderRadius: '14px',
      px: 1.25,
      transition: 'all .15s ease',
      '&:hover': { bgcolor: 'action.hover', transform: 'translateX(3px)' },
      '&:active': { opacity: 0.7 },
    }}
  >
    <Box
      sx={{
        width: 42,
        height: 42,
        borderRadius: '12px',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(135deg, rgba(32,178,170,.18), rgba(32,178,170,.08))',
        color: (t) => tealText(t.palette.mode),
        flexShrink: 0,
        border: '1px solid rgba(32,178,170,.15)',
      }}
    >
      {icon}
    </Box>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontWeight: 700, fontSize: 14.5, color: 'text.primary' }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12.5 }} noWrap>{desc}</Typography>
    </Box>
    <ChevronRightIcon sx={{ color: 'text.disabled', fontSize: 20 }} />
  </Stack>
);

export const ProfilePage = () => {
  useReuiThemeSync();
  const translate = useTranslate();
  const theme = useTheme();
  const [pid] = useSelectedPatient();
  const notify = useNotify();
  const refresh = useRefresh();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<'dados' | 'preferencias' | 'esportes' | 'conta'>(() => {
    if (searchParams.get('sports') === '1') return 'esportes';
    const t = searchParams.get('tab');
    if (t === 'preferencias' || t === 'esportes' || t === 'conta') return t;
    return 'dados';
  });

  const [user, setUser] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [clinical, setClinical] = useState('');
  const [allergies, setAllergies] = useState('');
  const [gender, setGender] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [ethnicity, setEthnicity] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [saving, setSaving] = useState(false);
  // O que veio do servidor: null = ainda carregando → "Salvar" bloqueado (ver utils/profilePatch).
  const [baseline, setBaseline] = useState<ProfileFormValues | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const pidRef = useRef(pid);
  pidRef.current = pid;
  const [photoVer, setPhotoVer] = useState(0);
  const [achAlerts, setAchAlerts] = useState(true);

  const [librasOn, setLibrasOn] = useState(() => {
    try { return localStorage.getItem('meus_exames_libras') === '1'; } catch { return false; }
  });
  const [activityOn, setActivityOn] = useState(() => {
    try { return localStorage.getItem('dx_activity_hidden') !== '1'; } catch { return true; }
  });
  const [textLarge, setTextLarge] = useState(() => {
    try { return localStorage.getItem('dx_text_large') === '1'; } catch { return false; }
  });

  const load = async () => {
    const reqPid = pid;
    setLoadFailed(false);
    try {
      const h = { Authorization: `Bearer ${token()}` };
      const me = await fetch(`${API_URL}/auth/me`, { headers: h });
      if (me.ok) {
        const mu = (await me.json())?.user;
        setUser(mu);
        setAchAlerts(mu?.achievementAlerts ?? true);
        if (typeof mu?.librasEnabled === 'boolean') setLibrasOn(mu.librasEnabled);
      }
      if (reqPid) {
        const pr = await fetch(`${API_URL}/patients/${reqPid}`, { headers: h });
        if (pidRef.current !== reqPid) return; // trocou de perfil no meio: o load novo assume
        if (!pr.ok) { setLoadFailed(true); return; }
        const p = await pr.json();
        const f = profileFormFromPatient(p);
        setPatient(p);
        setFullName(f.fullName);
        setCpf(p.cpfMasked ?? '');
        setPhone(f.phone);
        setClinical(f.clinicalProfile);
        setAllergies(f.allergies);
        setGender(f.gender);
        setHeightCm(f.heightCm);
        setEthnicity(f.ethnicity);
        setBirthDate(f.dateOfBirth);
        setBaseline(f);
      }
    } catch {
      if (pidRef.current === reqPid) setLoadFailed(true);
    }
  };

  useEffect(() => {
    setBaseline(null); // perfil novo: nada salvável até ele carregar
    load();
    /* eslint-disable-next-line */
  }, [pid]);

  const saveProfile = async () => {
    if (!pid || !baseline) return;
    if (!patient?.hasCpf && cpf && !isValidCpf(cpf)) {
      notify('Informe um CPF válido.', { type: 'error' });
      return;
    }
    // Só o que MUDOU desde o load — o PUT grava vazio como null (bug 27/10: apagava alergias).
    const body: Record<string, unknown> = buildProfilePatch(baseline, {
      fullName, phone, clinicalProfile: clinical, allergies, gender, heightCm, ethnicity, dateOfBirth: birthDate,
    });
    if (body.fullName === '') {
      notify('Informe o nome completo.', { type: 'error' });
      return;
    }
    if (!patient?.hasCpf && cpf) body.cpf = cpf;
    if (Object.keys(body).length === 0) {
      notify('Nada mudou desde o último salvamento.', { type: 'info' });
      return;
    }
    setSaving(true);
    const r = await fetch(`${API_URL}/patients/${pid}`, {
      method: 'PUT',
      headers: apiHeaders(true),
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (r.ok) {
      notify('Perfil atualizado com sucesso!', { type: 'success' });
      await load();
      refresh();
    } else {
      notify('Erro ao salvar perfil.', { type: 'error' });
    }
  };

  const toggleAchAlerts = async (on: boolean) => {
    setAchAlerts(on);
    const r = await fetch(`${API_URL}/auth/me`, {
      method: 'PATCH',
      headers: apiHeaders(true),
      body: JSON.stringify({ achievementAlerts: on }),
    });
    if (!r.ok) {
      setAchAlerts(!on);
      notify('Erro ao salvar preferência.', { type: 'error' });
    }
  };

  const toggleLibras = (on: boolean) => {
    setLibrasOn(on);
    try { localStorage.setItem('meus_exames_libras', on ? '1' : '0'); } catch {}
    document.body.classList.toggle('libras-off', !on);
    fetch(`${API_URL}/auth/me`, {
      method: 'PATCH',
      headers: apiHeaders(true),
      body: JSON.stringify({ librasEnabled: on }),
    }).catch(() => {});
    if (on) {
      (window as any).__loadVLibras?.();
    } else {
      (window as any).__unloadVLibras?.();
    }
  };

  const { privacyOn, setPrivacyOn } = usePrivacyMode();

  const toggleActivity = (on: boolean) => {
    setActivityOn(on);
    try { localStorage.setItem('dx_activity_hidden', on ? '0' : '1'); } catch {}
    if (on) notify('Card de atividade voltou ao início ✨', { type: 'success' });
  };

  const toggleTextLarge = (on: boolean) => {
    setTextLarge(on);
    try { localStorage.setItem('dx_text_large', on ? '1' : '0'); } catch {}
    try { window.dispatchEvent(new Event('dx-text-large')); } catch {}
  };

  // Cálculo de IMC integrado
  const bmiInfo = useMemo(() => {
    const h = parseHeightCm(heightCm);
    const w = patient?.weightKg;
    if (!h || !w || h < 60 || w < 20) return null;
    const imc = w / Math.pow(h / 100, 2);
    let status = 'Eutrófico (Normal)';
    let color = '#059669';
    let bg = 'rgba(16,185,129,0.12)';
    if (imc < 18.5) { status = 'Abaixo do peso'; color = '#0284c7'; bg = 'rgba(2,132,199,0.12)'; }
    else if (imc >= 25 && imc < 30) { status = 'Sobrepeso'; color = '#d97706'; bg = 'rgba(217,119,6,0.12)'; }
    else if (imc >= 30) { status = 'Obesidade'; color = '#dc2626'; bg = 'rgba(220,38,38,0.12)'; }
    return { val: imc.toFixed(1), status, color, bg };
  }, [heightCm, patient?.weightKg]);

  if (!pid) return <PageSkeleton cards={4} />;

  const planActive = user?.planExpiresAt && new Date(user.planExpiresAt) > new Date();
  const profilePct: number | null = patient?.profileCompleteness?.pct ?? null;

  return (
    <PageContainer width={780}>
      <PageHeader
        icon={<AccountCircleIcon />}
        title={translate('page.profile')}
        subtitle="Gerencie seus dados clínicos, biometria e preferências"
      />

      {/* Cartão de Apresentação do Perfil (Header de Alto Padrão) */}
      <Card
        sx={{
          mb: 2.5,
          borderRadius: '20px',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #0c4a46 0%, #137a72 50%, #20b2aa 100%)',
          boxShadow: '0 12px 32px rgba(15,95,90,0.20)',
          color: '#fff',
          position: 'relative',
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 85% 15%, rgba(255,255,255,0.18), transparent 55%)',
            pointerEvents: 'none',
          },
        }}
      >
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap', py: 2.75, position: 'relative', zIndex: 1 }}>
          <PhotoUpload
            patientId={pid}
            photoUrl={patient?.photoUrl}
            size={74}
            hideLabel
            version={photoVer}
            fallback={(fullName || user?.name || '').trim().charAt(0).toUpperCase()}
            onUploaded={() => { setPhotoVer((v) => v + 1); void load(); }}
          />
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {fullName || 'Meu Perfil'}
            </Typography>
            <Typography sx={{ opacity: 0.9, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
              <MailOutlineIcon sx={{ fontSize: 16 }} />
              {user?.email ?? '—'}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1.25 }} useFlexGap flexWrap="wrap">
              {patient?.relationship && (
                <Chip
                  size="small"
                  label={patient.relationship}
                  sx={{ bgcolor: 'rgba(255,255,255,.18)', color: '#fff', fontWeight: 700, height: 24, fontSize: 11.5 }}
                />
              )}
              {planActive ? (
                <Chip
                  size="small"
                  icon={<BadgeIcon sx={{ color: '#fff !important', fontSize: 14 }} />}
                  label="Premium ativo"
                  onClick={() => navigate('/planos')}
                  sx={{
                    bgcolor: 'rgba(255,255,255,.22)',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                    height: 24,
                    fontSize: 11.5,
                    '&:hover': { bgcolor: 'rgba(255,255,255,.32)' },
                  }}
                />
              ) : (
                <Chip
                  size="small"
                  label="Plano Grátis · Ver planos"
                  onClick={() => navigate('/planos')}
                  sx={{
                    bgcolor: 'rgba(255,255,255,.14)',
                    color: '#fff',
                    cursor: 'pointer',
                    height: 24,
                    fontSize: 11.5,
                    fontWeight: 600,
                    '&:hover': { bgcolor: 'rgba(255,255,255,.24)' },
                  }}
                />
              )}
              {profilePct != null && profilePct < 100 && (
                <Chip
                  size="small"
                  label={`Perfil ${profilePct}%`}
                  sx={{ bgcolor: 'rgba(255,255,255,.22)', color: '#fff', fontWeight: 700, height: 24, fontSize: 11.5 }}
                />
              )}
            </Stack>
          </Box>
        </CardContent>
      </Card>

      {/* Navegação por Abas em Estilo Pill (Zero Rolagem Infinita) */}
      <Box
        sx={{
          mb: 2.5,
          p: 0.6,
          bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
          borderRadius: '16px',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, v) => {
            setActiveTab(v);
            setSearchParams({ tab: v }, { replace: true });
          }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 40,
            '& .MuiTabs-indicator': { display: 'none' },
            '& .MuiTabs-flexContainer': { gap: 0.75 },
          }}
        >
          <Tab
            value="dados"
            label="Dados & Saúde"
            icon={<PersonOutlineIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            sx={{
              minHeight: 38,
              py: 0.75,
              px: 1.75,
              borderRadius: '12px',
              textTransform: 'none',
              fontWeight: activeTab === 'dados' ? 800 : 600,
              fontSize: 13,
              color: 'text.secondary',
              bgcolor: activeTab === 'dados' ? 'background.paper' : 'transparent',
              boxShadow: activeTab === 'dados' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              '&.Mui-selected': { color: (t) => tealText(t.palette.mode) },
            }}
          />
          <Tab
            value="preferencias"
            label="Preferências"
            icon={<TuneIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            sx={{
              minHeight: 38,
              py: 0.75,
              px: 1.75,
              borderRadius: '12px',
              textTransform: 'none',
              fontWeight: activeTab === 'preferencias' ? 800 : 600,
              fontSize: 13,
              color: 'text.secondary',
              bgcolor: activeTab === 'preferencias' ? 'background.paper' : 'transparent',
              boxShadow: activeTab === 'preferencias' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              '&.Mui-selected': { color: (t) => tealText(t.palette.mode) },
            }}
          />
          <Tab
            value="esportes"
            label="Saúde Esportiva"
            icon={<FitnessCenterIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            sx={{
              minHeight: 38,
              py: 0.75,
              px: 1.75,
              borderRadius: '12px',
              textTransform: 'none',
              fontWeight: activeTab === 'esportes' ? 800 : 600,
              fontSize: 13,
              color: 'text.secondary',
              bgcolor: activeTab === 'esportes' ? 'background.paper' : 'transparent',
              boxShadow: activeTab === 'esportes' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              '&.Mui-selected': { color: (t) => tealText(t.palette.mode) },
            }}
          />
          <Tab
            value="conta"
            label="Conta & Acessos"
            icon={<ShieldOutlinedIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            sx={{
              minHeight: 38,
              py: 0.75,
              px: 1.75,
              borderRadius: '12px',
              textTransform: 'none',
              fontWeight: activeTab === 'conta' ? 800 : 600,
              fontSize: 13,
              color: 'text.secondary',
              bgcolor: activeTab === 'conta' ? 'background.paper' : 'transparent',
              boxShadow: activeTab === 'conta' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              '&.Mui-selected': { color: (t) => tealText(t.palette.mode) },
            }}
          />
        </Tabs>
      </Box>

      {/* ─────────────────────────────────────────────────────────────
          ABA 1: DADOS PESSOAIS & PARÂMETROS CLÍNICOS (ReUI profile-3)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === 'dados' && (
        <div className="flex flex-col gap-5">
          {/* Identificação Segura */}
          <Frame>
            <FrameHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PersonOutlineIcon sx={{ color: '#0d9488', fontSize: 20 }} />
                  <FrameTitle>Identificação do Paciente</FrameTitle>
                </div>
                {patient?.identityLocked && (
                  <Badge variant="success-light" size="sm">
                    Identidade Verificada
                  </Badge>
                )}
              </div>
              <FrameDescription>
                Dados cadastrais sincronizados com seus laudos laboratoriais e teleconsultas
              </FrameDescription>
            </FrameHeader>
            <FramePanel>
              <Grid container spacing={2.25}>
                {/* Nome Completo */}
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FieldLabelWithHint
                    label="Nome Completo"
                    hint="Vinculado aos laudos laboratoriais para evitar mistura de exames de terceiros."
                    addon={
                      patient?.identityLocked ? (
                        <Badge variant="success-light" size="xs">
                          Verificado no Laudo
                        </Badge>
                      ) : undefined
                    }
                  />
                  {patient?.identityLocked ? (
                    <Box sx={{ p: 1.35, borderRadius: '12px', bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography sx={{ fontWeight: 800, fontSize: 14 }} noWrap>{fullName || '—'}</Typography>
                        <CheckCircleOutlineIcon sx={{ fontSize: 16, color: 'success.main' }} />
                      </Stack>
                    </Box>
                  ) : (
                    <TextField
                      placeholder="Seu nome completo"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      fullWidth
                      size="small"
                    />
                  )}
                </Grid>

                {/* CPF */}
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FieldLabelWithHint
                    label="CPF"
                    hint="Usado exclusivamente para validação de identidade médica e emissão de receitas digitais."
                    addon={
                      patient?.hasCpf ? (
                        <Badge variant="info-light" size="xs">
                          Auditado
                        </Badge>
                      ) : undefined
                    }
                  />
                  {patient?.hasCpf ? (
                    <Box sx={{ p: 1.35, borderRadius: '12px', bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography sx={{ fontWeight: 800, fontSize: 14, fontFamily: 'monospace' }}>{cpf || '—'}</Typography>
                        <LockOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                      </Stack>
                    </Box>
                  ) : (
                    <TextField
                      value={cpf}
                      onChange={(e) => setCpf(formatCpf(e.target.value))}
                      fullWidth
                      size="small"
                      inputProps={{ inputMode: 'numeric' }}
                      error={!!cpf && cpf.length === 14 && !isValidCpf(cpf)}
                      placeholder="000.000.000-00"
                    />
                  )}
                </Grid>

                {/* Telefone */}
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FieldLabelWithHint
                    label="Telefone / WhatsApp"
                    hint="Usado para avisos de teleconsulta e lembretes importantes de saúde."
                  />
                  <TextField
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    fullWidth
                    size="small"
                    placeholder="(00) 00000-0000"
                  />
                </Grid>

                {/* Data de Nascimento */}
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FieldLabelWithHint
                    label="Data de Nascimento"
                    hint="Essencial para calcular faixas de referência por idade e idade biológica (KDM)."
                  />
                  <DateFieldBR
                    label=""
                    value={birthDate}
                    onChange={setBirthDate}
                    fullWidth
                    size="small"
                  />
                </Grid>
              </Grid>
            </FramePanel>
          </Frame>

          {/* Biometria & Parâmetros Corporais */}
          <Frame>
            <FrameHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MonitorHeartOutlinedIcon sx={{ color: '#0d9488', fontSize: 20 }} />
                  <FrameTitle>Biometria & Dados Corporais</FrameTitle>
                </div>
                {bmiInfo && (
                  <Badge variant="primary-light" size="sm">
                    IMC {bmiInfo.val} · {bmiInfo.status}
                  </Badge>
                )}
              </div>
              <FrameDescription>
                Calibra índices renais (TFG), risco cardiometabólico e faixas laboratoriais por sexo biológico
              </FrameDescription>
            </FrameHeader>
            <FramePanel>
              <Grid container spacing={2.25}>
                {/* Altura */}
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FieldLabelWithHint
                    label="Altura"
                    hint="Combinada ao peso atual para cálculo automático do IMC e superfície corporal."
                  />
                  <TextField
                    value={heightCm}
                    onChange={(e) => setHeightCm(maskHeightInput(e.target.value))}
                    fullWidth
                    size="small"
                    placeholder="Ex: 1,75 m"
                    inputProps={{ inputMode: 'decimal' }}
                  />
                </Grid>

                {/* Peso Atual integrado */}
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FieldLabelWithHint
                    label="Peso Atual"
                    hint="Sincronizado com o histórico de Sinais Vitais & Medições."
                    addon={
                      <Badge variant="outline" size="xs">
                        Sinais Vitais
                      </Badge>
                    }
                  />
                  <Box
                    sx={{
                      p: 1.25,
                      px: 1.75,
                      borderRadius: '10px',
                      bgcolor: 'action.hover',
                      border: '1px solid',
                      borderColor: 'divider',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      height: 40,
                    }}
                  >
                    <Typography sx={{ fontWeight: 800, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                      {patient?.weightKg != null ? `${String(patient.weightKg).replace('.', ',')} kg` : 'Não registrado'}
                    </Typography>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => navigate('/medicoes')}
                      sx={{ textTransform: 'none', fontWeight: 800, fontSize: 11.5, p: 0.5, color: '#0d9488' }}
                    >
                      {patient?.weightKg != null ? 'Atualizar →' : '+ Registrar'}
                    </Button>
                  </Box>
                </Grid>

                {/* Banner de IMC Integrado quando há dados */}
                {bmiInfo && (
                  <Grid size={{ xs: 12 }}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: '12px',
                        bgcolor: bmiInfo.bg,
                        border: '1px solid',
                        borderColor: `${bmiInfo.color}33`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <ScaleIcon sx={{ color: bmiInfo.color, fontSize: 20 }} />
                        <Box>
                          <Typography sx={{ fontWeight: 800, fontSize: 13, color: bmiInfo.color }}>
                            IMC Calculado: {bmiInfo.val} kg/m²
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11 }}>
                            Classificação clínica: <strong>{bmiInfo.status}</strong>
                          </Typography>
                        </Box>
                      </Stack>
                      <Chip
                        size="small"
                        label={bmiInfo.status}
                        sx={{ bgcolor: bmiInfo.color, color: '#fff', fontWeight: 800, fontSize: 10.5, height: 20 }}
                      />
                    </Box>
                  </Grid>
                )}

                {/* Sexo */}
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FieldLabelWithHint
                    label="Sexo Biológico"
                    hint="Determina os valores de referência laboratoriais (ex.: hemoglobina, ferritina, creatinina, hormônios)."
                  />
                  <TextField
                    select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    fullWidth
                    size="small"
                  >
                    <MenuItem value="female">Feminino</MenuItem>
                    <MenuItem value="male">Masculino</MenuItem>
                    <MenuItem value="">Prefiro não informar</MenuItem>
                  </TextField>
                </Grid>

                {/* Etnia */}
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FieldLabelWithHint
                    label="Etnia (opcional)"
                    hint="Auxilia na contextualização clínica de marcadores específicos."
                  />
                  <TextField
                    select
                    value={ethnicity}
                    onChange={(e) => setEthnicity(e.target.value)}
                    fullWidth
                    size="small"
                  >
                    <MenuItem value="">Prefiro não informar</MenuItem>
                    <MenuItem value="branca">Branca</MenuItem>
                    <MenuItem value="preta">Preta</MenuItem>
                    <MenuItem value="parda">Parda</MenuItem>
                    <MenuItem value="amarela">Amarela</MenuItem>
                    <MenuItem value="indigena">Indígena</MenuItem>
                  </TextField>
                </Grid>
              </Grid>
            </FramePanel>
          </Frame>

          {/* Histórico Clínico & Alergias + Footer de Salvamento (ReUI profile-3) */}
          <Frame>
            <FrameHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FrameTitle>🩺 Histórico Clínico & Alergias</FrameTitle>
                <Badge variant="primary-light" size="xs">
                  Contexto IA & Telemedicina
                </Badge>
              </div>
              <FrameDescription>
                Usado pelo Dr. Exame para calibrar interpretações e compartilhado com segurança nas suas teleconsultas.
              </FrameDescription>
            </FrameHeader>
            <FramePanel>
              <Stack spacing={2.25}>
                <div>
                  <FieldLabelWithHint
                    label="Condições clínicas e medicações contínuas"
                    hint="Informe diagnósticos prévios, cirurgias e medicamentos de uso diário para evitar falsos alarmes nos exames."
                  />
                  <TextField
                    value={clinical}
                    onChange={(e) => setClinical(e.target.value)}
                    multiline
                    minRows={3}
                    fullWidth
                    placeholder="Ex: Hipotireoidismo (usa levotiroxina), hipertensão controlada, cirurgia bariátrica em 2022..."
                  />
                </div>

                <div>
                  <FieldLabelWithHint
                    label="Alergias conhecidas (medicamentos, alimentos, contraste)"
                    hint="Exibido em destaque para médicos durante teleconsultas e na ficha de emergência."
                    addon={
                      allergies.trim() ? (
                        <Badge variant="warning-light" size="xs">
                          Alerta Ativo
                        </Badge>
                      ) : undefined
                    }
                  />
                  <TextField
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    multiline
                    minRows={2}
                    fullWidth
                    placeholder="Ex: Penicilina, frutos do mar, dipirona, contraste iodado..."
                  />
                </div>
              </Stack>
            </FramePanel>
            <FrameFooter className="sm:flex-row sm:items-center sm:justify-between">
              <span className="text-muted-foreground text-xs">
                Salve para atualizar suas referências clínicas em todo o aplicativo.
              </span>
              <Button
                variant="contained"
                size="large"
                startIcon={<SaveIcon />}
                onClick={loadFailed ? () => { void load(); } : saveProfile}
                disabled={saving || (!baseline && !loadFailed)}
                sx={{
                  borderRadius: '12px',
                  py: 1.15,
                  px: 3,
                  width: { xs: '100%', sm: 'auto' },
                  textTransform: 'none',
                  fontWeight: 800,
                  fontSize: 14.5,
                  background: 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)',
                  boxShadow: '0 6px 18px rgba(32,178,170,.35)',
                  '&:hover': { background: 'linear-gradient(135deg, #178f89 0%, #0d9488 100%)' },
                  '&.Mui-disabled': { background: 'none', bgcolor: 'action.disabledBackground', color: 'text.secondary', boxShadow: 'none' },
                }}
              >
                {saving
                  ? 'Salvando alterações…'
                  : loadFailed
                    ? 'Não carregou — tentar de novo'
                    : !baseline
                      ? 'Carregando seus dados…'
                      : 'Salvar dados do perfil'}
              </Button>
            </FrameFooter>
          </Frame>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ABA 2: PREFERÊNCIAS & ACESSIBILIDADE (ReUI settings-2)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === 'preferencias' && (
        <div className="flex flex-col gap-5">
          <Frame>
            <FrameHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FrameTitle>Experiência & Acessibilidade</FrameTitle>
                <Badge variant="primary-light" size="xs">
                  Salvo neste dispositivo
                </Badge>
              </div>
              <FrameDescription>
                Personalize o conforto de leitura, privacidade visual e recursos de acessibilidade do aplicativo.
              </FrameDescription>
            </FrameHeader>

            <FramePanel className="p-0">
              <SettingRow
                icon={<TextFieldsIcon sx={{ fontSize: 20 }} />}
                iconVariant="soft"
                iconClassName="text-primary"
                title="Texto Grande (Conforto Visual)"
                badge="Acessibilidade"
                badgeVariant="primary-light"
                description="Amplia a escala tipográfica de laudos, tabelas e menus para leitura sem esforço."
                action={
                  <Switch
                    checked={textLarge}
                    onChange={(e) => toggleTextLarge(e.target.checked)}
                    inputProps={{ 'aria-label': 'Texto Grande' }}
                  />
                }
              />

              <SettingRow
                icon={<SignLanguageIcon sx={{ fontSize: 20 }} />}
                iconVariant="elevated"
                title="Assistente de Libras (VLibras)"
                badge="Inclusão"
                badgeVariant="info-light"
                description="Exibe o tradutor interativo da Língua Brasileira de Sinais nas páginas do aplicativo."
                action={
                  <Switch
                    checked={librasOn}
                    onChange={(e) => toggleLibras(e.target.checked)}
                    inputProps={{ 'aria-label': 'Assistente de Libras' }}
                  />
                }
              />

              <SettingRow
                icon={<DirectionsRunIcon sx={{ fontSize: 20 }} />}
                iconVariant="elevated"
                title="Card de Atividade Física na Home"
                badge="Smartwatch"
                badgeVariant="success-light"
                description="Exibe passos, calorias e metas sincronizados do Health Connect / relógio na tela inicial."
                action={
                  <Switch
                    checked={activityOn}
                    onChange={(e) => toggleActivity(e.target.checked)}
                    inputProps={{ 'aria-label': 'Card de Atividade Física' }}
                  />
                }
              />

              <SettingRow
                icon={<VisibilityOffOutlinedIcon sx={{ fontSize: 20 }} />}
                iconVariant="elevated"
                title="Modo Privacidade em Público"
                badge="Sigilo"
                badgeVariant="warning-light"
                description="Borra automaticamente nomes de exames sensíveis até que você toque neles."
                action={
                  <Switch
                    checked={privacyOn}
                    onChange={(e) => setPrivacyOn(e.target.checked)}
                    inputProps={{ 'aria-label': 'Modo Privacidade' }}
                  />
                }
              />

              <SettingRow
                icon={<EmojiEventsOutlinedIcon sx={{ fontSize: 20 }} />}
                iconVariant="elevated"
                title="Notificações de Conquistas"
                description="Avisa no sino quando novos marcos de saúde e consistência forem atingidos."
                action={
                  <Switch
                    checked={achAlerts}
                    onChange={(e) => toggleAchAlerts(e.target.checked)}
                    inputProps={{ 'aria-label': 'Notificações de Conquistas' }}
                  />
                }
              />
            </FramePanel>
          </Frame>

          {/* Suporte & Avaliação em padrão ReUI settings-2 */}
          <Frame>
            <FrameHeader>
              <FrameTitle>Ajuda, Diagnóstico & Avaliação</FrameTitle>
              <FrameDescription>
                Ferramentas técnicas de suporte e avaliação oficial na loja de aplicativos
              </FrameDescription>
            </FrameHeader>
            <FramePanel className="p-0">
              <SettingRow
                icon={<BugReportIcon sx={{ fontSize: 20 }} />}
                iconVariant="elevated"
                title="Enviar Diagnóstico Técnico"
                badge="Suporte"
                badgeVariant="info-light"
                description="Gera um resumo técnico seguro para ajudar nossa equipe a resolver eventuais falhas."
                stackOnMobile
                action={
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      diagShare().catch(() => {});
                    }}
                    startIcon={<BugReportIcon />}
                    sx={{
                      borderRadius: '10px',
                      textTransform: 'none',
                      fontWeight: 700,
                      minHeight: 36,
                      width: { xs: '100%', sm: 'auto' },
                    }}
                  >
                    Enviar diagnóstico
                  </Button>
                }
              />

              <SettingRow
                icon={<StarIcon sx={{ fontSize: 20, color: '#f59e0b' }} />}
                iconVariant="soft"
                iconClassName="text-amber-500"
                title="Avaliar o Dr. Exame na Google Play"
                badge="Comunidade"
                badgeVariant="warning-light"
                description="Sua avaliação ajuda mais pacientes a conhecerem o Consultório de Vidro."
                stackOnMobile
                action={
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={async () => {
                      try {
                        const { Browser } = await import('@capacitor/browser');
                        await Browser.open({ url: PLAY_URL });
                      } catch {
                        window.open(PLAY_URL, '_blank');
                      }
                    }}
                    startIcon={<StarIcon sx={{ color: '#f59e0b' }} />}
                    sx={{
                      borderRadius: '10px',
                      textTransform: 'none',
                      fontWeight: 700,
                      minHeight: 36,
                      width: { xs: '100%', sm: 'auto' },
                    }}
                  >
                    Avaliar na Play Store
                  </Button>
                }
              />
            </FramePanel>
          </Frame>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ABA 3: SAÚDE ESPORTIVA DEDICADA
         ───────────────────────────────────────────────────────────── */}
      {activeTab === 'esportes' && (
        <Stack spacing={2}>
          <SportsModeCard pid={pid} />
        </Stack>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ABA 4: CONTA, SEGURANÇA & ACESSOS (ReUI Frame + SettingRow)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === 'conta' && (
        <Frame>
          <FrameHeader>
            <FrameTitle>Central de Conta, Segurança & Privacidade</FrameTitle>
            <FrameDescription>
              Gerencie dependentes, autenticação em duas etapas, LGPD e integrações
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="p-0">
            <SettingRow
              icon={<Diversity3OutlinedIcon sx={{ fontSize: 20 }} />}
              iconVariant="soft"
              iconClassName="text-primary"
              title="Família e Dependentes"
              badge="Multi-perfil"
              badgeVariant="primary-light"
              description="Gerencie perfis separados para filhos, cônjuge e pais idosos na mesma conta."
              onClick={() => navigate('/familia')}
              className="cursor-pointer"
              action={<ChevronRightIcon sx={{ color: 'text.disabled', fontSize: 20 }} />}
            />
            <SettingRow
              icon={<LockResetIcon sx={{ fontSize: 20 }} />}
              iconVariant="elevated"
              title="Segurança, Senha & 2FA"
              badge="Protegido"
              badgeVariant="success-light"
              description="Altere sua senha, configure autenticação em duas etapas (TOTP) e biometria."
              onClick={() => navigate('/seguranca')}
              className="cursor-pointer"
              action={<ChevronRightIcon sx={{ color: 'text.disabled', fontSize: 20 }} />}
            />
            <SettingRow
              icon={<ShieldIcon sx={{ fontSize: 20 }} />}
              iconVariant="elevated"
              title="Privacidade & Dados (LGPD)"
              badge="Art. 18"
              badgeVariant="info-light"
              description="Exporte o pacote completo (.zip), consulte termos de uso ou exclua sua conta."
              onClick={() => navigate('/privacidade')}
              className="cursor-pointer"
              action={<ChevronRightIcon sx={{ color: 'text.disabled', fontSize: 20 }} />}
            />
            <SettingRow
              icon={<ApiIcon sx={{ fontSize: 20 }} />}
              iconVariant="elevated"
              title="API para Desenvolvedores"
              badge="REST / JSON"
              badgeVariant="outline"
              description="Integre o motor clínico e a extração estruturada de laudos no seu sistema."
              onClick={() => navigate('/api')}
              className="cursor-pointer"
              action={<ChevronRightIcon sx={{ color: 'text.disabled', fontSize: 20 }} />}
            />
          </FramePanel>
        </Frame>
      )}
    </PageContainer>
  );
};
