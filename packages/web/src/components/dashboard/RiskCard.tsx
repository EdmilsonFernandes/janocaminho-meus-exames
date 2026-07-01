import { useEffect, useState, useCallback } from 'react';
import { Box, Card, CardContent, Typography, Stack, Chip, CircularProgress, Button, IconButton, Collapse, Divider } from '@mui/material';
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
  key: string; name_pt: string; value: number; unit: string;
  severity: 'low' | 'moderate' | 'high'; condition: string; finding: string;
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

export const RiskCard = () => {
  const navigate = useNavigate();
  const [pid] = useSelectedPatient();
  const [r, setR] = useState<RiskResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQuestions, setShowQuestions] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planErr, setPlanErr] = useState<null | 'credits' | 'error'>(null);

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
      .then((d) => { if (d?.contentMd) setPlan(d.contentMd); })
      .catch(() => setPlanErr('error'))
      .finally(() => setPlanLoading(false));
  }, [pid, planLoading]);

  useEffect(() => { load(false); }, [load]);

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
        {/* cabeçalho */}
        <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1.25 }}>
          <HealthAndSafetyIcon sx={{ color: none ? '#16a34a' : meta.color }} />
          <Typography sx={{ fontWeight: 800, flex: 1 }}>Leitura de risco</Typography>
          <Chip size="small" label={`${meta.emoji} ${meta.label}`} sx={{ fontWeight: 800, height: 22, bgcolor: meta.color + '22', color: meta.color }} />
          <IconButton size="small" aria-label="Refazer análise" onClick={() => load(true)} sx={{ p: 0.5 }}>
            <RefreshIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          </IconButton>
        </Stack>

        {/* condição suspeita (destaque) */}
        <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', mb: 0.5, color: none ? 'text.primary' : meta.color }}>
          {r.predictedCondition}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1.25, color: 'text.primary', lineHeight: 1.45 }}>
          {r.userExplanation}
        </Typography>

        {/* o que chamou atenção (findings com severidade) */}
        {r.findings.length > 0 && (
          <Stack spacing={0.75} sx={{ mb: 1.25 }}>
            {r.findings.map((f, i) => {
              const pm = PRIORITY_META[SEV_TO_PRIO[f.severity]];
              return (
                <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.4, borderBottom: i < r.findings.length - 1 ? '1px dashed' : 'none', borderColor: 'divider' }}>
                  <Chip size="small" label={`${pm.emoji} ${f.value} ${f.unit}`} sx={{ fontWeight: 700, height: 20, flexShrink: 0, bgcolor: pm.color + '22', color: pm.color }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.2 }}>{f.name_pt}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.3, display: 'block' }}>{f.finding}</Typography>
                  </Box>
                </Box>
              );
            })}
          </Stack>
        )}

        {/* perguntas pro médico (colapsável) */}
        {r.doctorQuestions.length > 0 && (
          <>
            <Button
              size="small" onClick={() => setShowQuestions((v) => !v)}
              startIcon={<QuestionAnswerIcon />}
              endIcon={<ExpandMoreIcon sx={{ transform: showQuestions ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
              sx={{ p: 0, textTransform: 'none', fontWeight: 700, color: 'primary.main', mb: showQuestions ? 0.5 : 0 }}
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
            sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700 }}>
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

        {/* rodapé: confiança + disclaimer */}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 0.75 }}>
          Baseada em {r.markersEvaluated} marcador{r.markersEvaluated > 1 ? 'es' : ''}{r.ruleConfidence === 'baixa' ? ' (poucos dados — leitura parcial)' : ''}.
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'text.secondary' }}>
          *Educativo. {r.medicalDisclaimer}
        </Typography>
      </CardContent>
    </Card>
  );
};
