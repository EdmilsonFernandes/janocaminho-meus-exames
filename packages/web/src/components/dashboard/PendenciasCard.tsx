import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Stack, Typography, useTheme } from '@mui/material';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import AlarmOnRoundedIcon from '@mui/icons-material/AlarmOnRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { AppCard } from '../AppCard';

/**
 * "Pra você fazer" — fila de pendências do dia-a-dia do paciente no Dashboard
 * (padrão exception-queue do ReUI dashboard-1, portado p/ MUI): próxima consulta,
 * lembrete vencendo, pergunta aguardando o médico. Um lugar só, priorizado.
 *
 * Deliberadamente COMPLEMENTAR (não duplica nada):
 *  - NextStepsCard        → onboarding (perfil + 1º exame; some quando pronto)
 *  - UpcomingCollectionsCard → coletas pedidas pelo médico (plano T2)
 *  - ClinicalActionsCard  → ações de SAÚDE sugeridas pela IA (clinical-actions)
 * Aqui é a logística: teleconsulta agendada, lembrete vencido/próximo, pergunta pendente.
 *
 * Dados: 2 GETs já cacheados offline (fetch-cache): /reminders e /doctor-questions.
 * Card resolve NULL quando não há pendência (mesmo princípio do UpcomingCollections:
 * card opcional não vira mobília nem pisca estado vazio prematuro).
 */

type Tone = 'primary' | 'warning' | 'secondary';
type Row = { key: string; icon: React.ReactNode; label: string; chip: string; tone: Tone; to: string };

/** Chip de tempo honesto: futuro granular (timeAgo só diz "em breve"), passado explícito. */
const whenChip = (iso: string): { text: string; overdue: boolean } => {
  const due = new Date(iso).getTime();
  if (isNaN(due)) return { text: '', overdue: false };
  const dayMs = 86_400_000;
  const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((startOfDay(due) - startOfDay(Date.now())) / dayMs);
  if (days < -1) return { text: `vencido há ${-days} dias`, overdue: true };
  if (days === -1) return { text: 'vencido ontem', overdue: true };
  if (days === 0) return { text: 'hoje', overdue: false };
  if (days === 1) return { text: 'amanhã', overdue: false };
  return { text: `em ${days} dias`, overdue: false };
};

const MAX_ROWS = 4;
/** Vencido há mais que isto deixa de ser "pendência" na home: lembrete antigo nunca marcado
 *  ficava para sempre no topo (do mais velho pro mais novo) e tomava as vagas do que vem pela
 *  frente — falsa urgência (dono 24/11: "tem lembrete que já foi, aí queima"). Continua na
 *  agenda, em "Atrasados". */
const STALE_MS = 7 * 86_400_000;
/** Teleconsulta aberta que já passou há mais que isto não é mais "próxima" (mesma janela da agenda). */
const TELE_GRACE_MS = 2 * 60 * 60_000;

