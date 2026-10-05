import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotify } from 'react-admin';
import { Box, Button, Chip, CircularProgress, Link, Stack, Typography } from '@mui/material';
import PsychologyIcon from '@mui/icons-material/Psychology';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import FavoriteIcon from '@mui/icons-material/Favorite';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { AppCard } from '../components/AppCard';
import { Celebration } from '../components/Celebration';
import { SEM, tealText } from '../theme';
import { deltaEntre, deltaLabel, proximaJanela, diasAteJanela } from '../utils/mental-delta';
import { SeverityBar } from '../components/mental/SeverityBar';
import HistoryIcon from '@mui/icons-material/History';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  SCREENING_OPTIONS, screeningItems, maxScoreOf,
  type ScreeningType, type ScreeningSeverity,
} from '@meus-exames/shared';

/**
 * Saúde mental — rastreamento PHQ-9 (depressão) e GAD-7 (ansiedade), PT-BR validado
 * (domínio público). GRATUITO (sem créditos). A pontuação é SEMPRE recalculada pelo
 * server; a tela só envia as respostas 0-3.
 *
 * ÉTICO/CRÍTICO: qualquer resposta > 0 no item 9 do PHQ-9 (pensamento de autolesa)
 * exibe o bloco de ACOLHIMENTO (F3) logo acima do disclaimer: teal da marca com borda
 * suave, CVV 188 (ligar/chat), SAMU 192 e rede de apoio — presença, não pânico.
 *
 * Gotchas respeitados: hooks ANTES de qualquer return (#310); X-Offline-Empty tratado
 * como erro amigável; NUNCA reload/navigate(0); Recharts SEM ReferenceArea (descarta
 * silenciosamente) — corte de faixa via ReferenceLine.
 */

interface Row { id: string; type: ScreeningType; total: number; answers: number[]; severity: { key: ScreeningSeverity; label: string }; suicidalIdeation: boolean; createdAt: string }

const REDUCED_MOTION = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

/** Faixa → tom do design system (mode-aware): mínima=verde, leve/moderada=âmbar, resto=vermelho. */
const SEV_TONE: Record<ScreeningSeverity, 'ok' | 'warn' | 'bad'> = {
  minima: 'ok', leve: 'warn', moderada: 'warn', moderadamente_grave: 'bad', grave: 'bad',
};
const sevColor = (key: ScreeningSeverity) => (mode: 'light' | 'dark') => SEM[SEV_TONE[key]][mode];

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const INST: Record<ScreeningType, { title: string; code: string; desc: string; n: number }> = {
  phq9: { title: 'Humor', code: 'PHQ-9', desc: 'Rastreia sinais de depressão: interesse, energia, sono, apetite, concentração.', n: 9 },
  gad7: { title: 'Ansiedade', code: 'GAD-7', desc: 'Rastreia sinais de ansiedade: nervosismo, preocupação, tensão, irritabilidade.', n: 7 },
};

/** Entrada suave por pergunta (re-dispara a cada `key` nova). */
const qFade = {
  '@keyframes smIn': { from: { opacity: 0, transform: 'translateX(12px)' }, to: { opacity: 1, transform: 'none' } },
  animation: REDUCED_MOTION ? 'none' : 'smIn .28s cubic-bezier(.22,1,.36,1) both',
};

