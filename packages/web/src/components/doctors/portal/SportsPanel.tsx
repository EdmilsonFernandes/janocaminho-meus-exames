import { useEffect, useState, type ReactNode } from 'react';
import { Box, Card, CardContent, Typography, Stack, Chip, Divider, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress } from '@mui/material';
import { API_URL } from '../../../config';
import { Empty } from './NotesTab';
import { copperText, tealText, RADIUS } from '../../../theme';
import { goalRangeText } from '../../../utils/clinicalGoals';
import type { Theme } from '@mui/material/styles';
import { Medal, Syringe, Target, ListChecks } from '@phosphor-icons/react';

/**
 * E5.6 — template EDUCATIVO do plano de acompanhamento TRT. É AGENDA de monitoramento
 * citando sociedades médicas (SBEM/SBU/ABEMSS 2026; Endocrine Society 2018) para USO
 * PRESCRITO — nunca dose, ciclo ou conduta. O médico edita antes de salvar/compartilhar.
 * ⚠️ Revisão clínica pendente (E6): wording a validar por médico parceiro antes do piloto.
 */
const TRT_PLAN_TEMPLATE = [
  'PLANO DE ACOMPANHAMENTO — AGENDA SUGERIDA (educativa; a decisão clínica é sua)',
  '',
  'Monitoramento de terapia com testosterona de USO PRESCRITO:',
  '[ ] Dosar testosterona total + hematócrito em 3, 6 e 12 meses após início/ajuste (SBEM/SBU/ABEMSS 2026; Endocrine Society 2018)',
  '[ ] PSA anual — individualizar conforme idade e fatores de risco',
  '[ ] Revisar sintomas, adesão e efeitos em cada retorno',
  '',
  'Fontes: diretrizes de sociedades médicas para USO PRESCRITO de testosterona.',
  'Agenda educativa gerada no Dr. Exame — não define conduta nem substitui a consulta.',
].join('\n');

/** Selo fixo do painel esportivo: tudo aqui é autodeclarado, nunca verificado. */
const DECLARED_BADGE = 'DECLARADO PELO PACIENTE — não verificado';

/** Labels amigáveis p/ as chaves conhecidas do contexto de coleta (Jsonb flexível do E1). */
const COLLECTION_LABELS: Record<string, string> = {
  treinoAte24h: 'Treinou até 24h antes da coleta',
  trainingBefore: 'Treinou antes da coleta',
  horario: 'Horário da coleta',
  jejum: 'Jejum',
  doencaRecente: 'Doença recente',
  illness: 'Doença recente',
  observacoes: 'Observações',
};

/** Humaniza chave desconhecida de Jsonb: camelCase → "Camel case". */
const humanKey = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** Render genérico de valor Jsonb declarado (string/boolean/número/objeto raso). */
const jsonValue = (v: unknown): ReactNode => {
  if (v == null) return null;
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, vv]) => vv != null && vv !== '')
      .map(([k, vv]) => `${COLLECTION_LABELS[k] ?? humanKey(k)}: ${typeof vv === 'boolean' ? (vv ? 'sim' : 'não') : String(vv)}`)
      .join(' · ');
  }
  return String(v);
};

/** Lista declarada (Jsonb do SportsProfile): aceita strings ou objetos pequenos. */
const declaredList = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  return v
    .map((it) => (typeof it === 'string' ? it.trim() : typeof it === 'object' && it ? Object.values(it as Record<string, unknown>).filter(Boolean).join(' · ') : ''))
    .map((s) => s.trim())
    .filter(Boolean);
};

interface SportsContextData {
  profile: {
    modality?: string | null;
    trainingFreq?: string | null;
    goals?: string | null;
    supplements?: unknown;
    collectionContext?: unknown;
    declaredSubstances?: unknown;
    active?: boolean;
    updatedAt?: string;
  } | null;
  disabledByPatient: boolean;
  medications: { id: string; name: string; dosage?: string | null; frequency?: string | null; notes?: string | null }[];
}

interface GoalSuggestion {
  analyte: string;
  unit: string;
  targetLow: number;
  targetHigh: number;
  source: string;
  reason: string;
  requiresReview: true;
}

interface GoalRow {
  id: string;
  analyte: string;
  unit?: string | null;
  targetLow?: number | null;
  targetHigh?: number | null;
  justification: string;
  source?: string | null;
  vigente?: boolean;
  setBy?: string;
}

