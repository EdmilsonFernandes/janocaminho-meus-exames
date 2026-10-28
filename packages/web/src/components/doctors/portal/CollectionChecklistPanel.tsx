import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress,
  IconButton, Stack, TextField, Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ScienceIcon from '@mui/icons-material/Science';
import { API_URL } from '../../../config';
import { tealText } from '../../../theme';

// CHECKLIST DE COLETA (T2, 28/10/26) — "Plano de coleta" no painel do paciente do portal.
// Médico adiciona exames a coletar (nome livre + autocomplete) com prazo em chips 30/60/90/180
// e instrução curta. Paciente recebe push neutro + lembrete; exame extraído com canonical
// batente marca ✓ sozinho. Mobile-first 360-412px, toque 44px, teal (cobre NÃO — contexto médico ativo).

const DUE_OPTIONS = [30, 60, 90, 180] as const;

/** Sugestões de analito (autocomplete LIVRE — qualquer texto é aceito). Nomencelatura
 *  comum de labs BR; a chave de match é o canonicalName calculado no server. */
const ANALYTE_SUGGESTIONS = [
  'Hemograma completo', 'Hemoglobina', 'Leucócitos', 'Plaquetas',
  'Glicemia de jejum', 'Hemoglobina glicada (HbA1c)', 'Insulina',
  'Colesterol total', 'LDL colesterol', 'HDL colesterol', 'Triglicerídeos',
  'Creatinina', 'Ureia', 'Ácido úrico', 'TGO (AST)', 'TGP (ALT)', 'Gama-GT', 'Fosfatase alcalina',
  'PCR ultrassensível', 'Ferritina', 'Vitamina D', 'Vitamina B12',
  'TSH', 'T4 livre', 'T3',
  'Sódio', 'Potássio', 'Cálcio', 'Magnésio',
  'Testosterona total', 'PSA', 'TSH de controle',
];

type ChecklistItem = {
  id: string;
  analyteName: string;
  instruction: string | null;
  dueAt: string;
  status: string; // pending | collected | expired
  collectedAt: string | null;
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pendente', color: '#b45309', bg: 'rgba(245,158,11,.12)' },
  collected: { label: 'Coletado ✓', color: '#059669', bg: 'rgba(16,185,129,.10)' },
  expired: { label: 'Vencido', color: '#b91c1c', bg: 'rgba(239,68,68,.08)' },
};

const daysLeft = (dueAt: string): number => Math.ceil((new Date(dueAt).getTime() - Date.now()) / 86400_000);