export const SaudeMentalPage = () => {
  const navigate = useNavigate();
  const notify = useNotify();
  const [pid] = useSelectedPatient();
  const [type, setType] = useState<ScreeningType>('phq9');
  const [phase, setPhase] = useState<'intro' | 'quiz' | 'result'>('intro');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [history, setHistory] = useState<Row[]>([]);
  const [offline, setOffline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Row | null>(null);
  // Valor tocado na pergunta atual durante o feedback (220ms) — trava toques duplos e
  // mostra a seleção ANTES de avançar (sem isso parecia que nada aconteceu).
  const [picked, setPicked] = useState<number | null>(null);
  // G1 — o "momento" da 1ª conclusão (sem sinal grave). Instrumentos já concluídos
  // NESTA sessão (refazer não relembra) + gate de 1ª vez na vida (histórico vazio p/ tipo).
  const [firstMoment, setFirstMoment] = useState(false);
  const doneTypesRef = useRef<Set<ScreeningType>>(new Set());

  const [histLoaded, setHistLoaded] = useState(false);
  const load = useCallback(async () => {
    if (!pid) return;
    setOffline(false);
    try {
      const r = await fetch(`${API_URL}/patients/${pid}/mental-screenings`, { headers: { Authorization: `Bearer ${token()}` } });
      // fetch-cache devolve 200-VAZIO com X-Offline-Empty quando offline sem cache —
      // histórico crítico: tratar como erro amigável, não como "você nunca respondeu".
      if (r.headers.get('X-Offline-Empty') === 'true') { setOffline(true); return; }
      if (r.ok) setHistory(await r.json());
    } catch { setOffline(true); }
    finally { setHistLoaded(true); }
  }, [pid]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pid]);

  const items = screeningItems(type);
  const latest = useMemo(() => ({
    phq9: [...history].reverse().find((h) => h.type === 'phq9') ?? null,
    gad7: [...history].reverse().find((h) => h.type === 'gad7') ?? null,
  }), [history]);

  // Gráfico: uma linha por instrumento no eixo de tempo (dedup por dia, mais recente).
  const chartData = useMemo(() => {
    const byDay = new Map<string, { date: string; phq9?: number; gad7?: number }>();
    for (const h of history) {
      const key = String(h.createdAt).slice(0, 10);
      const row = byDay.get(key) ?? { date: fmtDay(h.createdAt) };
      if (h.type === 'phq9') row.phq9 = h.total; else row.gad7 = h.total;
      byDay.set(key, row);
    }
    return [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [history]);

  const startQuiz = (t: ScreeningType) => {
    setType(t); setAnswers([]); setStep(0); setResult(null); setPicked(null); setPhase('quiz');
    window.scrollTo?.({ top: 0, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
  };

  // 05/10 (bug do dono: "o botão fica pressionado na pergunta anterior"): as opções
  // eram o MESMO elemento entre perguntas → foco/hover/ripple do toque ficavam na opção
  // seguinte. Agora: blur + lista remontada por pergunta (key) + feedback curto travado.
  const answer = (value: number) => {
    if (saving || picked !== null) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    const next = [...answers]; next[step] = value;
    setAnswers(next);
    setPicked(value);
    setTimeout(() => { setPicked(null); void advance(next); }, REDUCED_MOTION ? 0 : 220);
  };

  const advance = async (next: number[]) => {
    if (step + 1 < items.length) { setStep(step + 1); return; }
    // Último item → salva (total server-side) e mostra o resultado.
    if (!pid || saving) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/patients/${pid}/mental-screenings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ type, answers: next.slice(0, items.length) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'Erro ao salvar');
      const saved = d as Row;
      // G1 — Celebration SÓ na 1ª conclusão do instrumento (sessão E na vida: histórico
      // prévio vazio p/ o tipo), score < 15 e SEM ideação de autolesa (bloco de
      // acolhimento sempre ganha; celebrar perto dele seria desumano). histLoaded evita a race do
      // "histórico ainda não carregou": sem certeza, NÃO celebra (erro pro lado seguro).
      const isFirst = histLoaded && !offline && !doneTypesRef.current.has(type) && !history.some((h) => h.type === type);
      doneTypesRef.current.add(type);
      setFirstMoment(isFirst && saved.total < 15 && !saved.suicidalIdeation);
      setResult(saved);
      setPhase('result');
      load(); // histórico atualiza atrás (sem reload — APK crasha)
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : 'Erro ao salvar', { type: 'error' });
    } finally { setSaving(false); }
  };

  const back = () => {
    // Voltar PRESERVA as respostas (antes apagava → a anterior aparecia desmarcada).
    if (phase === 'quiz' && step > 0) { setStep(step - 1); return; }
    setPhase('intro'); setStep(0); setAnswers([]); setResult(null);
  };

  const crisis = type === 'phq9' && (result?.suicidalIdeation || answers[8] > 0);

  // G3 — registro anterior do MESMO instrumento p/ o chip de delta ("↓4 desde setembro").
  // O load() pós-save é assíncrono: trata os dois estados (histórico já contém o resultado
  // novo → anterior é o penúltimo; ainda não contém → anterior é o último).
  const prevOfSame = useMemo(() => {
    if (!result) return null;
    const rows = history.filter((h) => h.type === result.type);
    const last = rows[rows.length - 1];
    if (!last) return null;
    if (last.id === result.id) return rows.length >= 2 ? rows[rows.length - 2] : null;
    return last;
  }, [history, result]);

  return (
    <PageContainer width="content" sx={{ pb: { xs: 10, sm: 5 } }}>
      <PageHeader
        icon={<PsychologyIcon />}
        title="Saúde mental"
        subtitle="PHQ-9 e GAD-7 — questionários validados, 2 minutos cada"
      />

      {offline && (
        <AppCard kind="accent" tone="warning" sx={{ mb: 2, p: 2 }}>
          <Typography sx={{ fontSize: 13 }}>Você está sem conexão — o histórico aparece quando voltar online. Seu rastreamento novo é salvo assim que a conexão voltar.</Typography>
        </AppCard>
      )}

      {/* INTRO — retrato por instrumento (régua + delta + janela) + histórico + apoio.
          05/10: o card NÃO inicia o quiz ao toque (dono: "clica e abre a pergunta de novo");
          refazer é sempre um botão explícito. */}
      {phase === 'intro' && (
        <>
          {!pid ? (
            <AppCard sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">Selecione um paciente para responder o rastreamento.</Typography>
            </AppCard>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mb: 2 }}>
              {(['phq9', 'gad7'] as const).map((t) => {
                const last = t === 'phq9' ? latest.phq9 : latest.gad7;
                const rows = history.filter((h) => h.type === t);
                const prev = rows.length >= 2 ? rows[rows.length - 2] : null;
                const delta = last && prev ? deltaEntre(prev.total, last.total) : null;
                const dTone = delta ? (delta.tone === 'good' ? 'ok' : delta.tone === 'warn' ? 'warn' : null) : null;
                const dias = last ? diasAteJanela(last.createdAt) : 0;
                const due = !last || dias <= 0;
                const meta = INST[t];
                return (
                  <AppCard key={t} sx={{ p: 2.25, display: 'flex', flexDirection: 'column' }}>
                    <Stack direction="row" alignItems="center" spacing={1.25}>
                      <Box sx={{ width: 38, height: 38, borderRadius: '11px', display: 'grid', placeItems: 'center', flexShrink: 0,
                        background: t === 'phq9' ? 'linear-gradient(135deg,rgba(32,178,170,.18),rgba(32,178,170,.06))' : 'linear-gradient(135deg,rgba(212,165,116,.22),rgba(212,165,116,.07))' }}>
                        <PsychologyIcon sx={{ fontSize: 21, color: t === 'phq9' ? '#20b2aa' : '#c08a4f' }} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 15.5, lineHeight: 1.2 }}>{meta.title}</Typography>
                        <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>{meta.code} · {meta.n} perguntas · 2 min</Typography>
                      </Box>
                      {last && (
                        <Chip size="small" label={due ? 'Pode refazer' : `Em ${dias} ${dias === 1 ? 'dia' : 'dias'}`}
                          sx={{ height: 22, fontSize: 11, fontWeight: 800,
                            bgcolor: due ? 'rgba(32,178,170,.14)' : 'action.hover',
                            color: due ? (th) => tealText(th.palette.mode) : 'text.secondary' }} />
                      )}
                    </Stack>

                    {last ? (
                      <>
                        <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap rowGap={0.5}>
                          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 34, lineHeight: 1, letterSpacing: '-0.02em', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: (th) => sevColor(last.severity.key)(th.palette.mode) }}>{last.total}</Typography>
                          <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 600 }}>/{maxScoreOf(t)}</Typography>
                          <Chip size="small" label={last.severity.label} sx={{ ml: 0.5, height: 22, fontWeight: 800, textTransform: 'capitalize', bgcolor: (th) => `${sevColor(last.severity.key)(th.palette.mode)}1f`, color: (th) => sevColor(last.severity.key)(th.palette.mode) }} />
                          {delta && prev && (
                            <Chip size="small" label={deltaLabel(delta, prev.createdAt)} sx={{ height: 22, fontSize: 11.5, fontWeight: 800,
                              ...(dTone ? { bgcolor: (th) => `${SEM[dTone][th.palette.mode]}1f`, color: (th) => SEM[dTone][th.palette.mode] } : { bgcolor: 'action.selected', color: 'text.secondary' }) }} />
                          )}
                        </Stack>
                        <Box sx={{ mt: 1.5 }}><SeverityBar type={t} score={last.total} /></Box>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1.25 }}>
                          Respondido em {fmtDay(last.createdAt)} · próxima janela <strong>{proximaJanela(last.createdAt)}</strong>
                        </Typography>
                        <Box sx={{ flex: 1 }} />
                        <Button fullWidth variant={due ? 'contained' : 'outlined'} onClick={() => startQuiz(t)}
                          sx={{ mt: 1.75, textTransform: 'none', fontWeight: 700, borderRadius: '12px' }}>
                          {due ? 'Refazer agora' : 'Refazer antes da janela'}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 1.5, lineHeight: 1.5 }}>{meta.desc}</Typography>
                        <Box sx={{ flex: 1 }} />
                        <Button fullWidth variant="contained" onClick={() => startQuiz(t)} sx={{ mt: 2, textTransform: 'none', fontWeight: 700, borderRadius: '12px' }}>Responder agora</Button>
                      </>
                    )}
                  </AppCard>
                );
              })}
            </Box>
          )}

          {chartData.length >= 2 && (
            <AppCard sx={{ p: 2.5, mb: 2 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                <Typography sx={{ fontWeight: 800 }}>Evolução dos scores</Typography>
                <Stack direction="row" spacing={1.5}>
                  {[['Humor', '#20b2aa'], ['Ansiedade', '#d4a574']].map(([l, c]) => (
                    <Stack key={l} direction="row" spacing={0.5} alignItems="center">
                      <Box sx={{ width: 10, height: 3, borderRadius: 2, bgcolor: c }} />
                      <Typography sx={{ fontSize: 11.5, color: 'text.secondary', fontWeight: 600 }}>{l}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Stack>
              <Box sx={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="rgba(148,163,184,.6)" />
                    <YAxis domain={[0, 27]} tick={{ fontSize: 12 }} stroke="rgba(148,163,184,.6)" allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    {/* Corte "moderada" (≥10 nos dois instrumentos) — ReferenceLine, NÃO ReferenceArea. */}
                    <ReferenceLine y={10} stroke="rgba(245,158,11,.5)" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="phq9" name="PHQ-9" stroke="#20b2aa" strokeWidth={2.5} connectNulls dot={{ r: 2.5, fill: '#20b2aa', strokeWidth: 0 }} isAnimationActive={!REDUCED_MOTION} animationDuration={700} />
                    <Line type="monotone" dataKey="gad7" name="GAD-7" stroke="#d4a574" strokeWidth={2.5} connectNulls dot={{ r: 2.5, fill: '#d4a574', strokeWidth: 0 }} isAnimationActive={!REDUCED_MOTION} animationDuration={700} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
              <Typography variant="caption" color="text.secondary">Linha tracejada = limite da faixa moderada (10). Scores menores são melhores.</Typography>
            </AppCard>
          )}

          {history.length > 0 && (
            <AppCard sx={{ p: 2.5, mb: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <HistoryIcon sx={{ fontSize: 19, color: 'text.secondary' }} />
                <Typography sx={{ fontWeight: 800 }}>Histórico</Typography>
              </Stack>
              {[...history].reverse().slice(0, 8).map((h, i) => (
                <Stack key={h.id} direction="row" alignItems="center" spacing={1.25}
                  sx={{ py: 1, borderTop: i ? '1px solid' : 'none', borderColor: 'divider' }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: (th) => sevColor(h.severity.key)(th.palette.mode) }} />
                  <Typography sx={{ fontSize: 13.5, fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
                    {INST[h.type].title} <Box component="span" sx={{ color: 'text.disabled', fontWeight: 500 }}>· {INST[h.type].code}</Box>
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: 'text.secondary', textTransform: 'capitalize', display: { xs: 'none', sm: 'block' } }}>{h.severity.label}</Typography>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', minWidth: 44, textAlign: 'right' }}>{h.total}/{maxScoreOf(h.type)}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.disabled', minWidth: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtDay(h.createdAt)}</Typography>
                </Stack>
              ))}
            </AppCard>
          )}

          {/* Como funciona + apoio SEMPRE visível (não só quando o item 9 dispara). */}
          <AppCard sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <InfoOutlinedIcon sx={{ fontSize: 19, color: 'text.secondary' }} />
              <Typography sx={{ fontWeight: 800 }}>Como funciona</Typography>
            </Stack>
            <Box component="ul" sx={{ m: 0, pl: 2.25, fontSize: 13, color: 'text.secondary', lineHeight: 1.75 }}>
              <li>Questionários validados no Brasil, usados por médicos no mundo todo.</li>
              <li>Cada resposta vale 0 a 3 pontos — <strong>quanto menor o score, melhor</strong>.</li>
              <li>Refaça a cada 2 semanas para acompanhar a tendência, não um dia isolado.</li>
              <li>É rastreamento, não diagnóstico. Grátis e privado.</li>
            </Box>
            <Link href="tel:188" underline="none" sx={{
              mt: 1.75, display: 'flex', alignItems: 'center', gap: 1, minHeight: 44, px: 1.5, borderRadius: '12px',
              bgcolor: 'rgba(32,178,170,.08)', border: '1px solid rgba(32,178,170,.25)',
              fontSize: 13, fontWeight: 700, color: (th) => tealText(th.palette.mode),
            }}>
              <PhoneInTalkIcon sx={{ fontSize: 18 }} />
              Precisa conversar agora? CVV 188 — gratuito, 24h
            </Link>
          </AppCard>
        </>
      )}

      {/* QUIZ — 1 item por passo. Opções remontam a cada pergunta (key) → nenhum estado
          de toque/foco vaza pra pergunta seguinte. */}
      {phase === 'quiz' && (
        <AppCard sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <Button size="small" startIcon={<ArrowBackIcon />} onClick={back} disabled={saving} sx={{ textTransform: 'none', fontWeight: 700, minWidth: 0 }}>Voltar</Button>
            <Box sx={{ flex: 1 }} aria-hidden="true">
              <Box sx={{ height: 6, borderRadius: '999px', bgcolor: 'rgba(32,178,170,.15)', overflow: 'hidden' }}>
                <Box sx={{ width: `${((step + (answers[step] != null ? 1 : 0)) / items.length) * 100}%`, height: '100%', borderRadius: '999px', background: 'linear-gradient(90deg,#20b2aa,#5fc9c3)', transition: 'width .3s cubic-bezier(.22,1,.36,1)' }} />
              </Box>
            </Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{step + 1}/{items.length}</Typography>
          </Stack>

          <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600, lineHeight: 1.5 }}>Nas últimas 2 semanas, com que frequência você foi incomodado(a) por:</Typography>
          <Box key={`q-${type}-${step}`} sx={qFade}>
            <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 18, lineHeight: 1.4, my: 2 }}>{items[step]}</Typography>

            <Stack spacing={1} role="radiogroup" aria-label={items[step]}>
              {SCREENING_OPTIONS.map((o) => {
                const on = (picked ?? answers[step]) === o.value;
                return (
                  <Box
                    key={o.value}
                    component="button"
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={saving}
                    onClick={() => answer(o.value)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', minHeight: 54, px: 1.75,
                      borderRadius: '14px', border: '1.5px solid', font: 'inherit', textAlign: 'left', cursor: 'pointer',
                      borderColor: on ? '#20b2aa' : 'divider',
                      bgcolor: on ? 'rgba(32,178,170,.12)' : 'background.paper',
                      color: 'text.primary', WebkitTapHighlightColor: 'transparent', userSelect: 'none',
                      transition: 'border-color .15s ease, background-color .15s ease, transform .1s ease',
                      // hover só em dispositivo com mouse — no toque o :hover "gruda".
                      '@media (hover: hover)': { '&:hover:not(:disabled)': { borderColor: on ? '#20b2aa' : 'rgba(32,178,170,.5)' } },
                      '&:active:not(:disabled)': { transform: 'scale(.985)' },
                      '&:focus-visible': { outline: '2px solid #20b2aa', outlineOffset: 2 },
                      '&:disabled': { cursor: 'default', opacity: on ? 1 : 0.55 },
                    }}
                  >
                    <Box sx={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                      border: '2px solid', borderColor: on ? '#20b2aa' : 'divider', bgcolor: on ? '#20b2aa' : 'transparent', transition: 'all .15s ease' }}>
                      <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#fff', transform: on ? 'scale(1)' : 'scale(0)', transition: 'transform .18s cubic-bezier(.2,1.4,.4,1)' }} />
                    </Box>
                    <Typography component="span" sx={{ flex: 1, fontSize: 15, fontWeight: on ? 800 : 600 }}>{o.label}</Typography>
                    {/* intensidade visual da frequência (0-3) */}
                    <Stack direction="row" spacing="3px" aria-hidden="true">
                      {[1, 2, 3].map((n) => (
                        <Box key={n} sx={{ width: 4, height: 6 + n * 3, borderRadius: 2, alignSelf: 'flex-end',
                          bgcolor: n <= o.value ? (on ? '#20b2aa' : 'rgba(32,178,170,.45)') : 'action.disabledBackground' }} />
                      ))}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </Box>
          {saving && <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}><CircularProgress size={16} /><Typography variant="body2" color="text.secondary">Calculando seu resultado…</Typography></Stack>}
        </AppCard>
      )}

      {/* RESULTADO */}
      {phase === 'result' && result && (
        <>
          <AppCard sx={{ p: { xs: 2.5, sm: 3.5 }, textAlign: 'center' }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              {result.type === 'phq9' ? 'PHQ-9 · Depressão' : 'GAD-7 · Ansiedade'}
            </Typography>
            <Stack direction="row" justifyContent="center" alignItems="baseline" spacing={0.75} sx={{ my: 1 }}>
              <Typography component="span" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 56, lineHeight: 1, color: (t) => sevColor(result.severity.key)(t.palette.mode) }}>{result.total}</Typography>
              <Typography component="span" color="text.secondary" sx={{ fontWeight: 600 }}>de {maxScoreOf(result.type)}</Typography>
            </Stack>
            <Stack direction="row" justifyContent="center" alignItems="center" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
              <Chip label={result.severity.label} sx={{ height: 30, fontSize: 15, fontWeight: 800, textTransform: 'capitalize', bgcolor: (t) => `${sevColor(result.severity.key)(t.palette.mode)}1f`, color: (t) => sevColor(result.severity.key)(t.palette.mode) }} />
              {/* 28/09 (bug bash): "leve" ficava vago — a régua de faixas mostra onde o score
                  cai e os cortes. A faixa ATUAL em negrito/teal, as demais discretas. */}
              <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                {(result.type === 'phq9'
                  ? [['0-4', 'mínima'], ['5-9', 'leve'], ['10-14', 'moderada'], ['15-19', 'mod. grave'], ['20-27', 'grave']]
                  : [['0-4', 'mínima'], ['5-9', 'leve'], ['10-14', 'moderada'], ['15-21', 'grave']]
                ).map(([range, label]) => label === result.severity.label
                  ? <strong key={range} style={{ color: '#0f766e' }}>{range} {label}</strong>
                  : <span key={range}>{range} {label}</span>
                ).reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, ' · ', el]), [])}
              </Typography>
              {prevOfSame && (() => {
                const delta = deltaEntre(prevOfSame.total, result.total);
                const toneKey = delta.tone === 'good' ? 'ok' : delta.tone === 'warn' ? 'warn' : null;
                return (
                  <Chip
                    size="small"
                    label={deltaLabel(delta, prevOfSame.createdAt)}
                    aria-label={`Diferença desde o rastreamento anterior: ${delta.dir === 'down' ? 'menos' : delta.dir === 'up' ? 'mais' : 'igual'} ${delta.abs} pontos`}
                    sx={{
                      height: 26, fontSize: 12.5, fontWeight: 800,
                      ...(toneKey
                        ? { bgcolor: (t) => `${SEM[toneKey][t.palette.mode]}1f`, color: (t) => SEM[toneKey][t.palette.mode] }
                        : { bgcolor: 'action.selected', color: 'text.secondary' }),
                    }}
                  />
                );
              })()}
            </Stack>
            {/* G1 — janela de reavaliação: rastreamentos valem 2 semanas (createdAt + 14d). */}
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 1.5 }}>
              Rastreamentos valem por 2 semanas — próxima janela ideal: <strong>{proximaJanela(result.createdAt)}</strong>
            </Typography>
            {/* F3 — ACOLHIMENTO IMEDIATO (item 9 do PHQ-9 > 0): presença, não pânico. Teal da
                marca + borda suave (nada de vermelho gritante); é conteúdo da tela de resultado,
                não alerta dismissable. Links com alvo de toque ≥44px: CVV 188 (ligar/chat),
                SAMU 192 em risco imediato, rede de apoio + levar o resultado ao médico. */}
            {crisis && (
              <Box
                component="section"
                aria-label="Apoio imediato — CVV 188, ligação gratuita 24 horas"
                sx={{
                  mt: 2, mb: 0.5, p: 2, textAlign: 'left',
                  borderRadius: '14px',
                  border: '1.5px solid rgba(32,178,170,.45)',
                  bgcolor: 'rgba(32,178,170,.08)',
                }}
              >
                <Stack direction="row" spacing={1.25} alignItems="flex-start">
                  <FavoriteIcon sx={{ fontSize: 20, color: (t) => tealText(t.palette.mode), mt: '2px' }} />
                  <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.55, textAlign: 'left' }}>
                    Se pensamentos difíceis passaram pela sua cabeça nas últimas semanas, você não precisa carregar isso sozinho(a).
                  </Typography>
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
                  <Link
                    href="tel:188"
                    underline="none"
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1, flex: 1,
                      minHeight: 44, px: 1.5, borderRadius: '12px',
                      border: '1.5px solid rgba(32,178,170,.55)',
                      bgcolor: 'rgba(32,178,170,.10)',
                      fontWeight: 800, fontSize: 14, color: (t) => tealText(t.palette.mode),
                    }}
                  >
                    <PhoneInTalkIcon sx={{ fontSize: 20 }} />
                    Ligar agora (gratuito, 24h): CVV 188
                  </Link>
                  <Link
                    href="https://www.cvv.org.br/"
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="none"
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1, flex: 1,
                      minHeight: 44, px: 1.5, borderRadius: '12px',
                      border: '1.5px solid rgba(32,178,170,.55)',
                      bgcolor: 'rgba(32,178,170,.10)',
                      fontWeight: 800, fontSize: 14, color: (t) => tealText(t.palette.mode),
                    }}
                  >
                    <ChatBubbleOutlineIcon sx={{ fontSize: 20 }} />
                    Prefere escrever? cvv.org.br (chat 24h)
                  </Link>
                </Stack>
                <Typography sx={{ fontSize: 13, mt: 1.25, lineHeight: 1.55, color: 'text.secondary', textAlign: 'left' }}>
                  Se sentir risco imediato, ligue <strong>192 (SAMU)</strong> ou vá a um <strong>pronto-socorro</strong>.
                </Typography>
                <Typography sx={{ fontSize: 13, mt: 0.5, lineHeight: 1.55, color: 'text.secondary', textAlign: 'left' }}>
                  Contar pra alguém de confiança também é um começo — e leve este resultado ao seu médico.
                </Typography>
              </Box>
            )}
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 2, maxWidth: 460, mx: 'auto' }}>
              Este é um <strong>rastreamento, não um diagnóstico</strong>. Ele ajuda a organizar o que você sente — leve o resultado ao seu médico para uma avaliação adequada.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="center" alignItems="center" sx={{ mt: 2.5 }}>
              <Button variant="contained" startIcon={<VolunteerActivismIcon />} onClick={() => navigate('/medicos')} sx={{ textTransform: 'none', fontWeight: 700 }}>Compartilhar com meu médico</Button>
              <Button variant="outlined" onClick={() => setPhase('intro')} sx={{ textTransform: 'none', fontWeight: 700 }}>Concluir</Button>
              {/* Válido, mas NÃO é o caminho principal — discreto (12px, texto). */}
              <Button variant="text" onClick={() => startQuiz(result.type)} sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600, minWidth: 0, px: 1, color: 'text.secondary' }}>Refazer agora</Button>
            </Stack>
          </AppCard>
        </>
      )}

      {/* G1 — momento da 1ª conclusão (reuso do Celebration do 1º exame; never com crise). */}
      <Celebration
        open={firstMoment}
        title="Primeiro retrato da sua saúde mental 🧠"
        subtitle="Você acabou de colocar no papel como está — isso já é cuidado. O próximo retrato vale dali a 2 semanas."
        ctaLabel="Compartilhar com meu médico"
        dismissLabel="Continuar aqui"
        ariaLabel="Celebração do primeiro rastreamento"
        onDone={() => setFirstMoment(false)}
        onCta={() => { setFirstMoment(false); navigate('/medicos'); }}
      />
    </PageContainer>
  );
};

export default SaudeMentalPage;
