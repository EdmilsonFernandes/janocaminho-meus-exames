import { useEffect, useState, useCallback, useRef } from 'react';
import { Box, Card, CardContent, Typography, Stack, Chip, CircularProgress, Button, IconButton, Collapse, Divider, Switch } from '@mui/material';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { PRIORITY_META } from '../../utils/alertPriority';
import { bumpCredits } from '../../utils/credits-events';

// Custo em créditos do plano de ação — manter sincronizado com CREDIT_COSTS.actionPlan (server).
const ACTION_PLAN_COST = 8;

/**
 * "Leitura de risco" — payoff visível da camada de risco (risk-engine, server).
 * Consome POST /api/risk/assess e mostra: condição suspeita (possível/risco — NÃO diagnóstico),
 * nível de risco, o que chamou atenção, explicação simples e perguntas pra levar ao médico.
 *
 * Não-alarmista, educativo. A decisão é sempre do médico. ML fica OFF (dados sintéticos).
 *
 * Robustez: o motor usa VALORES nas bandas (ignora flags de lab, que podem estar com escala
 * errada — ex.: Hemoglobina 15 g/dL com faixa 130-170 g/L marcada LOW). Por isso não chora
 * "anemia" por causa de flag bugado.
 */
type RiskLevel = 'low' | 'moderate' | 'high';
interface Finding {
  key: string; namePt: string; value: number; unit: string;
  severity: 'low' | 'moderate' | 'high'; condition: string; finding: string;
  source?: string | null;
  priorValue?: number | null; deltaPct?: number | null;
}
interface RiskResult {
  predictedConditionKey: string;
  predictedCondition: string;
  conditions: string[];
  riskLevel: RiskLevel;
  ruleConfidence: 'alta' | 'baixa';
  markersEvaluated: number;
  findings: Finding[];
  detectedFindings: string[];
  userExplanation: string;
  doctorQuestions: string[];
  medicalDisclaimer: string;
}

// riskLevel -> apresentação (cor consistente com PRIORITY_META do app)
const RISK_META: Record<RiskLevel, { emoji: string; color: string; label: string }> = {
  low:      { emoji: '🟢', color: '#16a34a', label: 'Baixo' },
  moderate: { emoji: '🟠', color: PRIORITY_META.moderada.color, label: 'Moderado' },
  high:     { emoji: '🔴', color: PRIORITY_META.importante.color, label: 'Atenção' },
};
// severidade do finding -> PRIORITY_META (chips coloridos consistentes)
const SEV_TO_PRIO = { low: 'leve', moderate: 'moderada', high: 'importante' } as const;
// tendência vs leitura anterior (motivo de retornar ao app — alavanca de retenção)
const TREND_CHIP: Record<string, { emoji: string; color: string; label: string }> = {
  melhorou: { emoji: '↓', color: '#16a34a', label: 'Risco caiu' },
  piorou: { emoji: '↑', color: '#dc2626', label: 'Risco subiu' },
  estavel: { emoji: '→', color: '#64748b', label: 'Risco estável' },
};