export const PendenciasCard = () => {
  const [pid] = useSelectedPatient();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!pid) return;
    let alive = true;
    const load = async () => {
      const h = { Authorization: `Bearer ${token()}` };
      const [remRes, qRes] = await Promise.allSettled([
        fetch(`${API_URL}/reminders?patientId=${pid}`, { headers: h }),
        fetch(`${API_URL}/doctor-questions?patientId=${pid}`, { headers: h }),
      ]);
      if (!alive) return;
      const reminders: any[] = remRes.status === 'fulfilled' && remRes.value.ok ? await remRes.value.json().catch(() => []) : [];
      const questions: any[] = qRes.status === 'fulfilled' && qRes.value.ok ? await qRes.value.json().catch(() => []) : [];

      const now = Date.now();
      const isTele = (r: any) => r && (r.type === 'teleconsulta' || r.provider === 'livekit');
      const isOpen = (r: any) => r && !r.endedAt && !r.done;
      const routine = (r: any) => !!r.recurrence; // remédio/rotina diária tem app próprio — não é "pendência"

      // 1. Próxima teleconsulta aberta (a mais próxima).
      const teles = reminders.filter((r) => isTele(r) && isOpen(r) && new Date(r.dueDate).getTime() >= now - TELE_GRACE_MS)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      const teleRows: Row[] = teles.slice(0, 2).map((r) => {
        const w = whenChip(r.dueDate);
        const imminent = new Date(r.dueDate).getTime() - now < 30 * 60_000 && new Date(r.dueDate).getTime() > now - 60 * 60_000;
        return {
          key: `tele-${r.id}`,
          icon: <VideocamRoundedIcon fontSize="small" />,
          label: r.title || 'Consulta por vídeo',
          chip: imminent ? 'agora' : w.text,
          tone: 'primary' as Tone,
          to: '/consultas',
        };
      });

      // 2. Lembretes vencidos (não-recorrentes) e próximos 7 dias.
      const pending = reminders.filter((r) => !isTele(r) && isOpen(r) && !routine(r) && r.dueDate);
      // Só vencido RECENTE, do mais novo pro mais velho, e no máximo UMA linha (agregada se houver
      // mais) — atrasado nunca ocupa a lista inteira no lugar do que ainda vai acontecer.
      const overdueList = pending
        .filter((r) => { const t = new Date(r.dueDate).getTime(); return t < now && t >= now - STALE_MS; })
        .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
      const overdue: Row[] = overdueList.length === 0 ? [] : [{
        key: `od-${overdueList[0].id}`,
        icon: <AlarmOnRoundedIcon fontSize="small" />,
        label: overdueList.length === 1 ? (overdueList[0].title || 'Lembrete') : `${overdueList.length} lembretes atrasados`,
        chip: overdueList.length === 1 ? whenChip(overdueList[0].dueDate).text : 'ver agenda',
        tone: 'warning',
        to: '/lembretes',
      }];
      const soon = pending
        .filter((r) => { const t = new Date(r.dueDate).getTime(); return t >= now && t < now + 7 * 86_400_000; })
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .map<Row>((r) => ({ key: `soon-${r.id}`, icon: <AlarmOnRoundedIcon fontSize="small" />, label: r.title || 'Lembrete', chip: whenChip(r.dueDate).text, tone: 'primary', to: '/lembretes' }));

      // 3. Perguntas aguardando o médico (1 linha, agregada).
      const pendingQuestions = Array.isArray(questions) ? questions.filter((q: any) => q && q.status !== 'answered').length : 0;
      const questionRows: Row[] = pendingQuestions > 0
        ? [{ key: 'questions', icon: <ChatBubbleOutlineRoundedIcon fontSize="small" />, label: pendingQuestions === 1 ? 'Pergunta aguardando o médico' : `${pendingQuestions} perguntas aguardando o médico`, chip: 'aguardando', tone: 'secondary', to: '/perguntas' }]
        : [];

      // Prioridade: tele imediata > vencidos > tele futura > perguntas > próximos 7d.
      const all = [...teleRows, ...overdue, ...questionRows, ...soon];
      setRows(all.slice(0, MAX_ROWS));
    };
    void load();
    // Refetch leve no retorno à aba (padrão da casa p/ consultas — push chega antes da lista atualizar).
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [pid]);

  if (!rows || rows.length === 0) return null; // em dia → card some (sem mobília, sem estado vazio)

  // Soft badge da casa (alpha .12) com texto AA por modo.
  const TONE: Record<Tone, { light: string; dark: string; bgLight: string; bgDark: string }> = {
    primary: { light: '#0f766e', dark: '#5fc9c3', bgLight: 'rgba(32,178,170,.12)', bgDark: 'rgba(32,178,170,.16)' },
    warning: { light: '#b45309', dark: '#fbbf24', bgLight: 'rgba(245,158,11,.14)', bgDark: 'rgba(251,191,36,.14)' },
    secondary: { light: '#a16207', dark: '#e0bc97', bgLight: 'rgba(212,165,116,.18)', bgDark: 'rgba(212,165,116,.16)' },
  };

  return (
    <AppCard sx={{ p: { xs: 2.25, md: 2.5 } }} aria-label="Pendências">
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
        <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 17, color: 'text.primary' }}>
          Pra você fazer
        </Typography>
        <Box sx={{ px: 1.25, py: 0.4, borderRadius: '999px', bgcolor: 'rgba(32,178,170,.12)', color: isDark ? '#5fc9c3' : '#0f766e', fontWeight: 800, fontSize: 12 }}>
          {rows.length}
        </Box>
      </Stack>
      <Stack spacing={0.5}>
        {rows.map((r) => {
          const t = TONE[r.tone];
          return (
            <Stack
              key={r.key}
              component="button"
              type="button"
              onClick={() => navigate(r.to)}
              aria-label={`${r.label} — ${r.chip}`}
              direction="row"
              alignItems="center"
              spacing={1.25}
              sx={{
                width: '100%', p: 1.25, minHeight: 48, cursor: 'pointer', textAlign: 'left',
                bgcolor: 'transparent', border: 'none', borderRadius: '12px', fontFamily: 'inherit',
                transition: 'background-color .15s ease',
                '&:hover': { bgcolor: isDark ? 'rgba(32,178,170,.08)' : 'rgba(32,178,170,.06)' },
                '&:active': { bgcolor: isDark ? 'rgba(32,178,170,.14)' : 'rgba(32,178,170,.10)' },
                '&:focus-visible': { outline: '2px solid', outlineColor: isDark ? '#5fc9c3' : '#178f89', outlineOffset: 2 },
              }}
            >
              <Box aria-hidden sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '10px', flexShrink: 0, bgcolor: isDark ? t.bgDark : t.bgLight, color: isDark ? t.dark : t.light }}>
                {r.icon}
              </Box>
              <Typography noWrap sx={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'text.primary', minWidth: 0 }}>
                {r.label}
              </Typography>
              <Typography component="span" noWrap sx={{ fontSize: 12, fontWeight: 700, flexShrink: 0, color: isDark ? t.dark : t.light }}>
                {r.chip}
              </Typography>
              <ArrowForwardRoundedIcon aria-hidden sx={{ fontSize: 15, color: 'text.disabled', flexShrink: 0 }} />
            </Stack>
          );
        })}
      </Stack>
    </AppCard>
  );
};
