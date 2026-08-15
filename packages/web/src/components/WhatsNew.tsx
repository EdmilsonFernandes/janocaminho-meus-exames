import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, Typography, Box } from '@mui/material';
import { APP_VERSION } from '../utils/version';

// Novidades da linha atual (2.7). Mantenha honesto e curto — o popup aparece 1× por linha de versão.
const FEATURES = [
  { emoji: '📱', title: 'Meus Exames V2', desc: 'Lista redesenhada: último exame em destaque, filtros e datas relativas.' },
  { emoji: '🔐', title: 'Login com biometria', desc: 'Entre com a digital do aparelho — sem digitar senha.' },
  { emoji: '🩺', title: 'Portal do médico', desc: 'Seu médico vê seus exames, alterados e tendências num só lugar.' },
  { emoji: '🚑', title: 'Cartão de emergência', desc: 'Dados críticos e contato na hora que importam.' },
];

export const WhatsNew = () => {
  const [show, setShow] = useState(false);
  // Chave por MAJOR.MINOR (não por patch): versionCode sobe a cada release — popup 1× por linha,
  // não a cada rebuild (antes: whatsnew_1.4.4 congelado ou popup a cada patch).
  const key = `whatsnew_${APP_VERSION.split('.').slice(0, 2).join('.')}`;

  useEffect(() => {
    try {
      if (localStorage.getItem('onboarded') && !localStorage.getItem(key)) setShow(true);
    } catch { /* ignore */ }
  }, []);

  if (!show) return null;

  const close = () => { try { localStorage.setItem(key, '1'); } catch {} setShow(false); };

  return (
    <Dialog open={show} onClose={close} PaperProps={{ sx: { borderRadius: '12px', maxWidth: 420 } }}>
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
                <Typography sx={{ fontWeight: 800, fontSize: 15 }}>{f.title}</Typography>
                <Typography variant="caption" color="text.secondary">{f.desc}</Typography>
              </Box>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', pb: 2.5 }}>
        <Button variant="contained" onClick={close} sx={{ borderRadius: '999px', px: 4, textTransform: 'none', fontWeight: 800, bgcolor: '#20b2aa' }}>Legal! →</Button>
      </DialogActions>
    </Dialog>
  );
};
