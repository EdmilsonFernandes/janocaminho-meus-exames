import { useEffect, useState, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  Box, Typography, TextField, Button, Stack, MenuItem, Switch, Grid, useTheme, LinearProgress, Slide,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useLogout, useNotify, useRefresh } from 'react-admin';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePrivacyMode } from '../hooks/usePrivacyMode';
import { diagShare } from '../utils/diag';
// Ícones: uma família só (Material "Outlined"), dentro do mesmo quadrado de 36px em todas as linhas.
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import FormatSizeOutlinedIcon from '@mui/icons-material/FormatSizeOutlined';
import SignLanguageOutlinedIcon from '@mui/icons-material/SignLanguageOutlined';
import DirectionsRunOutlinedIcon from '@mui/icons-material/DirectionsRunOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import MonitorWeightOutlinedIcon from '@mui/icons-material/MonitorWeightOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import { PLAY_URL } from '../components/ReviewPrompt';
import { API_URL, token, apiHeaders } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PhotoUpload } from '../components/PhotoUpload';
import { PageContainer } from '../components/layout/PageContainer';
import { PageSkeleton } from '../components/PageSkeleton';
import { formatCpf, isValidCpf } from '../utils/cpf';
import { parseHeightCm, maskHeightInput } from '../utils/height';
import { buildProfilePatch, profileFormFromPatient, type ProfileFormValues } from '../utils/profilePatch';
import { DateFieldBR } from '../components/DateFieldBR';
import { SportsModeCard } from '../components/SportsModeCard';
import { COPPER, SEM, tealText } from '../theme';
import { FieldLabelWithHint } from '@/components/reui/field-label';
import { pendingItems, profileFieldId } from '../utils/profilePending';
import { useFeedback } from '../components/feedback/FeedbackProvider';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';
import { APP_VERSION } from '../utils/version';

/*
 * PERFIL (redesenho 28/11/26, pedido do dono: "confuso, quadro verde feio, nada premium").
 *
 * Referências de mercado: Conta Google, Samsung Health (ficha: idade · altura · peso no topo),
 * Apple Saúde (Ficha Médica) e as Configurações do Android (grupos com título e linhas de 56px).
 *   - Cabeçalho = identidade: foto dentro do ANEL de perfil completo (o mesmo anel do placar do
 *     Início), nome, e-mail, plano. Sem bloco verde: superfície clara e um brilho teal discreto.
 *   - Ficha de saúde logo abaixo: os 4 números que o app usa em tudo (idade, altura, peso, IMC);
 *     o que falta vira "Adicionar" e leva ao campo.
 *   - 3 abas que cabem sempre: Meus dados · Preferências · Conta (antes 4, a última escondida).
 *   - Linhas no padrão das Configurações: ícone no mesmo quadrado, título, uma frase, e à direita
 *     o interruptor ou a seta. Sem os selos decorativos ("Auditado", "Art. 18", "REST / JSON").
 *   - Salvar aparece fixo acima da barra quando há alteração (antes ficava no fim de 3 blocos).
 */
type Tab = 'dados' | 'preferencias' | 'conta';

const ageFrom = (iso: string): number | null => {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
};

/** Grupo das Configurações: título fora do cartão + cartão com linhas separadas por divisória recuada. */
const Group = ({ title, id, children, pad }: { title?: string; id?: string; children: ReactNode; pad?: boolean }) => (
  <Box id={id} component="section" sx={{ mb: 3, scrollMarginTop: 80 }}>
    {title && (
      <Typography component="h2" sx={{ fontSize: 13, fontWeight: 700, color: 'text.secondary', letterSpacing: '.01em', px: 0.5, mb: 1 }}>
        {title}
      </Typography>
    )}
    <Box sx={{
      bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '16px', overflow: 'hidden',
      ...(pad ? { p: { xs: 2, sm: 2.5 } } : {}),
      '& > .pf-row + .pf-row::before': {
        content: '""', position: 'absolute', top: 0, left: 64, right: 0, height: '1px', bgcolor: 'divider',
      },
    }}>
      {children}
    </Box>
  </Box>
);

