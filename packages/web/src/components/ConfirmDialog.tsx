import * as React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, IconButton, Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

export type ConfirmTone = 'danger' | 'warning' | 'primary';
export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = vermelho (excluir); warning = laranja; primary = verde/teal. */
  tone?: ConfirmTone;
}
export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

const ICON_BY_TONE: Record<ConfirmTone, React.ComponentType<{ fontSize?: 'small' | 'inherit' | 'large' | 'medium' }>> = {
  danger: DeleteOutlineIcon, warning: WarningAmberIcon, primary: WarningAmberIcon,
};
const COLOR_BY_TONE: Record<ConfirmTone, 'error' | 'warning' | 'primary'> = { danger: 'error', warning: 'warning', primary: 'primary' };

/**
 * Dialog de confirmação PREMIUM — substitui o window.confirm nativo (feio, parece gambiarra).
 * Padrão "app top premium": título com ícone circular colorido, mensagem, botões pill cheios
 * (Cancelar outlined / Confirmar contained).
 *
 * 2 formas de usar:
 *  - IMPERATIVA (recomendada, 1 linha no handler): `if (!(await confirmDialog({ title, message }))) return;`
 *    (requer <ConfirmDialogProvider> no root do App).
 *  - CONTROLADA (state): <ConfirmDialog open onClose onConfirm ... />
 */
export const ConfirmDialog = ({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'danger', loading }: ConfirmDialogProps) => {
  const color = COLOR_BY_TONE[tone];
  const Icon = ICON_BY_TONE[tone];
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

// ───────────────── API IMPERATIVA (Promise<boolean>) ─────────────────
// Provider registra a fn global; handlers chamam confirmDialog() e awaitam.
let _open: ((o: ConfirmOptions) => Promise<boolean>) | null = null;

/** Confirmação premium imperativa. Troca 1:1 o window.confirm:
 *    if (!(await confirmDialog({ title: 'Excluir', message: '...' }))) return;
 *  Requer <ConfirmDialogProvider> no root (App). Sem provider, cai no window.confirm (dev/SSR). */
export const confirmDialog = (opts: ConfirmOptions): Promise<boolean> =>
  _open ? _open(opts) : Promise.resolve(window.confirm(typeof opts.message === 'string' ? opts.message : opts.title));

/** Renderiza o Dialog premium e registra a fn global. Envolver o App 1x (logo abaixo do tema/router). */
export const ConfirmDialogProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = React.useState<{ opts: ConfirmOptions; resolve: (b: boolean) => void } | null>(null);
  React.useEffect(() => {
    _open = (opts) => new Promise<boolean>((resolve) => setState({ opts, resolve }));
    return () => { _open = null; };
  }, []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  const opts = state?.opts ?? { title: '' };
  return (
    <React.Fragment>
      {children}
      <ConfirmDialog
        open={!!state}
        onClose={() => close(false)}
        onConfirm={() => close(true)}
        title={opts.title}
        message={opts.message}
        confirmLabel={opts.confirmLabel}
        cancelLabel={opts.cancelLabel}
        tone={opts.tone}
      />
    </React.Fragment>
  );
};
