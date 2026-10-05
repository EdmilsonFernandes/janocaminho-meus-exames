import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Chip, Stack, Typography, IconButton, Box, Card, CardContent, LinearProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BoltIcon from '@mui/icons-material/Bolt';
import { DrExame } from './DrExame';
import { claimColdDialog } from '../utils/coldDialog';
import { celebrateCredits } from './CreditRewardFx';
import { API_URL, token } from '../config';
import { tealText } from '../theme';

/** Quiz-first onboarding (licença Mito): "o que você quer entender?" ANTES do upload —
 *  personaliza a primeira experiência com valor instantâneo. 1x por dispositivo.
 *  Resposta fica em localStorage (preferência de UI, não dado clínico — NÃO vai pro
 *  clinicalProfile, que alimenta prompts de IA). Pular salva lista vazia = nunca mais pergunta.
 *
 *  RESUMÍVEL (05/10, padrão de engagement premium): 3 perguntas com participação
 *  persistida no server (QuizParticipation) — o card do dashboard ANUNCIA os metadados
 *  antes de entrar ("~X · N perguntas · +Y créditos") e, se o usuário abandona no meio,
 *  retoma de onde parou com barra de progresso %. A recompensa (POST /billing/quiz-reward)
 *  só cai com participação COMPLETA (completedAt). */
const KEY = 'dxGoals';
const EXTRA_KEY = 'dxQuizExtra';
/** Versiona o CONTEÚDO do quiz (perguntas novas = id novo, participação recomeça). */
export const QUIZ_ID = 'onboarding-2026-10';

export const GOALS = [
  { id: 'entender', emoji: '🧬', label: 'Entender o que meus exames significam' },
  { id: 'tendencia', emoji: '📈', label: 'Acompanhar a evolução ao longo do tempo' },
  { id: 'alterados', emoji: '⚠️', label: 'Ficar de olho em valores alterados' },
  { id: 'familia', emoji: '👨‍👩‍👧', label: 'Cuidar da saúde de um familiar' },
  { id: 'consulta', emoji: '🩺', label: 'Chegar na consulta com perguntas prontas' },
  { id: 'prevencao', emoji: '🛡️', label: 'Prevenção e longevidade' },
] as const;

export type GoalId = (typeof GOALS)[number]['id'];

/** Perguntas 2-3: preferências de UI (mesma política do KEY — nada clínico). */
const FREQUENCY = [
  { id: 'primeira', emoji: '🌱', label: 'É minha primeira vez com exames' },
  { id: 'anual', emoji: '📅', label: '1 a 2 por ano' },
  { id: 'semestral', emoji: '🔁', label: 'A cada 6 meses' },
  { id: 'constante', emoji: '🧪', label: 'Mais de 4 por ano' },
] as const;
const WHO = [
  { id: 'eu', emoji: '🙋', label: 'Só eu' },
  { id: 'familia', emoji: '🏡', label: 'Eu e minha família' },
] as const;

/** Metadados anunciados no card ANTES de entrar (padrão premium: o usuário sabe o
 *  compromisso — tempo, tamanho, recompensa — antes de investir uma tap). */
export const QUIZ_QUESTION_COUNT = 3;
const EST_SECONDS = QUIZ_QUESTION_COUNT * 10; // ~10s por pergunta
export const quizEstimateLabel = () => (EST_SECONDS < 60 ? `~${EST_SECONDS}s` : `~${Math.ceil(EST_SECONDS / 60)}min`);

/** Lidas no Dashboard pra personalizar o estado vazio. */
export const getGoals = (): GoalId[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((g) => GOALS.some((o) => o.id === g)) : [];
  } catch { return []; }
};

/** Linha do hero p/ 1º exame conforme o objetivo principal (vazio → copy padrão). */
export const goalSubtitle = (goals: GoalId[]): string | null => {
  switch (goals[0]) {
    case 'entender': return 'Você quer entender seus exames — envie o primeiro laudo e a IA explica cada valor em português simples.';
    case 'tendencia': return 'Cada exame enviado deixa sua evolução mais precisa — comece com o laudo mais recente.';
    case 'alterados': return 'Envie seu exame mais recente e o app destaca na hora o que está fora da faixa.';
    case 'familia': return 'Envie um exame do familiar e cadastre o perfil dele na Família — cada um com histórico próprio.';
    case 'consulta': return 'A partir do seu exame, o app monta as perguntas certas pra levar na consulta.';
    case 'prevencao': return 'Exames + idade biológica + risco cardiometabólico: tudo começa com o primeiro laudo.';
    default: return null;
  }
};

