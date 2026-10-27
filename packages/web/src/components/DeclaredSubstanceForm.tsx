import { useEffect, useState } from 'react';
import { Button, Chip, Collapse, Stack, TextField, Typography } from '@mui/material';
import MenuItem from '@mui/material/MenuItem';
import Autocomplete from '@mui/material/Autocomplete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useNotify } from 'react-admin';
import { API_URL, token, apiHeaders } from '../config';
import { SUBSTANCE_CATALOG, searchSubstances } from './sports/substanceCatalog';
import { DateFieldBR } from './DateFieldBR';

/**
 * E1.4 + P0.2 — SUBSTÂNCIA DECLARADA via Medication estruturado.
 * Hormônio/Outro → `Medication` com name prefixado ("[Hormônio] Testosterona (enantato)")
 * + fim-de-uso estruturado (endStatus/endedAt), última administração e médico acompanhante —
 * a declaração flui pro contexto da IA (medications-context) e pro cruzamento de interações
 * (match por palavra inteira aguenta o prefixo). Mirror do NOME em
 * `SportsProfile.declaredSubstances` (fonte de verdade = Medication; mirror p/ contexto
 * rápido da IA).
 *
 * P0.2 — Suplemento NÃO vira mais Medication: grava em `SportsProfile.supplements`
 * (PUT /sports/profile), separado de medicamentos. Registros legacy "[Suplemento] X"
 * continuam listados nos chips (filtro do prefixo mantido).
 *
 * Segurança de copy (blueprint AAS §6/§7): o app NUNCA sugere dose/ciclo/combinação —
 * a dose é opcional e guardada como DECLARAÇÃO ("declarado pelo paciente"). "Não sei" é
 * resposta válida e DEFAULT. Badge ANVISA (C5/C1) é informativo, sem julgamento e sem
 * número de resolução. LGPD: nada de substância em logs/analytics/eventos.
 */

export const SPORTS_SUBSTANCE_CLASSES = ['Hormônio', 'Suplemento', 'Outro'] as const;
export type SportsSubstanceClass = (typeof SPORTS_SUBSTANCE_CLASSES)[number];

/** Fim de uso (P0.2) — "não sei" é DEFAULT (registro parcial > registro ausente). */
export type SubstanceEndStatus = 'em_uso' | 'interrompi' | 'nao_sei';
const END_STATUS_OPTIONS: { value: SubstanceEndStatus; label: string }[] = [
  { value: 'em_uso', label: 'Em uso' },
  { value: 'interrompi', label: 'Interrompi' },
  { value: 'nao_sei', label: 'Não sei' },
];

export interface DeclaredSubstance {
  id: string;
  name: string;
  dosage?: string | null;
  startedAt?: string | null;
  active?: boolean;
  endStatus?: SubstanceEndStatus;
  endedAt?: string | null;
  lastAdministeredAt?: string | null;
  prescriberName?: string;
}

/** mm/aaaa (mês/ano de término) → ISO (dia 01). Incompleto/inválido → null (nunca bloqueia). */
const monthYearToIso = (v: string): string | null => {
  const m = /^(\d{2})\/(\d{4})$/.exec(v.trim());
  if (!m) return null;
  const mm = Number(m[1]);
  const yyyy = Number(m[2]);
  return mm >= 1 && mm <= 12 && yyyy >= 1900 && yyyy <= 2100 ? `${yyyy}-${String(mm).padStart(2, '0')}-01` : null;
};
const maskMonthYear = (v: string): string =>
  v.replace(/\D/g, '').slice(0, 6).replace(/(\d{2})(\d)/, '$1/$2');

