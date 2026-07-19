import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, Typography, Box } from '@mui/material';
import { APP_VERSION } from '../utils/version';

const FEATURES = [
  { emoji: '🔑', title: 'Login com Google', desc: 'Entre com 1 toque — sem digitar senha.' },
  { emoji: '🤖', title: 'Chat premium', desc: 'Renovado, mais limpo e rápido.' },
  { emoji: '🌐', title: 'Bilingue', desc: 'Português + inglês automático.' },
  { emoji: '📊', title: 'Dashboard premium', desc: 'Anel de score + detalhes em acordeão.' },
  { emoji: '🔐', title: 'MFA recovery', desc: 'Recupere seu acesso com suporte.' },
];

export const WhatsNew = () => {
  const [show, setShow] = useState(false);
  const key = `whatsnew_${APP_VERSION}`;

  useEffect(() => {
    try {
      if (localStorage.getItem('onboarded') && !localStorage.getItem(key)) setShow(true);
    } catch { /* ignore */ }
  }, []);

  if (!show) return null;

  const close = () => { try { localStorage.setItem(key, '1'); } catch {} setShow(false); };

  return (
    <Dialog open={show} onClose={close} PaperProps={{ sx: { borderRadius: 4, maxWidth: 420 } }}>
      <DialogTitle sx={{ textAlign: 'center', fontWeight: 800, fontFamily: 'Poppins, sans-serif', pb: 0 }}>
        ✨ Novidades do Dr. Exame
      </DialogTitle>
      <DialogContent>
        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'text.secondary', mb: 2 }}>Versão {APP_VERSION}</Typography>
        <Stack spacing={1.5}>
          {FEATURES.map((f) => (
            <Box key={f.title} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Box sx={{ fontSize: 24, flexShrink: 0, lineHeight: 1.2 }}>{f.emoji}</Box>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 14.5 }}>{f.title}</Typography>
                <Typography variant="caption" color="text.secondary">{f.desc}</Typography>
              </Box>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', pb: 2.5 }}>
        <Button variant="contained" onClick={close} sx={{ borderRadius: 99, px: 4, textTransform: 'none', fontWeight: 800, bgcolor: '#20b2aa' }}>Legal! →</Button>
      </DialogActions>
    </Dialog>
  );
};
