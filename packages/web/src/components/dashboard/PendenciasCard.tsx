import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, IconButton, Portal, Snackbar, Stack, Typography, useTheme } from '@mui/material';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import AlarmOnRoundedIcon from '@mui/icons-material/AlarmOnRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import VaccinesRoundedIcon from '@mui/icons-material/VaccinesRounded';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { AppCard } from '../AppCard';
import { compoundById, doseStatus } from '../../utils/hormoneRadar';

/**
 * "Pra você fazer" — fila de pendências do dia-a-dia do paciente no Dashboard
 * (padrão exception-queue do ReUI dashboard-1, portado p/ MUI): próxima consulta,
 * lembrete vencendo, pergunta aguardando o médico. Um lugar só, priorizado.
 *
 * Deliberadamente COMPLEMENTAR (não duplica nada):
 *  - NextStepsCard        → onboarding (perfil + 1º exame; some quando pronto)
 *  - UpcomingCollectionsCard → coletas pedidas pelo médico (plano T2)
 *  - ClinicalActionsCard  → ações de SAÚDE sugeridas pela IA (clinical-actions)
 * Aqui é a logística: teleconsulta agendada, lembrete vencido/próximo, pergunta pendente,
 * aplicação prevista no diário do Radar Hormonal.
 *
 * Dados: 2 GETs já cacheados offline (fetch-cache): /reminders e /doctor-questions; e, só para
 * quem tem protocolo salvo no Radar Hormonal (localStorage), /hormone-doses.
 * Card resolve NULL quando não há pendência (mesmo princípio do UpcomingCollections:
 * card opcional não vira mobília nem pisca estado vazio prematuro).
 *
 * Lembrete individual resolve AQUI ("Marcar como feito", otimista, com Desfazer) — não precisa
 * ir até a agenda. A linha do Radar é DIÁRIO, não conselho: só diz "prevista" (data calculada
 * pelo intervalo que a própria pessoa cadastrou); nunca manda aplicar nem cita dose.
 *
 * A montagem das linhas é a função pura `buildPendencias` (testada em PendenciasCard.test.ts).
 */

type Tone = 'primary' | 'warning' | 'secondary';
export type PendenciaKind = 'tele' | 'radar' | 'overdue' | 'overdue-group' | 'question' | 'soon';
export interface PendenciaRow {
  key: string;
  kind: PendenciaKind;
  label: string;
  chip: string;
  tone: Tone;
  to: string;
  /** Só em lembrete INDIVIDUAL (vencido ou próximo): habilita "Marcar como feito" na própria linha. */
  reminderId?: string;
}

/** Protocolo do Radar (localStorage) + aplicações registradas (servidor) — o mínimo que a linha usa. */
export interface RadarInput {
  protocol: Array<{ compoundId: string; freqDays: number }>;
  doses: Array<{ compoundId: string; takenAt: string }>;
}

const DAY_MS = 86_400_000;
const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0);
/** Diferença em dias de CALENDÁRIO (positivo = `t` cai depois de `now`). */
const calendarDays = (t: number, now: number) => Math.round((startOfDay(t) - startOfDay(now)) / DAY_MS);

/** Chip de tempo honesto: futuro granular (timeAgo só diz "em breve"), passado explícito. */
const whenChip = (iso: string, now: number): { text: string; overdue: boolean } => {
  const due = new Date(iso).getTime();
  if (isNaN(due)) return { text: '', overdue: false };
  const days = calendarDays(due, now);
  if (days < -1) return { text: `vencido há ${-days} dias`, overdue: true };
  if (days === -1) return { text: 'vencido ontem', overdue: true };
  if (days === 0) return { text: 'hoje', overdue: false };
  if (days === 1) return { text: 'amanhã', overdue: false };
  return { text: `em ${days} dias`, overdue: false };
};

export const MAX_ROWS = 4;
/** Vencido há mais que isto deixa de ser "pendência" na home: lembrete antigo nunca marcado
 *  ficava para sempre no topo (do mais velho pro mais novo) e tomava as vagas do que vem pela
 *  frente — falsa urgência (dono 24/11: "tem lembrete que já foi, aí queima"). Continua na
 *  agenda, em "Atrasados". */
