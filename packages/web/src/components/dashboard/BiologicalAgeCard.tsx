import { Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { useEffect, useState } from 'react';
import { AppCard } from '../AppCard';
import { SEM } from '../../theme';
import { Dna } from '@phosphor-icons/react';

type BioData = { age: number; confidence: string; markersUsed: number; missing?: string[] | null; method?: string; assumptions?: string[] };

/** Reduced-motion avaliado 1x na carga do módulo (guarda o spring do tile). */
const REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Accent único da feature (tile E dialog): esmeralda — antes o tile era esmeralda e o dialog, indigo.
const ACCENT = '#059669';

/**
 * Tile "Idade Biológica" — estimativa (PhenoAge) baseada em marcadores sanguíneos.
 *
 * NUNCA retorna null: mantém a grade 2×2 do Dashboard sempre completa. Sem estimativa, o tile
 * diz POR QUE não calculou (availability do server): falta perfil (nascimento) → CTA perfil;
 * falta exame → CTA 1º exame; faltam marcadores específicos → lista. "Em breve" genérico nunca
 * mais (ausência de dado não é um prazo). A explicação rica fica num Dialog (toque no tile).
 */
export const BiologicalAgeCard = ({ idx = 2, bio, bioAvail, bioLoaded }: {
  idx?: number;
  /** Vêm do MESMO /health-summary que o DashboardV2 já buscou — o tile não refaz o GET. */
  bio?: BioData | null;
  bioAvail?: { status: string; missing: string[] } | null;
  bioLoaded?: boolean;
}) => {
  const [pid] = useSelectedPatient();
  const navigate = useNavigate();
  const t = useTheme();
  const isDark = t.palette.mode === 'dark';
  // Estado PRÓPRIO só p/ uso isolado (sem props) e p/ refresh via dx-profile-updated.
  const [ownData, setOwnData] = useState<BioData | null>(null);
  const [ownAvail, setOwnAvail] = useState<{ status: string; missing: string[] } | null>(null);
  const [ownLoaded, setOwnLoaded] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const [explain, setExplain] = useState(false);
  const controlled = bioLoaded !== undefined;

  const loadBio = () => {
    if (!pid) return;
    setOwnLoaded(false);
    fetch(`${API_URL}/patients/${pid}/health-summary`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setOwnData(d?.biologicalAge ?? null); setOwnAvail(d?.availability?.biologicalAge ?? null); setRefreshed(true); })
      .catch(() => {})
      .finally(() => setOwnLoaded(true));
  };
  // Isolado (sem props): busca na mount. Controlado: só refaz em dx-profile-updated.
  useEffect(() => { if (!controlled) loadBio(); /* eslint-disable-next-line */ }, [pid, controlled]);
  // Reage ao onboarding salvar (idade biológica depende de nascimento/sexo) sem reload.
  useEffect(() => {
    window.addEventListener('dx-profile-updated', loadBio);
    return () => { window.removeEventListener('dx-profile-updated', loadBio); };
  }, [pid]);
  // Troca de paciente: descarta o refresh próprio e volta a espelhar as props.
  useEffect(() => { setRefreshed(false); setOwnData(null); setOwnAvail(null); }, [pid]);

  const data = controlled && !refreshed ? (bio ?? null) : ownData;
  const avail = controlled && !refreshed ? (bioAvail ?? null) : ownAvail;
  const loaded = controlled && !refreshed ? !!bioLoaded : ownLoaded;

  const userStr = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
  const chronoAge = userStr ? (() => { try { return JSON.parse(userStr)?.age ?? null; } catch { return null; } })() : null;
  const diff = chronoAge && data ? data.age - chronoAge : null;

  // Estado vazio HONESTO: o tile explica o que falta em vez de prometer um "Em breve" sem prazo.
  const missingProfile = avail?.status === 'missing_profile';
  const noExams = avail?.status === 'no_data';
  const value = data ? `${data.age}a` : loaded ? '—' : '…';
  const sub = data
    ? (diff === null ? 'estimativa corporal' : diff === 0 ? 'em equilíbrio' : diff < 0 ? `${Math.abs(diff)}a mais jovem` : `${diff}a mais velho`)
    : missingProfile ? 'complete seu perfil'
    : noExams ? 'após o 1º exame'
    : loaded && avail ? 'precisa de mais marcadores'
    : '';
  // SEM: verde/vermelho AA nos DOIS modos (o hardcode falhava contraste no dark).
  const subColor = diff !== null && diff < 0 ? SEM.ok[isDark ? 'dark' : 'light'] : diff !== null && diff > 0 ? SEM.bad[isDark ? 'dark' : 'light'] : 'text.secondary';

  return (
    <>
      <AppCard
        kind="interactive"
        onClick={() => setExplain(true)}
        sx={{
          p: 2,
          height: '100%',
          borderRadius: '20px !important',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'transform .18s ease, box-shadow .18s ease',
          // Mesmo spring escalonado dos IndicatorTiles (idx=2 → 3º da linha de KPI).
          animation: REDUCED_MOTION ? 'none' : `dxTileSpring .45s cubic-bezier(.34,1.56,.64,1) ${idx * 0.08}s both`,
          '@keyframes dxTileSpring': {
            from: { opacity: 0, transform: 'translateY(14px) scale(.96)' },
            to: { opacity: 1, transform: 'translateY(0) scale(1)' },
          },
          '&:hover': {
            boxShadow: '0 4px 16px rgba(0,0,0,.06)',
            transform: 'translateY(-2px)',
          },
          '&:active': { transform: 'scale(.98)' },
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1, pr: 1 }}>
          <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            Idade Bio
          </Typography>
          <Typography noWrap sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 'clamp(1.125rem, 5vw, 1.375rem)', sm: 22 }, color: 'text.primary', lineHeight: 1.2, mt: 0.25, fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </Typography>
          {sub && (
            <Typography noWrap sx={{ fontSize: 12, color: subColor, fontWeight: 600, mt: 0.25 }}>
              {sub}
            </Typography>
          )}
        </Box>
        <Box sx={{
          width: 42, height: 42, borderRadius: '12px',
          display: 'grid', placeItems: 'center', flexShrink: 0,
          bgcolor: 'rgba(16, 185, 129, 0.12)', color: '#059669',
        }}>
          <Dna size={22} weight="duotone" />
        </Box>
      </AppCard>

      <Dialog open={explain} onClose={() => setExplain(false)} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>🧬 Idade biológica</DialogTitle>
        <DialogContent>
          {data ? (
            <>
              <Typography variant="h6" sx={{ fontWeight: 800, color: ACCENT }}>{data.age} anos{chronoAge ? ` (você tem ${chronoAge})` : ''}</Typography>
              {diff !== null && diff !== 0 && (
                <Typography variant="body2" sx={{ mt: 0.5, color: diff < 0 ? SEM.ok[isDark ? 'dark' : 'light'] : SEM.bad[isDark ? 'dark' : 'light'], fontWeight: 700 }}>
                  {diff < 0 ? `💚 Seu corpo está ${Math.abs(diff)}a mais jovem que sua idade` : `⚠️ Seu corpo está ${diff}a mais velho que sua idade`}
                </Typography>
              )}
              {diff === 0 && <Typography variant="body2" sx={{ mt: 0.5 }} color="text.secondary">Seu corpo está em equilíbrio com sua idade.</Typography>}
              <Typography variant="body2" sx={{ lineHeight: 1.6, display: 'block', mt: 1.5 }}>
                É a idade estimada do seu <b>corpo</b> a partir de exames de sangue — glicose, colesterol, função do rim e do fígado, hormônios e outros marcadores. Pode diferir da sua idade de carteira (cronológica).
              </Typography>
              {chronoAge == null && (
                <Typography variant="body2" sx={{ mt: 1.5, color: ACCENT, fontWeight: 700 }}>
                  Cadastre sua data de nascimento no perfil para compararmos com sua idade real.
                </Typography>
              )}
              {data.assumptions?.includes('sexoNaoInformado') && (
                <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
                  ℹ️ Sexo não informado no perfil — os intervalos de referência usados assumem valores masculinos. Informe o sexo no perfil para uma estimativa mais precisa.
                </Typography>
              )}
              {data.missing && data.missing.length > 0 && (
                <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
                  📊 Estimativa parcial — pra ficar mais precisa, ajudaria ter: <b>{data.missing.join(', ')}</b> num próximo exame.
                </Typography>
              )}
              <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.secondary', fontStyle: 'italic' }}>
                Cálculo baseado em {data.markersUsed} marcadores. Estimativa educativa — não substitui a avaliação de um profissional de saúde.
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                A idade biológica é uma estimativa de como o seu <b>corpo</b> está envelhecendo, calculada a partir de exames de sangue (hemograma, glicose, colesterol, função renal/hepática, inflamação e outros).
              </Typography>
              {missingProfile ? (
                <Typography variant="body2" sx={{ mt: 1.5 }}>
                  Pra calcular a sua, primeiro precisamos da sua <b>data de nascimento</b> no perfil — ela entra direto na fórmula.
                </Typography>
              ) : (
                <Typography variant="body2" sx={{ mt: 1.5 }}>
                  Pra calcular a sua, envie um <b>exame completo</b> com esses marcadores. 🔄
                </Typography>
              )}
              {!!avail?.missing?.length && !missingProfile && avail.status === 'insufficient_data' && (
                <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
                  Ainda sem: <b>{avail.missing.join(', ')}</b>.
                </Typography>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          {!data && (
            <Button onClick={() => { setExplain(false); navigate(missingProfile ? '/perfil' : '/exams/create'); }} variant="contained" sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}>
              {missingProfile ? 'Completar perfil' : 'Enviar exame'}
            </Button>
          )}
          <Button onClick={() => setExplain(false)} variant={data ? 'contained' : 'text'} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}>Entendi</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
