import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Card, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Typography } from '@mui/material';
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
import { useNotify } from 'react-admin';

/** Severidade → cor/label (tons 800 p/ AA). */
const SEV: Record<string, { color: string; label: string; bg: string }> = {
  X: { color: '#b91c1c', label: 'Contraindicação', bg: 'rgba(185,28,28,.10)' },
  D: { color: '#b91c1c', label: 'Interação maior', bg: 'rgba(185,28,28,.08)' },
  C: { color: '#b45309', label: 'Moderada', bg: 'rgba(180,83,9,.10)' },
  B: { color: '#92400e', label: 'Menor', bg: 'rgba(146,64,14,.08)' },
  A: { color: '#64748b', label: 'Desprezível', bg: 'rgba(100,116,139,.08)' },
};

interface Med {
  id: string; name: string; dosage?: string | null; frequency?: string | null; active: boolean;
  priceStatus?: string; packQty?: number | null; catalogPhotoUrl?: string | null;
  priceSummary?: { lowestPriceCents?: number | null; offersCount?: number; collectedAt?: string; imageUrl?: string | null } | null;
}
interface Hit { drugA: string; drugB: string; severity: string; effect: string; recommendation: string }
interface CheckResp { critical: Hit[]; unmatched: string[]; activeMeds: number; hasMore?: boolean }
interface PriceOffer { pharmacy: string; productName: string; priceCents: number; url: string; imageUrl?: string | null }
interface PricesResp { status: string; snapshot?: { lowestPriceCents?: number | null; offersCount: number; collectedAt: string; offers: PriceOffer[] } | null }

/** Produto do catálogo/VTEX — o que aparece no combobox (completo: foto+dose+pack+preço). */
interface CatalogProduct {
  name: string; productName: string; photoUrl?: string | null; priceCents?: number | null;
  pharmacy?: string | null; dosage: string; packQty: number | null;
}

