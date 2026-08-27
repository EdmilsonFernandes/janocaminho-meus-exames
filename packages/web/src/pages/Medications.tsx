import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Card, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Snackbar, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MedicationIcon from '@mui/icons-material/Medication';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import ShieldIcon from '@mui/icons-material/Shield';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
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
  priceSummary?: { lowestPriceCents?: number | null; offersCount?: number; collectedAt?: string; imageUrl?: string | null; pharmacy?: string | null; stale?: boolean } | null;
}
interface Hit { drugA: string; drugB: string; severity: string; effect: string; recommendation: string }
interface CheckResp { critical: Hit[]; unmatched: string[]; activeMeds: number; hasMore?: boolean }
interface ScanSuggestion { name: string; dosage: string; on: boolean; photoUrl?: string | null; priceCents?: number | null; productName?: string | null }
interface PriceOffer { pharmacy: string; productName: string; priceCents: number; url: string; imageUrl?: string | null }
interface PriceOfferRow {
  pharmacy: string; productName: string; priceCents: number;
  url: string; imageUrl?: string | null; ean?: string | null;
}
interface PricesResp { status: string; snapshot?: { lowestPriceCents?: number | null; offersCount: number; collectedAt: string; offers: PriceOfferRow[] } | null }

/** Produto do catálogo/VTEX — o que aparece no combobox (completo: foto+dose+pack+preço). */
interface CatalogProduct {
  name: string; productName: string; photoUrl?: string | null; priceCents?: number | null;
  pharmacy?: string | null; dosage: string; packQty: number | null;
}

