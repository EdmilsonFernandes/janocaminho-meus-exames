// SportsPersonaBar (E5 §1, júri E4+ #13 ENXUTA) — barra de persona do atleta no topo do
// painel, ~2 LINHAS: avatar com inicial + nome/idade + chip da modalidade, objetivo e
// último exame (data·lab·recência). O júri CORTOU médico vinculado, peso/altura e chips
// de foco do arquétipo (o card de 171 linhas empilhava meta-dados acima da dobra);
// treino recente já vive na linha do tempo unificada. Linha sem dado segue omitida —
// honestidade §E4.3: nunca zero, nunca fake.
import { useEffect, useState } from 'react';
import { Box, Button, Chip, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TuneIcon from '@mui/icons-material/Tune';
import { API_URL, token } from '../../config';
import { AppCard } from '../AppCard';
import { RADIUS, tealText } from '../../theme';
import type { SportsProfile } from '../../hooks/useSportsProfile';
import type { SportArchetype } from './sportsDomains';
import type { CollectionContextChips } from './SportsMarkerCard';
import { SportsProfileWizard } from './SportsProfileWizard';

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
  const [wizardOpen, setWizardOpen] = useState(false);

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
    <>
      <AppCard
        kind="tinted"
        tone="primary"
        tone2="secondary"
        sx={{
          p: { xs: 2, sm: 2.5 },
          mb: 2,
          borderRadius: RADIUS.card,
          border: (t) => `1px solid ${t.palette.mode === 'dark' ? 'rgba(32,178,170,0.22)' : 'rgba(32,178,170,0.18)'}`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Topo do Hero: Eyebrow do Arquétipo + Badge Modo Esporte */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1.25 }}>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 800,
              color: (t) => tealText(t.palette.mode),
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              lineHeight: 1.2,
            }}
          >
            {archetype.header}
          </Typography>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1,
              py: 0.3,
              borderRadius: '999px',
              bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.18)' : 'rgba(32,178,170,0.12)'),
              color: (t) => tealText(t.palette.mode),
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            <span>🏃</span> Modo Atleta
          </Box>
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.75} alignItems={{ sm: 'flex-start' }}>
          {/* Avatar: inicial estilizada com gradiente two-tone */}
          <Box
            sx={{
              width: { xs: 44, sm: 48 },
              height: { xs: 44, sm: 48 },
              borderRadius: '14px',
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 800,
              fontSize: { xs: 18, sm: 20 },
              color: (t) => tealText(t.palette.mode),
              background: 'linear-gradient(135deg, rgba(32,178,170,0.28), rgba(212,165,116,0.28))',
              border: (t) => `1px solid ${t.palette.mode === 'dark' ? 'rgba(32,178,170,0.35)' : 'rgba(32,178,170,0.25)'}`,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            {name.trim().charAt(0).toUpperCase() || '?'}
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* Nome do paciente + Idade + Chips de modalidade com gatilho direto p/ Wizard */}
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 0.5 }}>
              <Typography
                component="h1"
                sx={{
                  fontFamily: 'Poppins, sans-serif',
                  fontWeight: 800,
                  fontSize: { xs: 17.5, sm: 20 },
                  lineHeight: 1.2,
                  color: 'text.primary',
                }}
              >
                {name}{age != null ? `, ${age} anos` : ''}
              </Typography>
              {profile?.modality ? (
                <Chip
                  size="small"
                  icon={<TuneIcon sx={{ fontSize: '13px !important', color: 'inherit !important' }} />}
                  label={
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.35 }}>
                      {profile.modality}
                      <Box component="span" sx={{ fontSize: 9.5, opacity: 0.7, ml: 0.25 }}>▾</Box>
                    </Box>
                  }
                  onClick={() => setWizardOpen(true)}
                  title="Toque para mudar o esporte ou calibrar sua lente"
                  sx={{
                    height: 25,
                    fontWeight: 800,
                    fontSize: 11.5,
                    cursor: 'pointer',
                    bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.2)' : 'rgba(32,178,170,0.15)'),
                    color: (t) => tealText(t.palette.mode),
                    border: '1px solid',
                    borderColor: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.45)' : 'rgba(32,178,170,0.35)'),
                    transition: 'all 0.15s ease-in-out',
                    '&:hover': {
                      bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.32)' : 'rgba(32,178,170,0.25)'),
                      transform: 'translateY(-1px)',
                    },
                  }}
                />
              ) : (
                <Chip
                  size="small"
                  icon={<TuneIcon sx={{ fontSize: '13px !important', color: 'inherit !important' }} />}
                  label="Escolher esporte ▾"
                  onClick={() => setWizardOpen(true)}
                  title="Defina seu esporte para organizar o painel"
                  sx={{
                    height: 25,
                    fontWeight: 800,
                    fontSize: 11.5,
                    cursor: 'pointer',
                    bgcolor: 'rgba(245,158,11,0.15)',
                    color: '#d97706',
                    border: '1px dashed rgba(245,158,11,0.6)',
                    '&:hover': {
                      bgcolor: 'rgba(245,158,11,0.25)',
                    },
                  }}
                />
              )}
              {profile?.trainingFreq && (
                <Chip
                  size="small"
                  label={profile.trainingFreq}
                  sx={{
                    height: 24,
                    fontWeight: 700,
                    fontSize: 11,
                    bgcolor: 'action.hover',
                    color: 'text.secondary',
                  }}
                />
              )}
            </Stack>

            {/* Objetivo do atleta em destaque refinado com atalho para calibrar a lente */}
            <Box
              sx={{
                mt: 0.75,
                p: { xs: 1, sm: 1.25 },
                borderRadius: '10px',
                bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.7)'),
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: { xs: 'flex-start', sm: 'center' },
                justifyContent: 'space-between',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 0.75,
              }}
            >
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.45, flex: 1 }}>
                <Box component="span" sx={{ fontWeight: 800, color: 'text.primary', mr: 0.5 }}>
                  🎯 Foco da Lente:
                </Box>
                {goalText}
              </Typography>
              <Button
                size="small"
                onClick={() => setWizardOpen(true)}
                startIcon={<TuneIcon sx={{ fontSize: '13px !important' }} />}
                sx={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: (t) => tealText(t.palette.mode),
                  textTransform: 'none',
                  py: 0.3,
                  px: 1.2,
                  minWidth: 'auto',
                  alignSelf: { xs: 'flex-end', sm: 'center' },
                  borderRadius: '6px',
                  bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.12)' : 'rgba(32,178,170,0.08)'),
                  border: '1px solid',
                  borderColor: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.25)' : 'rgba(32,178,170,0.2)'),
                  '&:hover': {
                    bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.22)' : 'rgba(32,178,170,0.18)'),
                  },
                }}
              >
                Mudar esporte
              </Button>
            </Box>

            {/* Último exame + Chips de contexto da coleta */}
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              {lastExamLine && (
                <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>
                  <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>Último exame:</Box> {lastExamLine}
                </Typography>
              )}

              {(ctx?.jejum || ctx?.treino24h || ctx?.ultimaDose) && (
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  {ctx?.jejum && (
                    <Chip size="small" label="Jejum informado" sx={{ height: 20, fontSize: 10.5, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />
                  )}
                  {ctx?.treino24h && (
                    <Chip size="small" label="Treino <24h" sx={{ height: 20, fontSize: 10.5, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />
                  )}
                  {ctx?.ultimaDose && (
                    <Chip size="small" label={`Dose: ${ctx.ultimaDose}`} sx={{ height: 20, fontSize: 10.5, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />
                  )}
                </Stack>
              )}
            </Stack>
          </Box>
        </Stack>
      </AppCard>

      {/* Modal Guiado de Seleção de Lente Esportiva */}
      <Dialog
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '16px',
            p: { xs: 2, sm: 2.5 },
            boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          },
        }}
      >
        <DialogTitle
          sx={{
            p: 0,
            pb: 1.5,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ pr: 1 }}>
            <Typography
              sx={{
                fontFamily: 'Poppins, sans-serif',
                fontWeight: 800,
                fontSize: { xs: 16.5, sm: 18.5 },
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                color: 'text.primary',
              }}
            >
              <span>🎯</span> Calibrar Lente Esportiva
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, lineHeight: 1.35 }}>
              Escolha seu esporte e rotina. O painel reorganiza na hora os marcadores mais críticos pro seu treino.
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={() => setWizardOpen(false)}
            aria-label="Fechar"
            sx={{ color: 'text.secondary', mt: -0.5, mr: -0.5 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, pt: 1.5 }}>
          <SportsProfileWizard
            pid={pid}
            embedded
            onSaved={() => setWizardOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