// ───────────────────────── participation (server) ─────────────────────────

interface ServerParticipation {
  quizId: string;
  currentIndex: number;
  answers: Record<string, unknown>;
  completedAt: string | null;
}

/** Busca a participação salva (retomada) + a recompensa corrente. Offline/falha → null. */
async function fetchQuizState(): Promise<{ participation: ServerParticipation | null; reward: number } | null> {
  try {
    const r = await fetch(`${API_URL}/billing/quiz-state`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/** Grava uma resposta no server (fire-and-forget: offline não trava o quiz no device). */
function postAnswer(index: number, answer: unknown) {
  return fetch(`${API_URL}/billing/quiz-answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: JSON.stringify({ quizId: QUIZ_ID, index, answer, total: QUIZ_QUESTION_COUNT }),
  }).catch(() => undefined);
}

/** Recompensa: só o server completa (completedAt) credita. Falha de rede = silenciosa. */
async function claimReward() {
  try {
    const r = await fetch(`${API_URL}/billing/quiz-reward`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
    const d = r.ok ? await r.json() : null;
    if (d?.ok && d.amount > 0) celebrateCredits(d.amount); // pill + confetti + chip atualiza
  } catch { /* silencioso */ }
}

// ───────────────────────── dialog (3 perguntas, retomável) ─────────────────────────

/** Caixa de pergunta reutilizável (multi = goals, single = demais). */
const OptionGrid = ({ options, selected, onToggle }: {
  options: readonly { id: string; emoji: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) => (
  <Stack sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1, pt: 0.5 }}>
    {options.map((g) => {
      const on = selected.includes(g.id);
      return (
        <Chip
          key={g.id}
          label={`${g.emoji}  ${g.label}`}
          onClick={() => onToggle(g.id)}
          sx={{
            justifyContent: 'flex-start',
            borderRadius: '12px',
            height: 44,
            fontSize: 15,
            fontWeight: on ? 800 : 600,
            border: '1.5px solid',
            borderColor: on ? '#20b2aa' : 'divider',
            bgcolor: on ? 'rgba(32,178,170,.12)' : 'background.default',
            color: 'text.primary',
            '& .MuiChip-label': { whiteSpace: 'normal' },
          }}
        />
      );
    })}
  </Stack>
);

/** Fluxo do quiz: 1 pergunta por passo, LinearProgress %, retoma de onde parou.
 *  Fechar no meio = PAUSA (onClose(false, índiceAtual) — participação fica no server;
 *  volta pelo card ou no próximo cold-open). "Pular"/concluir = onClose(true). */
export const GoalQuizDialog = ({ open, onClose, startIndex = 0, priorAnswers = {} }: {
  open: boolean;
  onClose: (finishedOrSkipped: boolean, reachedIndex?: number) => void;
  startIndex?: number;
  priorAnswers?: Record<string, unknown>;
}) => {
  const [step, setStep] = useState(startIndex);
  const [answers, setAnswers] = useState<Record<number, unknown>>(() => {
    const out: Record<number, unknown> = {};
    for (const [k, v] of Object.entries(priorAnswers)) out[Number(k)] = v;
    return out;
  });

  const pct = Math.min(100, Math.round((step / QUIZ_QUESTION_COUNT) * 100));

  const question = (() => {
    if (step === 0) return { title: 'O que você quer entender?', sub: 'Isso personaliza o app pra você', options: GOALS, multi: true };
    if (step === 1) return { title: 'Com que frequência você faz exames?', sub: 'Pra calibrar o que mostramos primeiro', options: FREQUENCY, multi: false };
    return { title: 'Quem vai usar o app?', sub: 'Cada pessoa tem histórico próprio', options: WHO, multi: false };
  })();
  const current = Array.isArray(answers[step]) ? (answers[step] as string[]) : (answers[step] != null ? [String(answers[step])] : []);
  const canAdvance = question.multi ? current.length > 0 : current.length === 1;

  /** Confirma a resposta do passo atual; última pergunta → grava local + recompensa. */
  const advance = async () => {
    const answer = question.multi ? current : current[0];
    const next = { ...answers, [step]: answer };
    setAnswers(next);
    if (step < QUIZ_QUESTION_COUNT - 1) {
      setStep(step + 1);
      postAnswer(step, answer); // fire-and-forget: retomada usa o server quando dá
      return;
    }
    // Última pergunta: grava ANTES de pedir recompensa (o server só paga completo).
    await postAnswer(step, answer);
    try {
      localStorage.setItem(KEY, JSON.stringify(Array.isArray(next[0]) ? next[0] : []));
      localStorage.setItem(EXTRA_KEY, JSON.stringify({ frequency: next[1] ?? null, who: next[2] ?? null }));
    } catch { /* ignore */ }
    onClose(true);
    if (token()) claimReward();
  };

  const skip = () => {
    try { localStorage.setItem(KEY, JSON.stringify([])); } catch { /* ignore */ }
    onClose(true);
  };

  return (
    <Dialog open={open} onClose={() => onClose(false, step)} PaperProps={{ sx: { borderRadius: '16px', maxWidth: 440, width: '100%' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 1, pb: 1 }}>
        <DrExame size={40} sx={{ borderRadius: '28%' }} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 19, color: 'text.primary' }}>
            {question.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">{question.sub} · pergunta {step + 1} de {QUIZ_QUESTION_COUNT}</Typography>
        </Box>
        <IconButton size="small" onClick={() => onClose(false, step)} aria-label="Fechar"><CloseIcon /></IconButton>
      </DialogTitle>
      {/* Progresso % do quiz (retomável): o usuário sempre sabe quanto falta. */}
      <Box sx={{ px: 3 }}>
        <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(32,178,170,.12)', '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#20b2aa,#178f89)' } }} />
      </Box>
      <DialogContent sx={{ pt: 1.5 }}>
        <OptionGrid
          options={question.options}
          selected={current}
          onToggle={(id) => setAnswers((a) => {
            const sel = Array.isArray(a[step]) ? [...(a[step] as string[])] : (a[step] != null ? [String(a[step])] : []);
            if (question.multi) {
              const i = sel.indexOf(id);
              return { ...a, [step]: i >= 0 ? sel.filter((x) => x !== id) : [...sel, id] };
            }
            return { ...a, [step]: [id] };
          })}
        />
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', gap: 1, px: 3, pb: 2.5 }}>
        {step > 0 ? (
          <Button onClick={() => setStep(step - 1)} variant="text" startIcon={<ArrowBackIcon />} sx={{ textTransform: 'none' }}>Voltar</Button>
        ) : (
          <Button onClick={skip} variant="text" sx={{ textTransform: 'none' }}>Pular</Button>
        )}
        <Button
          onClick={advance} disabled={!canAdvance} endIcon={<ArrowForwardIcon />}
          variant="contained" sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}
        >
          {step === QUIZ_QUESTION_COUNT - 1 ? 'Finalizar' : 'Continuar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ───────────────────────── card de entrada (dashboard) ─────────────────────────

/** Card que ANUNCIA o quiz antes de entrar: "~30s · 3 perguntas · +Y créditos" +
 *  progresso da retomada. Sem segredos: compromisso claro antes do tap (premium). */
export const GoalQuizCard = () => {
  const [hide, setHide] = useState(() => {
    try { return !!localStorage.getItem(KEY); } catch { return true; }
  });
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ currentIndex: number; answers: Record<string, unknown> } | null>(null);
  const [reward, setReward] = useState<number | null>(null);

  useEffect(() => {
    if (!token() || hide) return;
    let cancelled = false;
    fetchQuizState().then((d) => {
      if (cancelled || !d) return;
      if (d.participation?.completedAt) {
        // Completa no server mas sem marker local (outro device) → sela local e some.
        try { localStorage.setItem(KEY, JSON.stringify(Array.isArray(d.participation.answers?.['0']) ? d.participation.answers['0'] : [])); } catch { /* ignore */ }
        setHide(true);
        return;
      }
      setState({ currentIndex: d.participation?.currentIndex ?? 0, answers: d.participation?.answers ?? {} });
      setReward(Number(d.reward) || 0);
    });
    return () => { cancelled = true; };
  }, [hide]);

  if (hide || !token() || !state) return null;
  const pct = Math.min(100, Math.round((state.currentIndex / QUIZ_QUESTION_COUNT) * 100));
  const resuming = state.currentIndex > 0;

  return (
    <>
      <Card elevation={0} sx={{ mt: 2, borderRadius: '16px', border: '1px solid', borderColor: 'divider', background: 'rgba(32,178,170,0.05)' }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <DrExame size={44} sx={{ borderRadius: '28%' }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 16, color: 'text.primary' }}>
                {resuming ? 'Continue seu quiz de boas-vindas' : 'Personalize o app em 30 segundos'}
              </Typography>
              {/* Metadados ANUNCIADOS antes de entrar: tempo · tamanho · recompensa. */}
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                <Chip size="small" label={quizEstimateLabel()} sx={{ height: 24, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode) }} />
                <Chip size="small" label={`${QUIZ_QUESTION_COUNT} perguntas`} sx={{ height: 24, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode) }} />
                {reward != null && reward > 0 && (
                  <Chip size="small" icon={<BoltIcon sx={{ fontSize: 15 }} />} label={`+${reward} créditos`} sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(212,165,116,.15)', color: (t) => tealText(t.palette.mode), '& .MuiChip-icon': { color: (t) => tealText(t.palette.mode) } }} />
                )}
              </Stack>
            </Box>
          </Stack>
          {resuming && (
            <Box sx={{ mt: 1.5 }}>
              <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(32,178,170,.12)', '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#20b2aa,#178f89)' } }} />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{pct}% completo · {QUIZ_QUESTION_COUNT - state.currentIndex} falta{QUIZ_QUESTION_COUNT - state.currentIndex > 1 ? 'm' : ''}</Typography>
            </Box>
          )}
          <Button
            fullWidth variant="contained" endIcon={<ArrowForwardIcon />}
            onClick={() => setOpen(true)}
            sx={{ mt: 1.5, borderRadius: '12px', textTransform: 'none', fontWeight: 800, background: 'linear-gradient(135deg,#20b2aa,#178f89)' }}
          >
            {resuming ? `Continuar (${state.currentIndex}/${QUIZ_QUESTION_COUNT})` : 'Começar'}
          </Button>
        </CardContent>
      </Card>
      {open && (
        <GoalQuizDialog
          open={open}
          startIndex={Math.min(state.currentIndex, QUIZ_QUESTION_COUNT - 1)}
          priorAnswers={state.answers}
          onClose={(done, reachedIndex) => {
            setOpen(false);
            if (done) { setHide(true); return; }
            // Pausa: atualiza o progresso local com o índice que o diálogo alcançou
            // (o server pode não ter a última resposta — offline — então MAX local).
            setState((s) => (s ? { ...s, currentIndex: Math.max(s.currentIndex, reachedIndex ?? s.currentIndex) } : s));
          }}
        />
      )}
    </>
  );
};

/** Cold-open global (App.tsx): 1º login ainda abre o quiz sozinho — mas agora RETOMA
 *  o índice salvo. Fechar no meio = pausa (o card do dashboard oferece continuar).
 *  Mesma bateria anti-cascata (espera outros dialogs + claimColdDialog). */
export const GoalQuiz = () => {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ currentIndex: number; answers: Record<string, unknown> } | null>(null);

  useEffect(() => {
    let done = false;
    try { if (localStorage.getItem(KEY)) return; } catch { return; }
    // Espera tour/perfil/notificação fecharem (todos são .MuiDialog-root) pra não empilhar
    // modais no 1º login. Se em 30s não deu, desiste sem marcar (pergunta no próximo boot).
    const iv = setInterval(() => {
      if (done) return;
      if (document.querySelector('.MuiDialog-root')) return;
      done = true;
      clearInterval(iv);
      // Máx 1 diálogo de cold-load por SESSÃO (P1 bateria 2026-09): se WhatsNew/notificação
      // já abriram nesta sessão, o quiz fica pro card do dashboard (nova rota de entrada).
      if (!claimColdDialog('quiz')) return;
      fetchQuizState().then((d) => {
        if (d?.participation?.completedAt) {
          // Completa em outro device: sela local e encerra sem abrir.
          try { localStorage.setItem(KEY, JSON.stringify(Array.isArray(d.participation.answers?.['0']) ? d.participation.answers['0'] : [])); } catch { /* ignore */ }
          return;
        }
        setState({ currentIndex: d?.participation?.currentIndex ?? 0, answers: d?.participation?.answers ?? {} });
        setOpen(true);
      });
    }, 1200);
    const kill = setTimeout(() => { done = true; clearInterval(iv); }, 30000);
    return () => { done = true; clearInterval(iv); clearTimeout(kill); };
  }, []);

  if (!open || !state) return null;
  return (
    <GoalQuizDialog
      open={open}
      startIndex={Math.min(state.currentIndex, QUIZ_QUESTION_COUNT - 1)}
      priorAnswers={state.answers}
      onClose={() => setOpen(false) /* pausa: nada selado — o card do dashboard oferece continuar */}
    />
  );
};