const fmtBRL = (cents?: number | null) => (cents == null ? '—' : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

/** Identidade visual da farmácia — usa LOGO quando disponível (da tabela), senão badge colorido. */
const PHARMACY_BRAND: Record<string, { color: string; bg: string; label: string; logoUrl?: string | null }> = {
  'Pague Menos': { color: '#d32f2f', bg: 'rgba(211,47,47,.08)', label: 'PM' },
  'Drogaria Pacheco': { color: '#1565c0', bg: 'rgba(21,101,192,.08)', label: 'DP' },
  'Farmácias São João': { color: '#2e7d32', bg: 'rgba(46,125,50,.08)', label: 'SJ' },
  'Nova Esperança': { color: '#e65100', bg: 'rgba(230,81,0,.08)', label: 'NE' },
  'Drogaria Globo': { color: '#6a1b9a', bg: 'rgba(106,27,154,.08)', label: 'DG' },
  'Santa Lucia': { color: '#00695c', bg: 'rgba(0,105,92,.08)', label: 'SL' },
  'Drogaria São Paulo': { color: '#c62828', bg: 'rgba(198,40,40,.08)', label: 'SP' },
  'Farmais': { color: '#283593', bg: 'rgba(40,53,147,.08)', label: 'FM' },
  'Coop Drogaria': { color: '#37474f', bg: 'rgba(55,71,79,.08)', label: 'CD' },
};
// logos carregados do endpoint de farmácias ativas (fetch uma vez no mount).
// NÃO usar /admin/pharmacies — paciente toma 401 e o logo nunca carrega.
let PHARMACY_LOGOS: Record<string, string | null> = {};
export const loadPharmacyLogos = async () => {
  try {
    const r = await fetch(`${API_URL}/medications/pharmacies`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { const rows = await r.json(); PHARMACY_LOGOS = Object.fromEntries(rows.map((p: any) => [p.name, p.logoUrl])); }
  } catch { /* fallback: badges coloridos */ }
};
const PharmacyBadge = ({ name }: { name: string }) => {
  const logo = PHARMACY_LOGOS[name];
  if (logo) {
    return <Box component="img" src={logo} alt={name} sx={{ height: 18, borderRadius: '3px', flexShrink: 0, objectFit: 'contain' }} />;
  }
  const brand = PHARMACY_BRAND[name] ?? { color: '#64748b', bg: 'rgba(100,116,139,.08)', label: name?.slice(0, 2).toUpperCase() || '?' };
  return (
    <Box sx={{ px: 1, py: 0.25, borderRadius: '6px', bgcolor: brand.bg, color: brand.color, fontWeight: 800, fontSize: 10, fontFamily: 'Poppins, sans-serif', flexShrink: 0 }}>
      {brand.label}
    </Box>
  );
};

/** Preço premium: "R$ 4,19" → R$ menor + número GRANDE (estilo iFood). */
const PriceBig = ({ cents, size = 22, color = 'text.primary' }: { cents?: number | null; size?: number; color?: string }) => {
  if (cents == null) return null;
  const v = (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const [int, dec] = v.split(',');
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', lineHeight: 1, color, flexShrink: 0, whiteSpace: 'nowrap' }}>
      <Box component="span" sx={{ fontSize: size * 0.55, fontWeight: 700, mr: 0.15, fontFamily: 'Poppins, sans-serif' }}>R$</Box>
      <Box component="span" sx={{ fontSize: size, fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontFamily: 'Poppins, sans-serif' }}>{int}</Box>
      <Box component="span" sx={{ fontSize: size * 0.65, fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontFamily: 'Poppins, sans-serif' }}>,{dec}</Box>
    </Box>
  );
};

/** Sombra premium em 3 camadas (profundidade real, não flat). */
const premiumShadow = (elev = 1) => {
  const shadows = [
    '0 1px 2px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04), 0 8px 20px rgba(0,0,0,0.03)',
    '0 2px 4px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06), 0 12px 28px rgba(0,0,0,0.04)',
    '0 4px 8px rgba(0,0,0,0.05), 0 8px 20px rgba(0,0,0,0.08), 0 16px 36px rgba(0,0,0,0.05)',
  ];
  return shadows[Math.min(elev, 2)];
};

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
  const [suggestions, setSuggestions] = useState<ScanSuggestion[]>([]);
  const photoInput = useRef<HTMLInputElement>(null);

  // PREÇOS dialog (marketplace-style) + ficha de detalhe da oferta (nome truncado
  // na lista → clique abre a informação COMPLETA antes de ir pro site da farmácia)
  const [pricesFor, setPricesFor] = useState<Med | null>(null);
  const [pricesData, setPricesData] = useState<PricesResp | null>(null);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [offerDetail, setOfferDetail] = useState<PriceOfferRow | null>(null);
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
      // polling não re-renderiza se NADA mudou (array novo = re-render fantasma)
      setMeds((prev) => (silent && JSON.stringify(prev) === JSON.stringify(m) ? prev : m));
      setCheck((prev) => (silent && JSON.stringify(prev) === JSON.stringify(c) ? prev : c));
    } catch { if (!silent) setMeds([]); }
  }, [pid]);

  useEffect(() => { void load(); void loadPharmacyLogos(); }, [load]);

  // AUTO-REFRESH INTELIGENTE: enquanto há remédio 'buscando', re-carrega a lista
  // silenciosamente a cada 5s (só os dados mudam — sem skeleton, sem piscar).
  // Para sozinho quando tudo resolveu. O usuário vê um pill sutil "atualizando…".
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const pending = (meds ?? []).some((m) => m.active && (m.priceStatus === 'queued' || m.priceStatus === 'searching' || m.priceSummary?.stale));
    if (!pending) { setRefreshing(false); return; }
    setRefreshing(true);
    const iv = setInterval(() => { void load(true); }, 5000);
    return () => { clearInterval(iv); setRefreshing(false); };
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
    if (saving) return; // previna duplo-clique
    setSaving(p.productName);
    try {
      const r = await fetch(`${API_URL}/medications`, {
        method: 'POST', headers: apiHeaders(true),
        body: JSON.stringify({
          patientId: pid, name: p.name, dosage: p.dosage || null, packQty: p.packQty, frequency: null,
          // dados VTEX do combobox → server cria offer instantânea com foto+preço
          vtexPhotoUrl: p.photoUrl || null,
          vtexPriceCents: p.priceCents || null,
          vtexProductName: p.productName || null,
          vtexPharmacy: p.pharmacy || null,
        }),
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

  /** ESCANEAR: foto → OCR → IA → MATCH catálogo (foto+preço) → confirma com visual rico */
  const onPhoto = async (f?: File) => {
    if (!f) return;
    setScanOpen(true); setScanLoading(true); setSuggestions([]);
    try {
      const fd = new FormData(); fd.append('photo', f);
      const r = await fetch(`${API_URL}/medications/scan-photo`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { notify(d.error || 'Não conseguimos ler a foto', { type: 'warning' }); setScanOpen(false); return; }
      if (!d.suggestions?.length) { notify('Nenhum remédio identificado', { type: 'info' }); setScanOpen(false); return; }

      // MATCH: catálogo primeiro (instantâneo) → se vazio, VTEX live (preview)
      const enriched = await Promise.all(d.suggestions.map(async (s: any) => {
        const base = { name: s.name, dosage: s.dosage || '', on: true, photoUrl: null as string | null, priceCents: null as number | null, productName: null as string | null };
        try {
          // 1. Catálogo local (rápido, cacheado)
          const cat = await fetch(`${API_URL}/medications/catalog?q=${encodeURIComponent(s.name)}`, { headers: { Authorization: `Bearer ${token()}` } }).then(r2 => r2.json());
          const best = Array.isArray(cat) && cat.length > 0 ? cat[0] : null;
          if (best?.photoUrl || best?.priceCents) {
            return { ...base, photoUrl: best.photoUrl, priceCents: best.priceCents, productName: best.productName };
          }
          // 2. Catálogo vazio → busca LIVE na VTEX (preview endpoint)
          const prev = await fetch(`${API_URL}/medications/preview?name=${encodeURIComponent(s.name)}&dosage=${encodeURIComponent(s.dosage || '')}`, { headers: { Authorization: `Bearer ${token()}` } }).then(r2 => r2.json());
          if (prev?.found) {
            return { ...base, photoUrl: prev.photo, priceCents: prev.priceCents, productName: prev.productName };
          }
          return base;
        } catch { return base; }
      }));
      setSuggestions(enriched);
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
  // DELETE com DESFAZER (critique P1 2026-08-26: dado de saúde sumia num toquezinho
  // sem confirmação nem volta). Remove na hora (lista reage) + Snackbar próprio com
  // botão DESFAZER (5s) que re-cria o remédio com os mesmos dados — melhor que
  // dialog bloqueante, e sem depender de internals de undo do react-admin.
  const [undoRemove, setUndoRemove] = useState<Med | null>(null);
  const remove = async (m: Med) => {
    await fetch(`${API_URL}/medications/${m.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    void load(); setFull(null);
    setUndoRemove(m);
    setTimeout(() => setUndoRemove((cur) => (cur?.id === m.id ? null : cur)), 6000);
  };
  const doUndoRemove = async () => {
    const m = undoRemove;
    if (!m) return;
    setUndoRemove(null);
    const r = await fetch(`${API_URL}/medications`, {
      method: 'POST', headers: apiHeaders(true),
      body: JSON.stringify({ patientId: pid, name: m.name, dosage: m.dosage ?? undefined, frequency: m.frequency ?? undefined, packQty: m.packQty ?? undefined }),
    });
    if (r.ok) { notify('Remédio restaurado', { type: 'success' }); void load(); }
    else notify('Não consegui restaurar — cadastre de novo', { type: 'error' });
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
    <PageContainer width="narrow" sx={{ pb: { xs: 10, sm: 5 } }}>
      <PageHeader icon={<MedicationIcon />} title="Remédios" subtitle="Busque, fotografe a receita ou toque nos comuns." />

      {/* AÇÕES — busca primeiro (combobox ouro), foto segundo */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <GradientButton startIcon={<AddIcon />} onClick={() => setSearchOpen(true)} sx={{ flex: 1 }}>Buscar remédio</GradientButton>
        <Button variant="outlined" startIcon={<PhotoCameraIcon />} onClick={() => photoInput.current?.click()} sx={{ flex: 1, borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Ler receita</Button>
        <input ref={photoInput} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { void onPhoto(e.target.files?.[0]); if (e.target) e.target.value = ''; }} />
      </Stack>

      {/* skeleton SÓ quando há paciente carregando — sem paciente, o empty state
          abaixo já convida pra agir (não fica skeleton infinito "queimando") */}
      {meds == null && pid && <ListSkeleton count={3} />}

      {/* INDICADOR: pill sutil quando o worker está buscando preços */}
      {refreshing && meds != null && (
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{
          position: 'fixed', bottom: { xs: 90, md: 24 }, left: '50%', transform: 'translateX(-50%)',
          px: 2, py: 0.75, borderRadius: '999px',
          bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
          boxShadow: '0 2px 12px rgba(0,0,0,.08)', zIndex: 1200,
        }}>
          <CircularProgress size={14} sx={{ color: 'primary.main' }} />
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            Buscando melhores preços…
          </Typography>
        </Stack>
      )}

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

      {/* LISTA — premium (estilo iFood): sombra 3 camadas, radius 20, foto 64px, entrada animada */}
      {active.length > 0 && (
        <Stack spacing={1.5} sx={{ mb: inactive.length ? 2 : 0 }}>
          {active.map((m, idx) => {
            const photo = m.priceSummary?.imageUrl ?? m.catalogPhotoUrl;
            return (
              <Card key={m.id} elevation={0} sx={{
                p: 2, borderRadius: '20px', border: '1px solid', borderColor: 'divider',
                boxShadow: '0 1px 2px rgba(0,0,0,.03), 0 2px 8px rgba(0,0,0,.04), 0 8px 20px rgba(0,0,0,.03)',
                transition: 'box-shadow .2s ease, border-color .2s ease',
                '&:hover': m.priceSummary?.lowestPriceCents != null
                  ? { borderColor: 'rgba(32,178,170,.3)', boxShadow: '0 2px 4px rgba(32,178,170,.06), 0 8px 24px rgba(32,178,170,.1), 0 16px 36px rgba(32,178,170,.06)' }
                  : { boxShadow: '0 2px 4px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.06), 0 12px 28px rgba(0,0,0,.04)' },
                animation: `medCardIn .35s cubic-bezier(.16,1,.3,1) ${idx * 0.05}s both`,
                '@keyframes medCardIn': { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
              }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  {photo ? (
                    <Box component="img" src={photo} alt={m.name} loading="lazy"
                      sx={{ width: 64, height: 64, borderRadius: '16px', objectFit: 'contain',
                        bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
                        flexShrink: 0, transition: 'transform .15s', '&:hover': { transform: 'scale(1.04)' } }} />
                  ) : (
                    <MedAvatar name={m.name} size={64} />
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* NOME com clamp 2 linhas + DOSE sempre legível (critique P1:
                        "Mounjaro 5…"/"Ozempic 0,…" escondiam a dose — identificação
                        clínica ilegível. Nome quebra até 2 linhas; dose nunca truncada. */}
                    <Typography sx={{ fontWeight: 700, fontSize: 15.5, lineHeight: 1.25, fontFamily: 'Poppins, sans-serif', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }} title={m.name}>{m.name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>{[m.dosage, m.frequency].filter(Boolean).join(' · ') || 'uso contínuo'}</Typography>
                    {m.priceSummary?.lowestPriceCents != null ? (
                      // Row de preço clicável = BOTÃO de verdade (teclado + leitor de tela)
                      // com chevron: affordance visível de que abre o comparador (critique P2).
                      <Stack component="button" direction="row" spacing={0.75} alignItems="center"
                        onClick={(e) => { e.stopPropagation(); void openPrices(m); }}
                        aria-label={`Ver preços de ${m.name}`}
                        sx={{ mt: 0.75, cursor: 'pointer', minWidth: 0, maxWidth: '100%', p: 0, border: 'none', bgcolor: 'transparent', textAlign: 'left', fontFamily: 'inherit', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', borderRadius: '8px' } }}>
                        <PriceBig cents={m.priceSummary.lowestPriceCents} size={20} color="primary.dark" />
                        {m.priceSummary?.pharmacy && (
                          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
                            <PharmacyBadge name={m.priceSummary.pharmacy} />
                            <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 600, minWidth: 0 }}>
                              {m.priceSummary.pharmacy}
                            </Typography>
                          </Stack>
                        )}
                        <ChevronRightIcon sx={{ fontSize: 18, color: 'text.disabled', flexShrink: 0 }} />
                        {(m.priceSummary?.offersCount ?? 0) > 1 ? (
                          <Typography variant="caption" noWrap sx={{ color: 'primary.main', textDecoration: 'underline', fontWeight: 700, flexShrink: 0 }}>
                            +{(m.priceSummary?.offersCount ?? 0) - 1} oferta{(m.priceSummary?.offersCount ?? 0) > 2 ? 's' : ''}
                          </Typography>
                        ) : m.priceSummary?.stale ? (
                          // snapshot provisório (combobox) — worker ainda comparando farmácias
                          <Typography variant="caption" noWrap sx={{ color: 'text.disabled', fontWeight: 600, flexShrink: 0, animation: 'medHintPulse 1.6s ease-in-out infinite', '@keyframes medHintPulse': { '0%, 100%': { opacity: 0.55 }, '50%': { opacity: 1 } } }}>
                            comparando farmácias…
                          </Typography>
                        ) : null}
                      </Stack>
                    ) : (m.priceStatus === 'queued' || m.priceStatus === 'searching') ? (
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.disabled', whiteSpace: 'nowrap' }}>⏳ Buscando…</Typography>
                    ) : null}
                  </Box>
                  <Stack spacing={0.5} sx={{ flexShrink: 0 }}>
                    <Button size="small" onClick={() => toggle(m)} sx={{ textTransform: 'none', borderRadius: '999px', minWidth: 0, px: 1.5 }}>Suspender</Button>
                    <IconButton size="small" onClick={() => remove(m)} aria-label={`Excluir ${m.name}`} sx={{ '&:hover': { color: 'error.main' } }}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </Stack>
                </Stack>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* EMPTY STATE — nunca tela muda: sempre um convite pra agir (pedido do dono —
          "aparece só o label Remédios sem interação nenhuma ai queima") */}
      {(meds != null || !pid) && active.length === 0 && inactive.length === 0 && (
        <Card elevation={0} sx={{ p: 4, borderRadius: '20px', border: '1px dashed', borderColor: 'divider', textAlign: 'center' }}>
          <Box sx={{ width: 72, height: 72, mx: 'auto', mb: 2, borderRadius: '20px', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,rgba(32,178,170,.14),rgba(32,178,170,.05))' }}>
            <MedicationIcon sx={{ fontSize: 36, color: 'primary.dark' }} />
          </Box>
          <Typography sx={{ fontWeight: 800, fontSize: 18, fontFamily: 'Poppins, sans-serif', mb: 0.5 }}>Nenhum remédio ainda</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 330, mx: 'auto', lineHeight: 1.55, mb: 2.5 }}>
            Adicione o que você toma e o Dr. Exame avisa interações perigosas e acha o <strong>menor preço em 9 farmácias</strong> — com foto e link.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="center" alignItems={{ xs: 'stretch', sm: 'center' }}>
            <GradientButton startIcon={<AddIcon />} onClick={() => setSearchOpen(true)} sx={{ px: 3 }}>Buscar meu remédio</GradientButton>
            <Button variant="outlined" startIcon={<PhotoCameraIcon />} onClick={() => photoInput.current?.click()} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, px: 3 }}>
              Ler receita
            </Button>
          </Stack>
        </Card>
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

      {/* ANÁLISE COMPLETA (créditos) — copy pro leigo entender o VALOR */}
      {active.length >= 2 && (
        <AppCard kind="tinted" tone="primary" sx={{ mt: 3 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center">
              <AutoAwesomeIcon sx={{ color: 'primary.dark', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 800, fontSize: 15 }}>Seus remédios podem interagir?</Typography>
            </Stack>
            <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>
              O Dr. Exame cruza seus <strong>remédios com seus exames</strong> e responde em segundos:
              "Posso tomar estes dois juntos?" · "Este exame mudou por causa do remédio?" · "O que perguntar ao médico?"
            </Typography>
            <GradientButton onClick={runFull} disabled={fullLoading} startIcon={<AutoAwesomeIcon />}>
              {fullLoading ? 'Analisando seus remédios…' : 'Descobrir agora (2 créditos)'}
            </GradientButton>
            {full && (
              <Stack spacing={1}>
                {(full.all ?? []).length === 0 && <Typography sx={{ color: 'success.main', fontWeight: 700 }}>✅ Tudo certo entre seus remédios.</Typography>}
                {(full.all ?? []).map((h, i) => <HitCard key={i} h={h} />)}
                {full.contextual && <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'action.hover', whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6 }}>{full.contextual}</Box>}
              </Stack>
            )}
          </Stack>
        </AppCard>
      )}

      {/* ============ DIALOG BUSCAR — simples e direto (1 toque) ============ */}
      <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} fullWidth maxWidth="xs"
        PaperProps={{ sx: { borderRadius: '20px', overflow: 'hidden' } }}>
        <Box sx={{ p: 2, pb: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 18, fontFamily: 'Poppins, sans-serif', mb: 1.5 }}>
            Qual remédio você toma?
          </Typography>
          <TextField
            autoFocus fullWidth placeholder="dipirona, levoid, osartan..."
            value={query} onChange={(e) => setQuery(e.target.value)}
            variant="outlined" size="medium"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '14px', bgcolor: 'background.paper' } }}
          />
        </Box>
        <DialogContent sx={{ p: 1, pt: 0.5 }}>
          {searching && <Typography variant="caption" sx={{ color: 'text.disabled', px: 1 }}>buscando…</Typography>}
          {!searching && products.length === 0 && query.length >= 2 && (
            <Typography variant="body2" sx={{ color: 'text.secondary', py: 3, textAlign: 'center' }}>
              Não achamos "{query}" — tente outro nome ou fotografe a receita.
            </Typography>
          )}
          <Stack spacing={0.75}>
            {products.map((p, i) => (
              <Box key={i} component="button" type="button"
                onClick={() => void pickProduct(p)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5,
                  width: '100%', p: 1.5, borderRadius: '16px', textAlign: 'left',
                  cursor: saving === p.productName ? 'wait' : 'pointer',
                  bgcolor: i === 0 ? 'rgba(32,178,170,.05)' : 'transparent',
                  border: '1px solid', borderColor: i === 0 ? 'rgba(32,178,170,.15)' : 'divider',
                  transition: 'all .12s', '&:hover': { bgcolor: 'rgba(32,178,170,.08)', borderColor: 'primary.main' },
                  '&:active': { transform: 'scale(.98)' },
                  opacity: saving && saving !== p.productName ? 0.4 : 1,
                  outline: 'none', fontFamily: 'inherit',
                  animation: `medCardIn .3s ease ${i * 0.05}s both`,
                }}>
                {saving === p.productName ? (
                  <Box sx={{ width: 48, height: 48, display: 'grid', placeItems: 'center', flexShrink: 0 }}><CircularProgress size={24} /></Box>
                ) : p.photoUrl ? (
                  <Box component="img" src={p.photoUrl} alt={p.productName} loading="lazy"
                    sx={{ width: 48, height: 48, borderRadius: '12px', objectFit: 'contain', bgcolor: 'background.paper', flexShrink: 0 }} />
                ) : (
                  <MedAvatar name={p.productName} size={48} />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.productName}
                  </Typography>
                  {p.priceCents != null && (
                    <PriceBig cents={p.priceCents} size={16} color="primary.dark" />
                  )}
                </Box>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1 }}>
          <Button onClick={() => setSearchOpen(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>Fechar</Button>
        </DialogActions>
      </Dialog>

      {/* ============ DIALOG ESCANEAR — com progresso visual premium ============ */}
      <Dialog open={scanOpen} onClose={() => scanLoading ? null : setScanOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '20px', overflow: 'hidden' } }}>
        <Box sx={{ background: 'linear-gradient(135deg, rgba(32,178,170,.06), rgba(32,178,170,.02))', p: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ width: 56, height: 56, borderRadius: '16px', bgcolor: 'primary.main', display: 'grid', placeItems: 'center', boxShadow: '0 4px 16px rgba(32,178,170,.3)' }}>
              {scanLoading ? <CircularProgress size={28} sx={{ color: '#fff' }} /> : <PhotoCameraIcon sx={{ color: '#fff', fontSize: 28 }} />}
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: 18, fontFamily: 'Poppins, sans-serif' }}>
                {scanLoading ? 'Lendo sua receita…' : 'Remédios identificados'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {scanLoading ? 'O Dr. Exame está extraindo os nomes' : `${suggestions.filter(s => s.on).length} selecionado(s)`}
              </Typography>
            </Box>
          </Stack>
          {scanLoading && (
            <Box sx={{ mt: 2 }}>
              <Box sx={{ height: 4, borderRadius: '2px', bgcolor: 'rgba(32,178,170,.15)', overflow: 'hidden' }}>
                <Box sx={{ height: '100%', borderRadius: '2px', bgcolor: 'primary.main', animation: 'scanProgress 1.5s ease-in-out infinite', '@keyframes scanProgress': { '0%': { width: '10%', ml: '0%' }, '50%': { width: '60%', ml: '20%' }, '100%': { width: '10%', ml: '90%' } } }} />
              </Box>
              <Stack spacing={0.5} sx={{ mt: 1.5 }}>
                {['📸 Analisando a foto', '🔍 Reconhecendo o texto', '💊 Identificando remédios'].map((step, i) => (
                  <Stack key={i} direction="row" spacing={1} alignItems="center">
                    <Box sx={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid', borderColor: i === 0 ? 'primary.main' : 'divider', borderTopColor: i === 0 ? 'transparent' : 'divider', animation: i === 0 ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } } }} />
                    <Typography variant="caption" sx={{ color: i === 0 ? 'text.primary' : 'text.disabled' }}>{step}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}
        </Box>
        <DialogContent sx={{ p: 0 }}>
          {!scanLoading && suggestions.length > 0 && (
            <Stack spacing={0.75} sx={{ p: 1.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', px: 0.5, mb: 0.5 }}>Confirme os que você toma:</Typography>
              {suggestions.map((s, i) => (
                <Stack key={i} direction="row" spacing={1.5} alignItems="center" component="label"
                  sx={{
                    p: 1.5, borderRadius: '16px', cursor: 'pointer',
                    bgcolor: s.on ? 'rgba(32,178,170,.05)' : 'transparent',
                    border: '1px solid', borderColor: s.on ? 'rgba(32,178,170,.15)' : 'divider',
                    transition: 'all .12s', '&:hover': { bgcolor: 'rgba(32,178,170,.08)' },
                    animation: `medCardIn .3s ease ${i * 0.08}s both`,
                  }}>
                  <Checkbox checked={s.on} onChange={() => setSuggestions((a) => a.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} size="small" sx={{ color: 'primary.main' }} />
                  {/* FOTO do produto (do catálogo — match por nome) ou avatar */}
                  {s.photoUrl ? (
                    <Box component="img" src={s.photoUrl} alt={s.name} loading="lazy"
                      sx={{ width: 48, height: 48, borderRadius: '12px', objectFit: 'contain', bgcolor: 'background.paper', flexShrink: 0 }} />
                  ) : (
                    <MedAvatar name={s.name} size={48} />
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.25 }}>{s.name}</Typography>
                    {!!s.dosage && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{s.dosage}</Typography>}
                    {s.priceCents != null && (
                      <Stack direction="row" spacing={0.5} alignItems="baseline" sx={{ mt: 0.25 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>a partir de</Typography>
                        <PriceBig cents={s.priceCents} size={16} color="primary.dark" />
                      </Stack>
                    )}
                  </Box>
                </Stack>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={() => setScanOpen(false)} disabled={scanLoading} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button variant="contained" disabled={scanLoading || !suggestions.some((s) => s.on)} onClick={() => void saveScan()}
            sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, px: 3 }}>
            Salvar {suggestions.filter(s => s.on).length > 0 && `(${suggestions.filter(s => s.on).length})`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============ DIALOG VER PREÇOS — estilo marketplace (Shopee-like) ============ */}
      <Dialog open={!!pricesFor} onClose={() => setPricesFor(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: '20px', overflow: 'hidden' } }}>
        {/* HEADER: foto grande + melhor preço em destaque + ECONOMIA (delta entre
            a mais cara e a melhor — o argumento de venda que faltava, critique P2) */}
        {pricesFor && (() => {
          const offers = pricesData?.snapshot?.offers ?? [];
          const best = offers[0];
          const worst = offers.length > 1 ? offers[offers.length - 1] : null;
          const savings = best && worst ? worst.priceCents - best.priceCents : 0;
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
                  {savings > 0 && (
                    <Chip size="small" label={`economize ${fmtBRL(savings)} vs. a mais cara`} sx={{ mt: 0.75, height: 24, fontWeight: 800, fontSize: 11.5, bgcolor: 'rgba(5,150,105,.12)', color: '#047857' }} />
                  )}
                  {best?.pharmacy && (
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5, minWidth: 0 }}>
                      <PharmacyBadge name={best.pharmacy} />
                      <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 600, minWidth: 0 }}>{best.pharmacy}</Typography>
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
            <Stack key={i} component="button" direction="row" spacing={1.5} alignItems="center"
              onClick={() => setOfferDetail(o)}
              aria-label={`Detalhes de ${o.productName} na ${o.pharmacy}`}
              sx={{
                width: '100%', p: 1.75, borderBottom: '1px solid', borderColor: 'divider',
                cursor: 'pointer', border: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                bgcolor: i === 0 ? 'rgba(32,178,170,.04)' : 'transparent',
                fontFamily: 'inherit', textAlign: 'left',
                transition: 'background .12s', '&:hover': { bgcolor: 'rgba(32,178,170,.08)' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
              }}>
              {o.imageUrl ? (
                <Box component="img" src={o.imageUrl} alt={o.productName} loading="lazy"
                  sx={{ width: 52, height: 52, borderRadius: '12px', objectFit: 'contain', bgcolor: 'background.paper', flexShrink: 0 }} />
              ) : (
                <MedAvatar name={o.productName} size={52} />
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.productName}
                </Typography>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <PharmacyBadge name={o.pharmacy} />
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{o.pharmacy}</Typography>
                  {i === 0 && (
                    <Chip label="🏆" size="small" sx={{ height: 18, fontSize: 12, bgcolor: 'transparent', pl: 0, pr: 0, '& .MuiChip-label': { px: 0 } }} />
                  )}
                </Stack>
              </Box>
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                <Stack alignItems="flex-end" spacing={0.25}>
                  <PriceBig cents={o.priceCents} size={18} color={i === 0 ? 'primary.dark' : 'text.primary'} />
                  {i === 0 && (
                    <Chip label="MELHOR PREÇO" size="small" sx={{ height: 18, fontSize: 9, fontWeight: 800, bgcolor: 'primary.main', color: '#fff', letterSpacing: '0.03em' }} />
                  )}
                </Stack>
                <ChevronRightIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
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

      {/* FICHA DA OFERTA — nome COMPLETO (sem truncar), foto grande, farmácia e CTA.
          A lista truncava nomes longos; agora o clique mostra tudo e o usuário decide
          se vai pro site (não vai mais direto — camada intermediária). */}
      <Dialog open={!!offerDetail} onClose={() => setOfferDetail(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '20px', p: 0.5 } }}>
        {offerDetail && (
          <>
            <Box sx={{ position: 'relative', bgcolor: 'rgba(32,178,170,.05)', borderRadius: '16px', m: 1, p: 3, display: 'grid', placeItems: 'center' }}>
              {offerDetail.imageUrl ? (
                <Box component="img" src={offerDetail.imageUrl} alt={offerDetail.productName} sx={{ width: 120, height: 120, objectFit: 'contain' }} />
              ) : (
                <MedAvatar name={offerDetail.productName} size={120} />
              )}
              <IconButton size="small" onClick={() => setOfferDetail(null)} aria-label="Fechar"
                sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'background.paper', '&:hover': { bgcolor: 'action.hover' } }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
            <DialogContent sx={{ pt: 1, pb: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 16, fontFamily: 'Poppins, sans-serif', lineHeight: 1.35, wordBreak: 'break-word' }}>
                {offerDetail.productName}
              </Typography>
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1 }}>
                <PharmacyBadge name={offerDetail.pharmacy} />
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>{offerDetail.pharmacy}</Typography>
              </Stack>
              <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ mt: 2 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>preço</Typography>
                <PriceBig cents={offerDetail.priceCents} size={30} color="primary.dark" />
              </Stack>
              {offerDetail.ean && (
                <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.disabled', fontFamily: 'monospace' }}>EAN {offerDetail.ean}</Typography>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3, pt: 2 }}>
              <Button component="a" href={offerDetail.url} target="_blank" rel="noopener noreferrer" variant="contained" fullWidth
                endIcon={<OpenInNewIcon />}
                sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, py: 1.2, fontSize: 15 }}>
                Ver na farmácia
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* DESFAZER exclusão — 6s de janela,Snackbar próprio (sem internals de undo do RA) */}
      <Snackbar
        open={!!undoRemove}
        onClose={() => setUndoRemove(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        autoHideDuration={6000}
        sx={{ bottom: { xs: 'calc(var(--me-bottom-nav-h, 76px) + 16px)', sm: 24 } }}
      >
        <Box sx={{ bgcolor: 'rgba(15,23,42,.95)', color: '#fff', borderRadius: '12px', px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 2, boxShadow: 3 }}>
          <Typography sx={{ fontSize: 14 }}>
            {undoRemove?.name.slice(0, 28)}{(undoRemove?.name.length ?? 0) > 28 ? '…' : ''} removido
          </Typography>
          <Button size="small" onClick={() => { void doUndoRemove(); }} sx={{ color: '#7ee2d8', fontWeight: 800, textTransform: 'none', minWidth: 0 }}>
            DESFAZER
          </Button>
        </Box>
      </Snackbar>
    </PageContainer>
  );
};
