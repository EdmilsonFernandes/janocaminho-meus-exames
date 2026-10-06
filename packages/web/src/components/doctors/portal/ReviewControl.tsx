import { useState } from 'react';
import { Box, Chip, Popover, TextField, Button, Stack, Typography, MenuItem, MenuList } from '@mui/material';
import { Check as CheckIcon } from '@mui/icons-material';
import { API_URL } from '../../../config';
import type { Theme } from '@mui/material/styles';

/** E5.3 — estados de revisão de achado (DoctorReview.status). Cores do design system:
 *  teal = revisado; cobre = em acompanhamento (chama atenção, é o "lembrete" do médico);
 *  verde suave = resolvido. Sem cor sozinha: label sempre presente (não-só-cor). */
export const REVIEW_STATUS_META: Record<string, { label: string; color: (t: Theme) => string; bg: (t: Theme) => string }> = {
  REVISADO: {
    label: 'Revisado',
    color: (t) => (t.palette.mode === 'dark' ? '#5fc9c3' : '#178f89'),
    bg: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,.16)' : 'rgba(32,178,170,.10)'),
  },
  EM_ACOMPANHAMENTO: {
    label: 'Em acompanhamento',
    color: (t) => (t.palette.mode === 'dark' ? '#d4a574' : '#8a6240'),
    bg: () => 'rgba(212,165,116,.16)',
  },
  RESOLVIDO: {
    label: 'Resolvido',
    color: (t) => (t.palette.mode === 'dark' ? '#7dd3a8' : '#2f7d54'),
    bg: (t) => (t.palette.mode === 'dark' ? 'rgba(74,222,128,.14)' : 'rgba(74,222,128,.10)'),
  },
};

export const REVIEW_STATUSES = ['REVISADO', 'EM_ACOMPANHAMENTO', 'RESOLVIDO'] as const;

export interface ReviewLike {
  id: string;
  status: string;
  note?: string | null;
}

/**
 * ReviewControl (E5.3) — seletor de status + badge por achado (aba Alterados do portal).
 * Sem review: chip outline "Revisar". Com review: chip colorido do status. Clique abre
 * popover com os 3 estados + nota livre; salva via upsert (nunca apaga, nunca duplica).
 */
export const ReviewControl = ({ review, patientId, itemId, token, doctorId, onSaved }: {
  review: ReviewLike | null;
  patientId: string;
  itemId: string;
  token: string;
  doctorId: string;
  onSaved: (r: ReviewLike) => void;
}) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [status, setStatus] = useState<string>(review?.status ?? 'REVISADO');
  const [note, setNote] = useState(review?.note ?? '');
  const [saving, setSaving] = useState(false);

  const open = (e: React.MouseEvent<HTMLElement>) => {
    setStatus(review?.status ?? 'REVISADO');
    setNote(review?.note ?? '');
    setAnchor(e.currentTarget);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/doctor/${doctorId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ patientId, kind: 'item', examItemId: itemId, status, note: note.trim() || null }),
      });
      const d = await r.json();
      if (r.ok) { onSaved(d.review); setAnchor(null); }
    } finally { setSaving(false); }
  };

  return (
    <>
      <Chip
        size="small"
        onClick={open}
        label={review ? REVIEW_STATUS_META[review.status]?.label ?? review.status : 'Revisar'}
        title={review?.note || 'Marcar estado de revisão deste achado'}
        sx={{
          height: 24, fontSize: 12, fontWeight: 700, borderRadius: '999px', flexShrink: 0,
          ...(review
            ? {
                bgcolor: (t: Theme) => REVIEW_STATUS_META[review.status]?.bg(t) ?? 'action.hover',
                color: (t: Theme) => REVIEW_STATUS_META[review.status]?.color(t) ?? 'text.secondary',
                border: '1px solid', borderColor: (t: Theme) => REVIEW_STATUS_META[review.status]?.color(t) ?? 'divider',
              }
            : { variant: 'outlined', color: 'text.secondary' }),
        }}
      />
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { borderRadius: '14px', p: 1.5, width: 280, boxShadow: '0 10px 30px rgba(0,0,0,0.15)' } } }}>
        <Typography sx={{ fontWeight: 800, fontSize: 13, mb: 0.75 }}>Estado da revisão</Typography>
        <MenuList dense sx={{ '&& .MuiMenuItem-root': { borderRadius: '10px', fontSize: 13.5, fontWeight: 700 } }}>
          {REVIEW_STATUSES.map((s) => (
            <MenuItem key={s} selected={status === s} onClick={() => setStatus(s)}>
              <Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: (t: Theme) => REVIEW_STATUS_META[s].color(t), mr: 1, display: 'inline-block' }} />
              {REVIEW_STATUS_META[s].label}
              {status === s && <CheckIcon sx={{ ml: 'auto', fontSize: 16 }} />}
            </MenuItem>
          ))}
        </MenuList>
        <TextField
          value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Nota (opcional) — ex.: republicar em 3 meses"
          multiline minRows={2} size="small" fullWidth
          sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }}
        />
        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1 }}>
          <Button size="small" onClick={() => setAnchor(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancelar</Button>
          <Button size="small" variant="contained" disabled={saving} onClick={save} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '999px' }}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </Stack>
      </Popover>
    </>
  );
};
