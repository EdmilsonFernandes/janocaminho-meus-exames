// DeclareSubstanceSheet (redesign hormonal v2 — spec 2026-10-27) — bottom sheet de
// declaração em 2 TOQUES, 0 digitação obrigatória. Corrige a auditoria:
//  A2/A9  UMA pergunta de tempo (chips relativos, default "Não lembro", dia 01 — zero
//         DateField/máscara); "Já parei" responde QUANDO PAROU → endedAt.
//  A3/A4  label DUPLO na option ("Masteron — Drostanolona") + match por nome OU alias
//         (searchSubstances/catalogFindByToken), badge C5/C1 por alias.
//  A5     dose = input decimal + CHIPS de unidade/frequência (unitHint pré-seleciona).
//  A12    dose + médico ficam em "Detalhes (opcional)" COLAPSADO.
// Payload = mesmo contrato do DeclaredSubstanceForm (POST /medications "[Classe] Nome" +
// endStatus/startedAt/endedAt) + mirror SportsProfile.declaredSubstances (best-effort) +
// evento 'sports-profile-changed'. Edição com mudança de INÍCIO → DELETE+POST (o PATCH
// do server não aceita startedAt). LGPD: NENHUM log/console de substância/dose.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Autocomplete, Box, Button, Chip, Collapse, Drawer, Stack, TextField, Typography, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useNotify } from 'react-admin';
import { API_URL, apiHeaders, token } from '../../config';
import { sportsProfileUrl } from '../../hooks/useSportsProfile';
import {
  SUBSTANCE_CATALOG, searchSubstances, displayLabel, artFor, catalogFindByToken,
  type CatalogItem,
} from './substanceCatalog';
import { SubstanceArt } from './SubstanceArt';

type EndStatus = 'em_uso' | 'interrompi' | 'nao_sei';
type TimeKey = 'nao_lembro' | 'm1' | 'm3' | 'm6' | 'a1';

export interface SheetEditTarget {
  id: string;
  /** Item só do SportsProfile (id "sp-*", sem Medication) → salvar CRIA o Medication. */
  profileOnly?: boolean;
  endStatus?: EndStatus | null;
  startedAt?: string | null;
  endedAt?: string | null;
  dosage?: string | null;
  prescriberName?: string | null;
}

const TIME_OPTIONS: { key: TimeKey; label: string; months: number | null }[] = [
  { key: 'nao_lembro', label: 'Não lembro', months: null },
  { key: 'm1', label: '~1 mês', months: 1 },
  { key: 'm3', label: '~3 meses', months: 3 },
  { key: 'm6', label: '~6 meses', months: 6 },
  { key: 'a1', label: '~1 ano', months: 12 },
];

const STATUS_OPTIONS: { value: EndStatus; label: string }[] = [
  { value: 'em_uso', label: 'Em uso' },
  { value: 'interrompi', label: 'Já parei' },
  { value: 'nao_sei', label: 'Não sei' },
];

const UNITS = ['mg', 'mcg', 'UI', 'ml'] as const;
const FREQS = ['/dia', '/semana', '/mês'] as const;

/** "hoje - N meses" → ISO yyyy-mm-01 (dia 01 = aproximado declarado, nunca preciso). */
const approxIso = (monthsAgo: number): string => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

/** "300 mg/semana — declarado pelo paciente" → { value:'300', unit:'mg', freq:'/semana' }. */
const parseDose = (raw?: string | null): { value: string; unit: string; freq: string } => {
  const s = String(raw ?? '')
    .replace(/ — declarado pelo paciente|declarado pelo paciente/g, '')
    .trim()
    .toLowerCase();
  const m = /^([\d.,]+)\s*(mg|mcg|ui|ml)?\s*(?:\/\s*(dia|semana|m[eê]s))?$/.exec(s);
  if (!m) return { value: '', unit: '', freq: '' };
  return {
    value: m[1],
    unit: m[2] ? (m[2] === 'ui' ? 'UI' : m[2]) : '',
    freq: m[3] ? `/${m[3]}` : '',
  };
};

