import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, Box, Typography, Button, IconButton, Alert, CircularProgress, useTheme, useMediaQuery } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ReuiTextarea } from '@/components/reui/form-controls';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';
import { DrExame } from '../DrExame';
import { track } from '../../utils/analytics';
import { tealText } from '../../theme';
import {
  fetchSurvey, submitFeedback, loadDraft, saveDraft, clearDraft, newClientKey, markDismissed,
  type FeedbackMode, type SurveyDefinition, type SurveyAnswers, type Outcome,
} from '../../utils/feedbackApi';

/**
 * PESQUISA DE OPINIÃO (02/11/26) — 3 perguntas + comentário opcional (~45s).
 *
 *  - Q2 adapta o enunciado à resposta da Q1 (conseguiu / em parte-não / conhecendo);
 *  - opções em pílulas (ReUI ToggleGroup) — 1 toque por pergunta, Q2 até 3 escolhas;
 *  - "Responder depois" fecha sem punição; rascunho + clientKey ficam no aparelho;
 *  - falha no envio: mantém tudo e oferece "Tentar de novo" (clientKey = sem duplicar);
 *  - versão da pesquisa mudou no servidor: recarrega as perguntas e avisa;
 *  - agradecimento claro no fim; nota de privacidade honesta (vinculada à conta).
 */
export interface FeedbackSurveyDialogProps {
  mode: FeedbackMode;
  open: boolean;
  trigger: string;
  /** veio do convite contextual → fechar sem responder conta como dispensa (intervalo) */
  fromInvite?: boolean;
  hasExams?: boolean;
  onClose: (submitted: boolean) => void;
}

const EMPTY: SurveyAnswers = { outcome: null, detail: [], improvement: null };
const surveyCache: Partial<Record<FeedbackMode, SurveyDefinition>> = {};

type Step = 0 | 1 | 2 | 3 | 4; // Q1, Q2, Q3, comentário, obrigado

