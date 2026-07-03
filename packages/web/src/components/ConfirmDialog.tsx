import * as React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, IconButton, Box, TextField } from '@mui/material';
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
export interface PromptOptions {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

const ICON_BY_TONE: Record<ConfirmTone, React.ComponentType<{ fontSize?: 'small' | 'inherit' | 'large' | 'medium' }>> = {
  danger: DeleteOutlineIcon, warning: WarningAmberIcon, primary: WarningAmberIcon,
};
const COLOR_BY_TONE: Record<ConfirmTone, 'error' | 'warning' | 'primary'> = { danger: 'error', warning: 'warning', primary: 'primary' };

/**
 * Dialog PREMIUM — substitui window.confirm / window.prompt (feios, parecem gambiarra).
 * Padrão "app top premium": título com ícone circular colorido, mensagem, botões pill cheios.
 *
 * 2 formas de usar:
 *  - IMPERATIVA (recomendada, 1 linha no handler):
 *      if (!(await confirmDialog({ title, message }))) return;        // boolean
 *      const v = await promptDialog({ title, defaultValue });          // string | null
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

/** Dialog com input de texto — substitui window.prompt. */
const PromptDialogInner = ({ open, opts, onClose, onSubmit }: { open: boolean; opts?: PromptOptions; onClose: () => void; onSubmit: (v: string) => void }) => {
  const [val, setVal] = React.useState(opts?.defaultValue ?? '');
  React.useEffect(() => { if (open) setVal(opts?.defaultValue ?? ''); }, [open, opts?.defaultValue]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 800, pr: 6 }}>
        {opts?.title}
        <IconButton aria-label="Fechar" onClick={onClose} size="small" sx={{ position: 'absolute', right: 10, top: 10, color: 'text.secondary' }}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus fullWidth value={val} onChange={(e) => setVal(e.target.value)}
          placeholder={opts?.placeholder} label={opts?.label}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(val); }}
          sx={{ mt: 0.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
        <Button onClick={onClose} variant="outlined" fullWidth sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, py: 0.85 }}>{opts?.cancelLabel ?? 'Cancelar'}</Button>
        <Button onClick={() => onSubmit(val)} variant="contained" fullWidth sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 800, py: 0.85, boxShadow: 2 }}>{opts?.confirmLabel ?? 'OK'}</Button>
      </DialogActions>
    </Dialog>
  );
};

// ───────────────── APIs IMPERATIVAS (Promise) ─────────────────
let _open: ((o: ConfirmOptions) => Promise<boolean>) | null = null;
let _prompt: ((o: PromptOptions) => Promise<string | null>) | null = null;

/** Confirmação premium. `if (!(await confirmDialog({ title, message }))) return;` */
export const confirmDialog = (opts: ConfirmOptions): Promise<boolean> =>
  _open ? _open(opts) : Promise.resolve(window.confirm(typeof opts.message === 'string' ? opts.message : opts.title));

/** Prompt premium (input). `const v = await promptDialog({ title, defaultValue });` → string | null. */
export const promptDialog = (opts: PromptOptions): Promise<string | null> =>
  _prompt ? _prompt(opts) : Promise.resolve(window.prompt(opts.title, opts.defaultValue ?? ''));

/** Provider que renderiza os Dialogs premium e registra as fns globais. Envolver o App 1x. */
export const ConfirmDialogProvider = ({ children }: { children: React.ReactNode }) => {
  const [confirm, setConfirm] = React.useState<{ opts: ConfirmOptions; resolve: (b: boolean) => void } | null>(null);
  const [prompt, setPrompt] = React.useState<{ opts: PromptOptions; resolve: (v: string | null) => void } | null>(null);
  React.useEffect(() => {
    _open = (opts) => new Promise<boolean>((resolve) => setConfirm({ opts, resolve }));
    _prompt = (opts) => new Promise<string | null>((resolve) => setPrompt({ opts, resolve }));
    return () => { _open = null; _prompt = null; };
  }, []);
  const closeConfirm = (v: boolean) => { confirm?.resolve(v); setConfirm(null); };
  const closePrompt = (v: string | null) => { prompt?.resolve(v); setPrompt(null); };
  const c = confirm?.opts ?? { title: '' };
  return (
    <React.Fragment>
      {children}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => closeConfirm(false)}
        onConfirm={() => closeConfirm(true)}
        title={c.title}
        message={c.message}
        confirmLabel={c.confirmLabel}
        cancelLabel={c.cancelLabel}
        tone={c.tone}
      />
      <PromptDialogInner
        open={!!prompt}
        opts={prompt?.opts}
        onClose={() => closePrompt(null)}
        onSubmit={(v) => closePrompt(v)}
      />
    </React.Fragment>
  );
};