export const CollectionChecklistPanel = ({ patientId, token }: { patientId: string; token: string }) => {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [analyte, setAnalyte] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [dueDays, setDueDays] = useState<number>(30);
  const [instruction, setInstruction] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/doctor/patients/${patientId}/checklist`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setItems(d.items ?? []);
    } catch { setErr('Não foi possível carregar o plano de coleta.'); }
    finally { setLoaded(true); }
  }, [patientId, token]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    const name = (analyte ?? input).trim();
    if (name.length < 2) { setErr('Informe o exame a coletar.'); return; }
    setSaving(true); setErr('');
    try {
      const r = await fetch(`${API_URL}/doctor/patients/${patientId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ analyteName: name, dueInDays: dueDays, instruction: instruction.trim() || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao adicionar.');
      setAnalyte(null); setInput(''); setInstruction('');
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id)); // otimista
    await fetch(`${API_URL}/doctor/patients/${patientId}/checklist/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    }).catch(() => void load());
  };

  const pending = useMemo(() => items.filter((i) => i.status === 'pending'), [items]);
  const history = useMemo(() => items.filter((i) => i.status !== 'pending'), [items]);

  return (
    <Card sx={{ borderRadius: '20px', border: '1px solid', borderColor: 'divider', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
      <CardContent sx={{ p: { xs: 2, md: 2.25 } }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          <ScienceIcon sx={{ fontSize: 20, color: (t) => tealText(t.palette.mode) }} />
          <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif' }}>Plano de coleta</Typography>
          {pending.length > 0 && (
            <Chip size="small" label={`${pending.length} pendente${pending.length > 1 ? 's' : ''}`} sx={{ fontWeight: 700, borderRadius: '999px', bgcolor: 'rgba(32,178,170,.10)', color: (t) => tealText(t.palette.mode) }} />
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Exames que o paciente deve coletar — o app lembra com push e marca ✓ quando o resultado chega.
        </Typography>

        {/* FORM INLINE: analito (autocomplete livre) + chips de prazo + instrução */}
        <Stack spacing={1.5}>
          <Autocomplete
            freeSolo
            options={ANALYTE_SUGGESTIONS}
            value={analyte}
            inputValue={input}
            onInputChange={(_, v) => { setInput(v); setAnalyte(null); }}
            onChange={(_, v) => { setAnalyte(typeof v === 'string' ? v : null); setInput(typeof v === 'string' ? v : ''); }}
            renderInput={(params) => (
              <TextField {...params} label="Exame a coletar" placeholder="Ex.: Hemoglobina glicada" size="small" />
            )}
          />
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            {DUE_OPTIONS.map((d) => (
              <Chip
                key={d}
                label={`${d} dias`}
                clickable
                onClick={() => setDueDays(d)}
                sx={{
                  minHeight: 44, px: 0.5, fontWeight: 700, borderRadius: '999px',
                  ...(dueDays === d
                    ? { bgcolor: 'primary.main', color: '#fff', '& .MuiChip-label': { color: '#fff' } }
                    : { bgcolor: 'rgba(32,178,170,.08)', color: (t) => tealText(t.palette.mode) }),
                }}
              />
            ))}
          </Stack>
          <TextField
            label="Instrução (opcional)"
            placeholder="Ex.: jejum 12h"
            size="small"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            inputProps={{ maxLength: 140 }}
          />
          {err && <Alert severity="error" sx={{ py: 0.5, borderRadius: '12px' }}>{err}</Alert>}
          <Button
            onClick={add}
            disabled={saving || (analyte ?? input).trim().length < 2}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ alignSelf: 'flex-start', minHeight: 44, textTransform: 'none', fontWeight: 700, borderRadius: '12px', color: (t) => tealText(t.palette.mode) }}
          >
            {saving ? 'Adicionando…' : 'Adicionar ao plano'}
          </Button>
        </Stack>

        {/* LISTA — pendentes primeiro; histórico compacto embaixo */}
        {!loaded ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={22} /></Box>
        ) : (
          <Stack spacing={1} sx={{ mt: 2.5 }}>
            {pending.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
                Nenhum exame pendente de coleta.
              </Typography>
            )}
            {pending.map((i) => {
              const left = daysLeft(i.dueAt);
              return (
                <Stack key={i.id} direction="row" alignItems="center" spacing={1} sx={{ p: 1.25, borderRadius: '14px', bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,.04)' : 'rgba(32,178,170,.05)'), border: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{i.analyteName}</Typography>
                    <Typography variant="caption" sx={{ display: 'block', color: left < 0 ? '#b91c1c' : 'text.secondary' }}>
                      prazo: {left < 0 ? `venceu há ${-left} d` : left === 0 ? 'hoje' : `em ${left} d`}
                      {i.instruction ? ` · ${i.instruction}` : ''}
                    </Typography>
                  </Box>
                  <Chip size="small" label="Pendente" sx={{ borderRadius: '999px', bgcolor: STATUS_META.pending.bg, color: STATUS_META.pending.color, fontWeight: 700 }} />
                  <IconButton aria-label={`Remover ${i.analyteName} do plano`} onClick={() => void remove(i.id)} sx={{ color: 'text.secondary', minWidth: 44, minHeight: 44 }}>
                    <DeleteOutlineIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Stack>
              );
            })}
            {history.length > 0 && (
              <Box sx={{ pt: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>Histórico</Typography>
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  {history.slice(0, 8).map((i) => {
                    const m = STATUS_META[i.status] ?? STATUS_META.pending;
                    return (
                      <Stack key={i.id} direction="row" alignItems="center" spacing={1} sx={{ px: 1, py: 0.5, borderRadius: '10px' }}>
                        <Typography variant="body2" sx={{ flex: 1, minWidth: 0, color: 'text.secondary', textDecoration: i.status === 'collected' ? 'none' : 'none' }}>{i.analyteName}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {i.status === 'collected' && i.collectedAt ? new Date(i.collectedAt).toLocaleDateString('pt-BR') : new Date(i.dueAt).toLocaleDateString('pt-BR')}
                        </Typography>
                        <Chip size="small" label={m.label} sx={{ borderRadius: '999px', bgcolor: m.bg, color: m.color, fontWeight: 700, height: 22 }} />
                      </Stack>
                    );
                  })}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};
