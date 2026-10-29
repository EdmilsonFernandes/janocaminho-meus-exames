// DeclareSubstanceSheet (redesign hormonal v2 — spec 2026-10-27) — bottom sheet de
// declaração em 2 TOQUES, 0 digitação obrigatória. Corrige a auditoria:
//  A2/A9  UMA pergunta de tempo (chips relativos, default "Não lembro", dia 01 — zero
//         DateField/máscara); "Já parei" responde QUANDO PAROU → endedAt.
//  A3/A4  label DUPLO na option ("Masteron — Drostanolona") + match por nome OU alias
//         (searchSubstances/catalogFindByToken), badge C5 por alias.
//  A5     dose = input decimal + CHIPS de unidade/frequência (unitHint pré-seleciona).
//  A12    dose + médico ficam em "Detalhes (opcional)" COLAPSADO.
// Premium v3 (27/10/26): cards com "o que é" + selos (C5, uso veterinário) + o que muda na
// leitura dos exames; chips selecionados AA (antes o degradê ia em background-color =
// inválido → chip selecionado sumia); CTA fixo no rodapé. Cadastro inteligente: nome
// digitado que bate com o catálogo é registrado pelo nome reconhecido; substância já
// declarada (em uso) vira ATUALIZAÇÃO do registro existente em vez de duplicar.
// Payload = mesmo contrato do DeclaredSubstanceForm (POST /medications "[Classe] Nome" +
// endStatus/startedAt/endedAt) + mirror SportsProfile.declaredSubstances (best-effort) +
// evento 'sports-profile-changed'. Edição com mudança de INÍCIO → DELETE+POST (o PATCH
// do server não aceita startedAt). LGPD: NENHUM log/console de substância/dose.
import { useEffect, useId, useMemo, useState, type Key, type ReactNode } from 'react';
import {
  Autocomplete, Box, Button, Collapse, Drawer, IconButton, Stack, TextField, Typography, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { useNotify } from 'react-admin';
import { API_URL, apiHeaders, token } from '../../config';
import { sportsProfileUrl } from '../../hooks/useSportsProfile';
import { tealText } from '../../theme';
import { COPPER } from '../../tokens';
import {
  SUBSTANCE_CATALOG, searchSubstances, displayLabel, artFor, catalogFindByToken, sameSubstance,
  type CatalogItem,
} from './substanceCatalog';
import { SubstanceArt } from './SubstanceArt';
import {
  declaredFromMeds, findDuplicate, isOngoing,
  type EndStatus, type ExistingDecl, type SheetEditTarget,
} from './declarationMatch';

export type { SheetEditTarget } from './declarationMatch';

type TimeKey = 'nao_lembro' | 'm1' | 'm3' | 'm6' | 'a1';

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

/** Teal de marca (acentos) e o par AA p/ fundo sólido com texto branco (≥5,4:1). */
const BRAND_TEAL = '#20b2aa';
const TEAL_SOLID = 'linear-gradient(135deg,#0e7f78,#0b5f59)';

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

/** Medications declaradas do paciente + suplementos do perfil. Offline/erro → lista
 *  vazia: o aviso some, a declaração nunca trava. */
const loadExisting = async (pid: string): Promise<ExistingDecl[]> => {
  let meds: ExistingDecl[] = [];
  try {
    const r = await fetch(`${API_URL}/medications?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) meds = declaredFromMeds(await r.json(), pid);
  } catch { /* offline — sem aviso de duplicata */ }
  const supps = (await readProfileList(pid, 'supplements')).map((name): ExistingDecl => ({ name, kind: 'supp' }));
  return [...meds, ...supps];
};

// ── Peças visuais do sheet (toque 44px inegociável; texto AA nos dois modos) ──

const SheetChip = ({ selected, onClick, children, tone = 'teal', variant = 'solid', sx }: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: 'teal' | 'copper';
  /** solid = resposta principal (branco sobre teal escuro); tonal = escolha secundária. */
  variant?: 'solid' | 'tonal';
  sx?: object;
}) => {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const on = tone === 'copper'
    ? { background: alpha(COPPER.main, dark ? 0.2 : 0.18), borderColor: COPPER.main, color: dark ? COPPER.light : COPPER.textAA }
    : variant === 'solid'
      ? { background: TEAL_SOLID, borderColor: 'transparent', color: '#fff', boxShadow: '0 6px 16px rgba(11,95,89,.28)' }
      : { background: alpha(BRAND_TEAL, dark ? 0.2 : 0.14), borderColor: alpha(BRAND_TEAL, 0.7), color: tealText(theme.palette.mode) };
  const off = { background: 'transparent', borderColor: alpha(theme.palette.text.primary, dark ? 0.24 : 0.18), color: 'text.secondary' };
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
        justifyContent: 'center',
        border: '1.5px solid',
        borderRadius: '999px',
        px: 2,
        fontFamily: 'inherit',
        fontSize: 14,
        fontWeight: selected ? 800 : 600,
        cursor: 'pointer',
        touchAction: 'manipulation',
        whiteSpace: 'nowrap',
        transition: 'background .15s ease, border-color .15s ease, color .15s ease, transform .1s ease',
        ...(selected ? on : off),
        '&:hover': selected ? {} : { borderColor: alpha(BRAND_TEAL, 0.6), color: 'text.primary' },
        '&:focus-visible': { outline: `2px solid ${BRAND_TEAL}`, outlineOffset: 2 },
        '&:active': { transform: 'scale(.97)' },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
};

/** Selo informativo (lista C5, uso veterinário) — 12px, AA nos dois modos. */
const Tag = ({ children, tone }: { children: ReactNode; tone: 'copper' | 'neutral' }) => {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex', alignItems: 'center', minHeight: 22, px: 1, borderRadius: '999px',
        fontSize: 12, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap',
        ...(tone === 'copper'
          ? { bgcolor: alpha(COPPER.main, 0.16), color: dark ? COPPER.light : COPPER.textAA }
          : { bgcolor: alpha(theme.palette.text.primary, dark ? 0.1 : 0.07), color: dark ? 'text.secondary' : '#475569' }),
      }}
    >
      {children}
    </Box>
  );
};

const QuestionLabel = ({ children, hint }: { children: ReactNode; hint?: string }) => (
  <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
    <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{children}</Typography>
    {hint && <Typography sx={{ fontSize: 12, fontWeight: 500, color: 'text.secondary' }}>{hint}</Typography>}
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
  const teal = tealText(theme.palette.mode);
  const titleId = useId();

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
  // Cadastro inteligente: o que já foi declarado + registro existente a atualizar.
  const [existing, setExisting] = useState<ExistingDecl[]>([]);
  const [autoEdit, setAutoEdit] = useState<SheetEditTarget | null>(null);
  const [optOutId, setOptOutId] = useState<string | null>(null);

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
    setExisting([]);
    setAutoEdit(null);
    setOptOutId(null);
  }, [open, preselect, edit]);

  // O que o paciente já declarou (só p/ declaração NOVA — a edição já sabe qual registro é).
  useEffect(() => {
    if (!open || edit || !pid) return;
    let alive = true;
    void loadExisting(pid).then((list) => { if (alive) setExisting(list); });
    return () => { alive = false; };
  }, [open, edit, pid]);

  // Substância escolhida → chips de unidade seguem o unitHint do catálogo (formato,
  // nunca quantidade — contrato anti-dose do blueprint). Dose já declarada (edição ou
  // registro existente) manda: o hint só preenche o que está vazio.
  useEffect(() => {
    if (!sel) return;
    const hint = parseUnitHint(sel.unitHint);
    setUnit((u) => u || hint.unit);
    setFreq((f) => f || hint.freq);
  }, [sel]);

  const defaultOptions = useMemo(() => SUBSTANCE_CATALOG.filter((c) => c.popular).slice(0, 12), []);

  // Nome digitado que bate EXATO com nome/alias do catálogo ("deca", "tren") é registrado
  // pelo nome reconhecido — a leitura dos exames entende o comercial E o princípio ativo.
  const chosenItem = sel ?? (searchMode && text.trim() ? catalogFindByToken(text) : null);
  const label = chosenItem ? displayLabel(chosenItem) : null;
  const chosenName = label?.commercial ?? text.trim();
  const chosenCls = chosenItem?.cls ?? inferCls(text);
  const noMatch = searchMode && !chosenItem && text.trim().length >= 2 && searchSubstances(text, 1).length === 0;

  const dup = useMemo(
    () => (edit ? null : findDuplicate(existing, chosenName, chosenCls === 'Suplemento')),
    [edit, chosenName, chosenCls, existing],
  );
  const suppDup = dup?.kind === 'supp';
  const editTarget = edit ?? autoEdit;

  /** Registro existente vira o alvo: status/dose/médico vêm dele (nada se perde no PATCH). */
  const applyAutoEdit = (t: SheetEditTarget) => {
    setAutoEdit(t);
    setStatus(t.endStatus === 'interrompi' ? 'interrompi' : 'em_uso');
    const pd = parseDose(t.dosage);
    if (pd.value) { setDoseValue(pd.value); setUnit(pd.unit); setFreq(pd.freq); }
    if (t.prescriberName) setMedico(t.prescriberName);
  };

  // Escolheu da lista algo que JÁ está em uso → atualiza o registro (não duplica). Nome
  // mudou e não bate mais com aquele registro → volta a ser declaração nova.
  useEffect(() => {
    if (edit) return;
    const t = dup?.kind === 'med' ? dup.target : undefined;
    if (autoEdit) { if (t?.id !== autoEdit.id) setAutoEdit(null); return; }
    if (searchMode || !sel) return;
    if (isOngoing(t) && t.id !== optOutId) applyAutoEdit(t);
    // applyAutoEdit só usa setters estáveis
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dup, edit, searchMode, sel, autoEdit, optOutId]);

  const trocar = () => {
    setSearchMode(true);
    setSel(null);
    setAutoEdit(null);
    if (!edit) { setUnit(''); setFreq(''); }
  };

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
    // Digitou (sem escolher na lista) algo que já está em uso → primeiro mostra o registro
    // existente pré-preenchido; o próximo toque atualiza (nunca sobrescreve às cegas).
    const ongoing = dup?.kind === 'med' ? dup.target : undefined;
    if (!editTarget && isOngoing(ongoing) && ongoing.id !== optOutId) {
      applyAutoEdit(ongoing);
      if (chosenItem && !sel) { setSel(chosenItem); setSearchMode(false); }
      return;
    }
    setSaving(true);
    try {
      const cls = chosenCls;
      const doseStr = buildDose();
      const t = TIME_OPTIONS.find((o) => o.key === timeKey)!;

      // Suplemento NÃO vira Medication (P0.2): lista de nomes no SportsProfile.
      if (cls === 'Suplemento') {
        const cur = await readProfileList(pid ?? '', 'supplements');
        if (!cur.some((s) => sameSubstance(s, n))) {
          const ok = await putSportsProfile(pid ? { patientId: pid, supplements: [...cur, n] } : { supplements: [...cur, n] });
          if (!ok) { notify('Erro ao registrar suplemento.', { type: 'error' }); return; }
        }
        finish(n);
        return;
      }

      // A2/A9: UMA pergunta de tempo. "Já parei" responde QUANDO PAROU → endedAt
      // (início desconhecido = null → tratado como "desde o primeiro exame", spec A9).
      const endedAt = status === 'interrompi'
        ? (t.months != null ? approxIso(t.months) : (editTarget?.endedAt ?? null))
        : null;
      const startedAt = status === 'interrompi'
        ? (editTarget?.startedAt ?? null)
        : (t.months != null ? approxIso(t.months) : (editTarget?.startedAt ?? null));
      const dosage = doseStr ? `${doseStr} — declarado pelo paciente` : 'declarado pelo paciente';
      const name = `[${cls}] ${n}`;
      const prescriberName = medico.trim() || null;

      if (editTarget && !editTarget.profileOnly) {
        // PATCH cobre name/dosage/endStatus/endedAt/prescriber. Mudou o INÍCIO →
        // substitui (DELETE+POST): o PATCH do server não aceita startedAt.
        const startChanged = (startedAt ?? null) !== (editTarget.startedAt ?? null);
        if (startChanged) {
          const del = await fetch(`${API_URL}/medications/${editTarget.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
          if (!del.ok) { notify('Erro ao atualizar declaração.', { type: 'error' }); return; }
          const r = await fetch(`${API_URL}/medications`, {
            method: 'POST', headers: apiHeaders(true),
            body: JSON.stringify({ patientId: pid || undefined, name, dosage, startedAt, endStatus: status, endedAt, lastAdministeredAt: null, prescriberName }),
          });
          if (!r.ok) { notify('Erro ao atualizar declaração.', { type: 'error' }); return; }
        } else {
          const r = await fetch(`${API_URL}/medications/${editTarget.id}`, {
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
      if (!cur.some((s) => sameSubstance(s, n))) {
        await putSportsProfile(pid ? { patientId: pid, declaredSubstances: [...cur, n] } : { declaredSubstances: [...cur, n] });
      }
      finish(n);
    } finally { setSaving(false); }
  };

  // Aviso do cadastro inteligente (só com a substância escolhida — na busca, o painel não
  // pisca a cada letra).
  const note: { text: string; action?: { label: string; onClick: () => void } } | null = (() => {
    if (edit || !dup || (searchMode && !autoEdit)) return null;
    if (dup.kind === 'supp') return { text: `${dup.name} já está nos seus suplementos — não precisa declarar de novo.` };
    const t = dup.target;
    if (!t) return null;
    if (autoEdit?.id === t.id) {
      return {
        text: `Você já declarou ${dup.name}. Vamos atualizar essa declaração — sem duplicar.`,
        action: { label: 'Registrar como nova', onClick: () => { setOptOutId(t.id); setAutoEdit(null); } },
      };
    }
    if (!isOngoing(t)) return { text: `Você declarou ${dup.name} antes e marcou que parou. Esta vira uma declaração nova — a anterior fica no histórico.` };
    if (optOutId === t.id) {
      return {
        text: 'Vai como declaração nova, separada da que você já tem.',
        action: { label: 'Atualizar a existente', onClick: () => setOptOutId(null) },
      };
    }
    return null;
  })();

  const editing = !!editTarget;
  const ctaLabel = saving ? 'Salvando…'
    : !chosenName ? 'Escolha a substância'
      : suppDup ? 'Já está na sua lista'
        : `${editing ? 'Atualizar' : 'Declarar'} ${chosenName}`;
  const hormone = sel?.cls === 'Hormônio';
  const accent = hormone ? COPPER.main : BRAND_TEAL;
  const sheetBottom = dark ? '#101e1f' : '#f3faf9';

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-labelledby': titleId,
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
      <Stack sx={{ px: { xs: 2, sm: 2.5 }, pt: 1.25, pb: 1.5 }}>
        {/* drag handle (visual) */}
        <Box sx={{ width: 42, height: 5, borderRadius: 3, bgcolor: alpha(theme.palette.text.primary, 0.18), mx: 'auto', mb: 1.25 }} />

        {/* ── CABEÇALHO ── */}
        <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0, pt: 0.5 }}>
            <Typography id={titleId} component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 19, lineHeight: 1.25 }}>
              {editing ? 'Atualizar declaração' : 'Declarar substância'}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5, lineHeight: 1.45 }}>
              {editing ? 'Ajuste o que mudou — o registro continua um só.' : 'Seus exames passam a ser lidos considerando o que você usa.'}
            </Typography>
          </Box>
          <IconButton aria-label="Fechar" onClick={onClose} sx={{ width: 44, height: 44, mr: -1, color: 'text.secondary' }}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {/* ── SUBSTÂNCIA: busca com "o que é" OU card da escolha ── */}
        {searchMode ? (
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
            groupBy={text.trim() ? undefined : () => 'Sugestões'}
            renderGroup={(params) => (
              <Box component="li" key={params.key} sx={{ listStyle: 'none' }}>
                <Typography sx={{ px: 1.75, pt: 1.25, pb: 0.5, fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'text.secondary' }}>
                  {params.group}
                </Typography>
                <Box component="ul" sx={{ p: 0, m: 0 }}>{params.children}</Box>
              </Box>
            )}
            onInputChange={(_, v, reason) => { if (reason !== 'reset') setText(v ?? ''); }}
            onChange={(_, v) => {
              if (v && typeof v === 'object') { setSel(v); setSearchMode(false); }
              else if (typeof v === 'string') { setSel(null); setText(v); }
              else { setSel(null); }
            }}
            slotProps={{
              paper: { sx: { borderRadius: '16px', mt: 0.75, boxShadow: dark ? '0 16px 40px rgba(0,0,0,.55)' : '0 16px 40px rgba(15,23,42,.16)' } },
              listbox: { sx: { py: 0.5, maxHeight: 'min(46vh, 380px)' } },
            }}
            renderOption={(props, option) => {
              const { key, ...liProps } = props as typeof props & { key?: Key };
              const lab = displayLabel(option);
              const sub = [lab.chemical, option.sobre].filter(Boolean).join(' · ');
              const isHormone = option.cls === 'Hormônio';
              return (
                <Box component="li" key={key} {...liProps} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 60, py: 0.75, px: 1.5 }}>
                  <Box sx={{ width: 42, height: 42, borderRadius: '12px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: alpha(isHormone ? COPPER.main : BRAND_TEAL, dark ? 0.16 : 0.12) }}>
                    <SubstanceArt kind={artFor(option)} size={32} tone={isHormone ? 'copper' : 'teal'} />
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography noWrap sx={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.3 }}>{lab.commercial}</Typography>
                    {sub && (
                      <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {sub}
                      </Typography>
                    )}
                  </Box>
                  {(option.anvisa || option.origem) && (
                    <Stack spacing={0.5} alignItems="flex-end" sx={{ flexShrink: 0 }}>
                      {option.anvisa && <Tag tone="copper">Lista {option.anvisa}</Tag>}
                      {option.origem === 'veterinario' && <Tag tone="neutral">Veterinário</Tag>}
                    </Stack>
                  )}
                </Box>
              );
            }}
            renderInput={(p) => (
              <TextField
                {...p}
                label="Substância"
                placeholder="Ex.: Deca, Durateston, trembo, creatina…"
                fullWidth
                inputProps={{ ...p.inputProps, maxLength: 60 }}
                InputProps={{
                  ...p.InputProps,
                  startAdornment: (
                    <>
                      <SearchIcon sx={{ fontSize: 20, color: 'text.secondary', ml: 0.5 }} />
                      {p.InputProps.startAdornment}
                    </>
                  ),
                }}
                helperText={
                  chosenItem
                    ? `Reconhecido: ${label?.commercial}${label?.chemical ? ` — ${label.chemical}` : ''}.`
                    : noMatch
                      ? 'Não está na lista? Sem problema — registramos do jeito que você escreveu.'
                      : 'Nome comercial, princípio ativo ou apelido — ou escreva livre.'
                }
                FormHelperTextProps={{ sx: { fontSize: 12, mx: 0.5, color: chosenItem ? teal : 'text.secondary', fontWeight: chosenItem ? 700 : 400 } }}
              />
            )}
          />
        ) : (
          sel && (
            <Box
              sx={{
                p: 1.5,
                borderRadius: '18px',
                border: '1px solid',
                borderColor: alpha(accent, dark ? 0.4 : 0.38),
                background: `linear-gradient(160deg, ${alpha(accent, dark ? 0.16 : 0.12)} 0%, ${alpha(accent, dark ? 0.04 : 0.03)} 100%)`,
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box
                  sx={{
                    width: 60, height: 60, borderRadius: '16px', display: 'grid', placeItems: 'center', flexShrink: 0,
                    bgcolor: dark ? alpha('#000', 0.22) : alpha('#fff', 0.85),
                    boxShadow: `inset 0 0 0 1px ${alpha(accent, 0.25)}`,
                  }}
                >
                  <SubstanceArt kind={artFor(sel)} size={46} tone={hormone ? 'copper' : 'teal'} />
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 17, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
                    {label?.commercial}
                  </Typography>
                  {label?.chemical && (
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary', mt: 0.25, overflowWrap: 'anywhere' }}>{label.chemical}</Typography>
                  )}
                </Box>
                <Button
                  size="small"
                  onClick={trocar}
                  sx={{ minHeight: 44, minWidth: 0, px: 1.5, mr: -0.75, borderRadius: '999px', textTransform: 'none', fontWeight: 800, color: teal, flexShrink: 0 }}
                >
                  Trocar
                </Button>
              </Stack>
              {sel.sobre && <Typography sx={{ fontSize: 13.5, lineHeight: 1.45, mt: 1.25 }}>{sel.sobre}</Typography>}
              {(sel.anvisa || sel.origem) && (
                <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75} sx={{ mt: 1 }}>
                  {sel.anvisa && <Tag tone="copper">Lista {sel.anvisa} · venda controlada</Tag>}
                  {sel.origem === 'veterinario' && <Tag tone="neutral">Uso veterinário</Tag>}
                </Stack>
              )}
              {sel.impacto && (
                <Box
                  sx={{
                    mt: 1.5, p: 1.25, borderRadius: '14px',
                    bgcolor: dark ? alpha('#000', 0.2) : alpha('#fff', 0.8),
                    border: '1px solid', borderColor: alpha(theme.palette.text.primary, dark ? 0.1 : 0.07),
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <ScienceOutlinedIcon sx={{ fontSize: 18, color: teal, mt: '2px' }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 800, color: teal, letterSpacing: '.02em' }}>Na leitura dos seus exames</Typography>
                      <Typography sx={{ fontSize: 13, lineHeight: 1.5, mt: 0.25 }}>{sel.impacto}</Typography>
                    </Box>
                  </Stack>
                </Box>
              )}
            </Box>
          )
        )}

        {/* ── CADASTRO INTELIGENTE: já declarado ── */}
        {note && (
          <Stack
            direction="row"
            spacing={1}
            alignItems="flex-start"
            role="status"
            sx={{ mt: 1.25, p: 1.25, borderRadius: '14px', bgcolor: alpha(BRAND_TEAL, dark ? 0.12 : 0.08), border: '1px solid', borderColor: alpha(BRAND_TEAL, 0.3) }}
          >
            <InfoOutlinedIcon sx={{ fontSize: 18, color: teal, mt: '2px' }} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontSize: 13, lineHeight: 1.45 }}>{note.text}</Typography>
              {note.action && (
                <Button
                  onClick={note.action.onClick}
                  sx={{ mt: 0.25, ml: -1, minHeight: 44, px: 1, textTransform: 'none', fontWeight: 800, color: teal }}
                >
                  {note.action.label}
                </Button>
              )}
            </Box>
          </Stack>
        )}

        {/* ── STATUS (1 toque, default "Em uso" — A7 morreu: classe não é pergunta) ── */}
        <Box sx={{ mt: 2.5 }}>
          <QuestionLabel>Ainda usando?</QuestionLabel>
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
        <Box sx={{ mt: 2, borderTop: '1px solid', borderColor: alpha(theme.palette.text.primary, dark ? 0.12 : 0.08), pt: 0.5 }}>
          <Box
            component="button"
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            sx={{
              display: 'flex', width: '100%', minHeight: 48, alignItems: 'center', justifyContent: 'space-between',
              border: 'none', bgcolor: 'transparent', cursor: 'pointer', px: 0, fontFamily: 'inherit',
              color: 'text.primary', fontWeight: 700, fontSize: 14, touchAction: 'manipulation',
              '&:focus-visible': { outline: `2px solid ${BRAND_TEAL}`, outlineOffset: 2, borderRadius: '8px' },
            }}
          >
            <span>
              Detalhes <Box component="span" sx={{ fontWeight: 500, color: 'text.secondary' }}>· dose e médico (opcional)</Box>
            </span>
            <ExpandMoreIcon sx={{ transform: detailsOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s', fontSize: 20, color: 'text.secondary' }} />
          </Box>
          <Collapse in={detailsOpen} timeout="auto" unmountOnExit>
            <Stack spacing={1.5} sx={{ pt: 0.75, pb: 1 }}>
              <TextField
                label="Dose (opcional)"
                value={doseValue}
                onChange={(e) => setDoseValue(e.target.value)}
                fullWidth
                inputMode="decimal"
                inputProps={{ maxLength: 12 }}
                placeholder={sel?.unitHint ? `Ex.: ${sel.unitHint}` : 'Ex.: 300'}
                helperText="Autorrelato — o app nunca sugere nem valida dose."
              />
              <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75}>
                {UNITS.map((u) => (
                  <SheetChip key={u} variant="tonal" selected={unit === u} onClick={() => setUnit((cur) => (cur === u ? '' : u))} sx={{ px: 1.75, fontSize: 13 }}>{u}</SheetChip>
                ))}
                {FREQS.map((f) => (
                  <SheetChip key={f} variant="tonal" selected={freq === f} onClick={() => setFreq((cur) => (cur === f ? '' : f))} sx={{ px: 1.75, fontSize: 13 }}>{f}</SheetChip>
                ))}
              </Stack>
              <TextField
                label="Médico que acompanha (opcional)"
                value={medico}
                onChange={(e) => setMedico(e.target.value)}
                fullWidth
                inputProps={{ maxLength: 80 }}
                helperText="Preenchido → seu perfil vira “TRT prescrito”. Deixe vazio se não houver."
              />
            </Stack>
          </Collapse>
        </Box>
      </Stack>

      {/* ── CTA fixo no rodapé (sempre à vista, inclusive com os detalhes abertos) ── */}
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          zIndex: 1,
          px: { xs: 2, sm: 2.5 },
          pt: 1.25,
          pb: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          bgcolor: sheetBottom,
          borderTop: '1px solid',
          borderColor: alpha(theme.palette.text.primary, dark ? 0.1 : 0.06),
        }}
      >
        <Button
          variant="contained"
          fullWidth
          disabled={saving || !chosenName || suppDup}
          onClick={() => void save()}
          sx={{
            minHeight: 52,
            borderRadius: '15px',
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 800,
            fontSize: 15,
            textTransform: 'none',
            color: '#fff',
            background: TEAL_SOLID,
            boxShadow: '0 10px 24px rgba(11,95,89,.32)',
            '&:hover': { background: 'linear-gradient(135deg,#0b6b64,#094f4a)', boxShadow: '0 12px 28px rgba(11,95,89,.38)' },
            '&.Mui-disabled': { background: alpha(BRAND_TEAL, dark ? 0.14 : 0.12), color: teal, opacity: 0.8, boxShadow: 'none' },
          }}
        >
          <Box component="span" sx={{ display: 'block', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ctaLabel}
          </Box>
        </Button>

        {/* ── Rodapé de privacidade (LGPD) ── */}
        <Typography sx={{ mt: 1, fontSize: 12, fontWeight: 500, color: 'text.secondary', textAlign: 'center', lineHeight: 1.5 }}>
          <LockOutlinedIcon sx={{ fontSize: 14, verticalAlign: '-2px', mr: 0.5 }} />
          Só você — e o médico que você autorizar — veem isso.
        </Typography>
      </Box>
    </Drawer>
  );
};
