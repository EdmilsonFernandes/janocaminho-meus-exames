// DeclaredSubstanceForm (redesign hormonal v2 — spec 2026-10-27 §"Remover do form atual")
// — o form manual de 1º nível MORREU (Select Classe, DateFieldBR início, mm/aaaa de fim,
// última administração, médico em 1º nível, options sem alias). O que sobra: LISTA COMPACTA
// (chips com exclusão 1-tap, LGPD) + "Adicionar" abrindo o MESMO DeclareSubstanceSheet do
// dashboard — UMA única entrada de declaração no app. API de props preservada (Perfil usa).
import { useCallback, useEffect, useState } from 'react';
import { Button, Chip, Stack } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useNotify } from 'react-admin';
import { API_URL, token } from '../config';
import { DeclareSubstanceSheet, readProfileList, putSportsProfile } from './sports/DeclareSubstanceSheet';

export const SPORTS_SUBSTANCE_CLASSES = ['Hormônio', 'Suplemento', 'Outro'] as const;
export type SportsSubstanceClass = (typeof SPORTS_SUBSTANCE_CLASSES)[number];

/** Fim de uso (P0.2) — "não sei" é DEFAULT (registro parcial > registro ausente). */
export type SubstanceEndStatus = 'em_uso' | 'interrompi' | 'nao_sei';

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

/** Aparece no card esportivo do Perfil: chips do que já foi declarado + CTA que abre o sheet. */
export const DeclaredSubstanceForm = ({ pid }: { pid: string }) => {
  const notify = useNotify();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [declared, setDeclared] = useState<DeclaredSubstance[]>([]);
  // Suplementos vivem no SportsProfile (P0.2) — separados de medicamentos.
  const [supps, setSupps] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/medications?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) return;
      const list = await r.json();
      // declaradas = criadas pelo fluxo de declaração (prefixo "[Classe] ") — inclui legacy "[Suplemento]"
      if (Array.isArray(list)) setDeclared(list.filter((m: any) => m.patientId === pid && /^\[[^\]]+\]/.test(String(m.name ?? ''))));
    } catch { /* offline — lista fica como está */ }
    void readProfileList(pid, 'supplements').then(setSupps);
  }, [pid]);

  useEffect(() => { void load(); }, [load]);
  // O sheet espelha no SportsProfile e dispara 'sports-profile-changed' → recarrega aqui.
  useEffect(() => {
    const h = () => void load();
    window.addEventListener('sports-profile-changed', h);
    return () => window.removeEventListener('sports-profile-changed', h);
  }, [load]);

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
      const cur = await readProfileList(pid, 'supplements');
      const next = cur.filter((x) => x !== s);
      const ok = await putSportsProfile({ patientId: pid, supplements: next });
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
              sx={{ maxWidth: '100%', minHeight: 32, '& .MuiChip-label': { whiteSpace: 'normal' } }} />
          ))}
        </Stack>
      )}
      {supps.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
          {supps.map((s) => (
            <Chip key={s} size="small" variant="outlined" label={s} onDelete={() => void removeSupp(s)}
              sx={{ maxWidth: '100%', minHeight: 32, '& .MuiChip-label': { whiteSpace: 'normal' } }} />
          ))}
        </Stack>
      )}

      <Button
        size="small"
        variant="text"
        startIcon={<AddIcon sx={{ fontSize: 18 }} />}
        onClick={() => setSheetOpen(true)}
        sx={{ mt: 1, textTransform: 'none', fontWeight: 700, color: (t) => (t.palette.mode === 'dark' ? '#5fc9c3' : '#0f766e'), px: 0 }}
      >
        Declarar substância
      </Button>

      <DeclareSubstanceSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        pid={pid}
        onSaved={() => void load()}
      />
    </>
  );
};