/** unitHint "mg/semana" → pré-seleciona os chips { mg, /semana }. */
const parseUnitHint = (hint?: string): { unit: string; freq: string } => {
  const m = /^(mg|mcg|ui|ml)(?:\/(dia|semana|m[eê]s))?$/.exec(String(hint ?? '').toLowerCase());
  if (!m) return { unit: '', freq: '' };
  return { unit: m[1] === 'ui' ? 'UI' : m[1], freq: m[2] ? `/${m[2]}` : '' };
};

/** Texto livre sem match no catálogo → classe inferida por palavra-chave (default Hormônio:
 * este sheet vive no modo hormonal; suplemento tem vocabulário próprio). */
const inferCls = (raw: string): CatalogItem['cls'] => {
  const hit = catalogFindByToken(raw);
  if (hit) return hit.cls;
  const t = raw.toLowerCase();
  if (/(creatina|whey|prote[ií]na|[oô]mega|vitamina|cafe[ií]na|bcaa|zma|tribulus|pr[eé]-treino|termog[eê]nic|beta-alanina|dhea)/.test(t)) return 'Suplemento';
  return 'Hormônio';
};

// ── Helpers do SportsProfile (compartilhados com DeclaredSubstanceForm — UMA implementação) ──

/** Lista de strings de um campo jsonb do SportsProfile DO PACIENTE do form (GET com
 *  ?patientId= desde 27/10/26; a guarda de patientId abaixo fica como defesa). */
export const readProfileList = async (pid: string, key: 'supplements' | 'declaredSubstances'): Promise<string[]> => {
  try {
    const r = await fetch(sportsProfileUrl(pid), { headers: { Authorization: `Bearer ${token()}` } });
    if (!r.ok) return [];
    const d = await r.json();
    const p = d?.profile;
    if (!p || (pid && p.patientId && p.patientId !== pid)) return [];
    const v = p[key];
    if (!Array.isArray(v)) return [];
    return v
      .map((it: unknown) =>
        typeof it === 'string' ? it.trim()
          : it && typeof it === 'object' && typeof (it as { name?: unknown }).name === 'string' ? (it as { name: string }).name.trim()
            : '')
      .filter(Boolean);
  } catch { return []; } // offline → merge vazio (nunca bloqueia a declaração)
};

/** PUT parcial do SportsProfile (upsert server-side). Ok → invalida o cache da sessão. */
export const putSportsProfile = async (body: Record<string, unknown>): Promise<boolean> => {
  try {
    const r = await fetch(`${API_URL}/sports/profile`, { method: 'PUT', headers: apiHeaders(true), body: JSON.stringify(body) });
    if (!r.ok) return false;
    try { window.dispatchEvent(new Event('sports-profile-changed')); } catch { /* SSR/test */ }
    return true;
  } catch { return false; }
};

// ── Chip segmentado reutilizável do sheet (toque 44px inegociável) ──

