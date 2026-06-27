import { useRef } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, IconButton, useMediaQuery, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PrintIcon from '@mui/icons-material/Print';
import { Capacitor } from '@capacitor/core';
import { printDocument } from '../utils/nativeDoc';

/**
 * Mostra um documento HTML DENTRO do app (iframe num Dialog) — sem window.open,
 * que é bloqueado no PWA mobile (tela escura / nada acontecia). Botão imprimir usa
 * o iframe.contentWindow.print() (mais confiável que popup).
 */
export const DocPreview = ({ html, open, onClose, title = 'Documento' }: { html: string; open: boolean; onClose: () => void; title?: string }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const print = () => {
    // No APK o WebView não imprime → compartilha o documento (abre no navegador/PDF).
    if (Capacitor.isNativePlatform()) { void printDocument(title, html); return; }
    try { iframeRef.current?.contentWindow?.focus(); iframeRef.current?.contentWindow?.print(); } catch { /* */ }
  };
  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 3, height: fullScreen ? '100%' : '90vh', width: '100%', maxWidth: 900 } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        {title}
        <IconButton onClick={onClose} size="small" aria-label="Fechar"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0, overflow: 'hidden' }}>
        <iframe ref={iframeRef} srcDoc={html} title={title} style={{ width: '100%', height: '100%', border: 0, background: '#fff' }} />
      </DialogContent>
      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button onClick={onClose}>Fechar</Button>
        <Button variant="contained" startIcon={<PrintIcon />} onClick={print}>Imprimir / PDF</Button>
      </DialogActions>
    </Dialog>
  );
};