/** Quadrado do ícone — o mesmo em todas as linhas (cor muda só para "Sair"). */
const IconTile = ({ children, danger }: { children: ReactNode; danger?: boolean }) => (
  <Box aria-hidden sx={(t) => {
    const c = danger ? SEM.bad[t.palette.mode === 'dark' ? 'dark' : 'light'] : tealText(t.palette.mode);
    return {
      width: 36, height: 36, borderRadius: '10px', flexShrink: 0, display: 'grid', placeItems: 'center',
      color: c, bgcolor: alpha(c, t.palette.mode === 'dark' ? 0.16 : 0.09),
      '& svg': { fontSize: 20 },
    };
  }}>
    {children}
  </Box>
);

/**
 * Linha das Configurações. Com `checked` vira um <label> (tocar em qualquer lugar liga/desliga);
 * com `onClick` vira um <button> com seta. 56px de altura mínima — alvo de toque folgado.
 */
const Row = ({ icon, title, desc, onClick, checked, onToggle, value, danger, ariaLabel }: {
  icon: ReactNode; title: string; desc?: string; onClick?: () => void;
  checked?: boolean; onToggle?: (v: boolean) => void; value?: ReactNode; danger?: boolean; ariaLabel?: string;
}) => {
  const isSwitch = onToggle !== undefined;
  return (
    <Box
      className="pf-row"
      component={isSwitch ? 'label' : 'button'}
      {...(isSwitch ? {} : { type: 'button', onClick })}
      sx={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 1.75, width: '100%', minHeight: 64,
        px: 2, py: 1.25, m: 0, border: 0, bgcolor: 'transparent', textAlign: 'left', font: 'inherit', color: 'inherit',
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent', transition: 'background-color .15s ease',
        '@media (hover: hover) and (pointer: fine)': { '&:hover': { bgcolor: 'action.hover' } },
        '&:active': { bgcolor: 'action.selected' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
      }}
    >
      <IconTile danger={danger}>{icon}</IconTile>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={(t) => ({ fontSize: 15, fontWeight: 600, lineHeight: 1.3, color: danger ? SEM.bad[t.palette.mode === 'dark' ? 'dark' : 'light'] : 'text.primary' })}>
          {title}
        </Typography>
        {desc && <Typography sx={{ fontSize: 13, lineHeight: 1.4, color: 'text.secondary', mt: 0.25 }}>{desc}</Typography>}
      </Box>
      {value && <Box sx={{ fontSize: 14, fontWeight: 600, color: 'text.secondary', flexShrink: 0 }}>{value}</Box>}
      {isSwitch
        ? <Switch checked={!!checked} onChange={(e) => onToggle!(e.target.checked)} inputProps={{ 'aria-label': ariaLabel ?? title }} sx={{ flexShrink: 0, mr: -1 }} />
        : !danger && <ChevronRightRoundedIcon aria-hidden sx={{ color: 'text.disabled', fontSize: 22, flexShrink: 0, mr: -0.5 }} />}
    </Box>
  );
};

/** Célula da ficha de saúde (Idade · Altura · Peso · IMC). Sem valor → "Adicionar" leva ao campo. */
const StatCell = ({ label, value, unit, sub, subColor, onClick, loading }: {
  label: string; value: string | null; unit?: string; sub?: string; subColor?: string; onClick: () => void; loading?: boolean;
}) => (
  <Box component="button" type="button" onClick={onClick}
    aria-label={value ? `${label}: ${value}${unit ? ` ${unit}` : ''}${sub ? `, ${sub}` : ''}` : `${label}: adicionar`}
    sx={{
      flex: 1, minWidth: 0, border: 0, bgcolor: 'transparent', font: 'inherit', color: 'inherit', cursor: 'pointer',
      py: 1.5, px: 0.5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25, borderRadius: '12px',
      WebkitTapHighlightColor: 'transparent',
      '&:active': { bgcolor: 'action.selected' },
      '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
    }}>
    {loading ? (
      <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 18, color: 'text.disabled', lineHeight: 1.3 }}>…</Typography>
    ) : value ? (
      <Stack direction="row" alignItems="baseline" spacing={0.25} sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: { xs: 18, sm: 20 }, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
        {unit && <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary' }}>{unit}</Typography>}
      </Stack>
    ) : (
      <Box sx={(t) => ({
        width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center',
        color: tealText(t.palette.mode), border: '1.5px dashed', borderColor: alpha(tealText(t.palette.mode), 0.55),
      })}>
        <AddRoundedIcon sx={{ fontSize: 18 }} />
      </Box>
    )}
    <Typography noWrap sx={{ fontSize: 12, fontWeight: 600, color: subColor ?? 'text.secondary', maxWidth: '100%' }}>{sub ?? label}</Typography>
  </Box>
);

