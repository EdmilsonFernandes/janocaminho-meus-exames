import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MedicationIcon from '@mui/icons-material/Medication';
import ShieldIcon from '@mui/icons-material/Shield';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { API_URL, apiHeaders, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { ListSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { AppCard } from '../components/AppCard';
import { GradientButton } from '../components/GradientButton';
import { useNotify } from 'react-admin';

/** Severidade → cor/label (tons 800 p/ AA, mesma régua do app). */
const SEV: Record<string, { color: string; label: string; bg: string }> = {
  X: { color: '#b91c1c', label: 'Contraindicação', bg: 'rgba(185,28,28,.10)' },
  D: { color: '#b91c1c', label: 'Interação maior', bg: 'rgba(185,28,28,.08)' },
  C: { color: '#b45309', label: 'Moderada', bg: 'rgba(180,83,9,.10)' },
  B: { color: '#92400e', label: 'Menor', bg: 'rgba(146,64,14,.08)' },
  A: { color: '#64748b', label: 'Desprezível', bg: 'rgba(100,116,139,.08)' },
};

interface Med { id: string; name: string; dosage?: string | null; frequency?: string | null; active: boolean }
interface Hit { drugA: string; drugB: string; severity: string; effect: string; recommendation: string; matchedA: string; matchedB: string }

export const MedicationsPage = () => {
  const notify = useNotify();
  const [pid] = useSelectedPatient();
  const [meds, setMeds] = useState<Med[] | null>(null);
  const [check, setCheck] = useState<{ critical: Hit[]; activeMeds: number; hasMore?: boolean } | null>(null);
  const [full, setFull] = useState<{ all: (Hit & { severityLabel?: string })[]; contextual?: string | null } | null>(null);
  const [fullLoading, setFullLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', dosage: '', frequency: '' });

  const load = useCallback(async () => {
    if (!pid) return;
    setMeds(null);
    const h = { Authorization: `Bearer ${token()}` };
    try {
      const [m, c] = await Promise.all([
        fetch(`${API_URL}/medications?patientId=${pid}`, { headers: h }).then((r) => (r.ok ? r.json() : [])),
        fetch(`${API_URL}/medications/check?patientId=${pid}`, { headers: h }).then((r) => (r.ok ? r.json() : null)),
      ]);
      setMeds(m); setCheck(c);
    } catch { setMeds([]); }
  }, [pid]);

  useEffect(() => { void load(); }, [load]);

  const addMed = async () => {
    if (!form.name.trim()) { notify('Informe o nome do remédio.', { type: 'error' }); return; }
    const r = await fetch(`${API_URL}/medications`, { method: 'POST', headers: apiHeaders(true), body: JSON.stringify({ patientId: pid, ...form }) });
    if (r.ok) { setAddOpen(false); setForm({ name: '', dosage: '', frequency: '' }); notify('Remédio adicionado', { type: 'success' }); void load(); setFull(null); }
    else notify('Falha ao salvar', { type: 'error' });
  };

  const toggle = async (m: Med) => {
    const r = await fetch(`${API_URL}/medications/${m.id}`, { method: 'PATCH', headers: apiHeaders(true), body: JSON.stringify({ active: !m.active }) });
    if (r.ok) { void load(); setFull(null); }
  };
  const remove = async (m: Med) => {
    const r = await fetch(`${API_URL}/medications/${m.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { void load(); setFull(null); }
  };

  const runFull = async () => {
    setFullLoading(true);
    try {
      const r = await fetch(`${API_URL}/medications/check/full`, { method: 'POST', headers: apiHeaders(true), body: JSON.stringify({ patientId: pid }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 402) { notify(d.message || 'Sem créditos — compre um pacote em Planos.', { type: 'warning' }); return; }
      if (!r.ok) { notify(d.error || 'Falha na análise', { type: 'error' }); return; }
      setFull(d);
    } finally { setFullLoading(false); }
  };

  const active = (meds ?? []).filter((m) => m.active);
  const inactive = (meds ?? []).filter((m) => !m.active);
  const HitCard = ({ h, dim }: { h: Hit; dim?: boolean }) => {
    const s = SEV[h.severity] ?? SEV.C;
    return (
      <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: s.bg, border: '1px solid', borderColor: s.color + '33', opacity: dim ? 0.75 : 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: 'wrap' }}>
          <Chip size="small" label={`${h.severity} · ${s.label}`} sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: s.color, color: '#fff' }} />
          <Typography sx={{ fontWeight: 700, fontSize: 13.5, color: 'text.primary' }}>{h.drugA} + {h.drugB}</Typography>
        </Stack>
        <Typography sx={{ fontSize: 13, color: 'text.primary', opacity: 0.85 }}>{h.effect}</Typography>
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.5 }}>💡 {h.recommendation}</Typography>
      </Box>
    );
  };

  return (
    <PageContainer width="narrow">
      <PageHeader icon={<MedicationIcon />} title="Remédios" subtitle="Seus remédios de uso contínuo e a checagem de interações entre eles." />
      <GradientButton startIcon={<AddIcon />} onClick={() => setAddOpen(true)} sx={{ mb: 2 }}>Adicionar remédio</GradientButton>

      {meds == null && <ListSkeleton count={3} />}
      {meds != null && meds.length === 0 && (
        <EmptyState emoji="💊" title="Nenhum remédio cadastrado" desc="Cadastre os remédios que você usa todo dia (ex.: varfarina 5mg). O Dr. Exame avisa se algum par tem interação conhecida." />
      )}

      {/* CHECAGEM CRÍTICA (grátis, sempre visível — segurança não se cobra) */}
      {check && check.activeMeds >= 2 && (
        <AppCard kind={check.critical.length > 0 ? 'accent' : 'tinted'} tone={check.critical.length > 0 ? 'error' : 'success'} sx={{ mb: 2 }}>
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={1} alignItems="center">
              <ShieldIcon sx={{ color: check.critical.length > 0 ? 'error.main' : 'success.main', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 800, fontSize: 15 }}>{check.critical.length > 0 ? '⚠️ Interações críticas encontradas' : '✅ Nenhuma interação crítica'}</Typography>
            </Stack>
            {check.critical.map((h, i) => <HitCard key={i} h={h} />)}
            {check.hasMore && <Typography variant="caption" sx={{ color: 'text.secondary' }}>Há interações de severidade menor — veja tudo na análise completa abaixo.</Typography>}
          </Stack>
        </AppCard>
      )}

      {active.length > 0 && (
        <Stack spacing={1} sx={{ mb: inactive.length ? 2 : 0 }}>
          {active.map((m) => (
            <Card key={m.id} elevation={0} sx={{ p: 1.5, borderRadius: '12px', border: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <MedicationIcon sx={{ color: 'primary.dark', fontSize: 20 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, color: 'text.primary' }}>{m.name}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{[m.dosage, m.frequency].filter(Boolean).join(' · ') || 'uso contínuo'}</Typography>
                </Box>
                <Button size="small" onClick={() => toggle(m)} sx={{ textTransform: 'none', borderRadius: '999px' }}>Suspender</Button>
                <IconButton size="small" onClick={() => remove(m)} aria-label={`Excluir ${m.name}`}><DeleteOutlineIcon fontSize="small" /></IconButton>
              </Stack>
            </Card>
          ))}
        </Stack>
      )}
      {inactive.length > 0 && (
        <Stack spacing={0.75}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mt: 1 }}>SUSPENSOS (não entram na checagem)</Typography>
          {inactive.map((m) => (
            <Card key={m.id} elevation={0} sx={{ p: 1, borderRadius: '12px', border: '1px dashed', borderColor: 'divider', opacity: 0.7 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography sx={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{m.name}</Typography>
                <Button size="small" onClick={() => toggle(m)} sx={{ textTransform: 'none' }}>Retomar</Button>
                <IconButton size="small" onClick={() => remove(m)} aria-label={`Excluir ${m.name}`}><DeleteOutlineIcon fontSize="small" /></IconButton>
              </Stack>
            </Card>
          ))}
        </Stack>
      )}

      {/* ANÁLISE COMPLETA (créditos): todas as severidades + leitura da IA p/ SEUS exames */}
      {active.length >= 2 && (
        <AppCard kind="tinted" tone="primary" sx={{ mt: 3 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center">
              <AutoAwesomeIcon sx={{ color: 'primary.dark', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 800, fontSize: 15 }}>Análise completa de interações</Typography>
            </Stack>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Todas as severidades + o Dr. Exame cruza com SEUS exames e monta as perguntas certas pra levar ao médico. Consome 2 créditos.</Typography>
            <GradientButton onClick={runFull} disabled={fullLoading}>{fullLoading ? 'Analisando…' : 'Analisar com IA (2 créditos)'}</GradientButton>
            {full && (
              <Stack spacing={1}>
                {(full.all ?? []).length === 0 && <Typography sx={{ color: 'success.main', fontWeight: 700 }}>✅ Nenhuma interação conhecida entre seus remédios.</Typography>}
                {(full.all ?? []).map((h, i) => <HitCard key={i} h={h} dim={!['D', 'X'].includes(h.severity)} />)}
                {full.contextual && (
                  <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'action.hover', whiteSpace: 'pre-wrap', fontSize: 13.5, color: 'text.primary' }}>{full.contextual}</Box>
                )}
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Educativo — as decisões sobre seus remédios são do seu médico.</Typography>
              </Stack>
            )}
          </Stack>
        </AppCard>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Adicionar remédio</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Nome (use o genérico: varfarina, omeprazol…)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
            <TextField label="Dose (opcional — ex.: 5 mg)" value={form.dosage} onChange={(e) => setForm((f) => ({ ...f, dosage: e.target.value }))} />
            <TextField label="Frequência (opcional — ex.: 1× ao dia)" value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button variant="contained" onClick={addMed} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Salvar</Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};