const SheetChip = ({ selected, onClick, children, tone = 'teal', sx }: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: 'teal' | 'copper';
  sx?: object;
}) => {
  const grad = tone === 'copper'
    ? 'linear-gradient(135deg,#e0b98c,#d4a574)'
    : 'linear-gradient(135deg,#20b2aa,#178f89)';
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      sx={{
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
        border: selected ? '1.5px solid transparent' : '1.5px solid',
        borderColor: selected ? 'transparent' : 'rgba(157,180,178,.3)',
        borderRadius: '999px',
        px: 2,
        fontSize: 13.5,
        fontWeight: selected ? 800 : 600,
        color: selected ? '#fff' : 'text.secondary',
        bgcolor: selected ? grad : 'transparent',
        boxShadow: selected ? '0 5px 16px rgba(0,0,0,.18)' : 'none',
        cursor: 'pointer',
        touchAction: 'manipulation',
        whiteSpace: 'nowrap',
        transition: 'all .15s ease',
        '&:active': { transform: 'scale(.97)' },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
};

const QuestionLabel = ({ children, hint }: { children: ReactNode; hint?: string }) => (
  <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
    <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>{children}</Typography>
    {hint && <Typography sx={{ fontSize: 11, fontWeight: 500, color: 'text.disabled' }}>{hint}</Typography>}
  </Stack>
);

export interface DeclareSubstanceSheetProps {
  open: boolean;
  onClose: () => void;
  pid?: string;
  /** Chip 1-tap do card/banner → sheet já nasce com a pill fixa da substância. */
  preselect?: CatalogItem | null;
  /** Re-declaração (StackCard ✏️): pré-preenche status/dose; id de Medication → PATCH/replace. */
  edit?: SheetEditTarget | null;
  onSaved?: () => void;
}

export const DeclareSubstanceSheet = ({ open, onClose, pid, preselect, edit, onSaved }: DeclareSubstanceSheetProps) => {
  const notify = useNotify();
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';

  // TODOS os hooks antes de qualquer return (regra #310 do projeto).
  const [searchMode, setSearchMode] = useState(false);
  const [sel, setSel] = useState<CatalogItem | null>(null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<EndStatus>('em_uso');
  const [timeKey, setTimeKey] = useState<TimeKey>('nao_lembro');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [doseValue, setDoseValue] = useState('');
  const [unit, setUnit] = useState('');
  const [freq, setFreq] = useState('');
  const [medico, setMedico] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset/hidratação a cada ABERTURA (chip = pill fixa; sem preselect = modo busca;
  // edit = status/dose pré-preenchidos do registro atual).
  useEffect(() => {
    if (!open) return;
    setSearchMode(!preselect);
    setSel(preselect ?? null);
    setText('');
    setStatus(edit?.endStatus === 'interrompi' ? 'interrompi' : 'em_uso');
    setTimeKey('nao_lembro');
    setDetailsOpen(false);
    const pd = parseDose(edit?.dosage);
    setDoseValue(pd.value);
    setUnit(pd.unit);
    setFreq(pd.freq);
    setMedico(edit?.prescriberName ?? '');
  }, [open, preselect, edit]);

  // Substância escolhida → chips de unidade seguem o unitHint do catálogo (formato,
  // nunca quantidade — contrato anti-dose do blueprint).
  useEffect(() => {
    if (!sel) return;
    const hint = parseUnitHint(sel.unitHint);
    setUnit(hint.unit);
    setFreq(hint.freq);
  }, [sel]);

  const defaultOptions = useMemo(() => SUBSTANCE_CATALOG.filter((c) => c.popular).slice(0, 12), []);

  const label = sel ? displayLabel(sel) : null;
  const chosenName = label?.commercial ?? text.trim();

  const buildDose = (): string => {
    const v = doseValue.trim().replace(',', '.');
    if (!v) return '';
    return `${v}${unit ? ` ${unit}` : ''}${freq ?? ''}`;
  };

  const finish = (n: string) => {
    notify(`Pronto — seus exames agora consideram ${n}.`, { type: 'success' });
    try { window.dispatchEvent(new Event('sports-profile-changed')); } catch { /* SSR/test */ }
    onSaved?.();
    onClose();
  };

  const save = async () => {
    const n = chosenName;
    if (!n) { notify('Escolha ou digite a substância.', { type: 'error' }); return; }
    setSaving(true);
    try {
      const cls = sel?.cls ?? inferCls(text);
      const doseStr = buildDose();
      const t = TIME_OPTIONS.find((o) => o.key === timeKey)!;

      // Suplemento NÃO vira Medication (P0.2): lista de nomes no SportsProfile.
      if (cls === 'Suplemento') {
        const cur = await readProfileList(pid ?? '', 'supplements');
        if (!cur.some((s) => s.toLowerCase() === n.toLowerCase())) {
          const ok = await putSportsProfile(pid ? { patientId: pid, supplements: [...cur, n] } : { supplements: [...cur, n] });
          if (!ok) { notify('Erro ao registrar suplemento.', { type: 'error' }); return; }
        }
        finish(n);
        return;
      }

      // A2/A9: UMA pergunta de tempo. "Já parei" responde QUANDO PAROU → endedAt
      // (início desconhecido = null → tratado como "desde o primeiro exame", spec A9).
      const endedAt = status === 'interrompi'
        ? (t.months != null ? approxIso(t.months) : (edit?.endedAt ?? null))
        : null;
      const startedAt = status === 'interrompi'
        ? (edit?.startedAt ?? null)
        : (t.months != null ? approxIso(t.months) : (edit?.startedAt ?? null));
      const dosage = doseStr ? `${doseStr} — declarado pelo paciente` : 'declarado pelo paciente';
      const name = `[${cls}] ${n}`;
      const prescriberName = medico.trim() || null;

      if (edit && !edit.profileOnly) {
        // PATCH cobre name/dosage/endStatus/endedAt/prescriber. Mudou o INÍCIO →
        // substitui (DELETE+POST): o PATCH do server não aceita startedAt.
        const startChanged = (startedAt ?? null) !== (edit.startedAt ?? null);
        if (startChanged) {
          const del = await fetch(`${API_URL}/medications/${edit.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
          if (!del.ok) { notify('Erro ao atualizar declaração.', { type: 'error' }); return; }
          const r = await fetch(`${API_URL}/medications`, {
            method: 'POST', headers: apiHeaders(true),
            body: JSON.stringify({ patientId: pid || undefined, name, dosage, startedAt, endStatus: status, endedAt, lastAdministeredAt: null, prescriberName }),
          });
          if (!r.ok) { notify('Erro ao atualizar declaração.', { type: 'error' }); return; }
        } else {
          const r = await fetch(`${API_URL}/medications/${edit.id}`, {
            method: 'PATCH', headers: apiHeaders(true),
            body: JSON.stringify({ name, dosage, endStatus: status, endedAt, prescriberName }),
          });
          if (!r.ok) { notify('Erro ao atualizar declaração.', { type: 'error' }); return; }
        }
      } else {
        const r = await fetch(`${API_URL}/medications`, {
          method: 'POST', headers: apiHeaders(true),
          body: JSON.stringify({ patientId: pid || undefined, name, dosage, startedAt, endStatus: status, endedAt, lastAdministeredAt: null, prescriberName }),
        });
        if (!r.ok) { notify('Erro ao declarar substância.', { type: 'error' }); return; }
      }

      // Mirror best-effort do nome (contexto rápido da IA — fonte de verdade = Medication).
      const cur = await readProfileList(pid ?? '', 'declaredSubstances');
      if (!cur.some((s) => s.toLowerCase() === n.toLowerCase())) {
        await putSportsProfile(pid ? { patientId: pid, declaredSubstances: [...cur, n] } : { declaredSubstances: [...cur, n] });
      }
      finish(n);
    } finally { setSaving(false); }
  };

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            borderTopLeftRadius: '24px',
            borderTopRightRadius: '24px',
            maxWidth: 480,
            width: '100%',
            mx: 'auto',
            maxHeight: '90dvh',
            overflowY: 'auto',
            backgroundImage: 'none',
            background: dark
              ? 'linear-gradient(170deg,#16292b,#101e1f)'
              : 'linear-gradient(170deg,#ffffff,#f3faf9)',
          },
        },
      }}
    >
      <Stack sx={{ px: { xs: 2, sm: 2.5 }, pt: 1.25, pb: 3 }}>
        {/* drag handle (visual) */}
        <Box sx={{ width: 42, height: 5, borderRadius: 3, bgcolor: alpha(theme.palette.text.primary, 0.18), mx: 'auto', mb: 1.5 }} />

        {/* ── SUBSTÂNCIA: pill fixa (chip 1-tap) OU autocomplete label duplo ── */}
        {searchMode ? (
          <Box>
            <Autocomplete
              freeSolo
              openOnFocus
              autoFocus
              options={SUBSTANCE_CATALOG}
              inputValue={text}
              getOptionLabel={(o) => (typeof o === 'string' ? o : displayLabel(o).commercial)}
              filterOptions={(_opts, state) => {
                const q = state.inputValue.trim();
                return q ? searchSubstances(q, 10) : defaultOptions;
              }}
              onInputChange={(_, v, reason) => { if (reason !== 'reset') setText(v ?? ''); }}
              onChange={(_, v) => {
                if (v && typeof v === 'object') { setSel(v); setSearchMode(false); }
                else if (typeof v === 'string') { setSel(null); setText(v); }
                else { setSel(null); }
              }}
              renderOption={(props, option) => {
                const lab = displayLabel(option);
                return (
                  <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 48, px: 1.5 }}>
                    <SubstanceArt kind={artFor(option)} size={28} tone="teal" />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography noWrap sx={{ fontWeight: 700, fontSize: 14 }}>{lab.commercial}</Typography>
                      {lab.chemical && (
                        <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>{lab.chemical}</Typography>
                      )}
                    </Box>
                    {option.anvisa && (
                      <Chip
                        size="small"
                        label={`Lista ${option.anvisa}`}
                        sx={{
                          height: 20, fontSize: 10, fontWeight: 700, flexShrink: 0,
                          bgcolor: 'rgba(212,165,116,.14)', color: dark ? '#e3bd8f' : '#8a6240',
                          '& .MuiChip-label': { px: 0.75 },
                        }}
                      />
                    )}
                  </Box>
                );
              }}
              renderInput={(p) => (
                <TextField
                  {...p}
                  label="Substância"
                  placeholder="Ex.: masteron, trembo, creatina…"
                  fullWidth
                  size="small"
                  inputProps={{ ...p.inputProps, maxLength: 60 }}
                  helperText="Nome comercial ou princípio ativo — ou escreva livre."
                />
              )}
            />
          </Box>
        ) : (
          sel && (
            <Stack
              direction="row"
              spacing={1.5}
              alignItems="center"
              sx={{ p: 1.25, borderRadius: '16px', border: '1px solid', borderColor: 'divider' }}
            >
              <SubstanceArt kind={artFor(sel)} size={44} tone="copper" />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 16.5, lineHeight: 1.2 }}>
                  {label?.commercial}
                </Typography>
                {label?.chemical && (
                  <Typography noWrap sx={{ fontSize: 12.5, color: 'text.secondary' }}>{label.chemical}</Typography>
                )}
                {sel.anvisa && (
                  <Chip
                    size="small"
                    label={`Lista ${sel.anvisa} · ANVISA`}
                    sx={{
                      mt: 0.5, height: 20, fontSize: 10, fontWeight: 700,
                      bgcolor: 'rgba(212,165,116,.14)', color: dark ? '#e3bd8f' : '#8a6240',
                      '& .MuiChip-label': { px: 0.75 },
                    }}
                  />
                )}
              </Box>
              <Button
                size="small"
                onClick={() => { setSearchMode(true); setSel(null); }}
                sx={{ minHeight: 44, borderRadius: '999px', textTransform: 'none', fontWeight: 700, flexShrink: 0, px: 1.5 }}
              >
                trocar
              </Button>
            </Stack>
          )
        )}

        {/* ── STATUS (1 toque, default "Em uso" — A7 morreu: classe não é pergunta) ── */}
        <Box sx={{ mt: 2.25 }}>
          <QuestionLabel hint="1 toque">Ainda usando?</QuestionLabel>
          <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
            {STATUS_OPTIONS.map((o) => (
              <SheetChip key={o.value} selected={status === o.value} onClick={() => setStatus(o.value)}>{o.label}</SheetChip>
            ))}
          </Stack>
        </Box>

        {/* ── TEMPO (UMA pergunta — A2/A9; cobre = contexto relatado) ── */}
        <Box sx={{ mt: 2.25 }}>
          <QuestionLabel hint="opcional">{status === 'interrompi' ? 'Quando parou?' : 'Desde quando?'}</QuestionLabel>
          <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
            {TIME_OPTIONS.map((o) => (
              <SheetChip key={o.key} tone="copper" selected={timeKey === o.key} onClick={() => setTimeKey(o.key)}>{o.label}</SheetChip>
            ))}
          </Stack>
        </Box>

        {/* ── DETALHES (opcional, colapsado — A5/A12) ── */}
        <Box sx={{ mt: 1.5, borderTop: '1px solid', borderColor: 'divider', pt: 0.5 }}>
          <Box
            component="button"
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            sx={{
              display: 'flex', width: '100%', minHeight: 44, alignItems: 'center', justifyContent: 'space-between',
              border: 'none', bgcolor: 'transparent', cursor: 'pointer', px: 0,
              color: 'text.primary', fontWeight: 700, fontSize: 13.5, touchAction: 'manipulation',
            }}
          >
            Detalhes (opcional)
            <ExpandMoreIcon sx={{ transform: detailsOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s', fontSize: 18, color: 'text.secondary' }} />
          </Box>
          <Collapse in={detailsOpen} timeout="auto" unmountOnExit>
            <Stack spacing={1.25} sx={{ pt: 0.5, pb: 1 }}>
              <TextField
                label="Dose (opcional)"
                value={doseValue}
                onChange={(e) => setDoseValue(e.target.value)}
                fullWidth
                size="small"
                inputMode="decimal"
                inputProps={{ maxLength: 12 }}
                placeholder={sel?.unitHint ? `Ex.: ${sel.unitHint}` : 'Ex.: 300'}
                helperText="Autorrelato — o app nunca sugere nem valida dose."
              />
              <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75}>
                {UNITS.map((u) => (
                  <SheetChip key={u} selected={unit === u} onClick={() => setUnit((cur) => (cur === u ? '' : u))} sx={{ px: 1.75, fontSize: 12.5 }}>{u}</SheetChip>
                ))}
                {FREQS.map((f) => (
                  <SheetChip key={f} selected={freq === f} onClick={() => setFreq((cur) => (cur === f ? '' : f))} sx={{ px: 1.75, fontSize: 12.5 }}>{f}</SheetChip>
                ))}
              </Stack>
              <TextField
                label="Médico que acompanha (opcional)"
                value={medico}
                onChange={(e) => setMedico(e.target.value)}
                fullWidth
                size="small"
                inputProps={{ maxLength: 80 }}
                helperText="Preenchido → seu perfil vira “TRT prescrito”. Deixe vazio se não houver."
              />
            </Stack>
          </Collapse>
        </Box>

        {/* ── CTA ── */}
        <Button
          variant="contained"
          fullWidth
          disabled={saving || !chosenName}
          onClick={() => void save()}
          sx={{
            minHeight: 52,
            borderRadius: '15px',
            mt: 1.5,
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 800,
            fontSize: 15,
            textTransform: 'none',
            bgcolor: 'primary.main',
            background: 'linear-gradient(135deg,#20b2aa,#178f89)',
            boxShadow: '0 10px 26px rgba(32,178,170,.35)',
            '&:disabled': { background: (t) => alpha(t.palette.action.disabledBackground, 0.6), color: 'text.disabled' },
          }}
        >
          {saving ? 'Salvando…' : `Declarar ${chosenName || ''}`}
        </Button>

        {/* ── Rodapé de privacidade (LGPD) ── */}
        <Stack direction="row" spacing={0.75} justifyContent="center" alignItems="center" sx={{ mt: 1.25 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 500, color: 'text.disabled' }}>
            🔒 Só você — e o médico que você autorizar — veem isso.
          </Typography>
        </Stack>
      </Stack>
    </Drawer>
  );
};
