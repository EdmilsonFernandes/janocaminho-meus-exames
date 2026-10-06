import { useEffect, useState } from 'react';
import { Button, Chip, Collapse, Stack, TextField, Typography } from '@mui/material';
import MenuItem from '@mui/material/MenuItem';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useNotify } from 'react-admin';
import { API_URL, token, apiHeaders } from '../config';
import { DateFieldBR } from './DateFieldBR';

/**
 * E1.4 — SUBSTÂNCIA DECLARADA via Medication (zero migration no server).
 * O form do modo esportivo cria um `Medication` com name prefixado pela classe
 * ("[Hormônio] Testosterona (enantato)" / "[Suplemento] Creatina") — assim a
 * declaração já flui pro contexto da IA (medications-context) e pro cruzamento
 * de interações (match por palavra inteira aguenta o prefixo).
 *
 * Segurança de copy (relatório §D4): o app NUNCA sugere dose/ciclo — o campo de
 * dose é opcional e guardado como DECLARAÇÃO do paciente ("declarado pelo paciente").
 */

export const SPORTS_SUBSTANCE_CLASSES = ['Hormônio', 'Suplemento', 'Outro'] as const;
export type SportsSubstanceClass = (typeof SPORTS_SUBSTANCE_CLASSES)[number];

export interface DeclaredSubstance {
  id: string;
  name: string;
  dosage?: string | null;
  startedAt?: string | null;
  active?: boolean;
}

/** Aparece no card esportivo: substâncias já declaradas (chips) + form colapsável. */
export const DeclaredSubstanceForm = ({ pid }: { pid: string }) => {
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [subClass, setSubClass] = useState<SportsSubstanceClass>('Hormônio');
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [declared, setDeclared] = useState<DeclaredSubstance[]>([]);

  const load = async () => {
    try {
      const r = await fetch(`${API_URL}/medications?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) return;
      const list = await r.json();
      // declaradas = criadas por ESTE form (prefixo "[Classe] ")
      if (Array.isArray(list)) setDeclared(list.filter((m: any) => m.patientId === pid && /^\[[^\]]+\]/.test(String(m.name ?? ''))));
    } catch { /* offline — lista fica como está */ }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [pid]);

  const save = async () => {
    const n = name.trim();
    if (!n) { notify('Informe o nome da substância.', { type: 'error' }); return; }
    setSaving(true);
    const d = dose.trim();
    const r = await fetch(`${API_URL}/medications`, {
      method: 'POST', headers: apiHeaders(true),
      body: JSON.stringify({
        patientId: pid,
        name: `[${subClass}] ${n}`,
        dosage: d ? `${d} — declarado pelo paciente` : 'declarado pelo paciente',
        startedAt: startedAt || null,
      }),
    });
    setSaving(false);
    if (!r.ok) { notify('Erro ao declarar substância.', { type: 'error' }); return; }
    setName(''); setDose(''); setStartedAt('');
    notify('Substância declarada — entra no contexto da análise.', { type: 'success' });
    void load();
  };

  const remove = (id: string) => {
    void (async () => {
      const r = await fetch(`${API_URL}/medications/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) { setDeclared((ds) => ds.filter((x) => x.id !== id)); notify('Declaração removida.', { type: 'info' }); }
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
          <TextField
            label="Substância" value={name} onChange={(e) => setName(e.target.value)} fullWidth size="small"
            inputProps={{ maxLength: 60 }} helperText="Ex.: Testosterona (enantato), Creatina — o que você usa hoje."
          />
          <TextField
            label="Dose / período (opcional)" value={dose} onChange={(e) => setDose(e.target.value)} fullWidth size="small"
            inputProps={{ maxLength: 80 }} helperText="Ex.: 250mg/semana. Guardamos como DECLARAÇÃO sua — o app nunca sugere dose."
          />
          <DateFieldBR
            label="Início (opcional)" value={startedAt} onChange={setStartedAt} fullWidth size="small"
            helperText="Quando você começou a usar (contexto p/ a análise)."
          />
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