export const STALE_MS = 7 * 86_400_000;
/** Teleconsulta aberta que já passou há mais que isto não é mais "próxima" (mesma janela da agenda). */
export const TELE_GRACE_MS = 2 * 60 * 60_000;
/** Aplicação prevista que passou há mais dias que isto é diário abandonado (dado velho) — fica fora. */
export const RADAR_STALE_DAYS = 7;

/**
 * Linha do Radar Hormonal (no máximo UMA). Para cada composto do protocolo com PELO MENOS UMA
 * aplicação registrada (quem só brincou com o simulador não recebe aviso): próxima prevista =
 * última aplicação + intervalo cadastrado (`doseStatus`). Entra se a prevista cai HOJE (dia de
 * calendário) ou já passou há até RADAR_STALE_DAYS dias. Vários compostos → linha agregada.
 * Texto é só "prevista": diário, não conselheiro.
 */
function radarRow(radar: RadarInput | null | undefined, now: number): PendenciaRow | null {
  if (!radar || !Array.isArray(radar.protocol) || !Array.isArray(radar.doses)) return null;
  const due: Array<{ compoundId: string; next: number; late: number }> = [];
  const seen = new Set<string>();
  for (const item of radar.protocol) {
    if (!item || typeof item.compoundId !== 'string' || seen.has(item.compoundId)) continue;
    seen.add(item.compoundId);
    const freq = Number(item.freqDays);
    if (!Number.isFinite(freq) || freq <= 0) continue;
    const taken = radar.doses
      .filter((d) => d && d.compoundId === item.compoundId)
      .map((d) => new Date(d.takenAt).getTime())
      .filter((t) => Number.isFinite(t));
    if (taken.length === 0) continue; // sem registro = simulador, não diário
    const st = doseStatus(freq, taken, now);
    if (st.next == null || !Number.isFinite(st.next)) continue;
    const late = -calendarDays(st.next, now); // 0 = hoje; N = passou N dias; negativo = ainda vai chegar
    if (late < 0 || late > RADAR_STALE_DAYS) continue;
    due.push({ compoundId: item.compoundId, next: st.next, late });
  }
  if (due.length === 0) return null;
  due.sort((a, b) => b.late - a.late || a.next - b.next); // a mais atrasada primeiro
  if (due.length > 1) {
    return { key: 'radar', kind: 'radar', label: `${due.length} aplicações previstas`, chip: 'ver diário', tone: 'secondary', to: '/radar-hormonal' };
  }
  const d = due[0];
  return {
    key: 'radar',
    kind: 'radar',
    label: `Aplicação prevista: ${compoundById(d.compoundId).short}`,
    chip: d.late === 0 ? 'hoje' : `passou ${d.late} ${d.late === 1 ? 'dia' : 'dias'}`,
    tone: 'secondary',
    to: '/radar-hormonal',
  };
}

/**
 * Monta as linhas do card (pura — sem fetch, sem relógio próprio, sem JSX).
 * Prioridade: teleconsulta imediata > aplicação prevista (Radar) > demais teleconsultas >
 * vencido recente (1 linha) > perguntas ao médico > lembretes dos próximos 7 dias. Corta em MAX_ROWS.
 */