export const FeedbackSurveyDialog = ({ mode, open, trigger, fromInvite = false, hasExams, onClose }: FeedbackSurveyDialogProps) => {
  useReuiThemeSync();
  const theme = useTheme();
  const small = useMediaQuery(theme.breakpoints.down('sm'));
  const [survey, setSurvey] = useState<SurveyDefinition | null>(surveyCache[mode] ?? null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [step, setStep] = useState<Step>(0);
  const [answers, setAnswers] = useState<SurveyAnswers>(EMPTY);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [thanks, setThanks] = useState<{ title: string; text: string } | null>(null);
  const clientKeyRef = useRef<string>('');
  const submittedRef = useRef(false);

  // Carrega a definição (cache por sessão) + restaura rascunho da mesma pesquisa.
  useEffect(() => {
    if (!open) return;
    let dead = false;
    submittedRef.current = false;
    setStep(0); setSendError(null); setNotice(null); setThanks(null);
    const apply = (def: SurveyDefinition) => {
      if (dead) return;
      setSurvey(def);
      const draft = loadDraft(mode, def.key);
      if (draft && draft.clientKey) {
        clientKeyRef.current = draft.clientKey;
        setAnswers({ outcome: draft.answers?.outcome ?? null, detail: Array.isArray(draft.answers?.detail) ? draft.answers.detail : [], improvement: draft.answers?.improvement ?? null });
        setComment(typeof draft.comment === 'string' ? draft.comment : '');
      } else {
        clientKeyRef.current = newClientKey();
        setAnswers(EMPTY); setComment('');
      }
      track('feedback_survey_opened', { mode, trigger, surveyKey: def.key });
    };
    if (surveyCache[mode]) { apply(surveyCache[mode]!); return; }
    setLoading(true); setLoadError(false);
    fetchSurvey(mode).then((def) => {
      if (dead) return;
      setLoading(false);
      if (!def) { setLoadError(true); return; }
      surveyCache[mode] = def;
      apply(def);
    });
    return () => { dead = true; };
  }, [open, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rascunho a cada mudança (sobrevive a fechar/perder rede).
  useEffect(() => {
    if (!open || !survey || submittedRef.current) return;
    if (!answers.outcome && answers.detail.length === 0 && !answers.improvement && !comment) return;
    saveDraft(mode, survey.key, { clientKey: clientKeyRef.current, answers, comment, trigger, savedAt: Date.now() });
  }, [answers, comment, open, survey, mode, trigger]);

  const q2Text = useMemo(() => (survey && answers.outcome ? survey.q2.textByOutcome[answers.outcome] : survey?.q2.textByOutcome.partial ?? ''), [survey, answers.outcome]);
  const canNext = step === 0 ? !!answers.outcome : step === 1 ? answers.detail.length > 0 : step === 2 ? !!answers.improvement : true;

  const closeLater = () => {
    // Fechar sem responder: nunca pune. Se veio do convite, registra a dispensa (intervalo).
    if (!submittedRef.current && fromInvite) markDismissed(mode);
    onClose(submittedRef.current);
  };

  const send = async () => {
    if (!survey) return;
    setSending(true); setSendError(null);
    const r = await submitFeedback(mode, { surveyKey: survey.key, surveyVersion: survey.version, answers, comment: comment.trim(), clientKey: clientKeyRef.current, trigger, hasExams });
    setSending(false);
    if (r.ok) {
      submittedRef.current = true;
      clearDraft(mode, survey.key);
      setThanks(r.thanks); setStep(4);
      track('feedback_survey_submitted', { mode, surveyKey: survey.key, outcome: answers.outcome ?? '' });
      return;
    }
    if (r.outdated) {
      // Pesquisa mudou no servidor: recarrega as perguntas, mantém a chave (sem duplicar) e recomeça.
      delete surveyCache[mode];
      const def = await fetchSurvey(mode);
      if (def) { surveyCache[mode] = def; setSurvey(def); clearDraft(mode, survey.key); setAnswers(EMPTY); setComment(''); setStep(0); setNotice('A pesquisa foi atualizada. Pode responder de novo — é rápido.'); }
      else setSendError('Não foi possível carregar a pesquisa atualizada.');
      return;
    }
    setSendError(r.error);
  };

  if (!open) return null;
  const dark = theme.palette.mode === 'dark';
  const total = 3;

  const pill = 'rounded-full border border-border bg-card px-3.5 py-2 text-[14px] font-semibold text-foreground shadow-none data-[pressed]:border-primary data-[pressed]:bg-primary/12 data-[pressed]:text-primary aria-pressed:border-primary aria-pressed:bg-primary/12 aria-pressed:text-primary data-[state=on]:border-primary data-[state=on]:bg-primary/12 data-[state=on]:text-primary h-auto min-h-11 whitespace-normal text-left leading-snug';

  return (
    <Dialog
      open onClose={closeLater} fullWidth maxWidth="xs" data-testid="feedback-dialog"
      aria-labelledby="feedback-title"
      PaperProps={{ sx: {
        borderRadius: '22px', m: small ? 1.5 : 2, width: small ? 'calc(100% - 24px)' : '100%',
        mb: small ? 'max(12px, env(safe-area-inset-bottom))' : 2,
        maxHeight: 'calc(100dvh - 32px - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
        bgcolor: dark ? '#1a2424' : '#fff',
        animation: 'fbIn .22s cubic-bezier(.16,1,.3,1) both',
        '@keyframes fbIn': { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      } }}
    >
      {/* Cabeçalho */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2.25, pt: 2, pb: 1 }}>
        <DrExame size={38} sx={{ borderRadius: '28%' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id="feedback-title" component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 16, lineHeight: 1.2, color: 'text.primary' }}>
            {survey?.title ?? 'Ajude a melhorar o Dr. Exame'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
            {step < 3 ? `Pergunta ${step + 1} de ${total}` : step === 3 ? 'Último passo (opcional)' : survey?.subtitle}
          </Typography>
        </Box>
        <IconButton size="small" onClick={closeLater} aria-label="Fechar pesquisa" data-testid="feedback-close" sx={{ color: 'text.secondary' }}><CloseIcon fontSize="small" /></IconButton>
      </Box>

      {/* Progresso discreto */}
      {step < 4 && (
        <Box role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={step + 1} sx={{ mx: 2.25, height: 4, borderRadius: 99, bgcolor: dark ? 'rgba(255,255,255,.08)' : 'rgba(15,90,86,.10)', overflow: 'hidden' }}>
          <Box sx={{ width: `${((step + 1) / 4) * 100}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#20b2aa,#178f89)', transition: 'width .25s ease' }} />
        </Box>
      )}

      <Box sx={{ px: 2.25, pt: 2, pb: 1, overflowY: 'auto' }}>
        {loading && <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>}
        {loadError && !loading && (
          <Alert severity="warning" sx={{ borderRadius: '12px' }} action={<Button size="small" onClick={() => { setLoadError(false); setLoading(true); fetchSurvey(mode).then((d) => { setLoading(false); if (d) { surveyCache[mode] = d; setSurvey(d); clientKeyRef.current = clientKeyRef.current || newClientKey(); } else setLoadError(true); }); }}>Tentar de novo</Button>}>
            Não foi possível carregar a pesquisa agora.
          </Alert>
        )}
        {notice && <Alert severity="info" sx={{ borderRadius: '12px', mb: 1.5 }} onClose={() => setNotice(null)}>{notice}</Alert>}

        {survey && !loading && step === 0 && (
          <Box data-testid="feedback-step-1">
            <Typography sx={{ fontWeight: 700, fontSize: 16, color: 'text.primary', mb: 1.5, lineHeight: 1.35 }}>{survey.q1.text}</Typography>
            <ToggleGroup
              aria-label={survey.q1.text}
              className="flex w-full flex-wrap gap-2"
              value={answers.outcome ? [answers.outcome] : []}
              onValueChange={(v: unknown[]) => { const next = (v[0] as Outcome | undefined) ?? null; setAnswers((a) => ({ ...a, outcome: next, detail: next && next !== a.outcome ? [] : a.detail })); }}
            >
              {survey.q1.options.map((o) => (
                <ToggleGroupItem key={o.id} value={o.id} className={pill} data-testid={`fb-outcome-${o.id}`}>{o.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Box>
        )}

        {survey && !loading && step === 1 && (
          <Box data-testid="feedback-step-2">
            <Typography sx={{ fontWeight: 700, fontSize: 16, color: 'text.primary', mb: 0.5, lineHeight: 1.35 }}>{q2Text}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>Escolha até {survey.q2.max}.</Typography>
            <ToggleGroup
              multiple aria-label={q2Text}
              className="flex w-full flex-wrap gap-2"
              value={answers.detail}
              onValueChange={(v: unknown[]) => { const list = (v as string[]).slice(0, survey.q2.max); setAnswers((a) => ({ ...a, detail: list })); }}
            >
              {survey.q2.options.map((o) => {
                const on = answers.detail.includes(o.id);
                const full = answers.detail.length >= survey.q2.max && !on;
                return <ToggleGroupItem key={o.id} value={o.id} disabled={full} className={pill} data-testid={`fb-detail-${o.id}`}>{o.label}</ToggleGroupItem>;
              })}
            </ToggleGroup>
          </Box>
        )}

        {survey && !loading && step === 2 && (
          <Box data-testid="feedback-step-3">
            <Typography sx={{ fontWeight: 700, fontSize: 16, color: 'text.primary', mb: 1.5, lineHeight: 1.35 }}>{survey.q3.text}</Typography>
            <ToggleGroup
              aria-label={survey.q3.text}
              className="flex w-full flex-wrap gap-2"
              value={answers.improvement ? [answers.improvement] : []}
              onValueChange={(v: unknown[]) => setAnswers((a) => ({ ...a, improvement: (v[0] as string | undefined) ?? null }))}
            >
              {survey.q3.options.map((o) => (
                <ToggleGroupItem key={o.id} value={o.id} className={pill} data-testid={`fb-improvement-${o.id}`}>{o.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Box>
        )}

        {survey && !loading && step === 3 && (
          <Box data-testid="feedback-step-comment">
            <Typography sx={{ fontWeight: 700, fontSize: 16, color: 'text.primary', mb: 0.5, lineHeight: 1.35 }}>{survey.comment.label}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.25 }}>{survey.comment.hint}</Typography>
            <ReuiTextarea
              value={comment} maxLength={survey.comment.max} rows={4} data-testid="fb-comment"
              aria-label={survey.comment.label}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Escreva aqui, se quiser."
            />
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'right', color: 'text.disabled', mt: 0.5 }}>{comment.length}/{survey.comment.max}</Typography>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1.25, lineHeight: 1.45 }}>{survey.privacyNote}</Typography>
            {sendError && (
              <Alert severity="error" sx={{ borderRadius: '12px', mt: 1.5 }} data-testid="fb-send-error"
                action={<Button size="small" onClick={send} disabled={sending} data-testid="fb-retry">Tentar de novo</Button>}>
                {sendError}
              </Alert>
            )}
          </Box>
        )}

        {step === 4 && thanks && (
          <Box data-testid="feedback-thanks" sx={{ textAlign: 'center', py: 2 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 52, color: (t) => tealText(t.palette.mode), mb: 1 }} />
            <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 20, color: 'text.primary', mb: 0.75 }}>{thanks.title}</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 14.5, lineHeight: 1.5 }}>{thanks.text}</Typography>
          </Box>
        )}
      </Box>

      {/* Rodapé de ações */}
      <Box sx={{ px: 2.25, pb: 2, pt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        {step === 4 ? (
          <Button fullWidth variant="contained" onClick={() => onClose(true)} data-testid="fb-done"
            sx={{ borderRadius: '14px', textTransform: 'none', fontWeight: 800, minHeight: 46, background: 'linear-gradient(135deg,#20b2aa,#178f89)' }}>
            Fechar
          </Button>
        ) : (
          <>
            {step > 0 ? (
              <IconButton onClick={() => setStep((s) => (s - 1) as Step)} aria-label="Voltar" data-testid="fb-back" sx={{ color: 'text.secondary' }}><ArrowBackIcon /></IconButton>
            ) : (
              <Button onClick={closeLater} variant="text" data-testid="fb-later" sx={{ textTransform: 'none', fontWeight: 700, color: 'text.secondary', minHeight: 44 }}>Responder depois</Button>
            )}
            <Box sx={{ flex: 1 }} />
            {step < 3 ? (
              <Button onClick={() => setStep((s) => (s + 1) as Step)} disabled={!canNext || !survey} variant="contained" endIcon={<ArrowForwardIcon />} data-testid="fb-next"
                sx={{ borderRadius: '14px', textTransform: 'none', fontWeight: 800, minHeight: 44, px: 2.5, background: 'linear-gradient(135deg,#20b2aa,#178f89)', '&.Mui-disabled': { background: dark ? 'rgba(255,255,255,.08)' : 'rgba(15,90,86,.12)', color: 'text.disabled' } }}>
                Próxima
              </Button>
            ) : (
              <Button onClick={send} disabled={sending || !survey} variant="contained" data-testid="fb-submit"
                sx={{ borderRadius: '14px', textTransform: 'none', fontWeight: 800, minHeight: 44, px: 2.5, background: 'linear-gradient(135deg,#20b2aa,#178f89)' }}>
                {sending ? 'Enviando…' : 'Enviar opinião'}
              </Button>
            )}
          </>
        )}
      </Box>
    </Dialog>
  );
};