/** Aparece no card esportivo: substâncias já declaradas (chips) + form colapsável. */
export const DeclaredSubstanceForm = ({ pid }: { pid: string }) => {
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [subClass, setSubClass] = useState<SportsSubstanceClass>('Hormônio');
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [unitHint, setUnitHint] = useState<string>(''); // formato de unidade da substância escolhida (nunca a quantidade)
  const [startedAt, setStartedAt] = useState('');
  // P0.2 — fim de uso estruturado, última administração e médico acompanhante (tudo opcional).
  const [endStatus, setEndStatus] = useState<SubstanceEndStatus>('nao_sei');
  const [endedMonth, setEndedMonth] = useState(''); // mm/aaaa
  const [lastAdministeredAt, setLastAdministeredAt] = useState('');
  const [prescriber, setPrescriber] = useState('');
  const [saving, setSaving] = useState(false);
  const [declared, setDeclared] = useState<DeclaredSubstance[]>([]);
  // P0.2 — suplementos agora vivem no SportsProfile (separados de medicamentos).
  const [supps, setSupps] = useState<string[]>([]);

  // Match exato no catálogo → badge educativo da lista ANVISA (derivado, sem estado extra).
  const catalogHit = SUBSTANCE_CATALOG.find((c) => c.name === name.trim()) ?? null;

  /** Lista de strings de um campo jsonb do SportsProfile (itens objeto com .name também
   *  valem — padrão do wizard). GET devolve o TITULAR: se não é o paciente do form
   *  (dependente), parte de vazio — nunca mistura perfis. */
  const readProfileList = async (key: 'supplements' | 'declaredSubstances'): Promise<string[]> => {
    try {
      const r = await fetch(`${API_URL}/sports/profile`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) return [];
      const d = await r.json();
      const p = d?.profile;
      if (!p || (p.patientId && p.patientId !== pid)) return [];
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
  const putProfile = async (body: Record<string, unknown>): Promise<boolean> => {
    try {
      const r = await fetch(`${API_URL}/sports/profile`, { method: 'PUT', headers: apiHeaders(true), body: JSON.stringify(body) });
      if (!r.ok) return false;
      try { window.dispatchEvent(new Event('sports-profile-changed')); } catch { /* SSR/test */ }
      return true;
    } catch { return false; }
  };

  const load = async () => {
    try {
      const r = await fetch(`${API_URL}/medications?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) return;
      const list = await r.json();
      // declaradas = criadas por ESTE form (prefixo "[Classe] ") — inclui legacy "[Suplemento]"
      if (Array.isArray(list)) setDeclared(list.filter((m: any) => m.patientId === pid && /^\[[^\]]+\]/.test(String(m.name ?? ''))));
    } catch { /* offline — lista fica como está */ }
    void readProfileList('supplements').then(setSupps);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [pid]);

  const resetFields = () => {
    setName(''); setDose(''); setStartedAt('');
    setEndStatus('nao_sei'); setEndedMonth(''); setLastAdministeredAt(''); setPrescriber('');
  };

  const save = async () => {
    const n = name.trim();
    if (!n) { notify('Informe o nome da substância.', { type: 'error' }); return; }
    setSaving(true);
    try {
      const d = dose.trim();
      // P0.2 — suplemento: lista de nomes no perfil esportivo (NÃO vira Medication).
      if (subClass === 'Suplemento') {
        const cur = await readProfileList('supplements');
        if (!cur.some((s) => s.toLowerCase() === n.toLowerCase())) {
          const ok = await putProfile({ patientId: pid, supplements: [...cur, n] });
          if (!ok) { notify('Erro ao registrar suplemento.', { type: 'error' }); return; }
          setSupps([...cur, n]);
        }
        resetFields();
        notify('Suplemento registrado no seu perfil esportivo.', { type: 'success' });
        void load();
        return;
      }
      const r = await fetch(`${API_URL}/medications`, {
        method: 'POST', headers: apiHeaders(true),
        body: JSON.stringify({
          patientId: pid,
          name: `[${subClass}] ${n}`,
          dosage: d ? `${d} — declarado pelo paciente` : 'declarado pelo paciente',
          startedAt: startedAt || null,
          endStatus,
          endedAt: endStatus === 'interrompi' ? (monthYearToIso(endedMonth) ?? null) : null,
          lastAdministeredAt: lastAdministeredAt || null,
          prescriberName: prescriber.trim(),
        }),
      });
      if (!r.ok) { notify('Erro ao declarar substância.', { type: 'error' }); return; }
      // Mirror best-effort: nome em declaredSubstances p/ contexto rápido da IA.
      const cur = await readProfileList('declaredSubstances');
      if (!cur.some((s) => s.toLowerCase() === n.toLowerCase())) {
        await putProfile({ patientId: pid, declaredSubstances: [...cur, n] });
      }
      resetFields();
      notify('Substância declarada — entra no contexto da análise.', { type: 'success' });
      void load();
    } finally { setSaving(false); }
  };

  const remove = (id: string) => {
    void (async () => {
      const r = await fetch(`${API_URL}/medications/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) { setDeclared((ds) => ds.filter((x) => x.id !== id)); notify('Declaração removida.', { type: 'info' }); }
      else notify('Erro ao remover.', { type: 'error' });
    })();
  };

  /** Suplemento do perfil sai da lista (PUT sem o item — exclusão 1-tap, LGPD-friendly). */
  const removeSupp = (s: string) => {
    void (async () => {
      const cur = await readProfileList('supplements');
      const next = cur.filter((x) => x !== s);
      const ok = await putProfile({ patientId: pid, supplements: next });
      if (ok) { setSupps(next); notify('Suplemento removido do perfil.', { type: 'info' }); }
      else notify('Erro ao remover.', { type: 'error' });
    })();
  };

  return (
    <>
      {declared.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
          {declared.map((s) => (
            <Chip key={s.id} size="small" label={s.name} onDelete={() => remove(s.id)}
              sx={{ maxWidth: '100%', '& .MuiChip-label': { whiteSpace: 'normal' } }} />
          ))}
        </Stack>
      )}
      {supps.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
          {supps.map((s) => (
            <Chip key={s} size="small" variant="outlined" label={s} onDelete={() => void removeSupp(s)}
              sx={{ maxWidth: '100%', '& .MuiChip-label': { whiteSpace: 'normal' } }} />
          ))}
        </Stack>
      )}

      <Button
        size="small" variant="text" endIcon={<ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
        onClick={() => setOpen((v) => !v)}
        sx={{ mt: 1, textTransform: 'none', fontWeight: 700, color: (t) => (t.palette.mode === 'dark' ? '#5fc9c3' : '#0f766e'), px: 0 }}
      >
        Declarar substância
      </Button>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          <TextField
            select label="Classe" value={subClass} onChange={(e) => setSubClass(e.target.value as SportsSubstanceClass)}
            fullWidth size="small" helperText="Hormônio, suplemento ou outro — entra como contexto, nunca como recomendação."
          >
            {SPORTS_SUBSTANCE_CLASSES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          {/* Catálogo de mercado (farmacologia legítima): autocomplete freeSolo —
              sugerir o NOME e a UNIDADE da dose, nunca a quantidade. */}
          <Autocomplete
            freeSolo options={searchSubstances(name).map((c) => c.name)}
            value={name} onInputChange={(_, v) => setName(v ?? '')}
            includeInputInList disableClearable
            renderInput={(p) => (
              <TextField {...p} label="Substância" fullWidth size="small"
                inputProps={{ ...p.inputProps, maxLength: 60 }}
                helperText="Digite p/ ver os nomes de mercado — ou escreva livre. Ex.: durateston, tirzepatida, creatina." />
            )}
            onChange={(_, v) => {
              // Escolheu do catálogo → auto-preenche classe + formato de dose (unidade)
              const hit = SUBSTANCE_CATALOG.find((c) => c.name === v);
              if (hit) {
                setSubClass(hit.cls as SportsSubstanceClass);
                setUnitHint(hit.unitHint);
              }
            }}
          />
          {/* P0.2 — badge educativo da lista ANVISA: informativo, discreto, sem julgamento. */}
          {catalogHit?.anvisa && (
            <Chip
              size="small" variant="outlined" label={`Lista ${catalogHit.anvisa} — ANVISA`}
              sx={{
                alignSelf: 'flex-start', height: 20, fontSize: 10.5, fontWeight: 700,
                color: 'text.secondary', borderColor: 'divider', bgcolor: 'transparent',
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
          )}
          {subClass === 'Suplemento' ? (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Suplementos ficam no seu perfil esportivo, separados de medicamentos — registramos apenas o nome.
            </Typography>
          ) : (<>
            <TextField
              label="Dose / período (opcional)" value={dose} onChange={(e) => setDose(e.target.value)} fullWidth size="small"
              inputProps={{ maxLength: 80 }} placeholder={unitHint ? `Ex.: ${unitHint}` : undefined}
              helperText={`Ex.: ${unitHint ?? '250 mg a cada 15 dias'}. Guardamos como DECLARAÇÃO sua — o app nunca sugere dose.`}
            />
            <DateFieldBR
              label="Início (opcional)" value={startedAt} onChange={setStartedAt} fullWidth size="small"
              helperText="Quando você começou a usar (contexto p/ a análise)."
            />
            {/* P0.2 — fim de uso estruturado: "não sei" é default e resposta válida. */}
            <TextField
              select label="Fim de uso" value={endStatus} onChange={(e) => setEndStatus(e.target.value as SubstanceEndStatus)}
              fullWidth size="small"
              helperText={'"Não sei" é uma resposta válida — registro parcial já ajuda a análise.'}
            >
              {END_STATUS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
            {endStatus === 'interrompi' && (
              <TextField
                label="Término (mês/ano)" value={endedMonth} onChange={(e) => setEndedMonth(maskMonthYear(e.target.value))}
                fullWidth size="small" placeholder="mm/aaaa" inputMode="numeric" inputProps={{ maxLength: 7 }}
                error={endedMonth.length > 0 && !monthYearToIso(endedMonth)}
                helperText={endedMonth.length > 0 && !monthYearToIso(endedMonth) ? 'Use o formato mm/aaaa (ex.: 03/2026).' : 'Quando você parou — opcional.'}
              />
            )}
            <DateFieldBR
              label="Última administração (opcional)" value={lastAdministeredAt} onChange={setLastAdministeredAt}
              fullWidth size="small" helperText="Ajuda a IA a contextualizar a coleta. Opcional."
            />
            <TextField
              label="Médico acompanhante (opcional)" value={prescriber} onChange={(e) => setPrescriber(e.target.value)}
              fullWidth size="small" inputProps={{ maxLength: 80 }} helperText="Deixe em branco se não houver."
            />
          </>)}
          <Button
            variant="contained" size="small" disabled={saving || !name.trim()} onClick={() => void save()}
            sx={{ alignSelf: 'flex-start', borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa', boxShadow: 'none', '&:hover': { bgcolor: 'primary.dark' } }}
          >
            {saving ? 'Salvando…' : 'Declarar'}
          </Button>
          <Typography variant="caption" color="text.secondary">
            Declarações ajudam a contextualizar seus exames — não substituem acompanhamento médico.
          </Typography>
        </Stack>
      </Collapse>
    </>
  );
};