export function buildPendencias(input: {
  reminders: any[] | null | undefined;
  questions: any[] | null | undefined;
  radar?: RadarInput | null;
  now: number;
}): PendenciaRow[] {
  const { now } = input;
  const reminders: any[] = Array.isArray(input.reminders) ? input.reminders.filter(Boolean) : [];
  const questions: any[] = Array.isArray(input.questions) ? input.questions : [];
  const ms = (r: any) => new Date(r.dueDate).getTime();
  const isTele = (r: any) => r.type === 'teleconsulta' || r.provider === 'livekit';
  const isOpen = (r: any) => !r.endedAt && !r.done;
  const routine = (r: any) => !!r.recurrence; // remédio/rotina diária tem app próprio — não é "pendência"

  // 1. Próximas teleconsultas abertas (as 2 mais próximas).
  const teles = reminders.filter((r) => isTele(r) && isOpen(r) && ms(r) >= now - TELE_GRACE_MS).sort((a, b) => ms(a) - ms(b));
  const teleNow: PendenciaRow[] = [];
  const teleLater: PendenciaRow[] = [];
  for (const r of teles.slice(0, 2)) {
    const imminent = ms(r) - now < 30 * 60_000 && ms(r) > now - 60 * 60_000;
    const row: PendenciaRow = {
      key: `tele-${r.id}`,
      kind: 'tele',
      label: r.title || 'Consulta por vídeo',
      chip: imminent ? 'agora' : whenChip(r.dueDate, now).text,
      tone: 'primary',
      to: '/consultas',
    };
    (imminent ? teleNow : teleLater).push(row);
  }

  // 2. Aplicação prevista do Radar Hormonal (0 ou 1 linha).
  const radar = radarRow(input.radar, now);

  // 3. Lembretes vencidos (não-recorrentes) e próximos 7 dias.
  const pending = reminders.filter((r) => !isTele(r) && isOpen(r) && !routine(r) && r.dueDate);
  // Só vencido RECENTE, do mais novo pro mais velho, e no máximo UMA linha (agregada se houver
  // mais) — atrasado nunca ocupa a lista inteira no lugar do que ainda vai acontecer.
  const overdueList = pending.filter((r) => ms(r) < now && ms(r) >= now - STALE_MS).sort((a, b) => ms(b) - ms(a));
  const overdue: PendenciaRow[] = overdueList.length === 0 ? [] : overdueList.length === 1
    ? [{ key: `od-${overdueList[0].id}`, kind: 'overdue', label: overdueList[0].title || 'Lembrete', chip: whenChip(overdueList[0].dueDate, now).text, tone: 'warning', to: '/lembretes', reminderId: String(overdueList[0].id) }]
    : [{ key: `od-${overdueList[0].id}`, kind: 'overdue-group', label: `${overdueList.length} lembretes atrasados`, chip: 'ver agenda', tone: 'warning', to: '/lembretes' }];
  const soon = pending
    .filter((r) => ms(r) >= now && ms(r) < now + 7 * DAY_MS)
    .sort((a, b) => ms(a) - ms(b))
    .map<PendenciaRow>((r) => ({ key: `soon-${r.id}`, kind: 'soon', label: r.title || 'Lembrete', chip: whenChip(r.dueDate, now).text, tone: 'primary', to: '/lembretes', reminderId: String(r.id) }));

  // 4. Perguntas aguardando o médico (1 linha, agregada).
  const pendingQuestions = questions.filter((q: any) => q && q.status !== 'answered').length;
  const questionRows: PendenciaRow[] = pendingQuestions > 0
    ? [{ key: 'questions', kind: 'question', label: pendingQuestions === 1 ? 'Pergunta aguardando o médico' : `${pendingQuestions} perguntas aguardando o médico`, chip: 'aguardando', tone: 'secondary', to: '/perguntas' }]
    : [];

  return [...teleNow, ...(radar ? [radar] : []), ...teleLater, ...overdue, ...questionRows, ...soon].slice(0, MAX_ROWS);
}