const SectionCard = ({ title, children }: { title: string; children: ReactNode }) => (
  <Card
    variant="outlined"
    sx={{
      borderRadius: '20px',
      borderColor: (t: Theme) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.2)' : '#d8ece9'),
      boxShadow: (t: Theme) => (t.palette.mode === 'dark' ? '0 4px 20px rgba(0,0,0,0.25)' : '0 4px 14px rgba(32,178,170,0.05)'),
    }}
  >
    <CardContent sx={{ p: { xs: 2, md: 2.25 } }}>
      <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1.25, color: (t: Theme) => tealText(t.palette.mode), display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Medal size={16} weight="duotone" />{title}
      </Typography>
      {children}
    </CardContent>
  </Card>
);

/** Linha "label: valor" — só renderiza quando há valor. */
const Row = ({ label, value }: { label: string; value: ReactNode }) => {
  if (value == null || value === '') return null;
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', py: 0.4, minWidth: 0 }}>
      <Typography component="span" sx={{ fontWeight: 700, fontSize: 13.5, color: 'text.secondary', flexShrink: 0 }}>{label}:</Typography>
      <Typography component="span" sx={{ fontSize: 13.5, color: 'text.primary', wordBreak: 'break-word' }}>{value}</Typography>
    </Box>
  );
};

/**
 * SportsPanel (E5.2) — aba "Esportivo" do portal médico. SÓ é renderizada quando o share
 * tem o escopo 'sports' (gate em DoctorPortal computeTabs). Todo o conteúdo é DECLARADO
 * pelo paciente: o selo "DECLARADO PELO PACIENTE — não verificado" acompanha o painel e a
 * dose das substâncias aparece SEMPRE rotulada como declarada (nunca como prescrição).
 */