export const RiskCard = () => {
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const [r, setR] = useState<(RiskResult & { id?: string; trend?: string; prior?: { riskLevel: string; createdAt: string } | null }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQuestions, setShowQuestions] = useState(false);
  // Compactação mobile: explicação truncada. "Ver mais" só aparece se o texto transborda de fato (medido).
  const [showFull, setShowFull] = useState(false);
  const explanationRef = useRef<HTMLParagraphElement>(null);
  const [hasMoreExplanation, setHasMoreExplanation] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planErr, setPlanErr] = useState<null | 'credits' | 'error'>(null);
  const [feedback, setFeedback] = useState<null | 1 | 0>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // Reset estados derivados do paciente anterior ao trocar de perfil — não vazar
  // plano/feedback de um dependente (ex: Edmilson) pra outro (ex: Heloisa).
  useEffect(() => { setPlan(null); setPlanErr(null); setFeedback(null); setShowQuestions(false); setShowFull(false); setHasMoreExplanation(false); }, [pid]);

  const load = useCallback((force = false) => {
    if (!pid) { setLoading(false); setR(null); return; }
    setLoading(true);
    fetch(`${API_URL}/risk/assess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ patientId: pid, force }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setR(d ?? null))
      .catch(() => setR(null))
      .finally(() => setLoading(false));
  }, [pid]);

  const loadPlan = useCallback(() => {
    if (!pid || planLoading) return;
    setPlanLoading(true); setPlanErr(null);
    fetch(`${API_URL}/risk/action-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ patientId: pid }),
    })
      .then(async (res) => {
        if (res.status === 402) { setPlanErr('credits'); return null; }
        if (!res.ok) { setPlanErr('error'); return null; }
        return res.json();
      })
      .then((d) => { if (d?.contentMd) { setPlan(d.contentMd); bumpCredits(); } })   // atualiza o saldo do header (plano consome)
      .catch(() => setPlanErr('error'))
      .finally(() => setPlanLoading(false));
  }, [pid, planLoading]);

  // Feedback do plano (loop de melhoria da IA) — 👍 ajudou / 👎 não
  const sendFeedback = useCallback((rating: 1 | 0) => {
    if (!r?.id || feedbackLoading || feedback != null) return;
    setFeedbackLoading(true);
    fetch(`${API_URL}/risk/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ riskAssessmentId: r.id, rating }),
    })
      .then((res) => { if (res.ok) setFeedback(rating); })
      .catch(() => {})
      .finally(() => setFeedbackLoading(false));
  }, [r?.id, feedbackLoading, feedback]);

  // FLYWHEEL: opt-in do paciente pra doar dados ANONIMIZADOS (sem PHI) e treinar a IA.
  const [consent, setConsent] = useState<boolean | null>(null);
  useEffect(() => {
    if (!pid) { setConsent(null); return; }
    fetch(`${API_URL}/risk/consent?patientId=${encodeURIComponent(pid)}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setConsent(!!d?.consent))
      .catch(() => setConsent(null));
  }, [pid]);
  const toggleConsent = useCallback(() => {
    if (!pid || consent == null) return;
    const next = !consent;
    setConsent(next); // otimista
    fetch(`${API_URL}/risk/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ patientId: pid, consent: next }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setConsent(!!d?.consent))
      .catch(() => setConsent(!next)); // reverte em falha
  }, [pid, consent]);

  useEffect(() => { load(false); }, [load]);

  // "Ver mais" da explicação só aparece se o texto REALMENTE transborda o clamp de 3 linhas
  // (scrollHeight > clientHeight) — não por contagem de chars, que mostrava o botão até sem texto extra.
  useEffect(() => {
    const el = explanationRef.current;
    if (showFull || !el) { setHasMoreExplanation(false); return; }
    setHasMoreExplanation(el.scrollHeight - el.clientHeight > 2);
  }, [r, showFull]);

  if (loading) {
    return (
      <Card sx={{ mt: 2, borderRadius: 4, minHeight: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
        <CircularProgress size={22} sx={{ color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 600, color: 'text.secondary' }}>Montando sua leitura de risco…</Typography>
      </Card>
    );
  }

  // Sem dados (paciente sem exames extraídos com os marcadores do escopo)
  if (!r || r.markersEvaluated === 0) {
    return (
      <Card sx={{ mt: 2, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
        <CardContent>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <HealthAndSafetyIcon sx={{ color: 'primary.main' }} />
            <Box>
              <Typography sx={{ fontWeight: 800 }}>Leitura de risco</Typography>
              <Typography variant="body2" color="text.secondary">Envie exames de sangue (glicemia, hemograma, colesterol) e registre sua pressão pra ver sua leitura de risco aqui.</Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  const meta = RISK_META[r.riskLevel];
  const none = r.predictedConditionKey === 'none';

  return (
    <Card sx={{
      mt: 2, borderRadius: 4, border: '1px solid', borderColor: 'divider',
      background: none
        ? 'linear-gradient(135deg, rgba(22,163,74,.08), rgba(22,163,74,.02))'
        : `linear-gradient(135deg, ${meta.color}14, ${meta.color}05)`,
    }}>
      <CardContent>
        {/* cabeçalho — 2 LINHAS determinísticas (robusto em qualquer viewport/fonte/zoom do Android):
            linha 1 = ícone + título (truncável c/ ellipsis) + refresh; linha 2 = chips (nível + tendência).
            Antes era tudo numa linha só com flexWrap + flex:1 no título — frágil: em fonte/zoom específicos
            do Android o título não encolhia e os chips transbordavam ("quebra na vertical"). Cada linha agora
            é simples e independente; o título sempre cabe (trunca) e os chips nunca empurram o refresh. */}
        <Stack sx={{ mb: 1.25 }}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <HealthAndSafetyIcon sx={{ color: none ? '#16a34a' : meta.color, flexShrink: 0 }} />
            <Typography sx={{ fontWeight: 800, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Leitura de risco</Typography>
            <IconButton size="small" aria-label="Refazer análise" onClick={() => load(true)} sx={{ p: 1.1, flexShrink: 0 }}>
              <RefreshIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            </IconButton>
          </Stack>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.75, rowGap: 0.5 }}>
            <Chip size="small" label={`${meta.emoji} ${meta.label}`} sx={{ fontWeight: 800, height: 22, flexShrink: 0, bgcolor: meta.color + '22', color: meta.color }} />
            {r.trend && r.trend !== 'primeiro' && TREND_CHIP[r.trend] && (() => {
              const t = TREND_CHIP[r.trend];
              const d = r.prior?.createdAt ? new Date(r.prior.createdAt).toLocaleDateString('pt-BR') : '';
              return <Chip size="small" label={`${t.emoji} ${t.label}${d ? ` desde ${d}` : ''}`} sx={{ fontWeight: 700, height: 22, flexShrink: 0, bgcolor: t.color + '22', color: t.color }} />;
            })()}
          </Stack>
        </Stack>

        {/* condição suspeita (destaque). Quando nenhum padrão, o texto do server ("Sem alterações
            relevantes") confunde com "nenhum marcador fora da faixa" — sobrescrevemos pra deixar
            claro que é sobre PADRÕES de risco (compostos), não sobre valores individuais (esses
            ficam no card "Meu estado atual" ao lado). */}
        <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', mb: 0.5, color: none ? 'text.primary' : meta.color }}>
          {none ? 'Nenhum padrão de risco detectado' : r.predictedCondition}
        </Typography>

        {/* explicação truncada com "Ver mais" — só aparece se o texto transborda de fato (medido, não por contagem de chars) */}
        <Typography
          ref={explanationRef}
          variant="body2"
          sx={{
            mb: (hasMoreExplanation || showFull) ? 0.5 : 1.25,
            color: 'text.primary', lineHeight: 1.45,
            display: showFull ? 'block' : '-webkit-box',
            WebkitLineClamp: showFull ? 'none' : 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {r.userExplanation}
        </Typography>
        {(hasMoreExplanation || showFull) && (
          <Button size="small" onClick={() => setShowFull((v) => !v)}
            sx={{ py: 0.75, px: 0, mb: 1.25, textTransform: 'none', fontWeight: 700, color: 'primary.main', minWidth: 0, fontSize: '0.8rem' }}>
            {showFull ? 'Ver menos' : 'Ver mais'}
          </Button>
        )}

        {/* O que chamou atenção — 1 linha clara por finding (emoji + nome + valor/unidade + descrição).
            Antes havia chips compactos ("38 Cole") E detalhes ("38 mg/dL · COLESTEROL HDL") duplicando a info;
            agora cada finding aparece uma vez só, legível. */}
        {r.findings.length > 0 && (
          <Box sx={{ mb: 1.25 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 0.5, fontSize: '0.72rem', letterSpacing: '0.03em' }}>
              ⚠️ O QUE CHAMOU ATENÇÃO
            </Typography>
            <Stack divider={<Divider flexItem sx={{ borderColor: 'divider', borderStyle: 'dashed' }} />}>
              {r.findings.map((f, i) => {
                const pm = PRIORITY_META[SEV_TO_PRIO[f.severity]] ?? PRIORITY_META.leve;
                return (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.6 }}>
                    <Box sx={{ fontSize: '0.95rem', lineHeight: 1.3, flexShrink: 0, mt: 0.1 }}>{pm.emoji}</Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1} flexWrap="wrap" useFlexGap>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.2 }}>{f.namePt ?? f.finding ?? '—'}</Typography>
                        <Typography component="span" sx={{ fontWeight: 800, fontSize: '0.82rem', color: pm.color, whiteSpace: 'nowrap' }}>
                          {f.value}{f.unit ? ` ${f.unit}` : ''}
                          {f.priorValue != null && (
                            <Typography component="span" sx={{ fontSize: '0.7rem', color: 'text.secondary', ml: 0.5, fontWeight: 600 }}>
                              (antes {f.priorValue}{f.deltaPct != null ? `, ${f.deltaPct > 0 ? '+' : ''}${Math.round(f.deltaPct)}%` : ''})
                            </Typography>
                          )}
                        </Typography>
                      </Stack>
                      {f.finding && f.finding !== f.namePt && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.35, display: 'block', mt: 0.15 }}>
                          {f.finding}
                        </Typography>
                      )}
                      {f.source && (
                        <Box sx={{ mt: 0.5 }}>
                          <details>
                            <summary style={{ cursor: 'pointer', color: '#178f89', fontSize: '0.72rem', fontWeight: 700, display: 'inline-block', listStyle: 'none' }}>📖 Por quê? (fonte da faixa)</summary>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', pl: 1.5, mt: 0.25, lineHeight: 1.3 }}>{f.source}</Typography>
                          </details>
                        </Box>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          </Box>
        )}

        {/* perguntas pro médico (colapsável) */}
        {r.doctorQuestions.length > 0 && (
          <>
            <Button
              size="small" onClick={() => setShowQuestions((v) => !v)}
              startIcon={<QuestionAnswerIcon />}
              endIcon={<ExpandMoreIcon sx={{ transform: showQuestions ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
              sx={{ py: 0.75, px: 0, textTransform: 'none', fontWeight: 700, color: 'primary.main', mb: showQuestions ? 0.5 : 0 }}
            >
              Perguntas pra levar ao médico ({r.doctorQuestions.length})
            </Button>
            <Collapse in={showQuestions}>
              <Box component="ul" sx={{ m: 0, pl: 2.5, mb: 1 }}>
                {r.doctorQuestions.map((q, i) => (
                  <li key={i}><Typography variant="body2" sx={{ lineHeight: 1.4, mb: 0.3 }}>{q}</Typography></li>
                ))}
              </Box>
            </Collapse>
          </>
        )}

        {/* PLANO DE AÇÃO (IA — alavanca de créditos: a leitura de risco é grátis, o plano é o upsell) */}
        <Divider sx={{ my: 1.25 }} />
        {!plan && !planLoading && (
          <Button fullWidth variant="contained" size="small" startIcon={<AutoStoriesIcon />} onClick={loadPlan}
            sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, py: 1.1 }}>
            Plano de ação do Dr. Exame · {ACTION_PLAN_COST} créditos
          </Button>
        )}
        {planLoading && (
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ py: 0.5 }}>
            <CircularProgress size={16} sx={{ color: 'primary.main' }} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>Montando seu plano de ação…</Typography>
          </Stack>
        )}
        {planErr === 'credits' && (
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" sx={{ color: '#9a6b00', display: 'block', mb: 0.5 }}>Créditos insuficientes pra gerar o plano agora.</Typography>
            <Button size="small" onClick={() => navigate('/planos')} sx={{ textTransform: 'none', fontWeight: 700 }}>Comprar créditos</Button>
          </Box>
        )}
        {planErr === 'error' && (
          <Typography variant="caption" sx={{ color: 'error.main', display: 'block', textAlign: 'center' }}>Não foi possível gerar agora. Tente novamente em instantes.</Typography>
        )}
        {plan && (
          <Box sx={{ mt: 1, p: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
            <Typography sx={{ fontWeight: 800, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AutoStoriesIcon fontSize="small" /> Plano de ação do Dr. Exame
            </Typography>
            <Box className="risk-plan-md" sx={{ '& p': { my: 0.5, lineHeight: 1.45 }, '& ul': { pl: 2.5, my: 0.5 }, '& li': { my: 0.25 }, fontSize: '0.9rem' }}>
              <ReactMarkdown>{plan}</ReactMarkdown>
            </Box>
          </Box>
        )}

        {/* FEEDBACK: isso ajudou? (loop de melhoria da IA — grátis) */}
        {plan && (
          feedback == null ? (
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>Isso ajudou?</Typography>
              <Button size="small" disabled={feedbackLoading} onClick={() => sendFeedback(1)} sx={{ minWidth: 0, px: 1.5, fontSize: '1.15rem', lineHeight: 1 }}>👍</Button>
              <Button size="small" disabled={feedbackLoading} onClick={() => sendFeedback(0)} sx={{ minWidth: 0, px: 1.5, fontSize: '1.15rem', lineHeight: 1 }}>👎</Button>
            </Stack>
          ) : (
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 1, color: 'text.secondary' }}>
              {feedback === 1 ? '👍 Obrigado! Seu retorno deixa a IA melhor a cada uso.' : 'Obrigado — vamos revisar e melhorar.'}
            </Typography>
          )
        )}

        {/* rodapé: confiança + disclaimer */}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 0.75 }}>
          Baseada em {r.markersEvaluated} marcador{r.markersEvaluated > 1 ? 'es' : ''}{r.ruleConfidence === 'baixa' ? ' (poucos dados — leitura parcial)' : ''}.
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'text.secondary' }}>
          {r.medicalDisclaimer}
        </Typography>
        {consent != null && (
          <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center" sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>🧪 Ajudar a IA a melhorar (dados anônimos)</Typography>
            <Switch size="small" checked={consent} onChange={toggleConsent} color="success" />
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};
