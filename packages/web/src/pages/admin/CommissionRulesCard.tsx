// §18.2 (Onda 2, 24/10) — CONDIÇÃO COMERCIAL DE COMISSÕES: UI do admin para
// GET/POST /admin/commission-rules e DELETE /admin/commission-rules/doctor/:doctorId
// Regra GERAL vigente em destaque + específicas por médico.
// Conectado com o seletor de médico do topo da aba financeira para visualização e customização direta.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Card, TextField, MenuItem, Dialog,
  DialogTitle, DialogContent, DialogActions, IconButton, Collapse, useTheme,
} from '@mui/material';
import PercentOutlinedIcon from '@mui/icons-material/PercentOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import CheckCircleOutlineOutlinedIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import { API_URL, token as authToken } from '../../config';
import { tealText } from '../../theme';

const brl = (cents: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents ?? 0) / 100);
const dtFmt = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const pctFmt = (bps: number) => `${(bps / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

type RuleValues = { platformBps: number; feeBearer: 'platform' | 'doctor'; releaseDelayDays: number; minPayoutCents: number };
interface CommissionRule extends RuleValues {
  id: string;
  doctorId: string | null;
  validFrom: string;
  validTo: string | null;
}

const isVigente = (r: CommissionRule) => {
  const now = Date.now();
  return new Date(r.validFrom).getTime() <= now && (r.validTo == null || new Date(r.validTo).getTime() > now);
};

/** Resumo em linguagem humana — o mesmo formato da linha em destaque do card. */
const resumo = (r: RuleValues) =>
  `${pctFmt(r.platformBps)} plataforma · ${pctFmt(10_000 - r.platformBps)} médico · taxas: ${r.feeBearer === 'platform' ? 'plataforma' : 'médico'} · liberação D+${r.releaseDelayDays} · repasse mín. ${brl(r.minPayoutCents)}`;

export const CommissionRulesCard = ({
  doctors,
  selectedDoctorId = '',
  onSelectDoctor,
}: {
  doctors: { id: string; name: string; crm: string }[];
  selectedDoctorId?: string;
  onSelectDoctor?: (id: string) => void;
}) => {
  const t = useTheme();
  const mode = t.palette.mode as 'light' | 'dark';
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [general, setGeneral] = useState<CommissionRule | null>(null);
  const [defaults, setDefaults] = useState<RuleValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Reset de médico específico (volta à regra geral)
  const [resetDoctorTarget, setResetDoctorTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  // Formulário — escopo '' = regra geral; senão id do médico (regra específica).
  const [scope, setScope] = useState('');
  const [pctStr, setPctStr] = useState('');
  const [feeBearer, setFeeBearer] = useState<'platform' | 'doctor'>('platform');
  const [delayStr, setDelayStr] = useState('');
  const [minStr, setMinStr] = useState('');
  const [pending, setPending] = useState<RuleValues | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${API_URL}/admin/commission-rules`, { headers: { Authorization: `Bearer ${authToken()}` } });
      if (!r.ok) throw new Error('Falha ao carregar a condição comercial.');
      const j = await r.json();
      setRules(j.rules ?? []);
      setGeneral(j.active?.general ?? null);
      setDefaults(j.active?.defaults ?? null);
    } catch (e: any) {
      setErr(e?.message ?? 'Falha ao carregar a condição comercial.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const specifics = useMemo(() => rules.filter((r) => r.doctorId && isVigente(r)), [rules]);
  const historico = useMemo(
    () => [...rules].sort((a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime()),
    [rules],
  );
  const doctorName = useCallback(
    (id: string) => doctors.find((d) => d.id === id)?.name ?? `Médico ${id.slice(0, 8)}…`,
    [doctors],
  );

  const selectedDoctorObj = useMemo(
    () => (selectedDoctorId ? doctors.find((d) => d.id === selectedDoctorId) : null),
    [doctors, selectedDoctorId],
  );
  const activeDocRule = useMemo(
    () => (selectedDoctorId ? specifics.find((s) => s.doctorId === selectedDoctorId) : null),
    [specifics, selectedDoctorId],
  );

  const applyValues = (base: RuleValues) => {
    setPctStr(String(base.platformBps / 100));
    setFeeBearer(base.feeBearer === 'doctor' ? 'doctor' : 'platform');
    setDelayStr(String(base.releaseDelayDays));
    setMinStr((base.minPayoutCents / 100).toFixed(2).replace('.', ','));
  };

  const openForm = (targetScope?: string) => {
    const sc = targetScope !== undefined ? targetScope : selectedDoctorId;
    setScope(sc);
    const spec = sc ? specifics.find((s) => s.doctorId === sc) : null;
    if (spec) {
      applyValues(spec);
    } else {
      applyValues(general ?? defaults ?? { platformBps: 2000, feeBearer: 'platform', releaseDelayDays: 3, minPayoutCents: 2000 });
    }
    setFormErr(null);
    setFormOpen(true);
  };

  const parseForm = (): { error: string } | RuleValues => {
    const p = Number(String(pctStr).replace(',', '.'));
    const d = Number(String(delayStr).trim());
    const min = Math.round(Number(String(minStr).replace(',', '.')) * 100);
    if (!Number.isFinite(p) || p < 0 || p > 100) return { error: 'A % da plataforma deve estar entre 0 e 100.' };
    if (!Number.isInteger(d) || d < 0 || d > 90) return { error: 'Liberação deve ser um número inteiro de dias entre 0 e 90.' };
    if (!Number.isFinite(min) || min < 0) return { error: 'Repasse mínimo deve ser um valor em reais (maior ou igual a zero).' };
    return { platformBps: Math.round(p * 100), feeBearer, releaseDelayDays: d, minPayoutCents: min };
  };

  const review = () => {
    const parsed = parseForm();
    if ('error' in parsed) { setFormErr(parsed.error); return; }
    setFormErr(null);
    setPending(parsed);
    setFormOpen(false);
    setConfirmOpen(true);
  };

  // POST cria nova vigência — o server encerra a anterior (histórico append-only).
  const confirmSave = useCallback(async () => {
    if (!pending) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/admin/commission-rules`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(scope ? { doctorId: scope } : {}), ...pending }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? 'Falha ao salvar a nova condição.');
      setConfirmOpen(false);
      setFormOpen(false);
      setFeedback(scope
        ? `Nova condição específica ativa para ${doctorName(scope)} desde agora — vale para novos agendamentos dele.`
        : `Nova condição geral ativa desde agora${j?.closedRules ? ' (a vigência anterior foi encerrada)' : ''} — vale para novos agendamentos.`);
      await load();
    } catch (e: any) {
      setConfirmOpen(false);
      setFormOpen(true);
      setFormErr(e?.message ?? 'Falha ao salvar a nova condição.');
    } finally {
      setSaving(false);
    }
  }, [pending, scope, load, doctorName]);

  const confirmResetDoctor = useCallback(async () => {
    if (!resetDoctorTarget) return;
    setResetBusy(true);
    try {
      const res = await fetch(`${API_URL}/admin/commission-rules/doctor/${resetDoctorTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken()}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Falha ao reverter condição comercial.');
      setResetDoctorTarget(null);
      setFeedback(`Condição exclusiva de ${resetDoctorTarget.name} encerrada. O médico voltou a seguir a Regra Geral da plataforma.`);
      await load();
    } catch (e: any) {
      setErr(e?.message ?? 'Falha ao reverter condição.');
    } finally {
      setResetBusy(false);
    }
  }, [resetDoctorTarget, load]);

  const cur = general ?? defaults;
  const medicoPct = (() => {
    const p = Number(String(pctStr).replace(',', '.'));
    return Number.isFinite(p) && p >= 0 && p <= 100 ? 100 - p : null;
  })();

  return (
    <Box sx={{ borderRadius: '16px', border: '1px solid', borderColor: 'divider', p: { xs: 1.5, sm: 2 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 1.5 }} alignItems={{ sm: 'center' }}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
          <PercentOutlinedIcon sx={{ fontSize: 20, color: tealText(mode) }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 14 }}>
              Condição comercial de comissões
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              Como plataforma e médico dividem cada teleconsulta · mudar não recalcula o passado
            </Typography>
          </Box>
        </Stack>
        <Button
          variant="contained"
          startIcon={<EditOutlinedIcon />}
          onClick={() => openForm()}
          disabled={loading || !!err}
          sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 40, px: 2.2 }}
        >
          {selectedDoctorId ? 'Alterar condição' : 'Alterar condição geral'}
        </Button>
      </Stack>

      {loading && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>Carregando condição comercial…</Typography>}

      {!loading && err && (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5 }}>
          <Typography variant="body2" sx={{ flex: 1, color: mode === 'dark' ? '#f87171' : '#b91c1c' }}>{err}</Typography>
          <Button size="small" onClick={load} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 40 }}>Tentar de novo</Button>
        </Stack>
      )}

      {/* CASO 1: Médico específico selecionado no topo do painel financeiro */}
      {!loading && !err && selectedDoctorObj && (
        <Card
          variant="outlined"
          sx={{
            mt: 1.5,
            p: { xs: 1.5, sm: 2 },
            borderRadius: '14px',
            bgcolor: activeDocRule
              ? (mode === 'dark' ? 'rgba(212,165,116,0.06)' : 'rgba(212,165,116,0.08)')
              : (mode === 'dark' ? 'rgba(32,178,170,0.04)' : 'rgba(32,178,170,0.06)'),
            borderColor: activeDocRule ? 'rgba(212,165,116,0.6)' : 'rgba(32,178,170,0.4)',
          }}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <PersonOutlineOutlinedIcon sx={{ fontSize: 18, color: activeDocRule ? '#d4a574' : tealText(mode) }} />
              <Typography sx={{ fontWeight: 800, fontSize: 14 }}>
                {selectedDoctorObj.name} · CRM {selectedDoctorObj.crm}
              </Typography>
              <Chip
                size="small"
                icon={activeDocRule ? <PercentOutlinedIcon sx={{ fontSize: 13 }} /> : <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 13 }} />}
                label={activeDocRule ? 'Condição Exclusiva Deste Médico' : 'Seguindo a Regra Geral'}
                sx={{
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 11.5,
                  minHeight: 24,
                  bgcolor: activeDocRule ? 'rgba(212,165,116,0.22)' : 'rgba(32,178,170,0.16)',
                  color: activeDocRule ? '#b45309' : tealText(mode),
                  border: `1px solid ${activeDocRule ? 'rgba(212,165,116,0.6)' : 'rgba(32,178,170,0.4)'}`,
                }}
              />
            </Stack>

            {onSelectDoctor && (
              <Button
                size="small"
                onClick={() => onSelectDoctor('')}
                sx={{ textTransform: 'none', fontSize: 11.5, p: 0, minHeight: 'auto', color: 'text.secondary', textDecoration: 'underline' }}
              >
                Ver condição geral de todos os médicos →
              </Button>
            )}
          </Stack>

          <Typography sx={{ fontWeight: 800, fontSize: { xs: 14.5, sm: 16 }, mt: 1, lineHeight: 1.4, color: 'text.primary' }}>
            {activeDocRule ? resumo(activeDocRule) : (cur ? resumo(cur) : '—')}
          </Typography>

          {activeDocRule ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" sx={{ mt: 1.25 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Condição exclusiva ativa desde {dtFmt(activeDocRule.validFrom)} · Regra geral seria: {cur ? resumo(cur) : '—'}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<EditOutlinedIcon />}
                  onClick={() => openForm(selectedDoctorId)}
                  sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700, fontSize: 12 }}
                >
                  Editar comissão deste médico
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  startIcon={<RestartAltOutlinedIcon />}
                  onClick={() => setResetDoctorTarget({ id: selectedDoctorId, name: selectedDoctorObj.name })}
                  sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700, fontSize: 12 }}
                >
                  Voltar à Regra Geral
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" sx={{ mt: 1.25 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Este médico não possui regra personalizada e segue 100% as diretrizes gerais da plataforma.
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddOutlinedIcon />}
                onClick={() => openForm(selectedDoctorId)}
                sx={{
                  borderRadius: '10px', textTransform: 'none', fontWeight: 800, fontSize: 12,
                  borderColor: 'rgba(212,165,116,0.6)', color: '#b45309',
                  '&:hover': { bgcolor: 'rgba(212,165,116,0.08)', borderColor: '#b45309' },
                }}
              >
                + Definir condição exclusiva para este médico
              </Button>
            </Stack>
          )}
        </Card>
      )}

      {/* CASO 2: Visualização Geral (Nenhum médico filtrado ou "Todos os médicos") */}
      {!loading && !err && !selectedDoctorObj && (
        <Card variant="outlined" sx={{ mt: 1.5, p: { xs: 1.5, sm: 2 }, borderRadius: '14px', bgcolor: 'background.default', borderColor: 'rgba(32,178,170,.4)' }}>
          <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75 }}>
            <Chip label={general ? 'Geral · vigente' : 'Padrão do sistema'} size="small"
              sx={{ borderRadius: 8, fontWeight: 700, minHeight: 26, color: tealText(mode), bgcolor: 'rgba(32,178,170,.16)', border: '1px solid rgba(32,178,170,.4)' }} />
            {general && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>desde {dtFmt(general.validFrom)}</Typography>
            )}
          </Stack>
          <Typography sx={{ fontWeight: 800, fontSize: { xs: 14.5, sm: 16 }, mt: 0.75, lineHeight: 1.5, color: 'text.primary' }}>
            {cur ? resumo(cur) : '—'}
          </Typography>
          {!general && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
              Sem regra cadastrada — hipótese padrão do sistema. Criar a primeira condição registra o histórico.
            </Typography>
          )}
        </Card>
      )}

      {/* Lista de Condições Específicas cadastradas */}
      {!loading && !err && (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 13 }}>
              Condições específicas por médico ({specifics.length})
            </Typography>
            <Button
              size="small"
              startIcon={<AddOutlinedIcon />}
              onClick={() => openForm(doctors[0]?.id || '')}
              sx={{ textTransform: 'none', fontSize: 12, fontWeight: 700, color: tealText(mode) }}
            >
              + Nova condição para médico
            </Button>
          </Stack>
          {specifics.length === 0 ? (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              Nenhuma — todos os médicos usam a condição geral.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {specifics.map((r) => {
                const docId = r.doctorId as string;
                const isCurrentSelected = selectedDoctorId === docId;
                return (
                  <Card
                    key={r.id}
                    variant="outlined"
                    sx={{
                      p: 1.25,
                      borderRadius: '10px',
                      borderColor: isCurrentSelected ? 'rgba(212,165,116,0.8)' : 'divider',
                      bgcolor: isCurrentSelected ? (mode === 'dark' ? 'rgba(212,165,116,0.06)' : 'rgba(212,165,116,0.06)') : 'transparent',
                    }}
                  >
                    <Stack direction="column" spacing={1} sx={{ width: '100%' }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap" sx={{ width: '100%' }}>
                        <Chip
                          label={doctorName(docId)}
                          size="small"
                          onClick={() => onSelectDoctor?.(docId)}
                          sx={{
                            borderRadius: '8px',
                            fontWeight: 800,
                            minHeight: 26,
                            cursor: 'pointer',
                            color: '#b45309',
                            border: '1px solid rgba(212,165,116,.6)',
                            bgcolor: 'rgba(212,165,116,0.12)',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                            '& .MuiChip-label': { px: 1.25, whiteSpace: 'nowrap' },
                          }}
                        />
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Button
                            size="small"
                            onClick={() => openForm(docId)}
                            sx={{ textTransform: 'none', fontSize: 11.5, fontWeight: 700, minHeight: 28, py: 0 }}
                          >
                            Editar
                          </Button>
                          <Button
                            size="small"
                            color="warning"
                            onClick={() => setResetDoctorTarget({ id: docId, name: doctorName(docId) })}
                            sx={{ textTransform: 'none', fontSize: 11.5, fontWeight: 700, minHeight: 28, py: 0 }}
                          >
                            Voltar ao geral
                          </Button>
                        </Stack>
                      </Stack>
                      <Typography sx={{ fontSize: 12.5, color: 'text.secondary', fontWeight: 500, lineHeight: 1.45 }}>
                        {resumo(r)}
                      </Typography>
                    </Stack>
                  </Card>
                );
              })}
            </Stack>
          )}
        </Box>
      )}

      {/* Histórico de vigências — append-only, nunca editado nem apagado */}
      {!loading && !err && historico.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ cursor: 'pointer' }} onClick={() => setShowHistory((v) => !v)}>
            <Typography sx={{ fontWeight: 800, fontSize: 13, flex: 1 }}>Histórico de condições cadastradas · {historico.length}</Typography>
            <IconButton size="small" aria-label="Expandir histórico de condições" aria-expanded={showHistory} sx={{ color: 'text.secondary', transform: showHistory ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
              <ExpandMoreOutlinedIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Collapse in={showHistory}>
            <Stack spacing={0.75} sx={{ mt: 1 }}>
              {historico.map((r) => (
                <Stack key={r.id} direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0, sm: 1.5 }} alignItems={{ sm: 'center' }} sx={{ fontSize: 13 }}>
                  {isVigente(r) ? (
                    <Chip label="vigente" size="small" sx={{ borderRadius: 8, fontWeight: 700, minHeight: 26, width: { xs: '100%', sm: 170 }, justifyContent: 'flex-start', color: tealText(mode), border: '1px solid rgba(32,178,170,.4)', bgcolor: 'transparent' }} />
                  ) : (
                    <Chip label="encerrada" size="small" sx={{ borderRadius: 8, fontWeight: 700, minHeight: 26, width: { xs: '100%', sm: 170 }, justifyContent: 'flex-start', color: 'text.secondary', border: '1px solid', borderColor: 'divider', bgcolor: 'transparent' }} />
                  )}
                  <Typography component="span" sx={{ fontSize: 13, flex: 1, minWidth: 0 }}>
                    {r.doctorId ? doctorName(r.doctorId) : 'Geral'} · {resumo(r)}
                  </Typography>
                  <Typography component="span" sx={{ fontSize: 12.5, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                    {dtFmt(r.validFrom)} → {r.validTo ? dtFmt(r.validTo) : 'hoje'}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Collapse>
        </Box>
      )}

      {feedback && (
        <Card variant="outlined" sx={{ mt: 1.5, p: 1.5, borderRadius: '12px', bgcolor: 'transparent', borderColor: 'rgba(32,178,170,.4)' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography sx={{ fontSize: 13.5, flex: 1 }}>{feedback}</Typography>
            <IconButton size="small" aria-label="Fechar aviso" onClick={() => setFeedback(null)} sx={{ color: 'text.secondary' }}>
              <ExpandMoreOutlinedIcon sx={{ transform: 'rotate(90deg)' }} fontSize="small" />
            </IconButton>
          </Stack>
        </Card>
      )}

      {/* Modal de confirmação para Voltar à Regra Geral (remover personalização) */}
      <Dialog open={!!resetDoctorTarget} onClose={() => setResetDoctorTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif' }}>
          Voltar à Regra Geral?
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Deseja encerrar a comissão personalizada de <strong>{resetDoctorTarget?.name}</strong>?
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
            A vigência exclusiva deste médico será finalizada e ele passará a seguir automaticamente a <strong>Regra Geral vigente</strong> da plataforma nos próximos agendamentos.
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            Consultas antigas já faturadas permanecem inalteradas no livro-razão financeiro.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setResetDoctorTarget(null)} disabled={resetBusy} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700 }}>
            Cancelar
          </Button>
          <Button variant="contained" color="warning" onClick={confirmResetDoctor} disabled={resetBusy} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700 }}>
            {resetBusy ? 'Encerrando…' : 'Confirmar e Voltar à Regra Geral'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Formulário da nova vigência */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif' }}>
          {scope ? `Definir comissão para ${doctorName(scope)}` : 'Alterar condição comercial geral'}
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <TextField select fullWidth size="small" label="Escopo" value={scope}
              onChange={(e) => {
                const v = e.target.value;
                setScope(v);
                const spec = v ? specifics.find((s) => s.doctorId === v) : null;
                if (spec) applyValues(spec);
                else if (!v) applyValues(general ?? defaults ?? { platformBps: 2000, feeBearer: 'platform', releaseDelayDays: 3, minPayoutCents: 2000 });
              }}
              helperText="Regra específica substitui a geral exclusivamente para esse médico"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13.5 } }}>
              <MenuItem value="">Geral — todos os médicos</MenuItem>
              {doctors.map((d) => (<MenuItem key={d.id} value={d.id}>{d.name} · CRM {d.crm}</MenuItem>))}
            </TextField>
            <TextField fullWidth size="small" type="number" label="% da plataforma" value={pctStr} onChange={(e) => setPctStr(e.target.value)}
              helperText={medicoPct == null ? 'Entre 0 e 100' : `Médico recebe ${medicoPct.toLocaleString('pt-BR')}% de cada consulta`}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13.5 } }} />
            <TextField select fullWidth size="small" label="Quem paga as taxas do provedor" value={feeBearer} onChange={(e) => setFeeBearer(e.target.value as 'platform' | 'doctor')}
              helperText="Quem absorve as taxas de pagamento (Asaas)"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13.5 } }}>
              <MenuItem value="platform">Plataforma</MenuItem>
              <MenuItem value="doctor">Médico</MenuItem>
            </TextField>
            <TextField fullWidth size="small" type="number" label="Liberação (dias)" value={delayStr} onChange={(e) => setDelayStr(e.target.value)}
              helperText="Dias após o pagamento até o repasse ficar liberado ao médico (D+N)"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13.5 } }} />
            <TextField fullWidth size="small" label="Repasse mínimo (R$)" value={minStr} onChange={(e) => setMinStr(e.target.value)}
              helperText="Abaixo disso o valor fica retido até acumular"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13.5 } }} />
            {formErr && <Typography variant="caption" sx={{ color: mode === 'dark' ? '#f87171' : '#b91c1c', fontWeight: 700 }}>{formErr}</Typography>}
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Salvar encerra a vigência atual e cria uma nova a partir de agora. Aplica-se a NOVOS agendamentos — consultas antigas mantêm a condição congelada.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFormOpen(false)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 44 }}>Cancelar</Button>
          <Button variant="contained" onClick={review} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 44 }}>Revisar e salvar</Button>
        </DialogActions>
      </Dialog>

      {/* Confirmação — ação financeira mostra os valores ANTES de salvar */}
      <Dialog open={confirmOpen} onClose={() => { setConfirmOpen(false); setFormOpen(true); }} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif' }}>Confirmar nova condição</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Escopo: <strong>{scope ? `${doctorName(scope)} (específica)` : 'Geral — todos os médicos'}</strong>
          </Typography>
          <Typography sx={{ fontWeight: 800, fontSize: 15, lineHeight: 1.5, mb: 1.5, color: tealText(mode) }}>
            {pending ? resumo(pending) : ''}
          </Typography>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Numa consulta de R$ 100,00: plataforma {pending ? brl(Math.round(pending.platformBps)) : ''} · médico {pending ? brl(10_000 - Math.round(pending.platformBps)) : ''}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 0.5 }}>
            <WarningAmberOutlinedIcon sx={{ fontSize: 18, color: mode === 'dark' ? '#fbbf24' : '#b45309', mt: 0.25 }} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Aplica-se a NOVOS agendamentos — consultas antigas mantêm a condição congelada. A vigência atual é encerrada e fica no histórico (nunca é apagada).
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setConfirmOpen(false); setFormOpen(true); }} disabled={saving} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 44 }}>Voltar</Button>
          <Button variant="contained" onClick={confirmSave} disabled={saving} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, minHeight: 44 }}>
            {saving ? 'Salvando…' : 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
