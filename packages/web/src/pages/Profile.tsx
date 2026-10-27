import { useEffect, useState, useMemo } from 'react';
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
import { DateFieldBR } from '../components/DateFieldBR';
import { SportsModeCard } from '../components/SportsModeCard';
import { tealText } from '../theme';

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
    const h = { Authorization: `Bearer ${token()}` };
    const me = await fetch(`${API_URL}/auth/me`, { headers: h });
    if (me.ok) {
      const mu = (await me.json())?.user;
      setUser(mu);
      setAchAlerts(mu?.achievementAlerts ?? true);
      if (typeof mu?.librasEnabled === 'boolean') setLibrasOn(mu.librasEnabled);
    }
    if (pid) {
      const pr = await fetch(`${API_URL}/patients/${pid}`, { headers: h });
      if (pr.ok) {
        const p = await pr.json();
        setPatient(p);
        setFullName(p.fullName ?? '');
        setCpf(p.cpfMasked ?? '');
        setPhone(p.phone ?? '');
        setClinical(p.clinicalProfile ?? '');
        setAllergies(p.allergies ?? '');
        setGender(p.gender ?? '');
        setHeightCm(p.heightCm != null ? String(p.heightCm) : '');
        setEthnicity(p.ethnicity ?? '');
        setBirthDate(p.dateOfBirth ? p.dateOfBirth.split('T')[0] : '');
      }
    }
  };

  useEffect(() => {
    load();
    /* eslint-disable-next-line */
  }, [pid]);

  const saveProfile = async () => {
    if (!pid) return;
    if (!patient?.hasCpf && cpf && !isValidCpf(cpf)) {
      notify('Informe um CPF válido.', { type: 'error' });
      return;
    }
    setSaving(true);
    const body: any = {
      fullName,
      phone,
      clinicalProfile: clinical,
      allergies: allergies || null,
      gender,
      heightCm: parseHeightCm(heightCm),
      ethnicity,
      dateOfBirth: birthDate || null,
    };
    if (!patient?.hasCpf && cpf) body.cpf = cpf;
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
          ABA 1: DADOS PESSOAIS & PARÂMETROS CLÍNICOS
         ───────────────────────────────────────────────────────────── */}
      {activeTab === 'dados' && (
        <Stack spacing={2.5}>
          {/* Identificação Segura */}
          <Card sx={{ borderRadius: '20px', border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
              <Typography sx={{ fontWeight: 800, fontSize: 15, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <PersonOutlineIcon sx={{ color: '#0d9488', fontSize: 20 }} />
                Identificação do Paciente
              </Typography>

              <Grid container spacing={2}>
                {/* Nome Completo */}
                <Grid item xs={12} sm={6}>
                  {patient?.identityLocked ? (
                    <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block' }}>
                            Nome Completo
                          </Typography>
                          <Typography sx={{ fontWeight: 800, fontSize: 14 }} noWrap>{fullName || '—'}</Typography>
                        </Box>
                        <Chip size="small" icon={<CheckCircleOutlineIcon sx={{ fontSize: '13px !important' }} />} label="Verificado" color="success" sx={{ height: 22, fontSize: 10.5, fontWeight: 700 }} />
                      </Stack>
                    </Box>
                  ) : (
                    <TextField
                      label="Nome completo"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      fullWidth
                      size="small"
                    />
                  )}
                </Grid>

                {/* CPF */}
                <Grid item xs={12} sm={6}>
                  {patient?.hasCpf ? (
                    <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block' }}>
                            CPF (Auditado)
                          </Typography>
                          <Typography sx={{ fontWeight: 800, fontSize: 14, fontFamily: 'monospace' }}>{cpf || '—'}</Typography>
                        </Box>
                        <Chip size="small" icon={<LockOutlinedIcon sx={{ fontSize: '13px !important' }} />} label="Auditado" sx={{ height: 22, fontSize: 10.5, fontWeight: 700 }} />
                      </Stack>
                    </Box>
                  ) : (
                    <TextField
                      label="CPF"
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
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Telefone / WhatsApp"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    fullWidth
                    size="small"
                    placeholder="(00) 00000-0000"
                  />
                </Grid>

                {/* Data de Nascimento */}
                <Grid item xs={12} sm={6}>
                  <DateFieldBR
                    label="Data de nascimento"
                    value={birthDate}
                    onChange={setBirthDate}
                    fullWidth
                    size="small"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Biometria & Parâmetros Corporais */}
          <Card sx={{ borderRadius: '20px', border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
              <Typography sx={{ fontWeight: 800, fontSize: 15, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <MonitorHeartOutlinedIcon sx={{ color: '#0d9488', fontSize: 20 }} />
                Biometria & Dados Corporais
              </Typography>

              <Grid container spacing={2}>
                {/* Altura */}
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Altura"
                    value={heightCm}
                    onChange={(e) => setHeightCm(maskHeightInput(e.target.value))}
                    fullWidth
                    size="small"
                    placeholder="Ex: 1,75 m"
                    inputProps={{ inputMode: 'decimal' }}
                  />
                </Grid>

                {/* Peso Atual integrado */}
                <Grid item xs={12} sm={6}>
                  <Box
                    sx={{
                      p: 1.25,
                      px: 1.75,
                      borderRadius: '12px',
                      bgcolor: 'action.hover',
                      border: '1px solid',
                      borderColor: 'divider',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      height: 40,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', lineHeight: 1 }}>
                        Peso Atual
                      </Typography>
                      <Typography sx={{ fontWeight: 800, fontSize: 14 }}>
                        {patient?.weightKg != null ? `${String(patient.weightKg).replace('.', ',')} kg` : 'Não registrado'}
                      </Typography>
                    </Box>
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
                  <Grid item xs={12}>
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
                <Grid item xs={12} sm={6}>
                  <TextField
                    select
                    label="Sexo Biológico"
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
                <Grid item xs={12} sm={6}>
                  <TextField
                    select
                    label="Etnia (opcional)"
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
            </CardContent>
          </Card>

          {/* Histórico Clínico & Alergias */}
          <Card sx={{ borderRadius: '20px', border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
              <Typography sx={{ fontWeight: 800, fontSize: 15, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                🩺 Histórico Clínico & Alergias
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
                Usado pelo Dr. Exame para calibrar interpretações e compartilhado com segurança nas suas teleconsultas.
              </Typography>

              <Stack spacing={2}>
                <TextField
                  label="Condições clínicas e medicações contínuas"
                  value={clinical}
                  onChange={(e) => setClinical(e.target.value)}
                  multiline
                  minRows={3}
                  fullWidth
                  placeholder="Ex: Hipotireoidismo (usa levotiroxina), hipertensão controlada, cirurgia bariátrica em 2022..."
                />

                <TextField
                  label="Alergias conhecidas (medicamentos, alimentos, contraste)"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  multiline
                  minRows={2}
                  fullWidth
                  placeholder="Ex: Penicilina, frutos do mar, dipirona, contraste iodado..."
                />
              </Stack>
            </CardContent>
          </Card>

          {/* Botão de Salvar Perfil */}
          <Box sx={{ pt: 1, pb: 2 }}>
            <Button
              variant="contained"
              fullWidth
              size="large"
              startIcon={<SaveIcon />}
              onClick={saveProfile}
              disabled={saving}
              sx={{
                borderRadius: '14px',
                py: 1.4,
                textTransform: 'none',
                fontWeight: 800,
                fontSize: 15,
                background: 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)',
                boxShadow: '0 6px 18px rgba(32,178,170,.35)',
                '&:hover': { background: 'linear-gradient(135deg, #178f89 0%, #0d9488 100%)' },
              }}
            >
              {saving ? 'Salvando alterações…' : 'Salvar dados do perfil'}
            </Button>
          </Box>
        </Stack>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ABA 2: PREFERÊNCIAS & ACESSIBILIDADE
         ───────────────────────────────────────────────────────────── */}
      {activeTab === 'preferencias' && (
        <Stack spacing={2.5}>
          <Card sx={{ borderRadius: '20px', border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
              <Typography sx={{ fontWeight: 800, fontSize: 15, mb: 1 }}>
                Experiência & Acessibilidade
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
                Personalize o comportamento e a visualização do aplicativo no seu dispositivo.
              </Typography>

              <Stack spacing={1.5}>
                {/* Texto grande */}
                <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'action.hover' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box sx={{ pr: 1 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Aa Texto Grande</Typography>
                      <Typography variant="caption" color="text.secondary">Amplia os textos do aplicativo para maior conforto de leitura.</Typography>
                    </Box>
                    <Switch checked={textLarge} onChange={(e) => toggleTextLarge(e.target.checked)} />
                  </Stack>
                </Box>

                {/* Libras */}
                <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'action.hover' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box sx={{ pr: 1 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>♿ Assistente de Libras</Typography>
                      <Typography variant="caption" color="text.secondary">Exibe o avatar de Língua Brasileira de Sinais na tela.</Typography>
                    </Box>
                    <Switch checked={librasOn} onChange={(e) => toggleLibras(e.target.checked)} />
                  </Stack>
                </Box>

                {/* Atividade física */}
                <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'action.hover' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box sx={{ pr: 1 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>🏃 Card de Atividade Física</Typography>
                      <Typography variant="caption" color="text.secondary">Exibe passos e metas sincronizados do celular na tela inicial.</Typography>
                    </Box>
                    <Switch checked={activityOn} onChange={(e) => toggleActivity(e.target.checked)} />
                  </Stack>
                </Box>

                {/* Modo privacidade */}
                <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'action.hover' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box sx={{ pr: 1 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>🙈 Modo Privacidade</Typography>
                      <Typography variant="caption" color="text.secondary">Borra nomes de exames sensíveis em público até o toque.</Typography>
                    </Box>
                    <Switch checked={privacyOn} onChange={(e) => setPrivacyOn(e.target.checked)} />
                  </Stack>
                </Box>

                {/* Conquistas */}
                <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'action.hover' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box sx={{ pr: 1 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>🔔 Notificações de Conquistas</Typography>
                      <Typography variant="caption" color="text.secondary">Avisar no sino quando novos marcos de saúde forem atingidos.</Typography>
                    </Box>
                    <Switch checked={achAlerts} onChange={(e) => toggleAchAlerts(e.target.checked)} />
                  </Stack>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* Suporte & Avaliação */}
          <Card sx={{ borderRadius: '20px', border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
              <Typography sx={{ fontWeight: 800, fontSize: 15, mb: 1.5 }}>
                Ajuda & Diagnóstico
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button
                  variant="outlined"
                  onClick={() => { diagShare().catch(() => {}); }}
                  startIcon={<BugReportIcon />}
                  sx={{
                    borderRadius: '12px',
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: 13,
                    py: 1,
                    flex: 1,
                  }}
                >
                  Enviar diagnóstico
                </Button>
                <Button
                  variant="outlined"
                  onClick={async () => {
                    try {
                      const { Browser } = await import('@capacitor/browser');
                      await Browser.open({ url: PLAY_URL });
                    } catch { window.open(PLAY_URL, '_blank'); }
                  }}
                  startIcon={<StarIcon sx={{ color: '#f59e0b' }} />}
                  sx={{
                    borderRadius: '12px',
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: 13,
                    py: 1,
                    flex: 1,
                    borderColor: 'divider',
                  }}
                >
                  Avaliar na Play Store
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
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
          ABA 4: CONTA, SEGURANÇA & ACESSOS
         ───────────────────────────────────────────────────────────── */}
      {activeTab === 'conta' && (
        <Card sx={{ borderRadius: '20px', border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ py: 1.5, px: { xs: 1.5, md: 2 } }}>
            <Typography sx={{ fontWeight: 800, fontSize: 15, px: 1, pt: 1, pb: 1.5 }}>
              Central de Conta & Privacidade
            </Typography>
            <AccountLinkRow
              icon={<Diversity3OutlinedIcon />}
              title="Família e dependentes"
              desc="Gerencie perfis de filhos, cônjuge e dependentes"
              onClick={() => navigate('/familia')}
            />
            <Divider sx={{ my: 0.5 }} />
            <AccountLinkRow
              icon={<LockResetIcon />}
              title="Segurança & Senha"
              desc="Alterar senha, 2FA em duas etapas e biometria"
              onClick={() => navigate('/seguranca')}
            />
            <Divider sx={{ my: 0.5 }} />
            <AccountLinkRow
              icon={<ShieldIcon />}
              title="Privacidade & Dados (LGPD)"
              desc="Exportar histórico, termos de uso e exclusão de conta"
              onClick={() => navigate('/privacidade')}
            />
            <Divider sx={{ my: 0.5 }} />
            <AccountLinkRow
              icon={<ApiIcon />}
              title="API para desenvolvedores"
              desc="Integre o motor clínico e extrações no seu produto"
              onClick={() => navigate('/api')}
            />
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
};