const fmtBRL = (cents?: number | null) => (cents == null ? '—' : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

/** Avatar do remédio (inicial + cor estável) — fallback quando não tem foto. */
const MED_TONES: [string, string][] = [['#178f89', '#20b2aa'], ['#b88a54', '#d4a574'], ['#0369a1', '#0ea5e9'], ['#047857', '#059669'], ['#b45309', '#f59e0b'], ['#b91c1c', '#ef4444']];
const medTone = (n: string): [string, string] => MED_TONES[[...(n || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % MED_TONES.length];
const MedAvatar = ({ name, size = 48 }: { name: string; size?: number }) => {
  const [fg, wash] = medTone(name);
  return <Box sx={{ width: size, height: size, borderRadius: '12px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: wash + '22', color: fg, fontWeight: 800, fontSize: size * 0.42, fontFamily: 'Poppins, sans-serif' }}>{(name || '?').trim().charAt(0).toUpperCase()}</Box>;
};

export const MedicationsPage = () => {
  const notify = useNotify();
  const [pid] = useSelectedPatient();
  const [meds, setMeds] = useState<Med[] | null>(null);
  const [check, setCheck] = useState<CheckResp | null>(null);
  const [full, setFull] = useState<{ all: Hit[]; contextual?: string | null } | null>(null);
  const [fullLoading, setFullLoading] = useState(false);

  // BUSCAR (combobox produto-first)
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [searching, setSearching] = useState(false);

  // ESCANEAR (foto → IA → confirma)
  const [scanOpen, setScanOpen] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<{ name: string; dosage: string; on: boolean }[]>([]);
  const photoInput = useRef<HTMLInputElement>(null);

  // PREÇOS dialog (marketplace-style)
  const [pricesFor, setPricesFor] = useState<Med | null>(null);
  const [pricesData, setPricesData] = useState<PricesResp | null>(null);
  const [pricesLoading, setPricesLoading] = useState(false);
  const offers0Price = pricesData?.snapshot?.offers?.[0]?.priceCents ?? 0;

  const load = useCallback(async (silent = false) => {
    if (!pid) return;
    if (!silent) setMeds(null); // skeleton SÓ na 1ª carga (polling não pisca)
    const h = { Authorization: `Bearer ${token()}` };
    try {
      const [m, c] = await Promise.all([
        fetch(`${API_URL}/medications?patientId=${pid}`, { headers: h }).then((r) => (r.ok ? r.json() : [])),
        fetch(`${API_URL}/medications/check?patientId=${pid}`, { headers: h }).then((r) => (r.ok ? r.json() : null)),
      ]);
      setMeds(m); setCheck(c);
    } catch { if (!silent) setMeds([]); }
  }, [pid]);

  useEffect(() => { void load(); }, [load]);

  // AUTO-REFRESH: SÓ 1× após 8s (não a cada 4s queimando filme — o preço do catálogo
  // já é instantâneo; o worker só é preciso pra quem NÃO está no catálogo)
  useEffect(() => {
    const pending = (meds ?? []).some((m) => m.active && (m.priceStatus === 'queued' || m.priceStatus === 'searching'));
    if (!pending) return;
    const t = setTimeout(() => { void load(true); }, 8000);
    return () => clearTimeout(t);
  }, [meds, load]);

  // BUSCA no catálogo + VTEX (debounce 350ms)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setProducts([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`${API_URL}/medications/catalog?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token()}` } });
        setProducts(r.ok ? await r.json() : []);
      } catch { setProducts([]); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  /** SALVA um produto — 1 TOQUE com feedback (fecha dialog → toast → lista atualiza) */
  const [saving, setSaving] = useState<string | null>(null);
  const pickProduct = async (p: CatalogProduct) => {
    setSaving(p.productName);
    try {
      const r = await fetch(`${API_URL}/medications`, {
        method: 'POST', headers: apiHeaders(true),
        body: JSON.stringify({ patientId: pid, name: p.name, dosage: p.dosage || null, packQty: p.packQty, frequency: null }),
      });
      if (r.ok) {
        setSearchOpen(false); setQuery(''); setProducts([]);
        notify(`${p.name} adicionado ✅`, { type: 'success' });
        await load(true);
      } else {
        const e = await r.json().catch(() => ({}));
        notify(e.error || 'Falha ao salvar', { type: 'error' });
      }
    } catch { notify('Sem conexão', { type: 'error' }); }
    finally { setSaving(null); }
  };

  /** ESCANEAR: foto → IA lista → confirma */
  const onPhoto = async (f?: File) => {
    if (!f) return;
    setScanOpen(true); setScanLoading(true); setSuggestions([]);
    try {
      const fd = new FormData(); fd.append('photo', f);
      const r = await fetch(`${API_URL}/medications/scan-photo`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { notify(d.error || 'Não conseguimos ler a foto', { type: 'warning' }); setScanOpen(false); return; }
      if (!d.suggestions?.length) { notify('Nenhum remédio identificado', { type: 'info' }); setScanOpen(false); return; }
      setSuggestions(d.suggestions.map((s: any) => ({ name: s.name, dosage: s.dosage || '', on: true })));
    } catch { notify('Falha ao enviar', { type: 'error' }); setScanOpen(false); }
    finally { setScanLoading(false); }
  };

  const saveScan = async () => {
    const items = suggestions.filter((s) => s.on).map((s) => ({ name: s.name, dosage: s.dosage || null }));
    if (!items.length) return;
    const r = await fetch(`${API_URL}/medications/bulk`, { method: 'POST', headers: apiHeaders(true), body: JSON.stringify({ patientId: pid, items }) });
    if (r.ok) { const d = await r.json(); notify(`${d.created} salvo(s)`, { type: 'success' }); setScanOpen(false); void load(); }
  };

  const toggle = async (m: Med) => {
    await fetch(`${API_URL}/medications/${m.id}`, { method: 'PATCH', headers: apiHeaders(true), body: JSON.stringify({ active: !m.active }) });
    void load();
  };
  const remove = async (m: Med) => {
    await fetch(`${API_URL}/medications/${m.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    void load(); setFull(null);
  };

  const openPrices = async (m: Med) => {
    setPricesFor(m); setPricesData(null); setPricesLoading(true);
    try {
      const r = await fetch(`${API_URL}/medications/${m.id}/prices`, { headers: { Authorization: `Bearer ${token()}` } });
      setPricesData(r.ok ? await r.json() : { status: m.priceStatus ?? 'not_requested' });
    } finally { setPricesLoading(false); }
  };

  const runFull = async () => {
    setFullLoading(true);
    try {
      const r = await fetch(`${API_URL}/medications/check/full`, { method: 'POST', headers: apiHeaders(true), body: JSON.stringify({ patientId: pid }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 402) { notify('Sem créditos — veja os planos', { type: 'warning' }); return; }
      if (!r.ok) { notify('Falha na análise', { type: 'error' }); return; }
      setFull(d);
    } finally { setFullLoading(false); }
  };

  const active = (meds ?? []).filter((m) => m.active);
  const inactive = (meds ?? []).filter((m) => !m.active);

  const HitCard = ({ h }: { h: Hit }) => {
    const s = SEV[h.severity] ?? SEV.C;
    return (
      <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: s.bg, border: '1px solid', borderColor: s.color + '33' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: 'wrap' }}>
          <Chip size="small" label={`${h.severity} · ${s.label}`} sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: s.color, color: '#fff' }} />
          <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>{h.drugA} + {h.drugB}</Typography>
        </Stack>
        <Typography sx={{ fontSize: 13, opacity: 0.85 }}>{h.effect}</Typography>
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.5 }}>💡 {h.recommendation}</Typography>
      </Box>
    );
  };

  return (
    <PageContainer width="narrow">
      <PageHeader icon={<MedicationIcon />} title="Remédios" subtitle="Busque, fotografe a receita ou toque nos comuns." />

      {/* AÇÕES — busca primeiro (combobox ouro), foto segundo */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <GradientButton startIcon={<AddIcon />} onClick={() => setSearchOpen(true)} sx={{ flex: 1 }}>Buscar remédio</GradientButton>
        <Button variant="outlined" startIcon={<PhotoCameraIcon />} onClick={() => photoInput.current?.click()} sx={{ flex: 1, borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Ler receita</Button>
        <input ref={photoInput} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { void onPhoto(e.target.files?.[0]); if (e.target) e.target.value = ''; }} />
      </Stack>

      {meds == null && <ListSkeleton count={3} />}

      {/* INTERAÇÕES — SILENCIOSA quando tudo bem (só mostra se há problema REAL) */}
      {check && check.critical.length > 0 && (
        <AppCard kind="accent" tone="error" sx={{ mb: 2 }}>
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={1} alignItems="center">
              <ShieldIcon sx={{ color: 'error.main', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 800, fontSize: 15 }}>⚠️ Atenção: {check.critical.length} intera{check.critical.length === 1 ? 'ção' : 'ções'} importante{check.critical.length === 1 ? '' : 's'}</Typography>
            </Stack>
            {check.critical.map((h, i) => <HitCard key={i} h={h} />)}
          </Stack>
        </AppCard>
      )}

      {/* LISTA — premium */}
      {active.length > 0 && (
        <Stack spacing={1} sx={{ mb: inactive.length ? 2 : 0 }}>
          {active.map((m) => {
            const photo = m.priceSummary?.imageUrl ?? m.catalogPhotoUrl;
            return (
              <Card key={m.id} elevation={0} sx={{
                p: 1.5, borderRadius: '16px', border: '1px solid', borderColor: 'divider',
                transition: 'border-color .15s ease, box-shadow .15s ease',
                '&:hover': m.priceSummary?.lowestPriceCents != null
                  ? { borderColor: 'primary.main', boxShadow: (t) => `0 4px 16px ${t.palette.primary.main}22` } : {},
              }}>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  {photo ? (
                    <Box component="img" src={photo} alt={m.name} loading="lazy"
                      sx={{ width: 52, height: 52, borderRadius: '12px', objectFit: 'contain', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', flexShrink: 0 }} />
                  ) : (
                    <MedAvatar name={m.name} size={52} />
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{m.name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{[m.dosage, m.frequency].filter(Boolean).join(' · ') || 'uso contínuo'}</Typography>
                    {m.priceSummary?.lowestPriceCents != null ? (
                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.4, cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); void openPrices(m); }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
                          💰 <b style={{ color: 'text.primary', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(m.priceSummary.lowestPriceCents)}</b>
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'primary.dark', textDecoration: 'underline', flexShrink: 0 }}>ver preços</Typography>
                      </Stack>
                    ) : (m.priceStatus === 'queued' || m.priceStatus === 'searching') ? (
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.3, color: 'text.disabled', whiteSpace: 'nowrap' }}>⏳ Buscando…</Typography>
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

      {/* SUSPENSOS */}
      {inactive.length > 0 && (
        <Stack spacing={0.75}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mt: 1 }}>SUSPENSOS</Typography>
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
              <Typography sx={{ fontWeight: 800, fontSize: 15 }}>Análise completa</Typography>
            </Stack>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Todas as interações + o Dr. Exame cruza com seus exames. 2 créditos.</Typography>
            <GradientButton onClick={runFull} disabled={fullLoading}>{fullLoading ? 'Analisando…' : 'Analisar (2 créditos)'}</GradientButton>
            {full && (
              <Stack spacing={1}>
                {(full.all ?? []).length === 0 && <Typography sx={{ color: 'success.main', fontWeight: 700 }}>✅ Tudo certo entre seus remédios.</Typography>}
                {(full.all ?? []).map((h, i) => <HitCard key={i} h={h} />)}
                {full.contextual && <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'action.hover', whiteSpace: 'pre-wrap', fontSize: 13.5 }}>{full.contextual}</Box>}
              </Stack>
            )}
          </Stack>
        </AppCard>
      )}

      {/* ============ DIALOG BUSCAR — produto-first (1 toque salva tudo) ============ */}
      <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 0 }}>Buscar remédio</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            autoFocus fullWidth label="Nome ou marca (ex.: dipirona, Novalgina)"
            value={query} onChange={(e) => setQuery(e.target.value)}
            sx={{ mb: 1.5 }}
          />
          {searching && <Typography variant="caption" sx={{ color: 'text.disabled' }}>buscando…</Typography>}
          {!searching && products.length === 0 && query.length >= 2 && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', py: 2, textAlign: 'center' }}>
              Não achamos "{query}" — tente o nome do remédio ou fotografe a receita.
            </Typography>
          )}
          <Stack spacing={0.5}>
            {products.map((p, i) => (
              <Box key={i} component="button" type="button"
                onClick={() => void pickProduct(p)}
                aria-label={`Adicionar ${p.productName}`}
                sx={{
                  display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 1.25,
                  width: '100%', p: 1.25, borderRadius: '12px', textAlign: 'left',
                  cursor: saving === p.productName ? 'wait' : 'pointer',
                  bgcolor: i === 0 ? 'rgba(32,178,170,.06)' : 'action.hover',
                  border: '1px solid', borderColor: i === 0 ? 'rgba(32,178,170,.2)' : 'transparent',
                  transition: 'all .12s', '&:hover': { bgcolor: 'rgba(32,178,170,.1)', borderColor: 'primary.main' },
                  '&:active': { transform: 'scale(.97)' },
                  opacity: saving && saving !== p.productName ? 0.5 : 1,
                  outline: 'none', fontFamily: 'inherit', fontSize: 'inherit',
                }}>
                {saving === p.productName ? (
                  <Box sx={{ width: 44, height: 44, display: 'grid', placeItems: 'center', flexShrink: 0 }}><CircularProgress size={22} /></Box>
                ) : p.photoUrl ? (
                  <Box component="img" src={p.photoUrl} alt={p.productName} loading="lazy"
                    sx={{ width: 44, height: 44, borderRadius: '10px', objectFit: 'contain', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', flexShrink: 0 }} />
                ) : (
                  <MedAvatar name={p.productName} size={44} />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.productName}</Typography>
                  {p.priceCents != null && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      💰 {fmtBRL(p.priceCents)} {p.pharmacy ? `· ${p.pharmacy}` : ''}
                    </Typography>
                  )}
                </Box>
                {p.priceCents != null && saving !== p.productName && (
                  <Chip size="small" label="1 toque" sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: 'primary.main', color: '#fff', flexShrink: 0, pointerEvents: 'none' }} />
                )}
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSearchOpen(false)} sx={{ textTransform: 'none' }}>Fechar</Button>
        </DialogActions>
      </Dialog>

      {/* ============ DIALOG ESCANEAR ============ */}
      <Dialog open={scanOpen} onClose={() => setScanOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Remédios identificados 📷</DialogTitle>
        <DialogContent>
          {scanLoading && <Typography sx={{ color: 'text.secondary', py: 2 }}>Lendo a foto com o Dr. Exame…</Typography>}
          {!scanLoading && suggestions.length > 0 && (
            <Stack spacing={0.5}>
              <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1 }}>Confirme os que você usa:</Typography>
              {suggestions.map((s, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center" component="label" sx={{ p: 1, borderRadius: '10px', bgcolor: 'action.hover', cursor: 'pointer' }}>
                  <Checkbox checked={s.on} onChange={() => setSuggestions((a) => a.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} size="small" />
                  <Box sx={{ flex: 1 }}>
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
          <Button variant="contained" disabled={scanLoading || !suggestions.some((s) => s.on)} onClick={() => void saveScan()}
            sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Salvar</Button>
        </DialogActions>
      </Dialog>

      {/* ============ DIALOG VER PREÇOS — estilo marketplace (Shopee-like) ============ */}
      <Dialog open={!!pricesFor} onClose={() => setPricesFor(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: '20px', overflow: 'hidden' } }}>
        {/* HEADER: foto grande + melhor preço em destaque */}
        {pricesFor && (() => {
          const offers = pricesData?.snapshot?.offers ?? [];
          const best = offers[0];
          return (
            <Box sx={{ background: 'linear-gradient(135deg, rgba(32,178,170,.08), rgba(32,178,170,.02))', p: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" spacing={2} alignItems="center">
                {best?.imageUrl || pricesFor.catalogPhotoUrl ? (
                  <Box component="img" src={best?.imageUrl ?? pricesFor.catalogPhotoUrl!} alt={pricesFor.name}
                    sx={{ width: 72, height: 72, borderRadius: '16px', objectFit: 'contain', bgcolor: 'background.paper', border: '2px solid', borderColor: 'primary.main' }} />
                ) : (
                  <MedAvatar name={pricesFor.name} size={72} />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 18, lineHeight: 1.2, fontFamily: 'Poppins, sans-serif' }}>{pricesFor.name}</Typography>
                  {[pricesFor.dosage, pricesFor.packQty ? `${pricesFor.packQty} un.` : null].filter(Boolean).join(' · ') && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                      {[pricesFor.dosage, pricesFor.packQty ? `${pricesFor.packQty} un.` : null].filter(Boolean).join(' · ')}
                    </Typography>
                  )}
                  {best && (
                    <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mt: 0.5 }}>
                      <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}>a partir de</Typography>
                      <Typography component="span" sx={{ fontWeight: 800, fontSize: 26, lineHeight: 1, color: 'primary.dark', fontVariantNumeric: 'tabular-nums', fontFamily: 'Poppins, sans-serif' }}>
                        {fmtBRL(best.priceCents)}
                      </Typography>
                    </Stack>
                  )}
                </Box>
                {best && (
                  <Chip label="🏆 MELHOR" size="small" sx={{ bgcolor: 'primary.main', color: '#fff', fontWeight: 800, fontSize: 10, flexShrink: 0 }} />
                )}
              </Stack>
            </Box>
          );
        })()}

        <DialogContent sx={{ p: 0 }}>
          {pricesLoading && <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>Buscando ofertas…</Typography>}
          {!pricesLoading && (pricesData?.snapshot?.offers ?? []).length === 0 && (
            <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>Ainda não temos preços para este remédio.</Typography>
          )}
          {!pricesLoading && (pricesData?.snapshot?.offers ?? []).map((o, i) => (
            <Stack key={i} direction="row" spacing={1.5} alignItems="center"
              component="a" href={o.url} target="_blank" rel="noopener noreferrer"
              sx={{
                p: 1.75, borderBottom: '1px solid', borderColor: 'divider',
                textDecoration: 'none', color: 'inherit',
                bgcolor: i === 0 ? 'rgba(32,178,170,.05)' : 'transparent',
                transition: 'background .12s', '&:hover': { bgcolor: 'rgba(32,178,170,.08)' },
                '&:active': { transform: 'scale(.99)' },
              }}>
              {/* RANK badge (1º, 2º, 3º...) */}
              <Box sx={{ width: 28, height: 28, borderRadius: '8px', display: 'grid', placeItems: 'center', flexShrink: 0,
                bgcolor: i === 0 ? 'primary.main' : 'action.hover', color: i === 0 ? '#fff' : 'text.secondary',
                fontWeight: 800, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                {i + 1}
              </Box>
              {/* FOTO do produto */}
              {o.imageUrl ? (
                <Box component="img" src={o.imageUrl} alt={o.productName} loading="lazy"
                  sx={{ width: 52, height: 52, borderRadius: '12px', objectFit: 'contain', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', flexShrink: 0 }} />
              ) : (
                <MedAvatar name={o.productName} size={52} />
              )}
              {/* INFO: nome + farmácia */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.productName}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{o.pharmacy}</Typography>
                {/* barra de comparação visual */}
                {offers0Price > 0 && (
                  <Box sx={{ mt: 0.5, height: 4, borderRadius: '2px', bgcolor: 'divider', width: '100%', overflow: 'hidden' }}>
                    <Box sx={{ height: '100%', borderRadius: '2px', bgcolor: 'primary.main', width: `${Math.max(15, 100 - ((o.priceCents - offers0Price) / offers0Price) * 100)}%` }} />
                  </Box>
                )}
              </Box>
              {/* PREÇO + botão */}
              <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 16, fontVariantNumeric: 'tabular-nums', color: i === 0 ? 'primary.dark' : 'text.primary' }}>
                  {fmtBRL(o.priceCents)}
                </Typography>
                <Chip label="Ver oferta" size="small" sx={{ height: 24, fontSize: 11, fontWeight: 700, bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' } }} />
              </Stack>
            </Stack>
          ))}
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1 }}>
            {pricesData?.snapshot?.collectedAt ? `Atualizado ${new Date(pricesData.snapshot.collectedAt).toLocaleDateString('pt-BR')} · ` : ''}Preços podem mudar no site da loja
          </Typography>
          <Button onClick={() => setPricesFor(null)} variant="contained" sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};
