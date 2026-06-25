import type { ReactNode } from 'react';
import { Box, Card, Typography, Button, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';

/** Usuário (espelha o select do GET /admin/users). */
export interface U {
  id: string; email: string; name: string; role: string;
  credits: number; planExpiresAt: string | null; createdAt: string;
}

export const TabLoader = () => <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

export const SectionError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <Card variant="outlined" sx={{ borderRadius: 2, p: 3, textAlign: 'center' }}>
    <Typography color="error" sx={{ mb: 2 }}>{message}</Typography>
    <Button variant="outlined" onClick={onRetry}>Tentar de novo</Button>
  </Card>
);

/** Dialog de confirmação premium (modelo ConfirmSpend) — substitui o window.confirm. */
export const ConfirmDialog = ({ open, onClose, onConfirm, title, desc, confirmLabel = 'Confirmar', tone = 'danger', loading = false }: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; desc?: ReactNode; confirmLabel?: string; tone?: 'danger' | 'primary'; loading?: boolean;
}) => (
  <Dialog open={open} onClose={onClose} PaperProps={{ sx: { borderRadius: 4, maxWidth: 420, width: '100%' } }}>
    <DialogTitle sx={{ textAlign: 'center', pt: 3, pb: 1 }}>
      <Typography sx={{ fontWeight: 800, fontSize: 20, fontFamily: 'Poppins, sans-serif', color: '#0f172a' }}>{title}</Typography>
    </DialogTitle>
    <DialogContent sx={{ textAlign: 'center' }}>{desc && <Typography color="text.secondary" sx={{ fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{desc}</Typography>}</DialogContent>
    <DialogActions sx={{ px: 3, pb: 3, justifyContent: 'center', gap: 1 }}>
      <Button onClick={onClose} variant="outlined" disabled={loading} sx={{ borderRadius: 99, px: 3, textTransform: 'none', fontWeight: 600, borderColor: '#cbd5e1', color: '#475569' }}>Cancelar</Button>
      <Button onClick={onConfirm} variant="contained" disabled={loading} sx={{ borderRadius: 99, px: 4, textTransform: 'none', fontWeight: 700, bgcolor: tone === 'danger' ? '#ef4444' : '#20b2aa', '&:hover': { bgcolor: tone === 'danger' ? '#dc2626' : '#178f89' } }}>{loading ? '…' : confirmLabel}</Button>
    </DialogActions>
  </Dialog>
);
