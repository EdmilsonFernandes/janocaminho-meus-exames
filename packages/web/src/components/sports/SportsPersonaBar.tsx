// SportsPersonaBar (E5 §1, júri E4+ #13 ENXUTA) — barra de persona do atleta no topo do
// painel, ~2 LINHAS: avatar com inicial + nome/idade + chip da modalidade, objetivo e
// último exame (data·lab·recência). O júri CORTOU médico vinculado, peso/altura e chips
// de foco do arquétipo (o card de 171 linhas empilhava meta-dados acima da dobra);
// treino recente já vive na linha do tempo unificada. Linha sem dado segue omitida —
// honestidade §E4.3: nunca zero, nunca fake.
import { useEffect, useState } from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { API_URL, token } from '../../config';
import { AppCard } from '../AppCard';
import { tealText } from '../../theme';
import type { SportsProfile } from '../../hooks/useSportsProfile';
import type { SportArchetype } from './sportsDomains';
import type { CollectionContextChips } from './SportsMarkerCard';

const fmtDay = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');
const daysSince = (d?: string | null): number | null => {
  if (!d) return null;
  const n = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return n >= 0 ? n : null;
};
const relDays = (d?: string | null) => {
  const days = daysSince(d);
  if (days == null) return null;
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  const m = Math.floor(days / 30);
  return m < 12 ? `há ${m} ${m === 1 ? 'mês' : 'meses'}` : `há ${Math.floor(m / 365)} ano(s)`;
};

interface PersonaPatient { fullName?: string | null; dateOfBirth?: string | null }

export const SportsPersonaBar = ({ pid, profile, archetype, fallbackName, lastExam, ctx }: {
  pid: string | null;
  profile: SportsProfile | null;
  archetype: SportArchetype;
  /** Primeiro nome do usuário (saudação) — fallback quando o Patient ainda não carregou. */
  fallbackName: string;
  /** Último exame EXTRAÍDO do titular ({date, lab} — o mesmo critério do tile "Último exame"). */
  lastExam: { date: string | null; lab?: string | null } | null;
  /** Contexto de coleta declarado (jejum/treino<24h/última dose) — chips, nunca supressor. */
  ctx?: CollectionContextChips | null;
}) => {
  const [patient, setPatient] = useState<PersonaPatient | null>(null);

  // Patient (nome/nascimento) — mesmo GET do EmergencyCard/Profile. Peso/altura e médico
  // vinculado SAÍRAM da barra (júri #13): peso era medição isolada fora de contexto e o
  // médico já aparece no painel de Metas/compartilhamento.
  useEffect(() => {
    if (!pid) return;
    fetch(`${API_URL}/patients/${pid}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (p?.fullName) setPatient(p); })
      .catch(() => {});
  }, [pid]);

  const name = patient?.fullName || fallbackName || 'Atleta';
  const age = patient?.dateOfBirth
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  // Último exame: data · laboratório · recência (só com dado real — SEM dado = sem linha).
  let lastExamLine: string | null = null;
  if (lastExam?.date) {
    const parts = [fmtDay(lastExam.date), lastExam.lab?.trim()].filter(Boolean).join(' · ');
    const rel = relDays(lastExam.date);
    lastExamLine = rel ? `${parts} · ${rel}` : parts;
  }

  const goalText = profile?.goals?.trim() || archetype.emphasis;

  return (
    <AppCard kind="tinted" tone="primary" tone2="secondary" sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
        {/* Avatar: inicial do nome em círculo teal (mockup §1 — identidade do atleta) */}
        <Box sx={{
          width: 46, height: 46, borderRadius: '14px', flexShrink: 0, display: 'grid', placeItems: 'center',
          fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 19,
          color: (t) => tealText(t.palette.mode),
          background: 'linear-gradient(135deg, rgba(32,178,170,.25), rgba(212,165,116,.25))',
        }}>
          {name.trim().charAt(0).toUpperCase() || '?'}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.2 }}>
            {archetype.header}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 0.25 }}>
            <Typography component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 17, sm: 19 }, lineHeight: 1.15 }}>
              {name}{age != null ? `, ${age}` : ''}
            </Typography>
            {profile?.modality && (
              <Chip size="small" label={profile.modality} sx={{ height: 24, fontWeight: 800, bgcolor: 'rgba(32,178,170,.14)', color: (t) => tealText(t.palette.mode) }} />
            )}
            {profile?.trainingFreq && (
              <Chip size="small" label={profile.trainingFreq} sx={{ height: 24, fontWeight: 700, fontSize: 11, bgcolor: 'action.hover', color: 'text.secondary' }} />
            )}
            <Chip size="small" label="🏃 Modo Esporte" sx={{ height: 24, fontWeight: 800, bgcolor: 'rgba(32,178,170,.14)', color: (t) => tealText(t.palette.mode) }} />
          </Stack>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5, lineHeight: 1.45 }}>
            🎯 {goalText}
          </Typography>
          {lastExamLine && (
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.25, lineHeight: 1.4, wordBreak: 'break-word' }}>
              <Box component="b" sx={{ fontWeight: 800, color: 'text.primary' }}>Último exame:</Box> {lastExamLine}
            </Typography>
          )}
          {(ctx?.jejum || ctx?.treino24h || ctx?.ultimaDose) && (
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
              {ctx?.jejum && <Chip size="small" label="Coleta em jejum" sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />}
              {ctx?.treino24h && <Chip size="small" label="Treino <24h antes da coleta" sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />}
              {ctx?.ultimaDose && <Chip size="small" label={`Última dose: ${ctx.ultimaDose}`} sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />}
            </Stack>
          )}
        </Box>
      </Stack>
    </AppCard>
  );
};