/** Protocolo salvo pelo Radar Hormonal neste aparelho. Qualquer problema → lista vazia (sem linha). */
function readRadarProtocol(pid: string): RadarInput['protocol'] {
  try {
    const raw = window.localStorage.getItem(`dx-radar-v2:${pid}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { protocol?: unknown } | null;
    const protocol: unknown = parsed?.protocol;
    if (!Array.isArray(protocol)) return [];
    const out: RadarInput['protocol'] = [];
    for (const p of protocol as Array<{ compoundId?: unknown; freqDays?: unknown } | null>) {
      if (p && typeof p.compoundId === 'string' && Number.isFinite(Number(p.freqDays))) {
        out.push({ compoundId: p.compoundId, freqDays: Number(p.freqDays) });
      }
    }
    return out;
  } catch {
    return [];
  }
}

const ICON: Record<PendenciaKind, React.ReactNode> = {
  tele: <VideocamRoundedIcon fontSize="small" />,
  radar: <VaccinesRoundedIcon fontSize="small" />,
  overdue: <AlarmOnRoundedIcon fontSize="small" />,
  'overdue-group': <AlarmOnRoundedIcon fontSize="small" />,
  question: <ChatBubbleOutlineRoundedIcon fontSize="small" />,
  soon: <AlarmOnRoundedIcon fontSize="small" />,
};

type Loaded = { reminders: any[]; questions: any[]; radar: RadarInput | null; now: number };
type Toast = { seq: number; text: string; undoId?: string };

export const PendenciasCard = () => {
  const [pid] = useSelectedPatient();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [data, setData] = useState<Loaded | null>(null);
  /** Lembretes marcados como feitos aqui (otimista): somem da lista antes de o servidor responder. */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [toast, setToast] = useState<Toast | null>(null);
  const inFlight = useRef<Set<string>>(new Set()); // trava de duplo envio, por lembrete
  const toastSeq = useRef(0);
  const reload = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!pid) return;
    let alive = true;
    setHidden(new Set<string>());
    const load = async () => {
      const h = { Authorization: `Bearer ${token()}` };
      const protocol = readRadarProtocol(String(pid));
      const [remRes, qRes, doseRes] = await Promise.allSettled([
        fetch(`${API_URL}/reminders?patientId=${pid}`, { headers: h }),
        fetch(`${API_URL}/doctor-questions?patientId=${pid}`, { headers: h }),
        // Só busca as aplicações de quem tem protocolo salvo; sem protocolo não há linha do Radar.
        protocol.length > 0 ? fetch(`${API_URL}/hormone-doses?patientId=${pid}`, { headers: h }) : Promise.resolve(null),
      ]);
      if (!alive) return;
      const reminders: any[] = remRes.status === 'fulfilled' && remRes.value.ok ? await remRes.value.json().catch(() => []) : [];
      const questions: any[] = qRes.status === 'fulfilled' && qRes.value.ok ? await qRes.value.json().catch(() => []) : [];
      let radar: RadarInput | null = null;
      if (doseRes.status === 'fulfilled' && doseRes.value && doseRes.value.ok) {
        const body: any = await doseRes.value.json().catch(() => null);
        if (body && Array.isArray(body.items)) radar = { protocol, doses: body.items };
      }
      if (!alive) return;
      setData({
        reminders: Array.isArray(reminders) ? reminders : [],
        questions: Array.isArray(questions) ? questions : [],
        radar,
        now: Date.now(),
      });
    };
    reload.current = () => { void load(); };
    void load();
    // Refetch leve no retorno à aba (padrão da casa p/ consultas — push chega antes da lista atualizar).
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false;
      reload.current = () => undefined;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [pid]);

  const rows = useMemo<PendenciaRow[]>(() => {
    if (!data) return [];
    return buildPendencias({ ...data, reminders: data.reminders.filter((r) => !(r && hidden.has(String(r.id)))) });
  }, [data, hidden]);

  const showToast = (text: string, undoId?: string) => { toastSeq.current += 1; setToast({ seq: toastSeq.current, text, undoId }); };
  const unhide = (id: string) => setHidden((prev) => { const n = new Set(prev); n.delete(id); return n; });
  const putDone = async (id: string, done: boolean) => {
    const r = await fetch(`${API_URL}/reminders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ done }),
    });
    if (!r.ok) throw new Error(String(r.status));
  };

  const markDone = async (id: string) => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setHidden((prev) => new Set(prev).add(id)); // otimista: a linha sai na hora e a próxima sobe
    try {
      await putDone(id, true);
      showToast('Feito.', id);
    } catch {
      unhide(id);
      showToast('Não foi possível marcar. Tente de novo.');
    } finally {
      inFlight.current.delete(id);
    }
  };

  const undo = async (id: string) => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setToast(null);
    try {
      await putDone(id, false);
      unhide(id);
      reload.current();
    } catch {
      showToast('Não foi possível desfazer. Veja na agenda.');
    } finally {
      inFlight.current.delete(id);
    }
  };

  // Aviso curto próprio (em Portal): sobrevive ao card sumir quando a última pendência é resolvida.
  const toastEl = toast ? (
    <Portal>
      <Snackbar
        key={toast.seq}
        open
        autoHideDuration={toast.undoId ? 6000 : 4000}
        onClose={(_e, reason) => { if (reason !== 'clickaway') setToast(null); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={toast.text}
        action={toast.undoId ? (
          <Button
            size="small"
            onClick={() => { if (toast.undoId) void undo(toast.undoId); }}
            sx={{ minHeight: 44, minWidth: 44, px: 1.5, color: '#5fc9c3', fontWeight: 800, textTransform: 'none' }}
          >
            Desfazer
          </Button>
        ) : undefined}
        sx={{ bottom: { xs: 'calc(88px + env(safe-area-inset-bottom, 0px))', sm: 24 } }}
      />
    </Portal>
  ) : null;

  if (rows.length === 0) return toastEl; // em dia → card some (sem mobília, sem estado vazio)

  // Soft badge da casa (alpha .12) com texto AA por modo.
  const TONE: Record<Tone, { light: string; dark: string; bgLight: string; bgDark: string }> = {
    primary: { light: '#0f766e', dark: '#5fc9c3', bgLight: 'rgba(32,178,170,.12)', bgDark: 'rgba(32,178,170,.16)' },
    warning: { light: '#b45309', dark: '#fbbf24', bgLight: 'rgba(245,158,11,.14)', bgDark: 'rgba(251,191,36,.14)' },
    secondary: { light: '#a16207', dark: '#e0bc97', bgLight: 'rgba(212,165,116,.18)', bgDark: 'rgba(212,165,116,.16)' },
  };
  const focusRing = { outline: '2px solid', outlineColor: isDark ? '#5fc9c3' : '#178f89', outlineOffset: 2 };

  return (
    <>
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
            const tint = isDark ? t.dark : t.light;
            const reminderId = r.reminderId;
            return (
              <Stack key={r.key} direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                <Stack
                  component="button"
                  type="button"
                  onClick={() => navigate(r.to)}
                  aria-label={`${r.label} — ${r.chip}`}
                  direction="row"
                  alignItems="center"
                  spacing={1.25}
                  sx={{
                    flex: 1, minWidth: 0, p: 1.25, minHeight: 48, cursor: 'pointer', textAlign: 'left',
                    bgcolor: 'transparent', border: 'none', borderRadius: '12px', fontFamily: 'inherit',
                    transition: 'background-color .15s ease',
                    '&:hover': { bgcolor: isDark ? 'rgba(32,178,170,.08)' : 'rgba(32,178,170,.06)' },
                    '&:active': { bgcolor: isDark ? 'rgba(32,178,170,.14)' : 'rgba(32,178,170,.10)' },
                    '&:focus-visible': focusRing,
                  }}
                >
                  <Box aria-hidden sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '10px', flexShrink: 0, bgcolor: isDark ? t.bgDark : t.bgLight, color: tint }}>
                    {ICON[r.kind]}
                  </Box>
                  {reminderId ? (
                    // Com a ação à direita, o chip desce para a 2ª linha: sobra largura pro título a 320px.
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}>
                        {r.label}
                      </Typography>
                      <Typography noWrap sx={{ fontSize: 12, fontWeight: 700, color: tint }}>
                        {r.chip}
                      </Typography>
                    </Box>
                  ) : (
                    <>
                      <Typography noWrap sx={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'text.primary', minWidth: 0 }}>
                        {r.label}
                      </Typography>
                      <Typography component="span" noWrap sx={{ fontSize: 12, fontWeight: 700, flexShrink: 0, color: tint }}>
                        {r.chip}
                      </Typography>
                      <ArrowForwardRoundedIcon aria-hidden sx={{ fontSize: 15, color: 'text.disabled', flexShrink: 0 }} />
                    </>
                  )}
                </Stack>
                {reminderId ? (
                  <IconButton
                    aria-label={`Marcar ${r.label} como feito`}
                    title="Marcar como feito"
                    onClick={() => { void markDone(reminderId); }}
                    sx={{
                      width: 44, height: 44, flexShrink: 0, color: isDark ? '#5fc9c3' : '#178f89',
                      '&:hover': { bgcolor: isDark ? 'rgba(32,178,170,.14)' : 'rgba(32,178,170,.10)' },
                      '&:focus-visible': focusRing,
                    }}
                  >
                    <CheckCircleOutlineRoundedIcon />
                  </IconButton>
                ) : null}
              </Stack>
            );
          })}
        </Stack>
      </AppCard>
      {toastEl}
    </>
  );
};
