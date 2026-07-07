/**
 * ReviewPrompt — pede avaliação no Google Play após momento positivo.
 * Aparece UMA vez (localStorage) após: score calculado + pelo menos 1 exame extraído.
 * No nativo (APK): abre a Play Store direto. No web: silent (não perturba).
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Stack } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import { Capacitor } from '@capacitor/core';

const KEY = 'me_review_asked';
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.janocaminho.drexame';

export const ReviewPrompt = ({ trigger }: { trigger: boolean }) => {
  const [open, setOpen] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!trigger || !isNative) return;
    try {
      if (localStorage.getItem(KEY)) return;
      // Espera 3s após o trigger pra não interromper a experiência
      const t = setTimeout(() => { setOpen(true); try { localStorage.setItem(KEY, '1'); } catch {} }, 3000);
      return () => clearTimeout(t);
    } catch {}
  }, [trigger, isNative]);

  if (!isNative) return null;

  const rate = async () => {
    setOpen(false);
    try { const { Browser } = await import('@capacitor/browser'); await Browser.open({ url: PLAY_URL }); } catch { window.open(PLAY_URL, '_blank'); }
  };

  return (
    <Dialog open={open} onClose={() => setOpen(false)} PaperProps={{ sx: { borderRadius: 4, maxWidth: 340 } }}>
      <DialogTitle sx={{ textAlign: 'center', pb: 0 }}>
        <Stack alignItems="center" spacing={1}>
          <Stack direction="row" spacing={0.5}>{[1,2,3,4,5].map(i => <StarIcon key={i} sx={{ color: '#f59e0b', fontSize: 28 }} />)}</Stack>
          Gostando do Dr. Exame?
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center' }}>
        <Typography color="text.secondary">Sua avaliação ajuda mais pessoas a descobrirem o app. Leva 10 segundos! 🙏</Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', pb: 3, flexDirection: 'column', gap: 1 }}>
        <Button variant="contained" onClick={rate} startIcon={<StarIcon />} sx={{ borderRadius: 99, px: 4, textTransform: 'none', fontWeight: 800, bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706' } }}>Avaliar no Google Play</Button>
        <Button size="small" onClick={() => setOpen(false)} sx={{ textTransform: 'none', color: 'text.secondary' }}>Talvez depois</Button>
      </DialogActions>
    </Dialog>
  );
};
