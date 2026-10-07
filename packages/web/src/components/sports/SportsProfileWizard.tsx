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

export const SportsProfileWizard = ({
  pid,
  onSaved,
  embedded = false,
}: {
  pid: string | null | undefined;
  onSaved?: () => void;
  embedded?: boolean;
}) => {
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
      onSaved?.();
    } catch {
      notify('Não foi possível salvar.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const chipRow = (label: string, hint: string, children: React.ReactNode) => (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{label}</Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75, lineHeight: 1.35 }}>{hint}</Typography>
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">{children}</Stack>
    </Box>
  );
  const sel = (selected: boolean) => ({
    // 44px no touch (xs) — alvo de acessibilidade p/ chips clicáveis (júri E4+ #10);
    // 32px no desktop (sm+), onde o alvo é o mouse.
    height: { xs: 44, sm: 34 } as const, fontWeight: 700, fontSize: 12.5,
    ...(selected
      ? { bgcolor: 'rgba(32,178,170,.18)', color: (t: any) => tealText(t.palette.mode), borderColor: 'rgba(32,178,170,.55)' }
      : {}),
  });

  return (
    <Stack
      spacing={2}
      sx={{
        mt: embedded ? 0 : 1.5,
        pt: embedded ? 0 : 1.5,
        borderTop: embedded ? 'none' : '1px solid',
        borderColor: 'divider',
      }}
    >
      {chipRow('1. Seu esporte principal', 'Muda a lente do painel: prioriza marcadores chave de esforço, CK, ferro ou recuperação.', SPORTS.map((s) => (
        <Chip key={s} component="button" size="small" variant={modality === s ? 'filled' : 'outlined'}
          aria-pressed={modality === s} label={s} onClick={() => setModality(s)} sx={sel(modality === s)} />
      )))}
      {chipRow('2. Seu nível de treino', 'Contexto de intensidade — calibra limites para interpretação de enzimas musculares e recuperação.', LEVELS.map((l) => (
        <Chip key={l.v} component="button" size="small" variant={level === l.v ? 'filled' : 'outlined'}
          aria-pressed={level === l.v} label={l.l} onClick={() => setLevel(l.v)} sx={sel(level === l.v)} />
      )))}
      {chipRow('3. Contexto hormonal', 'Independente do esporte. Reposição ativa monitoramento específico (Hematócrito, PSA, Perfil Lipídico).', HORMONAL.map((h) => (
        <Chip key={h.v} component="button" size="small" variant={hormonal === h.v ? 'filled' : 'outlined'}
          aria-pressed={hormonal === h.v} label={h.l} onClick={() => setHormonal(h.v)} sx={sel(hormonal === h.v)} />
      )))}
      <Box sx={{ pt: 1, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button
          size="medium"
          variant="contained"
          disabled={!dirty || saving || !modality}
          onClick={() => void save()}
          sx={{
            borderRadius: '999px',
            textTransform: 'none',
            fontWeight: 800,
            fontSize: 13.5,
            px: 3,
            py: 0.9,
            bgcolor: '#20b2aa',
            boxShadow: '0 2px 10px rgba(32,178,170,0.3)',
            '&:hover': { bgcolor: 'primary.dark' },
          }}
        >
          {saving ? 'Salvando…' : 'Aplicar à Minha Lente'}
        </Button>
      </Box>
    </Stack>
  );
};
