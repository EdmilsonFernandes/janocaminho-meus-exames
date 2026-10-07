// SportsPersonaBar (E5 §1) — barra de persona do atleta no topo do painel (substitui o
// hero "contexto do atleta": mesmo AppCard tinted, agora com IDENTIDADE — avatar com
// inicial, nome+idade, chips do esporte/nível, objetivo, último exame+lab, peso/altura,
// treino recente do Health Connect e médico VINCULADO quando existe share ativo).
//
// Honestidade de dado (§E4.3): SEM dado = linha omitida — nunca zero, nunca fake. O
// médico só aparece com DoctorShare ativo (sem CTA inventado). Peso vem da última
// medição WEIGHT (mesma fonte do IMC no health-state); altura é heightCm do Patient.
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
  return m < 12 ? `há ${m} ${m === 1 ? 'mês' : 'meses'}` : `há ${Math.floor(days / 365)} ano(s)`;
};

interface PersonaPatient { fullName?: string | null; dateOfBirth?: string | null; heightCm?: number | null }

export const SportsPersonaBar = ({ pid, profile, archetype, fallbackName, lastExam, training, ctx, focusChips }: {
  pid: string | null;
  profile: SportsProfile | null;
  archetype: SportArchetype;
  /** Primeiro nome do usuário (saudação) — fallback quando o Patient ainda não carregou. */
  fallbackName: string;
  /** Último exame EXTRAÍDO do titular ({date, lab} — o mesmo critério do tile "Último exame"). */
  lastExam: { date: string | null; lab?: string | null } | null;
  /** Treinos do Health Connect (dias mais recentes com exercício >0 — ActivityCard pattern). */
  training: { date: string; min: number }[];
  /** Contexto de coleta declarado (jejum/treino<24h/última dose) — chips, nunca supressor. */
  ctx?: CollectionContextChips | null;
  /** Chips de foco do arquétipo (lente esporte × contexto — commit "lente por arquétipo"). */
  focusChips?: string[];
}) => {
  const [patient, setPatient] = useState<PersonaPatient | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [doctor, setDoctor] = useState<{ name: string; crm: string } | null>(null);

  useEffect(() => {
    if (!pid) return;
    const h = { Authorization: `Bearer ${token()}` };
    // Patient (nome/nascimento/altura) — mesmo GET do EmergencyCard/Profile.
    fetch(`${API_URL}/patients/${pid}`, { headers: h })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (p?.fullName) setPatient(p); })
      .catch(() => {});
    // Último PESO: medição WEIGHT mais recente (mesma semântica do IMC no health-state).
    fetch(`${API_URL}/measurements?patientId=${pid}&type=WEIGHT`, { headers: h })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        const w = (Array.isArray(rows) ? rows : [])
          .filter((m) => m?.type === 'WEIGHT' && Number(m.value) > 0)
          .sort((a, b) => new Date(b.measuredAt ?? 0).getTime() - new Date(a.measuredAt ?? 0).getTime())[0];
        if (w) setWeightKg(Math.round(Number(w.value) * 10) / 10);
      })
      .catch(() => {});
    // Médico VINCULADO: primeiro share ATIVO com médico (GET /doctor-shares — padrão Medicos).
    fetch(`${API_URL}/doctor-shares`, { headers: h })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => {
        const s = (d.items ?? []).find((x: any) => x?.active !== false && x?.doctor?.name);
        if (s?.doctor) setDoctor({ name: s.doctor.name, crm: String(s.doctor.crm ?? '').trim() });
      })
      .catch(() => {});
  }, [pid]);

  const name = patient?.fullName || fallbackName || 'Atleta';
  const age = patient?.dateOfBirth
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;
  // Treino recente: último dia COM exercício, mostrado só se ≤7d (stale = omitir, §E4.3).
  const lastTraining = training.length > 0 ? training[training.length - 1] : null;
  const trainingAge = lastTraining ? daysSince(lastTraining.date) : null;
  const showTraining = !!(lastTraining && trainingAge != null && trainingAge <= 7);

  // Linhas de meta — cada uma só com dado real (SEM dado = linha não existe).
  const metaLines: { label: string; value: string }[] = [];
  if (lastExam?.date) {
    const parts = [fmtDay(lastExam.date), lastExam.lab?.trim()].filter(Boolean).join(' · ');
    const rel = relDays(lastExam.date);
    metaLines.push({ label: 'Último exame', value: rel ? `${parts} · ${rel}` : parts });
  }
  if (weightKg != null || patient?.heightCm != null) {
    const parts = [
      weightKg != null ? `${weightKg.toLocaleString('pt-BR')} kg` : null,
      patient?.heightCm != null ? `${Math.round(patient.heightCm)} cm` : null,
    ].filter(Boolean).join(' · ');
    metaLines.push({ label: 'Peso/altura', value: parts });
  }
  if (showTraining && lastTraining) {
    metaLines.push({ label: 'Treino recente', value: `${relDays(lastTraining.date)} · ${lastTraining.min} min` });
  }
  if (doctor) {
    // Nome já pode trazer título próprio ("Dr Teste QA") — não duplica "Dr(a).".
    const cleanName = doctor.name.replace(/^(dr\.?|dra\.?|dr\(a\)\.?)\s*/i, '').trim() || doctor.name;
    metaLines.push({ label: 'Médico vinculado', value: `${/^[Dd]ra/.test(doctor.name) ? 'Dra.' : 'Dr.'} ${cleanName}${doctor.crm ? ` · CRM ${doctor.crm}` : ''}` });
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
          {metaLines.length > 0 && (
            <Stack spacing={0.25} sx={{ mt: 1 }}>
              {metaLines.map((m) => (
                <Typography key={m.label} sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.4, wordBreak: 'break-word' }}>
                  <Box component="b" sx={{ fontWeight: 800, color: 'text.primary' }}>{m.label}:</Box> {m.value}
                </Typography>
              ))}
            </Stack>
          )}
          {(ctx?.jejum || ctx?.treino24h || ctx?.ultimaDose || (focusChips?.length ?? 0) > 0) && (
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
              {(focusChips ?? []).map((f) => (
                <Chip key={f} size="small" label={`Foco: ${f}`} sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(212,165,116,.12)', color: 'text.secondary' }} />
              ))}
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
