// SportsProfileWizard (E5 "lente por arquétipo") — declaração em 3 passos com CHIPS:
// Esporte → Nível → Contexto hormonal. Persiste SEM migration: `modality` continua o
// texto do esporte (fuzzy cobre dado antigo) e nível/contexto hormonal entram como
// CHAVES do `collectionContext` jsonb existente (PUT /sports/profile já aceita objeto).
//
// O par esporte × contexto hormonal define a LENTE do SportsDashboard (ordem dos
// domínios, spotlight, foco e perguntas). Dimensões INDEPENDENTES: musculação NÃO
// implica uso hormonal — nunca acoplar (RELATORIO §1).
import { useEffect, useState } from 'react';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { useNotify } from 'react-admin';
import { API_URL, apiHeaders, token } from '../../config';
import { tealText } from '../../theme';

/** Esportes do wizard (texto vai p/ modality — o fuzzy da lente casa todos). */
const SPORTS = ['Musculação/Hipertrofia', 'Corrida/Ciclismo', 'CrossFit/Funcional', 'Outro'] as const;
/** Níveis → collectionContext.level. */
const LEVELS: { v: string; l: string }[] = [
  { v: 'recreativo', l: 'Recreativo' },
  { v: 'amador', l: 'Amador competitivo' },
  { v: 'alta', l: 'Alta performance' },
];
/** Contexto hormonal → collectionContext.hormonalContext (independente do esporte). */
const HORMONAL: { v: string; l: string; hint?: string }[] = [
  { v: 'nenhum', l: 'Nenhum' },
  { v: 'trt', l: 'Reposição com prescrição (TRT)' },
  { v: 'declarado', l: 'Uso declarado sem prescrição' },
  { v: 'nao_dizer', l: 'Prefiro não dizer' },
];

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

export const SportsProfileWizard = ({ pid }: { pid: string | null | undefined }) => {
  const notify = useNotify();
  const [modality, setModality] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [hormonal, setHormonal] = useState<string | null>(null);
  const [initial, setInitial] = useState<{ modality: string | null; level: string | null; hormonal: string | null } | null>(null);
  const [saving, setSaving] = useState(false);

  // Carrega o perfil atual (prefill) — GET leve, mesma rota do dashboard.
  useEffect(() => {
    if (!pid) return;
    let alive = true;
    fetch(`${API_URL}/sports/profile`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.profile) return;
        const cc = d.profile.collectionContext;
        const m = typeof d.profile.modality === 'string' ? d.profile.modality : null;
        const lv = isPlainObject(cc) && typeof cc.level === 'string' ? cc.level : null;
        const hm = isPlainObject(cc) && typeof cc.hormonalContext === 'string' ? cc.hormonalContext : null;
        setModality(m); setLevel(lv); setHormonal(hm);
        setInitial({ modality: m, level: lv, hormonal: hm });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [pid]);

  const dirty = !!initial && (
    modality !== initial.modality || level !== initial.level || hormonal !== initial.hormonal
  );

  const save = async () => {
    if (!pid || !modality) { notify('Escolha seu esporte.', { type: 'warning' }); return; }
    setSaving(true);
    try {
      // collectionContext é jsonb substituído no PUT → MERGE das chaves existentes
      // (jejum/treino24h/última dose do fluxo de coleta NÃO podem se perder).
      let cc: Record<string, unknown> = {};
      if (initial) {
        const r = await fetch(`${API_URL}/sports/profile`, { headers: { Authorization: `Bearer ${token()}` } });
        if (r.ok) {
          const d = await r.json();
          if (isPlainObject(d?.profile?.collectionContext)) cc = { ...d.profile.collectionContext };
        }
      }
      cc.level = level ?? null;
      cc.hormonalContext = hormonal ?? null;
      const r = await fetch(`${API_URL}/sports/profile`, {
        method: 'PUT', headers: apiHeaders(true),
        body: JSON.stringify({ modality, collectionContext: cc }),
      });
      if (!r.ok) { notify('Não foi possível salvar.', { type: 'error' }); return; }
      setInitial({ modality, level, hormonal });
      notify('Perfil esportivo salvo — o painel já reflete sua lente.', { type: 'success' });
      // Invalida o cache de sessão → o dashboard re-organiza na hora.
      try { window.dispatchEvent(new Event('sports-profile-changed')); } catch { /* SSR/test */ }
    } catch {
      notify('Não foi possível salvar.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const chipRow = (label: string, hint: string, children: React.ReactNode) => (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>{label}</Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>{hint}</Typography>
      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">{children}</Stack>
    </Box>
  );
  const sel = (selected: boolean) => ({
    height: 32, fontWeight: 700, fontSize: 12.5,
    ...(selected
      ? { bgcolor: 'rgba(32,178,170,.16)', color: (t: any) => tealText(t.palette.mode), borderColor: 'rgba(32,178,170,.5)' }
      : {}),
  });

  return (
    <Stack spacing={1.5} sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
      {chipRow('1 · Seu esporte', 'Muda a lente do painel: ordem dos domínios e marcadores em destaque.', SPORTS.map((s) => (
        <Chip key={s} component="button" size="small" variant={modality === s ? 'filled' : 'outlined'}
          aria-pressed={modality === s} label={s} onClick={() => setModality(s)} sx={sel(modality === s)} />
      )))}
      {chipRow('2 · Seu nível', 'Contexto de intensidade — ajuda a interpretar CK e recuperação.', LEVELS.map((l) => (
        <Chip key={l.v} component="button" size="small" variant={level === l.v ? 'filled' : 'outlined'}
          aria-pressed={level === l.v} label={l.l} onClick={() => setLevel(l.v)} sx={sel(level === l.v)} />
      )))}
      {chipRow('3 · Contexto hormonal', 'Independente do esporte. Reposição com prescrição ativa a lente de monitoramento (Hct, PSA, HDL).', HORMONAL.map((h) => (
        <Chip key={h.v} component="button" size="small" variant={hormonal === h.v ? 'filled' : 'outlined'}
          aria-pressed={hormonal === h.v} label={h.l} onClick={() => setHormonal(h.v)} sx={sel(hormonal === h.v)} />
      )))}
      <Box>
        <Button size="small" variant="contained" disabled={!dirty || saving || !modality} onClick={() => void save()}
          sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa', boxShadow: 'none', '&:hover': { bgcolor: 'primary.dark' } }}>
          {saving ? 'Salvando…' : 'Salvar perfil esportivo'}
        </Button>
      </Box>
    </Stack>
  );
};
