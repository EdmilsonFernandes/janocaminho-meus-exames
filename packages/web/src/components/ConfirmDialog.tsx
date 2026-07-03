import * as React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, IconButton, Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = vermelho (excluir); warning = laranja; primary = verde/teal. */
  tone?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
}

/**
 * Dialog de confirmação PREMIUM — substitui o window.confirm nativo (feio, parece gambiarra).
 * Padrão "app top premium": título com ícone circular colorido, mensagem, botões pill cheios
 * (Cancelar outlined / Confirmar contained). Dialog portaliza — pode ficar em qualquer ponto do JSX.
 */
export const ConfirmDialog = ({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'danger', loading }: ConfirmDialogProps) => {
  const color = tone === 'danger' ? 'error' : tone === 'warning' ? 'warning' : 'primary';
  const Icon = tone === 'danger' ? DeleteOutlineIcon : WarningAmberIcon;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.25, fontWeight: 800, pr: 6 }}>
        <Box sx={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: `${color}.main`, color: '#fff', flexShrink: 0 }}><Icon fontSize="small" /></Box>
        {title}
        <IconButton aria-label="Fechar" onClick={onClose} size="small" sx={{ position: 'absolute', right: 10, top: 10, color: 'text.secondary' }}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      {message && (
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>{message}</Typography>
        </DialogContent>
      )}
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
        <Button onClick={onClose} variant="outlined" fullWidth disabled={loading} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, py: 0.85 }}>{cancelLabel}</Button>
        <Button onClick={onConfirm} color={color} variant="contained" fullWidth disabled={loading} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 800, py: 0.85, boxShadow: 2 }}>{confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  );
};