export const SportsPanel = ({ patientId, token, doctorId }: { patientId: string; token: string; doctorId: string }) => {
  const [data, setData] = useState<SportsContextData | null>(null);
  const [loading, setLoading] = useState(true);
  // E5.4 — sugestões de meta (E2.6) + metas vigentes, para o card de configuração rápida.
  const [suggestions, setSuggestions] = useState<GoalSuggestion[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [goalDialog, setGoalDialog] = useState<GoalSuggestion | null>(null);
  const [goalJustification, setGoalJustification] = useState('');
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalError, setGoalError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${API_URL}/doctor/${doctorId}/sports-context?patientId=${patientId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [patientId, token, doctorId]);

  const loadGoals = () => {
    const h = { Authorization: `Bearer ${token}` } as const;
    fetch(`${API_URL}/doctor/${doctorId}/clinical-goal-suggestions?patientId=${patientId}`, { headers: h })
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((d) => { setSuggestions(d.suggestions ?? []); })
      .catch(() => setSuggestions([]));
    fetch(`${API_URL}/doctor/${doctorId}/clinical-goals?patientId=${patientId}`, { headers: h })
      .then((r) => (r.ok ? r.json() : { goals: [] }))
      .then((d) => { setGoals(d.goals ?? []); })
      .catch(() => setGoals([]));
  };
  useEffect(loadGoals, [patientId, token, doctorId]);

  const createGoal = async () => {
    if (!goalDialog) return;
    if (!goalJustification.trim()) { setGoalError('A justificativa é obrigatória — o paciente vai vê-la junto com a meta.'); return; }
    setGoalSaving(true); setGoalError('');
    try {
      const r = await fetch(`${API_URL}/doctor/${doctorId}/clinical-goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patientId, analyte: goalDialog.analyte, unit: goalDialog.unit,
          targetLow: goalDialog.targetLow, targetHigh: goalDialog.targetHigh,
          source: goalDialog.source, justification: goalJustification.trim(),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao criar meta.');
      setGoalDialog(null); setGoalJustification('');
      loadGoals();
    } catch (e: any) { setGoalError(e.message || 'Falha ao criar meta.'); } finally { setGoalSaving(false); }
  };

  const vigenteByAnalyte = new Map(goals.filter((g) => g.vigente).map((g) => [g.analyte, g]));
  const openSuggestions = suggestions.filter((s) => !vigenteByAnalyte.has(s.analyte));

  // E5.6 — planos de acompanhamento salvos (DoctorNote category='plano').
  const [plans, setPlans] = useState<{ id: string; content: string; sharedAt?: string | null; createdAt: string }[]>([]);
  const [planText, setPlanText] = useState('');
  const [planBusy, setPlanBusy] = useState(false);
  const loadPlans = () => {
    fetch(`${API_URL}/doctor/patients/${patientId}/notes`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setPlans((d.items ?? []).filter((n: any) => n.category === 'plano')))
      .catch(() => {});
  };
  useEffect(loadPlans, [patientId, token]);

  const savePlan = async () => {
    if (!planText.trim()) return;
    setPlanBusy(true);
    try {
      const r = await fetch(`${API_URL}/doctor/patients/${patientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: planText.trim(), category: 'plano' }),
      });
      if (r.ok) { setPlanText(''); loadPlans(); }
    } finally { setPlanBusy(false); }
  };

  const sharePlan = async (id: string) => {
    setPlanBusy(true);
    try {
      const r = await fetch(`${API_URL}/doctor/notes/${id}/share`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) loadPlans();
    } finally { setPlanBusy(false); }
  };

  if (loading) {
    return (
      <Card sx={{ borderRadius: RADIUS.sectionCard }}><CardContent>
        <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>Carregando contexto esportivo…</Typography>
      </CardContent></Card>
    );
  }

  if (!data) {
    return <Empty label="Sem permissão para o contexto esportivo deste paciente." icon="🔒" />;
  }

  const p = data.profile;
  const substancesFromProfile = declaredList(p?.declaredSubstances);
  const supplements = declaredList(p?.supplements);
  const collectionEntries = p?.collectionContext && typeof p.collectionContext === 'object' && !Array.isArray(p.collectionContext)
    ? Object.entries(p.collectionContext as Record<string, unknown>).filter(([, v]) => v != null && v !== '' && v !== false)
    : [];

  return (
    <Stack spacing={1.5}>
      {/* SELO — contexto autodeclarado, nunca verificado */}
      <Card
        sx={{
          borderRadius: '20px',
          background: (t: Theme) =>
            t.palette.mode === 'dark'
              ? 'radial-gradient(ellipse 90% 70% at 10% 0%, rgba(212,165,116,0.12), transparent 70%), #1c2320'
              : 'radial-gradient(ellipse 90% 70% at 10% 0%, rgba(212,165,116,0.10), transparent 70%), #ffffff',
          border: '1px solid',
          borderColor: 'rgba(212,165,116,0.35)',
        }}
      >
        <CardContent sx={{ py: 1.75, px: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              label={DECLARED_BADGE}
              sx={{ fontWeight: 800, fontSize: 11, bgcolor: 'rgba(212,165,116,0.18)', color: (t: Theme) => copperText(t.palette.mode), border: '1px solid rgba(212,165,116,0.4)' }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Tudo nesta aba foi declarado pelo próprio paciente para dar contexto à interpretação — não é dado de prontuário verificado.
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {data.disabledByPatient && (
        <Empty label="O paciente desativou o modo Saúde Esportiva — o contexto declarado não está sendo compartilhado agora." icon="🏅" />
      )}

      {!data.disabledByPatient && !p && (
        <Empty label="Paciente ainda não declarou contexto esportivo (modalidade, treino, substâncias)." icon="🏅" />
      )}

      {!data.disabledByPatient && p && (
        <>
          <SectionCard title="Perfil esportivo declarado">
            <Row label="Modalidade" value={p.modality ?? null} />
            <Row label="Frequência de treino" value={p.trainingFreq ?? null} />
            <Row label="Objetivos declarados" value={p.goals ?? null} />
            {p.updatedAt && (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.75 }}>
                Última atualização pelo paciente: {new Date(p.updatedAt).toLocaleDateString('pt-BR')}
              </Typography>
            )}
          </SectionCard>

          {(substancesFromProfile.length > 0 || data.medications.length > 0) && (
            <SectionCard title="Substâncias e suplementos declarados">
              <Stack spacing={0.75}>
                {substancesFromProfile.map((s, i) => (
                  <Box key={`sp-${i}`} sx={{ p: 1, borderRadius: '12px', bgcolor: 'action.hover', display: 'flex', gap: 1, alignItems: 'baseline', minWidth: 0 }}>
                    <Syringe size={14} weight="duotone" style={{ flexShrink: 0, marginTop: 2 }} />
                    <Typography sx={{ fontSize: 13.5, wordBreak: 'break-word' }}>{s} <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}>· declarado pelo paciente</Typography></Typography>
                  </Box>
                ))}
                {data.medications.map((m) => (
                  <Box key={m.id} sx={{ p: 1, borderRadius: '12px', bgcolor: 'action.hover', minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 13.5, wordBreak: 'break-word' }}>{m.name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                      {[m.dosage, m.frequency].filter(Boolean).join(' · ')}{[m.dosage, m.frequency].some(Boolean) ? ' · dose declarada pelo paciente' : '· declarado pelo paciente'}
                    </Typography>
                    {m.notes && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{m.notes}</Typography>}
                  </Box>
                ))}
              </Stack>
              <Divider sx={{ my: 1.25 }} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Posologia é autodeclarada e não foi verificada. Diretrizes clínicas citadas no app referem-se a uso prescrito.
              </Typography>
            </SectionCard>
          )}

          {supplements.length > 0 && (
            <SectionCard title="Suplementos declarados">
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {supplements.map((s, i) => (
                  <Chip key={`sup-${i}`} size="small" label={s} sx={{ fontWeight: 600, borderRadius: '999px' }} />
                ))}
              </Stack>
            </SectionCard>
          )}

          {collectionEntries.length > 0 && (
            <SectionCard title="Contexto de coleta declarado">
              {collectionEntries.map(([k, v]) => (
                <Row key={k} label={COLLECTION_LABELS[k] ?? humanKey(k)} value={jsonValue(v)} />
              ))}
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.75 }}>
                Contexto declarado informa a interpretação — nunca suprime alerta nem muda a faixa de referência do laboratório.
              </Typography>
            </SectionCard>
          )}
        </>
      )}

      {/* E5.4 — metas clínicas vigentes + sugestões de configuração rápida (fonte sempre visível). */}
      <SectionCard title="Metas clínicas e sugestões">
        {[...vigenteByAnalyte.values()].length > 0 && (
          <Stack spacing={0.75} sx={{ mb: 1.5 }}>
            {[...vigenteByAnalyte.values()].map((g) => (
              <Box key={g.id} sx={{ p: 1, borderRadius: '12px', bgcolor: 'rgba(212,165,116,.10)', border: '1px solid rgba(212,165,116,.25)' }}>
                <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>
                  🎯 {prettyAnalyte(g.analyte)}: {goalRangeText(g)} {g.setBy ? `· ${g.setBy}` : ''}
                </Typography>
                {g.source && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Fonte: {g.source}</Typography>}
              </Box>
            ))}
          </Stack>
        )}
        {openSuggestions.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {suggestions.length > 0
              ? 'Todas as sugestões disponíveis já foram configuradas como metas vigentes.'
              : 'Sem sugestões de meta no momento — elas aparecem quando o padrão do paciente encontra diretriz aplicável.'}
          </Typography>
        )}
        {openSuggestions.map((s) => (
          <Box key={s.analyte} sx={{ p: 1.25, borderRadius: '14px', bgcolor: 'action.hover', mb: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
              <Target size={16} weight="duotone" />
              <Typography sx={{ fontWeight: 800, fontSize: 13.5 }}>{prettyAnalyte(s.analyte)} — {goalRangeText(s)}</Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Fonte: {s.source}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{s.reason}.</Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
              <Button
                size="small" variant="contained"
                onClick={() => { setGoalDialog(s); setGoalJustification(''); setGoalError(''); }}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '999px' }}
              >
                Configurar meta
              </Button>
              <Typography variant="caption" sx={{ color: (t: Theme) => copperText(t.palette.mode), fontWeight: 700 }}>
                Diretrizes citadas referem-se a uso prescrito — revisão médica obrigatória.
              </Typography>
            </Stack>
          </Box>
        ))}
      </SectionCard>

      {/* E5.6 — plano de acompanhamento: checklist TRT educativo (agenda sugerida). */}
      <SectionCard title="Plano de acompanhamento (educativo)">
        <Box sx={{ p: 1.25, borderRadius: '12px', bgcolor: 'action.hover', mb: 1.5 }}>
          {TRT_PLAN_TEMPLATE.split('\n').slice(0, 7).map((line, i) => (
            <Typography key={i} variant="caption" sx={{ display: 'block', color: line.startsWith('[') ? 'text.primary' : 'text.secondary', fontWeight: line.startsWith('[') ? 700 : 400, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {line}
            </Typography>
          ))}
          <Typography variant="caption" sx={{ color: (t: Theme) => copperText(t.palette.mode), fontWeight: 700, display: 'block', mt: 0.5 }}>
            AGENDA sugerida por diretrizes de USO PRESCRITO — a decisão clínica é sua.
          </Typography>
        </Box>
        <TextField
          label="Plano (edição livre antes de salvar)"
          value={planText}
          onChange={(e) => setPlanText(e.target.value)}
          onFocus={() => { if (!planText) setPlanText(TRT_PLAN_TEMPLATE); }}
          multiline minRows={6} fullWidth size="small"
          placeholder="Toque para carregar o checklist editável…"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px', fontSize: 13 } }}
        />
        <Button size="small" variant="contained" onClick={savePlan} disabled={planBusy || !planText.trim()} sx={{ mt: 1, textTransform: 'none', fontWeight: 700, borderRadius: '999px' }}>
          Salvar plano
        </Button>
        {plans.length > 0 && (
          <Stack spacing={1} sx={{ mt: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>Planos salvos</Typography>
            {plans.map((pl) => (
              <Box key={pl.id} sx={{ p: 1.25, borderRadius: '12px', border: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                  <ListChecks size={14} weight="duotone" />
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {new Date(pl.createdAt).toLocaleDateString('pt-BR')}
                  </Typography>
                  {pl.sharedAt ? (
                    <Chip size="small" label={`Compartilhado em ${new Date(pl.sharedAt).toLocaleDateString('pt-BR')}`} sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(32,178,170,.10)', color: (t: Theme) => tealText(t.palette.mode) }} />
                  ) : (
                    <Button size="small" variant="outlined" disabled={planBusy} onClick={() => sharePlan(pl.id)} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '999px', minHeight: 28 }}>
                      Compartilhar com o paciente
                    </Button>
                  )}
                </Stack>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', whiteSpace: 'pre-wrap', maxHeight: 96, overflow: 'hidden' }}>
                  {pl.content.split('\n')[0]}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </SectionCard>

      {/* Dialog de configuração rápida de meta (justificativa editável OBRIGATÓRIA). */}
      <Dialog open={!!goalDialog} onClose={() => setGoalDialog(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '18px' } }}>
        <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif' }}>
          {goalDialog ? `Meta clínica — ${prettyAnalyte(goalDialog.analyte)}` : ''}
        </DialogTitle>
        <DialogContent>
          {goalDialog && (
            <Stack spacing={1.5} sx={{ mt: 0.5 }}>
              <Box sx={{ p: 1.25, borderRadius: '12px', bgcolor: 'action.hover' }}>
                <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Alvo sugerido: {goalRangeText(goalDialog)}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Fonte: {goalDialog.source}</Typography>
              </Box>
              <TextField
                label="Justificativa clínica (obrigatória — visível ao paciente)"
                value={goalJustification}
                onChange={(e) => setGoalJustification(e.target.value)}
                multiline minRows={3} fullWidth size="small"
                error={!!goalError && !goalJustification.trim()}
                helperText={goalError && !goalJustification.trim() ? goalError : 'Edite livremente: motivo clínico da meta. Máx. 500 caracteres.'}
                inputProps={{ maxLength: 500 }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
              />
              {goalError && goalJustification.trim() && <Typography variant="caption" sx={{ color: 'error.main' }}>{goalError}</Typography>}
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Se já existia meta vigente para este analito, ela é substituída (histórico preservado). A meta NUNCA altera flags de alerta — ela adiciona a banda tracejada nos gráficos.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setGoalDialog(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancelar</Button>
          <Button variant="contained" onClick={createGoal} disabled={goalSaving} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 3 }}>
            {goalSaving ? <CircularProgress size={20} color="inherit" /> : 'Salvar meta'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

/** ALL CAPS canônico → legível (mesma régua do DoctorTrends, preserva siglas). */
const prettyAnalyte = (n: string) => (n || '').split('_').map((tok) => (tok.length <= 5 && /^[A-Z0-9]+$/.test(tok) ? tok : tok.toLowerCase().replace(/(^|\s)\w/g, (m) => m.toUpperCase()))).join(' ');
