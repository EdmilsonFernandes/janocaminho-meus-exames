import { useEffect, useState, type ReactNode } from 'react';
import { Box, Card, CardContent, Typography, Stack, Chip, Divider, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, Grid } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { API_URL } from '../../../config';
import { Empty } from './NotesTab';
import { copperText, tealText, RADIUS, SEM } from '../../../theme';
import { goalRangeText } from '../../../utils/clinicalGoals';
import type { Theme } from '@mui/material/styles';
import { Medal, Syringe, Target, ListChecks, Heartbeat, FirstAid } from '@phosphor-icons/react';

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

const SectionCard = ({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) => (
  <Card
    variant="outlined"
    sx={{
      borderRadius: RADIUS.card,
      borderColor: (t: Theme) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.22)' : 'rgba(32,178,170,0.18)'),
      boxShadow: (t: Theme) => (t.palette.mode === 'dark' ? '0 4px 20px rgba(0,0,0,0.25)' : '0 4px 14px rgba(32,178,170,0.05)'),
      bgcolor: 'background.paper',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <CardContent sx={{ p: { xs: 2, md: 2.5 }, flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Typography
        sx={{
          fontWeight: 800,
          fontSize: 14.5,
          mb: 1.5,
          color: (t: Theme) => tealText(t.palette.mode),
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {icon || <Medal size={18} weight="duotone" />}
        {title}
      </Typography>
      <Box sx={{ flex: 1 }}>{children}</Box>
    </CardContent>
  </Card>
);

/** Linha "label: valor" — só renderiza quando há valor. */
const Row = ({ label, value }: { label: string; value: ReactNode }) => {
  if (value == null || value === '') return null;
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', py: 0.5, minWidth: 0 }}>
      <Typography component="span" sx={{ fontWeight: 700, fontSize: 13.5, color: 'text.secondary', flexShrink: 0 }}>
        {label}:
      </Typography>
      <Typography component="span" sx={{ fontSize: 13.5, color: 'text.primary', wordBreak: 'break-word', fontWeight: 500 }}>
        {value}
      </Typography>
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
      <Card sx={{ borderRadius: RADIUS.card }}>
        <CardContent>
          <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            Carregando contexto esportivo…
          </Typography>
        </CardContent>
      </Card>
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

  const totalActiveSubstances = substancesFromProfile.length + data.medications.length;
  const totalVigenteGoals = vigenteByAnalyte.size;

  return (
    <Stack spacing={2.5}>
      {/* ── HERO EXECUTIVO: Selo Autodeclarado + Mini KPIs do Atleta ── */}
      <Card
        sx={{
          borderRadius: RADIUS.card,
          background: (t: Theme) =>
            t.palette.mode === 'dark'
              ? 'radial-gradient(ellipse 90% 70% at 10% 0%, rgba(212,165,116,0.16), transparent 70%), #141f1e'
              : 'radial-gradient(ellipse 90% 70% at 10% 0%, rgba(212,165,116,0.12), transparent 70%), #ffffff',
          border: '1px solid',
          borderColor: 'rgba(212,165,116,0.35)',
          boxShadow: '0 4px 18px rgba(0,0,0,0.04)',
        }}
      >
        <CardContent sx={{ py: 2, px: { xs: 2, md: 2.5 } }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap justifyContent="space-between">
              <Chip
                size="small"
                label={DECLARED_BADGE}
                sx={{
                  fontWeight: 800,
                  fontSize: 11,
                  bgcolor: 'rgba(212,165,116,0.20)',
                  color: (t: Theme) => copperText(t.palette.mode),
                  border: '1px solid rgba(212,165,116,0.45)',
                  py: 0.25,
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>
                Informações autodeclaradas pelo paciente para interpretação de performance clínica.
              </Typography>
            </Stack>

            {/* Quick Glance Chips */}
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {p?.modality && (
                <Chip
                  size="small"
                  icon={<Medal size={14} weight="duotone" />}
                  label={`Modalidade: ${p.modality}${p.trainingFreq ? ` (${p.trainingFreq})` : ''}`}
                  sx={{ height: 26, fontSize: 12, fontWeight: 700, bgcolor: 'action.hover' }}
                />
              )}
              <Chip
                size="small"
                icon={<Syringe size={14} weight="duotone" />}
                label={`${totalActiveSubstances} substância${totalActiveSubstances === 1 ? '' : 's'} informada${totalActiveSubstances === 1 ? '' : 's'}`}
                sx={{ height: 26, fontSize: 12, fontWeight: 700, bgcolor: 'action.hover' }}
              />
              <Chip
                size="small"
                icon={<Target size={14} weight="duotone" />}
                label={`${totalVigenteGoals} meta${totalVigenteGoals === 1 ? '' : 's'} clínica${totalVigenteGoals === 1 ? '' : 's'} vigente${totalVigenteGoals === 1 ? '' : 's'}`}
                sx={{ height: 26, fontSize: 12, fontWeight: 700, bgcolor: 'action.hover' }}
              />
            </Stack>
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
        <Grid container spacing={2.5}>
          {/* ── COLUNA DA ESQUERDA: Perfil Esportivo, Substâncias & Contexto de Coleta ── */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={2.5}>
              <SectionCard title="Perfil Esportivo Declarado" icon={<Medal size={18} weight="duotone" />}>
                <Row label="Modalidade" value={p.modality ?? null} />
                <Row label="Frequência de treino" value={p.trainingFreq ?? null} />
                <Row label="Objetivos declarados" value={p.goals ?? null} />
                {p.updatedAt && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1, fontSize: 11.5 }}>
                    Última atualização pelo paciente: {new Date(p.updatedAt).toLocaleDateString('pt-BR')}
                  </Typography>
                )}
              </SectionCard>

              {(substancesFromProfile.length > 0 || data.medications.length > 0) && (
                <SectionCard title="Substâncias Informadas pelo Paciente" icon={<Syringe size={18} weight="duotone" />}>
                  <Stack spacing={1}>
                    {substancesFromProfile.map((s, i) => (
                      <Box
                        key={`sp-${i}`}
                        sx={{
                          p: 1.25,
                          borderRadius: '12px',
                          bgcolor: 'action.hover',
                          border: '1px solid',
                          borderColor: 'divider',
                          display: 'flex',
                          gap: 1,
                          alignItems: 'baseline',
                          minWidth: 0,
                        }}
                      >
                        <Syringe size={16} weight="duotone" style={{ flexShrink: 0, marginTop: 2, color: '#d4a574' }} />
                        <Typography sx={{ fontSize: 13.5, wordBreak: 'break-word', fontWeight: 600 }}>
                          {s} <Typography component="span" variant="caption" sx={{ color: 'text.secondary', fontWeight: 400 }}>· declarado pelo paciente</Typography>
                        </Typography>
                      </Box>
                    ))}
                    {data.medications.map((m) => (
                      <Box
                        key={m.id}
                        sx={{
                          p: 1.25,
                          borderRadius: '12px',
                          bgcolor: 'action.hover',
                          border: '1px solid',
                          borderColor: 'divider',
                          minWidth: 0,
                        }}
                      >
                        <Typography sx={{ fontWeight: 800, fontSize: 13.5, wordBreak: 'break-word' }}>{m.name}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                          {[m.dosage, m.frequency].filter(Boolean).join(' · ')}{[m.dosage, m.frequency].some(Boolean) ? ' · dose autodeclarada' : ' · autodeclarado'}
                        </Typography>
                        {m.notes && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>{m.notes}</Typography>}
                      </Box>
                    ))}
                  </Stack>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.45 }}>
                    *Posologia é autodeclarada pelo paciente. Diretrizes clínicas citadas referem-se estritamente a uso prescrito com acompanhamento.
                  </Typography>
                </SectionCard>
              )}

              {supplements.length > 0 && (
                <SectionCard title="Suplementos Declarados" icon={<Heartbeat size={18} weight="duotone" />}>
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                    {supplements.map((s, i) => (
                      <Chip key={`sup-${i}`} size="small" label={s} sx={{ fontWeight: 700, borderRadius: '999px', bgcolor: 'action.hover' }} />
                    ))}
                  </Stack>
                </SectionCard>
              )}

              {collectionEntries.length > 0 && (
                <SectionCard title="Contexto de Coleta Declarado" icon={<FirstAid size={18} weight="duotone" />}>
                  {collectionEntries.map(([k, v]) => (
                    <Row key={k} label={COLLECTION_LABELS[k] ?? humanKey(k)} value={jsonValue(v)} />
                  ))}
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1, lineHeight: 1.45 }}>
                    Contexto declarado informa a interpretação médica — nunca altera os limites nem suprime os alertas originais do laboratório.
                  </Typography>
                </SectionCard>
              )}
            </Stack>
          </Grid>

          {/* ── COLUNA DA DIREITA: Metas Clínicas & Plano de Acompanhamento TRT ── */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={2.5}>
              {/* E5.4 — Metas Clínicas vigentes + sugestões de diretriz médica */}
              <SectionCard title="Metas Clínicas & Sugestões" icon={<Target size={18} weight="duotone" />}>
                {[...vigenteByAnalyte.values()].length > 0 && (
                  <Stack spacing={1} sx={{ mb: 1.75 }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Metas vigentes configuradas:
                    </Typography>
                    {[...vigenteByAnalyte.values()].map((g) => (
                      <Box
                        key={g.id}
                        sx={{
                          p: 1.25,
                          borderRadius: '12px',
                          bgcolor: 'rgba(212,165,116,.10)',
                          border: '1px solid rgba(212,165,116,.30)',
                        }}
                      >
                        <Typography sx={{ fontWeight: 800, fontSize: 13.5, color: (t: Theme) => copperText(t.palette.mode) }}>
                          🎯 {prettyAnalyte(g.analyte)}: {goalRangeText(g)} {g.setBy ? `· ${g.setBy}` : ''}
                        </Typography>
                        {g.source && (
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                            Fonte: {g.source}
                          </Typography>
                        )}
                        {g.justification && (
                          <Typography variant="caption" sx={{ color: 'text.primary', display: 'block', mt: 0.25, fontStyle: 'italic' }}>
                            "{g.justification}"
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Stack>
                )}

                {openSuggestions.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                    {suggestions.length > 0
                      ? 'Todas as sugestões de diretriz disponíveis já foram configuradas como metas vigentes.'
                      : 'Sem sugestões de meta no momento — elas surgem quando os analitos do paciente encontram diretrizes clínicas aplicáveis.'}
                  </Typography>
                )}

                {openSuggestions.map((s) => (
                  <Box
                    key={s.analyte}
                    sx={{
                      p: 1.5,
                      borderRadius: '14px',
                      bgcolor: 'action.hover',
                      border: '1px solid',
                      borderColor: 'divider',
                      mb: 1.25,
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                      <Target size={16} weight="duotone" style={{ color: '#20b2aa' }} />
                      <Typography sx={{ fontWeight: 800, fontSize: 14 }}>
                        {prettyAnalyte(s.analyte)} — {goalRangeText(s)}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                      <b>Fonte:</b> {s.source}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                      {s.reason}.
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.25 }} flexWrap="wrap" useFlexGap>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => { setGoalDialog(s); setGoalJustification(''); setGoalError(''); }}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 800,
                          borderRadius: '999px',
                          px: 2,
                          touchAction: 'manipulation',
                        }}
                      >
                        Configurar meta
                      </Button>
                      <Typography variant="caption" sx={{ color: (t: Theme) => copperText(t.palette.mode), fontWeight: 700 }}>
                        Revisão médica obrigatória
                      </Typography>
                    </Stack>
                  </Box>
                ))}
              </SectionCard>

              {/* E5.6 — Plano de acompanhamento: checklist TRT educativo */}
              <SectionCard title="Plano de Acompanhamento (Educativo)" icon={<ListChecks size={18} weight="duotone" />}>
                <Box
                  sx={{
                    p: 1.25,
                    borderRadius: '12px',
                    bgcolor: 'action.hover',
                    border: '1px solid',
                    borderColor: 'divider',
                    mb: 1.5,
                  }}
                >
                  {TRT_PLAN_TEMPLATE.split('\n').slice(0, 7).map((line, i) => (
                    <Typography
                      key={i}
                      variant="caption"
                      sx={{
                        display: 'block',
                        color: line.startsWith('[') ? 'text.primary' : 'text.secondary',
                        fontWeight: line.startsWith('[') ? 700 : 400,
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {line}
                    </Typography>
                  ))}
                  <Typography variant="caption" sx={{ color: (t: Theme) => copperText(t.palette.mode), fontWeight: 700, display: 'block', mt: 0.75 }}>
                    AGENDA sugerida por diretrizes de USO PRESCRITO — a decisão clínica é do médico.
                  </Typography>
                </Box>

                <TextField
                  label="Plano (edição livre antes de salvar)"
                  value={planText}
                  onChange={(e) => setPlanText(e.target.value)}
                  onFocus={() => { if (!planText) setPlanText(TRT_PLAN_TEMPLATE); }}
                  multiline
                  minRows={5}
                  fullWidth
                  size="small"
                  placeholder="Toque para carregar o checklist editável…"
                  inputProps={{ style: { fontSize: 13, lineHeight: 1.5 } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                />

                <Button
                  size="small"
                  variant="contained"
                  onClick={savePlan}
                  disabled={planBusy || !planText.trim()}
                  sx={{
                    mt: 1.25,
                    textTransform: 'none',
                    fontWeight: 800,
                    borderRadius: '999px',
                    px: 2.5,
                    touchAction: 'manipulation',
                  }}
                >
                  Salvar plano
                </Button>

                {plans.length > 0 && (
                  <Stack spacing={1} sx={{ mt: 2 }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Planos salvos
                    </Typography>
                    {plans.map((pl) => (
                      <Box key={pl.id} sx={{ p: 1.25, borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                          <ListChecks size={15} weight="duotone" />
                          <Typography variant="caption" sx={{ fontWeight: 800 }}>
                            {new Date(pl.createdAt).toLocaleDateString('pt-BR')}
                          </Typography>
                          {pl.sharedAt ? (
                            <Chip
                              size="small"
                              label={`Compartilhado em ${new Date(pl.sharedAt).toLocaleDateString('pt-BR')}`}
                              sx={{
                                height: 22,
                                fontSize: 11,
                                fontWeight: 800,
                                bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.12),
                                color: (t: Theme) => tealText(t.palette.mode),
                              }}
                            />
                          ) : (
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={planBusy}
                              onClick={() => sharePlan(pl.id)}
                              sx={{
                                textTransform: 'none',
                                fontWeight: 700,
                                borderRadius: '999px',
                                minHeight: 26,
                                py: 0.2,
                                fontSize: 11.5,
                              }}
                            >
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
            </Stack>
          </Grid>
        </Grid>
      )}

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
                inputProps={{ maxLength: 500, style: { fontSize: 14 } }}
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
