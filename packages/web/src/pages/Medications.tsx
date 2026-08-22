import { useCallback, useEffect, useRef, useState } from 'react';
// (useCallback já importado acima — preview fetch é memoizado)
import { Autocomplete, Box, Button, Card, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MedicationIcon from '@mui/icons-material/Medication';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import ShieldIcon from '@mui/icons-material/Shield';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { API_URL, apiHeaders, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { ListSkeleton } from '../components/Skeleton';
import { AppCard } from '../components/AppCard';
import { GradientButton } from '../components/GradientButton';
import { searchMeds, QUICK_MEDS, type MedEntry } from '../data/meds-br';
import { useNotify } from 'react-admin';

/** Severidade → cor/label (tons 800 p/ AA, mesma régua do app). */
const SEV: Record<string, { color: string; label: string; bg: string }> = {
  X: { color: '#b91c1c', label: 'Contraindicação', bg: 'rgba(185,28,28,.10)' },
  D: { color: '#b91c1c', label: 'Interação maior', bg: 'rgba(185,28,28,.08)' },
  C: { color: '#b45309', label: 'Moderada', bg: 'rgba(180,83,9,.10)' },
  B: { color: '#92400e', label: 'Menor', bg: 'rgba(146,64,14,.08)' },
  A: { color: '#64748b', label: 'Desprezível', bg: 'rgba(100,116,139,.08)' },
};

interface Med {
  id: string; name: string; dosage?: string | null; frequency?: string | null; active: boolean;
  priceStatus?: string; packQty?: number | null;
  priceSummary?: { lowestPriceCents?: number | null; offersCount?: number; collectedAt?: string; imageUrl?: string | null } | null;
}
interface PriceOffer { pharmacy: string; productName: string; priceCents: number; url: string; imageUrl?: string | null; ean?: string | null }
interface PricesResp { status: string; snapshot?: { lowestPriceCents?: number | null; offersCount: number; collectedAt: string; expiresAt: string; offers: PriceOffer[] } | null }

const fmtBRL = (cents?: number | null) => (cents == null ? '—' : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
interface Hit { drugA: string; drugB: string; severity: string; effect: string; recommendation: string }
interface CheckResp { critical: Hit[]; unmatched: string[]; activeMeds: number; hasMore?: boolean }

/** Avatar do remédio: inicial + cor estável derivada do nome (paleta do sistema, tons AA
 *  sobre a lavagem própria) — "logo bonitinho" sem depender de imagem externa/direitos. */
const MED_TONES: [string, string][] = [['#178f89', '#20b2aa'], ['#b88a54', '#d4a574'], ['#0369a1', '#0ea5e9'], ['#047857', '#059669'], ['#b45309', '#f59e0b'], ['#b91c1c', '#ef4444']];
const medTone = (n: string): [string, string] => MED_TONES[[...(n || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % MED_TONES.length];
const MedAvatar = ({ name, size = 36 }: { name: string; size?: number }) => {
  const [fg, wash] = medTone(name);
  return (
    <Box sx={{ width: size, height: size, borderRadius: '11px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: wash + '22', color: fg, fontWeight: 800, fontSize: size * 0.42, fontFamily: 'Poppins, sans-serif' }}>
      {(name || '?').trim().charAt(0).toUpperCase()}
    </Box>
  );
};

export const MedicationsPage = () => {
  const notify = useNotify();
  const [pid] = useSelectedPatient();
  const [meds, setMeds] = useState<Med[] | null>(null);
  const [check, setCheck] = useState<CheckResp | null>(null);
  const [full, setFull] = useState<{ all: Hit[]; contextual?: string | null } | null>(null);
  const [fullLoading, setFullLoading] = useState(false);

  // diálogo ADICIONAR: autocomplete que busca no CATÁLOGO do servidor (com foto + preço)
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<MedEntry | null>(null);
  const [dose, setDose] = useState('');
  const [freeName, setFreeName] = useState('');
  const [catalogResults, setCatalogResults] = useState<{ name: string; brands?: string[]; photoUrl?: string | null; priceCents?: number | null; productName?: string | null; pharmacy?: string | null }[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // busca no catálogo do servidor (com debounce 300ms) — cai pro dicionário local se server não tem
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setCatalogResults([]); return; }
    const t = setTimeout(async () => {
      setCatalogLoading(true);
      try {
        const r = await fetch(`${API_URL}/medications/catalog?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token()}` } });
        const results = r.ok ? await r.json() : [];
        if (Array.isArray(results) && results.length > 0) setCatalogResults(results);
        else setCatalogResults(searchMeds(q).map((m) => ({ name: m.name, brands: m.brands }))); // fallback local
      } catch { setCatalogResults(searchMeds(q).map((m) => ({ name: m.name, brands: m.brands }))); }
      finally { setCatalogLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // diálogo ESCANEAR (foto → IA → confirma)
  const [scanOpen, setScanOpen] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<{ name: string; dosage: string; on: boolean }[]>([]);
  const photoInput = useRef<HTMLInputElement>(null);

  // PREÇOS: dialog de ofertas + pergunta contextual da embalagem
  const [pricesFor, setPricesFor] = useState<Med | null>(null);
  const [pricesData, setPricesData] = useState<PricesResp | null>(null);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [packFor, setPackFor] = useState<Med | null>(null);

  const openPrices = async (m: Med) => {
    setPricesFor(m); setPricesData(null); setPricesLoading(true);
    try {
      const r = await fetch(`${API_URL}/medications/${m.id}/prices`, { headers: { Authorization: `Bearer ${token()}` } });
      setPricesData(r.ok ? await r.json() : { status: m.priceStatus ?? 'not_requested' });
    } finally { setPricesLoading(false); }
  };

  const setPack = async (m: Med, qty: number) => {
    const r = await fetch(`${API_URL}/medications/${m.id}`, { method: 'PATCH', headers: apiHeaders(true), body: JSON.stringify({ packQty: qty }) });
    if (r.ok) { setPackFor(null); notify('Embalagem salva — buscando preços…', { type: 'success' }); void load(); setTimeout(() => void load(), 5000); setTimeout(() => void load(), 12000); }
  };

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

  const saveMeds = async (items: { name: string; dosage?: string | null }[]) => {
    if (!items.length) return;
    const r = await fetch(`${API_URL}/medications/bulk`, { method: 'POST', headers: apiHeaders(true), body: JSON.stringify({ patientId: pid, items }) });
    if (r.ok) {
      const d = await r.json(); notify(`${d.created} remédio(s) salvos`, { type: 'success' });
      void load(); setFull(null);
      // Preço chega em background (worker): re-carrega a lista em cascata p/ o card "acordar"
      setTimeout(() => void load(), 5000); setTimeout(() => void load(), 12000);
    }
    else notify('Falha ao salvar', { type: 'error' });
  };

  const addPicked = async () => {
    const name = picked?.name ?? freeName.trim();
    if (!name) { notify('Escolha um remédio ou digite o nome', { type: 'error' }); return; }
    await saveMeds([{ name, dosage: dose || null }]);
    setAddOpen(false); setPicked(null); setQuery(''); setDose(''); setFreeName('');
  };

  const quickAdd = async (name: string) => { await saveMeds([{ name }]); };

  const onPhoto = async (f?: File) => {
    if (!f) return;
    if (f.size > 6 * 1024 * 1024) { notify('Foto muito grande (máx. 6MB)', { type: 'error' }); return; }
    setScanOpen(true); setScanLoading(true); setSuggestions([]);
    try {
      const fd = new FormData(); fd.append('photo', f);
      const r = await fetch(`${API_URL}/medications/scan-photo`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { notify(d.error || 'Não conseguimos ler a foto', { type: 'warning' }); setScanOpen(false); return; }
      if (!d.suggestions?.length) { notify('Nenhum remédio identificado — adicione manualmente', { type: 'info' }); setScanOpen(false); return; }
      setSuggestions(d.suggestions.map((s: any) => ({ name: s.name, dosage: s.dosage || '', on: true })));
    } catch { notify('Falha ao enviar a foto', { type: 'error' }); setScanOpen(false); }
    finally { setScanLoading(false); }
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
      if (r.status === 402) { notify(d.message || 'Sem créditos — veja os planos.', { type: 'warning' }); return; }
      if (!r.ok) { notify(d.error || 'Falha na análise', { type: 'error' }); return; }
      setFull(d);
    } finally { setFullLoading(false); }
  };

  const active = (meds ?? []).filter((m) => m.active);
  const inactive = (meds ?? []).filter((m) => !m.active);
  const options = searchMeds(query);

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
      <PageHeader icon={<MedicationIcon />} title="Remédios" subtitle="Cadastre em segundos — fotografe a receita ou toque nos mais comuns." />

      {/* AÇÕES — foto primeiro (zero digitação), adicionar com busca inteligente */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <GradientButton startIcon={<PhotoCameraIcon />} onClick={() => photoInput.current?.click()} sx={{ flex: 1 }}>Ler receita</GradientButton>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setAddOpen(true)} sx={{ flex: 1, borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Adicionar</Button>
        <input ref={photoInput} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { void onPhoto(e.target.files?.[0]); if (e.target) e.target.value = ''; }} />
      </Stack>

      {meds == null && <ListSkeleton count={3} />}

      {/* VAZIO — chips 1-toque dos mais usados (cadastro em segundos) */}
      {meds != null && meds.length === 0 && (
        <AppCard kind="tinted" tone="primary" sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 15, mb: 1 }}>Toque no que você usa:</Typography>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            {QUICK_MEDS.map((name) => (
              <Chip key={name} label={name} onClick={() => void quickAdd(name)}
                sx={{ borderRadius: '999px', fontWeight: 700, height: 34, mb: 0.5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', '&:active': { transform: 'scale(.96)' } }} />
            ))}
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>Não achou? Use "Adicionar" (busca por marca: Levoid, Glifage, Rivotril…) ou fotografe a receita.</Typography>
        </AppCard>
      )}

      {/* CHECAGEM — honesta: críticos vermelho, desconhecidos âmbar, verde só quando sabe */}
      {check && check.activeMeds >= 2 && (
        <AppCard kind={check.critical.length > 0 ? 'accent' : 'tinted'} tone={check.critical.length > 0 ? 'error' : (check.unmatched?.length ? 'warning' : 'success')} sx={{ mb: 2 }}>
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={1} alignItems="center">
              <ShieldIcon sx={{ color: check.critical.length > 0 ? 'error.main' : check.unmatched?.length ? 'warning.main' : 'success.main', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 800, fontSize: 15 }}>
                {check.critical.length > 0 ? '⚠️ Interações críticas encontradas' : check.unmatched?.length ? '⚠️ Não conhecemos todos os remédios' : '✅ Nenhuma interação crítica conhecida'}
              </Typography>
            </Stack>
            {check.critical.map((h, i) => <HitCard key={i} h={h} />)}
            {check.unmatched?.length > 0 && (
              <Box sx={{ p: 1.25, borderRadius: '12px', bgcolor: 'rgba(180,83,9,.08)' }}>
                <Typography sx={{ fontSize: 13, color: 'text.primary' }}>Nosso banco de <strong>interações</strong> ainda não cobre: <strong>{check.unmatched.join(', ')}</strong>.</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Isso NÃO afeta os preços — apenas não verificamos interações deste remédio com os outros. A base cobre os medicamentos mais usados no Brasil.</Typography>
              </Box>
            )}
            {check.critical.length === 0 && !check.unmatched?.length && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Checagem automática e gratuita entre seus remédios ativos.</Typography>
            )}
          </Stack>
        </AppCard>
      )}

      {/* LISTA — premium: FOTO do produto quando disponível (fonte VTEX), fallback avatar */}
      {active.length > 0 && (
        <Stack spacing={1} sx={{ mb: inactive.length ? 2 : 0 }}>
          {active.map((m) => {
            const photo = m.priceSummary?.imageUrl;
            return (
              <Card key={m.id} elevation={0} sx={{
                p: 1.5, borderRadius: '16px', border: '1px solid', borderColor: 'divider',
                transition: 'border-color .15s ease, box-shadow .15s ease',
                '&:hover': m.priceSummary?.lowestPriceCents != null
                  ? { borderColor: 'primary.main', boxShadow: (t) => `0 4px 16px ${t.palette.primary.main}22` }
                  : {},
              }}>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  {/* FOTO do produto (oferta mais barata) ou avatar de inicial */}
                  {photo ? (
                    <Box component="img" src={photo} alt={m.name} loading="lazy"
                      sx={{ width: 52, height: 52, borderRadius: '12px', objectFit: 'contain',
                        bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', flexShrink: 0 }} />
                  ) : (
                    <MedAvatar name={m.name} size={52} />
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, color: 'text.primary', fontSize: 15 }}>{m.name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{[m.dosage, m.frequency].filter(Boolean).join(' · ') || 'uso contínuo'}</Typography>
                    {/* PREÇO — informação secundária, discreta (saúde, não e-commerce). */}
                    {m.priceSummary?.lowestPriceCents != null ? (
                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.4, cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); void openPrices(m); }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
                          💰 <b style={{ color: 'text.primary', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(m.priceSummary.lowestPriceCents)}</b>
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'primary.dark', textDecoration: 'underline', flexShrink: 0 }}>
                          ver preços
                        </Typography>
                      </Stack>
                    ) : m.priceStatus === 'insufficient_data' ? (
                      <Typography
                        onClick={(e) => { e.stopPropagation(); setPackFor(m); }}
                        variant="caption" sx={{ display: 'block', color: 'text.disabled', mt: 0.3, cursor: 'pointer', '&:hover': { color: 'text.secondary', textDecoration: 'underline' } }}
                      >
                        📦 Informar embalagem p/ comparar preços
                      </Typography>
                    ) : (m.priceStatus === 'queued' || m.priceStatus === 'searching') ? (
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.3, color: 'text.disabled', whiteSpace: 'nowrap' }}>
                        ⏳ Buscando preços…
                      </Typography>
                    ) : null}
                  </Box>
                  <Button size="small" onClick={() => toggle(m)} sx={{ textTransform: 'none', borderRadius: '999px' }}>Suspender</Button>
                  <IconButton size="small" onClick={() => remove(m)} aria-label={`Excluir ${m.name}`}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Stack>
              </Card>
            );
          })}
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

      {/* ANÁLISE COMPLETA (créditos) */}
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

      {/* DIÁLOGO ADICIONAR — busca por genérico OU marca (Levoid→Levotiroxina), doses em chips */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Adicionar remédio</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Autocomplete
              freeSolo
              options={catalogResults.length > 0 ? catalogResults : options}
              getOptionLabel={(o: any) => typeof o === 'string' ? o : o.name}
              renderOption={({ key, ...li }, o: any) => (
                <Box component="li" key={key} {...li} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.75 }}>
                  {/* FOTO do produto (do catálogo — instantânea) ou avatar */}
                  {o.photoUrl ? (
                    <Box component="img" src={o.photoUrl} alt={o.name} loading="lazy"
                      sx={{ width: 40, height: 40, borderRadius: '8px', objectFit: 'contain', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', flexShrink: 0 }} />
                  ) : (
                    <MedAvatar name={o.name} size={40} />
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{o.name}</Typography>
                    {!!o.brands?.length && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{o.brands.slice(0, 3).join(' · ')}</Typography>}
                  </Box>
                  {/* PREÇO à direita (se o catálogo já tem) */}
                  {o.priceCents != null && (
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                      {fmtBRL(o.priceCents)}
                    </Typography>
                  )}
                </Box>
              )}
              inputValue={query}
              onInputChange={(_, v) => setQuery(v)}
              value={picked}
              onChange={(_, v) => { setPicked(typeof v === 'string' ? { name: v } : v); setDose(''); }}
              renderInput={(params) => <TextField {...params} label="Busque por nome ou marca (ex.: Levoid)" autoFocus />}
            />
            {catalogLoading && <Typography variant="caption" sx={{ color: 'text.disabled' }}>buscando…</Typography>}
            {picked?.doses?.length ? (
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {picked.doses.map((d) => (
                  <Chip key={d} label={d} onClick={() => setDose(d)} size="small"
                    sx={{ borderRadius: '999px', fontWeight: 700, ...(dose === d ? { bgcolor: 'primary.main', color: '#fff' } : { border: '1px solid', borderColor: 'divider' }) }} />
                ))}
              </Stack>
            ) : null}
            <TextField label="Dose (opcional)" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="ex.: 50 mcg" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button variant="contained" onClick={addPicked} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Salvar</Button>
        </DialogActions>
      </Dialog>

      {/* DIÁLOGO CONFIRMAR LEITURA DA RECEITA — IA sugere, usuário valida (1 clique) */}
      <Dialog open={scanOpen} onClose={() => setScanOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Remédios identificados 📷</DialogTitle>
        <DialogContent>
          {scanLoading && <Typography sx={{ color: 'text.secondary', py: 2 }}>Lendo a foto com o Dr. Exame…</Typography>}
          {!scanLoading && (
            <Stack spacing={0.5}>
              <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1 }}>Confirme os que você realmente usa — desmarque o que não fizer parte.</Typography>
              {suggestions.map((s, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center" component="label" sx={{ p: 1, borderRadius: '10px', bgcolor: 'action.hover', cursor: 'pointer' }}>
                  <Checkbox checked={s.on} onChange={() => setSuggestions((arr) => arr.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} size="small" />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{s.name}</Typography>
                    {!!s.dosage && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{s.dosage}</Typography>}
                  </Box>
                </Stack>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScanOpen(false)} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button variant="contained" disabled={scanLoading || !suggestions.some((s) => s.on)}
            onClick={async () => { await saveMeds(suggestions.filter((s) => s.on).map((s) => ({ name: s.name, dosage: s.dosage || null }))); setScanOpen(false); }}
            sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Salvar selecionados</Button>
        </DialogActions>
      </Dialog>
      <PricesDialog med={pricesFor} data={pricesData} loading={pricesLoading} onClose={() => setPricesFor(null)} />
      <PackDialog med={packFor} onClose={() => setPackFor(null)} onPick={(q) => { if (packFor) void setPack(packFor, q); }} />
    </PageContainer>
  );
};

/** DIALOG: ofertas do remédio (FASE 12) — preço + loja + link externo + aviso honesto. */
const PricesDialog = ({ med, data, loading, onClose }: { med: Med | null; data: PricesResp | null; loading: boolean; onClose: () => void }) => {
  const offers = data?.snapshot?.offers ?? [];
  const updated = data?.snapshot?.collectedAt ? Math.round((Date.now() - new Date(data.snapshot.collectedAt).getTime()) / 60000) : null;
  return (
    <Dialog open={!!med} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '12px' } }}>
      <DialogTitle sx={{ fontWeight: 800 }}>{med?.name} — preços</DialogTitle>
      <DialogContent>
        {loading && <Typography sx={{ color: 'text.secondary', py: 2 }}>Buscando ofertas…</Typography>}
        {!loading && offers.length === 0 && (
          <Typography sx={{ color: 'text.secondary', py: 2 }}>
            {data?.status === 'insufficient_data'
              ? 'Informe a embalagem no card do remédio para buscarmos preços comparáveis.'
              : 'Ainda não encontramos preços para esta apresentação.'}
          </Typography>
        )}
        {!loading && offers.length > 0 && (
          <Stack spacing={0.75} sx={{ mt: 1 }}>
            {offers.map((o, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="center" sx={{ p: 1, borderRadius: '10px', bgcolor: i === 0 ? 'rgba(32,178,170,.08)' : 'action.hover' }}>
                {/* FOTO real do produto (fontes VTEX) — a "foto do remédio" que faltava */}
                {o.imageUrl ? (
                  <Box component="img" src={o.imageUrl} alt={o.productName} loading="lazy"
                    sx={{ width: 44, height: 44, borderRadius: '8px', objectFit: 'contain', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', flexShrink: 0 }} />
                ) : (
                  <MedAvatar name={o.productName} size={44} />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(o.priceCents)}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{o.productName}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>{o.pharmacy}</Typography>
                </Box>
                <Button size="small" href={o.url} target="_blank" rel="noopener noreferrer" sx={{ textTransform: 'none', borderRadius: '999px', flexShrink: 0 }}>Abrir</Button>
              </Stack>
            ))}
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 1 }}>
              {updated != null ? `Atualizado há ${updated < 60 ? `${Math.max(1, updated)} min` : `${Math.round(updated / 60)} h`} · ` : ''}Preços, estoque e condições podem mudar no site da loja.
            </Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none', fontWeight: 700 }}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
};

/** DIALOG: pergunta contextual da embalagem (FASE 2 — nunca bloqueia o cadastro). */
const PackDialog = ({ med, onClose, onPick }: { med: Med | null; onClose: () => void; onPick: (qty: number) => void }) => {
  const OPTIONS = [10, 14, 20, 28, 30, 60, 90];
  const [custom, setCustom] = useState('');
  return (
    <Dialog open={!!med} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '12px' } }}>
      <DialogTitle sx={{ fontWeight: 800 }}>Qual embalagem você compra?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {med?.name}{med?.dosage ? ` ${med.dosage}` : ''} — o preço muda conforme a quantidade. Só usamos isso pra comparar.
        </Typography>
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
          {OPTIONS.map((q) => (
            <Chip key={q} label={`${q} un.`} onClick={() => onPick(q)} sx={{ borderRadius: '999px', fontWeight: 700, mb: 0.5, border: '1px solid', borderColor: 'divider', '&:active': { transform: 'scale(.96)' } }} />
          ))}
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
          <TextField size="small" label="Outra quantidade" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} sx={{ flex: 1 }} />
          <Button variant="contained" disabled={!custom} onClick={() => onPick(Number(custom))} sx={{ borderRadius: '999px', textTransform: 'none' }}>Ok</Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>Agora não</Button>
      </DialogActions>
    </Dialog>
  );
};
