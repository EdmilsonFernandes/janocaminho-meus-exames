import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Stack } from '@mui/material';
import { CreditBadge } from './CreditBadge';

/**
 * Dialog premium de confirmação de gasto de créditos.
 * Substitui o window.confirm amador por um componente React moderno.
 * Uso: <ConfirmSpend open={...} onClose={...} onConfirm={...} credits={10} title="..." desc="..." />
 */
export const ConfirmSpend = ({ open, onClose, onConfirm, credits, title, desc }: {
  open: boolean; onClose: () => void; onConfirm: () => void; credits: number; title: string; desc?: string;
}) => (
  <Dialog open={open} onClose={onClose} PaperProps={{ sx: { borderRadius: 4, maxWidth: 400, width: '100%' } }}>
    <DialogTitle sx={{ textAlign: 'center', pt: 3, pb: 1 }}>
      <Typography sx={{ fontWeight: 800, fontSize: 20, fontFamily: 'Poppins, sans-serif', color: 'text.primary' }}>{title}</Typography>
    </DialogTitle>
    <DialogContent sx={{ textAlign: 'center', pb: 1 }}>
      {desc && <Typography color="text.secondary" sx={{ mb: 2, fontSize: 15, lineHeight: 1.5 }}>{desc}</Typography>}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
        <CreditBadge amount={credits} size="medium" />
      </Box>
      <Typography variant="caption" color="text.secondary">serão debitados dos seus créditos</Typography>
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 3, justifyContent: 'center', gap: 1 }}>
      <Button onClick={onClose} variant="outlined" sx={{ borderRadius: 99, px: 3, textTransform: 'none', fontWeight: 600, borderColor: 'divider', color: 'text.secondary' }}>Cancelar</Button>
      <Button onClick={onConfirm} variant="contained" sx={{ borderRadius: 99, px: 4, textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa', '&:hover': { bgcolor: '#178f89' } }}>Confirmar</Button>
    </DialogActions>
  </Dialog>
);
