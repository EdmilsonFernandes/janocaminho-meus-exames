import { useState, type ReactNode } from 'react';
import { Box, Card, Typography, Button, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';

/** Usuário (espelha o select do GET /admin/users). */
export interface U {
  id: string; email: string; name: string; role: string;
  credits: number; planExpiresAt: string | null; createdAt: string;
  blocked: boolean;
}

export const TabLoader = () => <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

/** Foto clicável com ZOOM: clique no avatar → lightbox escuro; clique NA FOTO → 2×
 *  ancorado no ponto clicado (cursor zoom-in/zoom-out); clicar fora fecha. */
export const PhotoZoom = ({ src, caption, children }: { src?: string | null; caption?: ReactNode; children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState<{ x: string; y: string } | null>(null);
  if (!src) return <>{children}</>;
  return (
    <>
      <Box component="span" role="button" aria-label="Ampliar foto"
        onClick={(e) => { e.stopPropagation(); setOpen(true); setZoom(null); }}
        sx={{ cursor: 'zoom-in', display: 'inline-flex', position: 'relative', lineHeight: 0 }}>
        {children}
      </Box>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="lg" fullScreen={false}
        slotProps={{ backdrop: { sx: { bgcolor: 'rgba(4,10,10,.86)', backdropFilter: 'blur(6px)' } } }}
        PaperProps={{ onClick: () => setOpen(false), sx: { bgcolor: 'transparent', backgroundImage: 'none', boxShadow: 'none', overflow: 'visible', m: 0 } }}>
        <Box onClick={(e) => e.stopPropagation()} sx={{ outline: 'none' }}>
          <Box component="img" src={src} alt={typeof caption === 'string' ? caption : 'foto'}
            onClick={(e) => {
              const r = (e.target as HTMLElement).getBoundingClientRect();
              setZoom(zoom ? null : { x: `${((e.clientX - r.left) / r.width) * 100}%`, y: `${((e.clientY - r.top) / r.height) * 100}%` });
            }}
            sx={{
              display: 'block', maxWidth: '100%', maxHeight: { xs: '72vh', sm: '80vh' }, borderRadius: '16px',
              cursor: zoom ? 'zoom-out' : 'zoom-in',
              transform: zoom ? 'scale(2.2)' : 'scale(1)',
              transformOrigin: zoom ? `${zoom.x} ${zoom.y}` : 'center',
              transition: 'transform .25s cubic-bezier(.16,1,.3,1)',
              animation: 'photoZoomIn .22s cubic-bezier(.16,1,.3,1)',
              '@keyframes photoZoomIn': { from: { opacity: 0, transform: 'scale(.92)' }, to: { opacity: 1, transform: 'scale(1)' } },
              userSelect: 'none',
            }} />
          {caption && (
            <Typography sx={{ textAlign: 'center', color: 'rgba(255,255,255,.85)', fontWeight: 700, fontFamily: 'Poppins, sans-serif', mt: 1.5, fontSize: 15, textShadow: '0 1px 8px rgba(0,0,0,.5)' }}>
              {caption}
            </Typography>
          )}
          <Typography variant="caption" component="div" sx={{ textAlign: 'center', color: 'rgba(255,255,255,.45)', mt: 0.5 }}>
            {zoom ? 'clique na foto para reduzir' : 'clique na foto para ampliar 2× · fora para fechar'}
          </Typography>
        </Box>
      </Dialog>
    </>
  );
};

export const SectionError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <Card variant="outlined" sx={{ borderRadius: '12px', p: 3, textAlign: 'center' }}>
    <Typography color="error" sx={{ mb: 2 }}>{message}</Typography>
    <Button variant="outlined" onClick={onRetry}>Tentar de novo</Button>
  </Card>
);

/** Dialog de confirmação premium (modelo ConfirmSpend) — substitui o window.confirm. */
export const ConfirmDialog = ({ open, onClose, onConfirm, title, desc, confirmLabel = 'Confirmar', tone = 'danger', loading = false }: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; desc?: ReactNode; confirmLabel?: string; tone?: 'danger' | 'primary'; loading?: boolean;
}) => (
  <Dialog open={open} onClose={onClose} PaperProps={{ sx: { borderRadius: '12px', maxWidth: 420, width: '100%' } }}>
    <DialogTitle sx={{ textAlign: 'center', pt: 3, pb: 1 }}>
      <Typography sx={{ fontWeight: 800, fontSize: 20, fontFamily: 'Poppins, sans-serif', color: 'text.primary' }}>{title}</Typography>
    </DialogTitle>
    <DialogContent sx={{ textAlign: 'center' }}>{desc && <Typography color="text.secondary" sx={{ fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{desc}</Typography>}</DialogContent>
    <DialogActions sx={{ px: 3, pb: 3, justifyContent: 'center', gap: 1 }}>
      <Button onClick={onClose} variant="outlined" disabled={loading} sx={{ borderRadius: '999px', px: 3, textTransform: 'none', fontWeight: 600, borderColor: 'divider', color: 'text.secondary' }}>Cancelar</Button>
      <Button onClick={onConfirm} variant="contained" disabled={loading} sx={{ borderRadius: '999px', px: 4, textTransform: 'none', fontWeight: 700, bgcolor: tone === 'danger' ? '#ef4444' : '#20b2aa', '&:hover': { bgcolor: tone === 'danger' ? '#dc2626' : '#178f89' } }}>{loading ? '…' : confirmLabel}</Button>
    </DialogActions>
  </Dialog>
);