/** Foto dentro do anel de perfil completo (mesmo desenho do anel do placar do Início). */
const AvatarRing = ({ pct, children }: { pct: number | null; children: ReactNode }) => {
  const t = useTheme();
  const S = 112; const R = 52; const C = 2 * Math.PI * R;
  const p = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <Box sx={{ position: 'relative', width: S, height: S, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <Box component="svg" aria-hidden viewBox={`0 0 ${S} ${S}`} sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
        <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke={alpha(t.palette.text.secondary, 0.14)} strokeWidth={4} />
        {pct != null && (
          <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke="url(#pf-ring)" strokeWidth={4} strokeLinecap="round"
            strokeDasharray={`${(p / 100) * C} ${C}`} style={{ transition: 'stroke-dasharray .9s cubic-bezier(.16,1,.3,1)' }} />
        )}
        <defs>
          <linearGradient id="pf-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5fc9c3" />
            <stop offset="100%" stopColor="#178f89" />
          </linearGradient>
        </defs>
      </Box>
      {children}
    </Box>
  );
};

export const ProfilePage = () => {
  useReuiThemeSync();
  const feedback = useFeedback(); // OPINIÕES: acesso permanente ("Dar minha opinião")
  const theme = useTheme();
  const [pid] = useSelectedPatient();
  const notify = useNotify();
  const refresh = useRefresh();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // 3 abas que sempre cabem na tela (antes eram 4 e "Conta & Acessos" ficava escondida à direita).
  // Saúde esportiva virou um grupo de Preferências; links antigos (?tab=esportes, ?sports=1) caem lá.
  const tabFrom = (t: string | null, sports: boolean): Tab => (sports || t === 'esportes' ? 'preferencias' : t === 'preferencias' || t === 'conta' ? t : 'dados');
  const [activeTab, setActiveTab] = useState<Tab>(() => tabFrom(searchParams.get('tab'), searchParams.get('sports') === '1'));
  const wantsSports = useRef(searchParams.get('sports') === '1' || searchParams.get('tab') === 'esportes');
  const tabParam = searchParams.get('tab');
  useEffect(() => { if (tabParam) setActiveTab(tabFrom(tabParam, false)); }, [tabParam]);
  const changeTab = (v: Tab) => { setActiveTab(v); setSearchParams({ tab: v }, { replace: true }); window.scrollTo({ top: 0 }); };
  const logout = useLogout();

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

  // Veio da home tocando numa pendência (?falta=cpf): rola até o campo assim que o perfil carrega.
  const faltaKey = searchParams.get('falta');
  const patientLoaded = !!patient;
  useEffect(() => {
    if (!faltaKey || !patientLoaded) return;
    setActiveTab('dados');
    const t = window.setTimeout(() => {
      const el = document.getElementById(profileFieldId(faltaKey));
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el?.querySelector('input, [role="combobox"], button') as HTMLElement | null)?.focus({ preventScroll: true });
    }, 350);
    return () => window.clearTimeout(t);
  }, [faltaKey, patientLoaded]);

  // Chegou por um link da Saúde esportiva: rola até o grupo dela em Preferências.
  useEffect(() => {
    if (!wantsSports.current || activeTab !== 'preferencias' || !patientLoaded) return;
    wantsSports.current = false;
    const t = window.setTimeout(() => document.getElementById('perfil-esportes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
    return () => window.clearTimeout(t);
  }, [activeTab, patientLoaded]);

  // Há algo digitado que ainda não foi salvo? (mesma regra do PUT: só o que mudou desde o load)
  const dirty = !!baseline && (
    Object.keys(buildProfilePatch(baseline, { fullName, phone, clinicalProfile: clinical, allergies, gender, heightCm, ethnicity, dateOfBirth: birthDate })).length > 0
    || (!patient?.hasCpf && !!cpf)
  );

  if (!pid) return <PageSkeleton cards={4} />;

  const planActive = user?.planExpiresAt && new Date(user.planExpiresAt) > new Date();
  const profilePct: number | null = patient?.profileCompleteness?.pct ?? null;
  const pending = pendingItems(patient?.profileCompleteness?.missing);
  const goToPending = (it: { key: string; to: string }) => {
    if (!it.to.startsWith('/perfil')) { navigate(it.to); return; }
    setActiveTab('dados');
    // espera a aba renderizar antes de rolar até o campo
    window.setTimeout(() => {
      const el = document.getElementById(profileFieldId(it.key));
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el?.querySelector('input, [role="combobox"], button') as HTMLElement | null)?.focus({ preventScroll: true });
    }, 120);
  };

  const age = ageFrom(birthDate);
  const hCm = parseHeightCm(heightCm);
  const loadingPatient = !patient && !loadFailed;
  const isDark = theme.palette.mode === 'dark';
  const semC = (k: 'ok' | 'warn' | 'bad' | 'info') => SEM[k][isDark ? 'dark' : 'light'];
  // IMC: palavra curta + cor do estado (nunca só cor). Faixas da OMS para adultos.
  const bmiShort = bmiInfo
    ? (Number(bmiInfo.val) < 18.5 ? { t: 'abaixo do peso', c: semC('info') }
      : Number(bmiInfo.val) < 25 ? { t: 'IMC normal', c: semC('ok') }
      : Number(bmiInfo.val) < 30 ? { t: 'sobrepeso', c: semC('warn') }
      : { t: 'obesidade', c: semC('bad') })
    : null;
  const focusField = (key: string) => goToPending({ key, to: `/perfil?falta=${key}` });
  const displayName = fullName || user?.name || 'Meu perfil';
  const tabs: { v: Tab; label: string }[] = [
    { v: 'dados', label: 'Meus dados' },
    { v: 'preferencias', label: 'Preferências' },
    { v: 'conta', label: 'Conta' },
  ];
  const saveLabel = saving ? 'Salvando…' : loadFailed ? 'Não carregou — tentar de novo' : !baseline ? 'Carregando seus dados…' : dirty ? 'Salvar alterações' : 'Tudo salvo';
  const onSave = loadFailed ? () => { void load(); } : saveProfile;

  return (
    <PageContainer width={720}>
      {/* ── IDENTIDADE ─────────────────────────────────────────── */}
      <Box component="header" sx={{
        position: 'relative', textAlign: 'center', pt: { xs: 1, sm: 2 }, pb: 2.5,
        '&::before': {
          content: '""', position: 'absolute', left: '50%', top: -40, width: 360, height: 260, transform: 'translateX(-50%)',
          background: `radial-gradient(closest-side, ${alpha('#20b2aa', isDark ? 0.2 : 0.14)}, transparent)`, pointerEvents: 'none', zIndex: 0,
        },
        '& > *': { position: 'relative', zIndex: 1 },
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <AvatarRing pct={profilePct}>
            <PhotoUpload
              patientId={pid}
              photoUrl={patient?.photoUrl}
              size={92}
              hideLabel
              appearance="surface"
              version={photoVer}
              fallback={displayName.trim().charAt(0).toUpperCase()}
              onUploaded={() => { setPhotoVer((v) => v + 1); void load(); }}
            />
          </AvatarRing>
        </Box>
        <Typography component="h1" sx={{ mt: 1.5, fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 22, sm: 26 }, letterSpacing: '-0.02em', lineHeight: 1.2, px: 2, overflowWrap: 'anywhere' }}>
          {displayName}
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: 14, color: 'text.secondary', display: 'inline-flex', alignItems: 'center', gap: 0.75, maxWidth: '100%', px: 2 }}>
          <MailOutlineRoundedIcon sx={{ fontSize: 16, flexShrink: 0 }} />
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email ?? '—'}</Box>
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="center" useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
          {patient?.relationship && (
            <Box sx={{ px: 1.5, height: 32, display: 'inline-flex', alignItems: 'center', borderRadius: '999px', border: '1px solid', borderColor: 'divider', fontSize: 13, fontWeight: 600, color: 'text.secondary', bgcolor: 'background.paper' }}>
              {patient.relationship}
            </Box>
          )}
          <Box component="button" type="button" onClick={() => navigate('/planos')} sx={{
            px: 1.5, height: 32, display: 'inline-flex', alignItems: 'center', gap: 0.75, borderRadius: '999px', cursor: 'pointer',
            font: 'inherit', fontSize: 13, fontWeight: 700, position: 'relative',
            '&::after': { content: '""', position: 'absolute', inset: '-6px 0' },
            ...(planActive
              ? { border: '1px solid', borderColor: alpha(COPPER.main, 0.55), bgcolor: COPPER.wash, color: isDark ? COPPER.light : COPPER.textAA }
              : { border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', color: 'text.primary' }),
          }}>
            {planActive
              ? (<><WorkspacePremiumRoundedIcon sx={{ fontSize: 17 }} />Premium</>)
              : (<>Plano grátis<Box component="span" sx={{ color: (t) => tealText(t.palette.mode) }}>· Ver planos</Box></>)}
          </Box>
        </Stack>
      </Box>

      {/* ── FICHA DE SAÚDE ─────────────────────────────────────── */}
      <Box sx={{
        display: 'flex', alignItems: 'stretch', mb: 2, p: 0.5,
        bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '16px',
        '& > * + *': { borderLeft: '1px solid', borderColor: 'divider', borderRadius: 0 },
      }}>
        <StatCell label="idade" value={age != null ? String(age) : null} unit="anos" sub={age != null ? 'idade' : undefined} loading={loadingPatient} onClick={() => focusField('dateOfBirth')} />
        <StatCell label="altura" value={hCm ? (hCm / 100).toFixed(2).replace('.', ',') : null} unit="m" loading={loadingPatient} onClick={() => focusField('heightCm')} />
        <StatCell label="peso" value={patient?.weightKg != null ? String(Math.round(Number(patient.weightKg) * 10) / 10).replace('.', ',') : null} unit="kg" loading={loadingPatient} onClick={() => navigate('/medicoes')} />
        <StatCell label="IMC" value={bmiInfo ? bmiInfo.val.replace('.', ',') : null} sub={bmiShort?.t} subColor={bmiShort?.c} loading={loadingPatient}
          onClick={() => (!hCm ? focusField('heightCm') : navigate('/medicoes'))} />
      </Box>

      {/* ── PERFIL INCOMPLETO ──────────────────────────────────── */}
      {pending.length > 0 && profilePct != null && (
        <Box sx={{ mb: 2.5, p: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '16px' }}>
          <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
            <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Complete seu perfil</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: 15, color: (t) => tealText(t.palette.mode), fontVariantNumeric: 'tabular-nums' }}>{profilePct}%</Typography>
          </Stack>
          <LinearProgress variant="determinate" value={profilePct} aria-label={`Perfil ${profilePct}% completo`}
            sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: alpha(theme.palette.text.secondary, 0.12), '& .MuiLinearProgress-bar': { borderRadius: 3, background: 'linear-gradient(90deg, #5fc9c3, #178f89)' } }} />
          <Typography sx={{ mt: 1, fontSize: 13, color: 'text.secondary', lineHeight: 1.45 }}>
            {pending.length === 1 ? 'Falta 1 dado' : `Faltam ${pending.length} dados`} — com eles, as faixas dos seus exames ficam do seu tamanho.
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
            {pending.map((it) => (
              <Button key={it.key} variant="outlined" onClick={() => goToPending(it)} startIcon={<AddRoundedIcon />}
                sx={{ minHeight: 44, borderRadius: '999px', textTransform: 'none', fontWeight: 600, px: 1.75, borderColor: 'divider', color: 'text.primary' }}>
                {it.label}
              </Button>
            ))}
          </Stack>
        </Box>
      )}

      {/* ── ABAS (segmentado: sempre cabem as 3) ──────────────── */}
      <Box role="tablist" aria-label="Seções do perfil" sx={{
        display: 'flex', p: 0.5, mb: 2.5, gap: 0.5, borderRadius: '14px',
        bgcolor: isDark ? '#1f2b2b' : '#e9eef1',
        position: 'sticky', top: { xs: 64, sm: 72 }, zIndex: 5, backdropFilter: 'blur(12px)',
      }}>
        {tabs.map(({ v, label }) => {
          const on = activeTab === v;
          return (
            <Box key={v} component="button" type="button" role="tab" aria-selected={on} onClick={() => changeTab(v)} sx={{
              flex: 1, minWidth: 0, minHeight: 44, border: 0, borderRadius: '10px', cursor: 'pointer', font: 'inherit',
              fontSize: 14, fontWeight: on ? 700 : 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', px: 1,
              color: on ? tealText(theme.palette.mode) : 'text.secondary',
              bgcolor: on ? 'background.paper' : 'transparent',
              boxShadow: on ? (isDark ? '0 1px 2px rgba(0,0,0,.5)' : '0 1px 3px rgba(15,23,42,.10), 0 1px 1px rgba(15,23,42,.04)') : 'none',
              transition: 'background-color .2s ease, color .2s ease, box-shadow .2s ease',
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
            }}>
              {label}
            </Box>
          );
        })}
      </Box>

      {/* ── MEUS DADOS ─────────────────────────────────────────── */}
      {activeTab === 'dados' && (
        <Box sx={{ pb: dirty ? 10 : 0 }}>
          <Group title="Identificação" pad>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FieldLabelWithHint label="Nome completo" hint="É o nome que conferimos nos laudos — evita misturar exames de outra pessoa." />
                {patient?.identityLocked ? (
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ minHeight: 40, px: 1.5, borderRadius: '10px', bgcolor: 'action.hover' }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 15, flex: 1, minWidth: 0 }} noWrap>{fullName || '—'}</Typography>
                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: semC('ok'), flexShrink: 0 }}>
                      <CheckCircleRoundedIcon sx={{ fontSize: 16 }} />
                      <Typography sx={{ fontSize: 12, fontWeight: 700 }}>conferido</Typography>
                    </Stack>
                  </Stack>
                ) : (
                  <TextField placeholder="Seu nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} fullWidth size="small" autoComplete="name" />
                )}
              </Grid>
              <Grid id={profileFieldId('cpf')} size={{ xs: 12, sm: 6 }} sx={{ scrollMarginTop: 140 }}>
                <FieldLabelWithHint label="CPF" hint="Só para confirmar que o exame enviado é seu. Fica criptografado." />
                {patient?.hasCpf ? (
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ minHeight: 40, px: 1.5, borderRadius: '10px', bgcolor: 'action.hover' }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 15, flex: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '.04em' }}>{cpf || '—'}</Typography>
                    <LockOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  </Stack>
                ) : (
                  <TextField value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} fullWidth size="small"
                    inputProps={{ inputMode: 'numeric' }} error={!!cpf && cpf.length === 14 && !isValidCpf(cpf)} placeholder="000.000.000-00" />
                )}
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FieldLabelWithHint label="Celular / WhatsApp" hint="Para avisos de teleconsulta e lembretes." />
                <TextField value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth size="small" placeholder="(00) 00000-0000"
                  inputProps={{ inputMode: 'tel' }} autoComplete="tel" />
              </Grid>
              <Grid id={profileFieldId('dateOfBirth')} size={{ xs: 12, sm: 6 }} sx={{ scrollMarginTop: 140 }}>
                <FieldLabelWithHint label="Data de nascimento" hint="Ajusta as faixas de referência à sua idade e calcula a idade do corpo." />
                <DateFieldBR label="" value={birthDate} onChange={setBirthDate} fullWidth size="small" />
              </Grid>
            </Grid>
          </Group>

          <Group title="Corpo" pad>
            <Grid container spacing={2}>
              <Grid id={profileFieldId('heightCm')} size={{ xs: 12, sm: 6 }} sx={{ scrollMarginTop: 140 }}>
                <FieldLabelWithHint label="Altura" hint="Com o peso, calcula o seu IMC." />
                <TextField value={heightCm} onChange={(e) => setHeightCm(maskHeightInput(e.target.value))} fullWidth size="small"
                  placeholder="Ex.: 1,75 m" inputProps={{ inputMode: 'decimal' }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FieldLabelWithHint label="Peso" hint="Vem das suas medições — o último registro." />
                <Stack direction="row" alignItems="center" spacing={1} sx={{ minHeight: 40, pl: 1.5, pr: 0.5, borderRadius: '10px', bgcolor: 'action.hover' }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 15, flex: 1, fontVariantNumeric: 'tabular-nums', color: patient?.weightKg != null ? 'text.primary' : 'text.secondary' }}>
                    {patient?.weightKg != null ? `${String(patient.weightKg).replace('.', ',')} kg` : 'Sem registro'}
                  </Typography>
                  <Button size="small" onClick={() => navigate('/medicoes')}
                    sx={{ textTransform: 'none', fontWeight: 700, minHeight: 36, color: (t) => tealText(t.palette.mode) }}>
                    {patient?.weightKg != null ? 'Atualizar' : 'Registrar'}
                  </Button>
                </Stack>
              </Grid>
              <Grid id={profileFieldId('gender')} size={{ xs: 12, sm: 6 }} sx={{ scrollMarginTop: 140 }}>
                <FieldLabelWithHint label="Sexo biológico" hint="Define as faixas de referência (hemoglobina, ferritina, creatinina, hormônios)." />
                <TextField select value={gender} onChange={(e) => setGender(e.target.value)} fullWidth size="small">
                  <MenuItem value="female">Feminino</MenuItem>
                  <MenuItem value="male">Masculino</MenuItem>
                  <MenuItem value="">Prefiro não informar</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FieldLabelWithHint label="Etnia (opcional)" hint="Ajuda a contextualizar alguns marcadores." />
                <TextField select value={ethnicity} onChange={(e) => setEthnicity(e.target.value)} fullWidth size="small">
                  <MenuItem value="">Prefiro não informar</MenuItem>
                  <MenuItem value="branca">Branca</MenuItem>
                  <MenuItem value="preta">Preta</MenuItem>
                  <MenuItem value="parda">Parda</MenuItem>
                  <MenuItem value="amarela">Amarela</MenuItem>
                  <MenuItem value="indigena">Indígena</MenuItem>
                </TextField>
              </Grid>
            </Grid>
          </Group>
          <Group>
            <Row icon={<MonitorWeightOutlinedIcon />} title="Composição corporal" desc="Gordura, músculo e água da bioimpedância" onClick={() => navigate('/composicao')} />
          </Group>

          <Group title="Saúde" pad>
            <Stack spacing={2}>
              <div>
                <FieldLabelWithHint label="Doenças, cirurgias e remédios de uso contínuo" hint="O Dr. Exame usa isto para não dar falso alarme — ex.: quem toma levotiroxina tem TSH diferente." />
                <TextField value={clinical} onChange={(e) => setClinical(e.target.value)} multiline minRows={3} fullWidth
                  placeholder="Ex.: hipotireoidismo (levotiroxina), pressão alta controlada, bariátrica em 2022…" />
              </div>
              <div>
                <FieldLabelWithHint label="Alergias" hint="Aparece em destaque para o médico na teleconsulta e no cartão de emergência." />
                <TextField value={allergies} onChange={(e) => setAllergies(e.target.value)} multiline minRows={2} fullWidth
                  placeholder="Ex.: penicilina, dipirona, frutos do mar, contraste iodado…" />
              </div>
            </Stack>
          </Group>

          <Button variant="contained" size="large" fullWidth onClick={onSave} disabled={saving || (!baseline && !loadFailed) || (!!baseline && !dirty && !loadFailed)}
            startIcon={!dirty && baseline && !loadFailed ? <CheckCircleRoundedIcon /> : undefined}
            sx={{ minHeight: 52, borderRadius: '14px', textTransform: 'none', fontWeight: 800, fontSize: 15, mb: 1 }}>
            {saveLabel}
          </Button>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', textAlign: 'center', mb: 2 }}>
            Ao salvar, as faixas de referência de todo o app se ajustam aos seus dados.
          </Typography>

          {/* Salvar fixo acima da barra enquanto houver alteração (padrão dos apps de mercado). */}
          <Slide direction="up" in={dirty && !saving} mountOnEnter unmountOnExit>
            <Box sx={{
              position: 'fixed', zIndex: 1050, left: 12, right: 12, mx: 'auto', maxWidth: 696,
              bottom: { xs: 'calc(var(--me-bottom-nav-h, 16px) + 8px)', sm: 24 },
              display: 'flex', alignItems: 'center', gap: 1.5, p: 1, pl: 2, borderRadius: '16px',
              bgcolor: isDark ? 'rgba(26,36,36,.92)' : 'rgba(255,255,255,.94)', backdropFilter: 'blur(16px)',
              border: '1px solid', borderColor: 'divider', boxShadow: '0 10px 30px rgba(15,23,42,.16)',
            }}>
              <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Alterações não salvas</Typography>
              <Button variant="contained" onClick={saveProfile} sx={{ minHeight: 44, borderRadius: '12px', textTransform: 'none', fontWeight: 800, px: 2.5 }}>
                Salvar
              </Button>
            </Box>
          </Slide>
        </Box>
      )}

      {/* ── PREFERÊNCIAS ───────────────────────────────────────── */}
      {activeTab === 'preferencias' && (
        <Box>
          <Group title="Leitura e acessibilidade">
            <Row icon={<FormatSizeOutlinedIcon />} title="Texto grande" desc="Letras maiores em laudos, tabelas e menus" checked={textLarge} onToggle={toggleTextLarge} />
            <Row icon={<SignLanguageOutlinedIcon />} title="Tradutor de Libras" desc="Mostra o VLibras nas telas do app" checked={librasOn} onToggle={toggleLibras} />
          </Group>
          <Group title="Privacidade">
            <Row icon={<VisibilityOffOutlinedIcon />} title="Modo discreto" desc="Embaça nomes de exames sensíveis até você tocar — bom para usar em público" checked={privacyOn} onToggle={setPrivacyOn} />
          </Group>
          <Group title="Início e avisos">
            <Row icon={<DirectionsRunOutlinedIcon />} title="Atividade física no Início" desc="Passos e calorias do relógio ou do Health Connect" checked={activityOn} onToggle={toggleActivity} />
            <Row icon={<EmojiEventsOutlinedIcon />} title="Avisos de conquistas" desc="Avisa no sino quando você atinge um marco" checked={achAlerts} onToggle={toggleAchAlerts} />
          </Group>
          {/* O card traz margem e divisória de quando ficava abaixo de outro conteúdo — aqui zera; e
              some o grupo inteiro se o card não renderizar (recurso desligado no painel). */}
          <Box sx={{ '&:has(.pf-sports:empty)': { display: 'none' } }}>
            <Group title="Saúde esportiva" id="perfil-esportes" pad>
              <Box className="pf-sports" sx={{ '& > div:first-of-type': { mt: 0, pt: 0, borderTop: 0 } }}>
                <SportsModeCard pid={pid} />
              </Box>
            </Group>
          </Box>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', textAlign: 'center', mb: 2 }}>
            Estas escolhas ficam guardadas neste aparelho.
          </Typography>
        </Box>
      )}

      {/* ── CONTA ──────────────────────────────────────────────── */}
      {activeTab === 'conta' && (
        <Box>
          <Group title="Sua conta">
            <Row icon={<WorkspacePremiumOutlinedIcon />} title="Plano e créditos" desc={planActive ? 'Premium ativo' : 'Plano grátis — veja o Premium'} onClick={() => navigate('/planos')} />
            <Row icon={<Diversity3OutlinedIcon />} title="Família" desc="Perfis de filhos, pais ou cônjuge na mesma conta" onClick={() => navigate('/familia')} />
          </Group>
          <Group title="Segurança e privacidade">
            <Row icon={<LockOutlinedIcon />} title="Senha e verificação em 2 etapas" desc="Troque a senha e proteja o acesso" onClick={() => navigate('/seguranca')} />
            <Row icon={<ShieldOutlinedIcon />} title="Seus dados (LGPD)" desc="Baixe tudo, veja os termos ou exclua a conta" onClick={() => navigate('/privacidade')} />
          </Group>
          <Group title="Ajuda">
            <Row icon={<SupportAgentOutlinedIcon />} title="Falar com o suporte" desc="Tire uma dúvida ou conte um problema" onClick={() => navigate('/suporte')} />
            <Row icon={<RateReviewOutlinedIcon />} title="Dar minha opinião" desc="1 minuto — ajuda a decidir o que melhorar" onClick={() => feedback.openSurvey('profile')} />
            <Row icon={<StarBorderRoundedIcon />} title="Avaliar na Google Play" desc="Sua nota ajuda outras pessoas a nos acharem" onClick={async () => {
              try {
                const { Browser } = await import('@capacitor/browser');
                await Browser.open({ url: PLAY_URL });
              } catch {
                window.open(PLAY_URL, '_blank');
              }
            }} />
            <Row icon={<BugReportOutlinedIcon />} title="Enviar diagnóstico do app" desc="Um resumo técnico, sem seus exames, para o suporte" onClick={() => { diagShare().catch(() => {}); }} />
          </Group>
          <Group title="Para desenvolvedores">
            <Row icon={<CodeOutlinedIcon />} title="API do Dr. Exame" desc="Integre a leitura de laudos ao seu sistema" onClick={() => navigate('/api')} />
          </Group>
          <Group>
            <Row icon={<LogoutRoundedIcon />} title="Sair da conta" danger onClick={() => logout('/entrar')} />
          </Group>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'center', mb: 2 }}>
            Dr. Exame · versão {APP_VERSION}
          </Typography>
        </Box>
      )}
    </PageContainer>
  );
};
