import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, Typography, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { APP_BUILD_INFO } from '../generated/buildInfo';
import { APP_VERSION } from '../utils/version';
import { claimColdDialog } from '../utils/coldDialog';
import { tealText } from '../theme';
import { markWhatsNewSeen, notesForVersion, shouldShowWhatsNew } from '../utils/whatsNew';

/**
 * "✨ Novidades do Dr. Exame" (G5) — dialog version-gated por versionCode.
 * Conteúdo no mapa `RELEASE_NOTES` (utils/whatsNew.ts); gatilho = onboarded +
 * chave `whatsnew_vc_<code>` não vista + slot de cold-dialog (máx 1 modal de
 * 1º load por sessão). Mostra só os itens da versão ATUAL (sem acúmulo).
 */
export const WhatsNew = () => {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const code = Number(APP_BUILD_INFO.versionCode) || 0;
  const notes = notesForVersion(code);

  useEffect(() => {
    if (code > 0 && shouldShowWhatsNew(code, window.localStorage, () => claimColdDialog('whatsnew'))) setShow(true);
  }, [code]);

  if (!show || notes.length === 0) return null;

  const close = () => {
    markWhatsNewSeen(code, window.localStorage);
    setShow(false);
  };
  // "Ver agora" marca como visto E navega (deep-link). Nada de reload() — crasha o APK.
  const go = (to: string) => {
    close();
    navigate(to);
  };

  return (
    <Dialog open={show} onClose={close} PaperProps={{ sx: { borderRadius: '12px', maxWidth: 420 } }}>
      <DialogTitle sx={{ textAlign: 'center', fontWeight: 800, fontFamily: 'Poppins, sans-serif', pb: 0 }}>
        ✨ Novidades do Dr. Exame
      </DialogTitle>
      <DialogContent>
        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'text.secondary', mb: 2 }}>Versão {APP_VERSION}</Typography>
        {/* Máx ~5 itens visíveis; além disso rola (mobile: menos que metade da tela). */}
        <Stack spacing={1.5} sx={{ maxHeight: { xs: '46vh', sm: 320 }, overflowY: 'auto', pr: 0.5 }}>
          {notes.map((f) => (
            <Box key={f.title} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Box sx={{ fontSize: 24, flexShrink: 0, lineHeight: 1.2 }}>{f.emoji}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{f.title}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{f.desc}</Typography>
              </Box>
              <Button
                size="small" variant="text" onClick={() => go(f.to)}
                sx={{
                  textTransform: 'none', fontWeight: 700, flexShrink: 0, px: 1, minHeight: 28,
                  color: (t) => tealText(t.palette.mode),
                }}
              >
                Ver agora
              </Button>
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
