import { useState, useEffect } from 'react';
import { Dialog, Box, Typography, Button, Stack, MobileStepper } from '@mui/material';

const SLIDES = [
  { emoji: '📋', title: 'Sua saude centralizada', desc: 'Todos os seus exames em um so lugar, organizados por data. Nunca mais perca um resultado.' },
  { emoji: '🤖', title: 'IA que le seus resultados', desc: 'O Dr. Exame explica cada valor em portugues simples, compara com exames anteriores e destaca o que precisa de atencao.' },
  { emoji: '🩺', title: 'Pronto pro medico', desc: 'Relatorio de 1 pagina + perguntas prontas para sua consulta. Compartilhe por link seguro.' },
];

export const Onboarding = () => {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => { if (!localStorage.getItem('onboarded')) setShow(true); }, []);
  if (!show) return null;
  const s = SLIDES[step];
  const last = step === SLIDES.length - 1;
  const finish = () => { localStorage.setItem('onboarded', '1'); setShow(false); };
  return (
    <Dialog open={show} fullScreen sx={{ '& .MuiDialog-paper': { bgcolor: 'linear-gradient(160deg,#20b2aa,#178f89)', background: 'linear-gradient(160deg,#20b2aa,#178f89)' } }}>
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 4, color: '#fff', textAlign: 'center' }}>
        <Box sx={{ fontSize: 80, mb: 3, animation: 'onbFloat 2s ease-in-out infinite' }}>{s.emoji}</Box>
        <Typography variant="h4" sx={{ fontWeight: 900, mb: 2, fontFamily: 'Poppins, sans-serif' }}>{s.title}</Typography>
        <Typography sx={{ fontSize: 17, opacity: 0.9, maxWidth: 340, lineHeight: 1.6, mb: 4 }}>{s.desc}</Typography>
        <MobileStepper steps={SLIDES.length} position="static" activeStep={step} sx={{ bgcolor: 'transparent', mb: 3, '& .MuiMobileStepper-dot': { bgcolor: 'rgba(255,255,255,.3)' }, '& .MuiMobileStepper-dotActive': { bgcolor: '#fff' } }} nextButton={<Box />} backButton={<Box />} />
        <Stack direction="row" spacing={2}>
          {!last && <Button onClick={finish} sx={{ color: 'rgba(255,255,255,.7)', textTransform: 'none', fontWeight: 700 }}>Pular</Button>}
          <Button variant="contained" onClick={() => last ? finish() : setStep(step + 1)} sx={{ bgcolor: '#fff', color: '#178f89', fontWeight: 800, textTransform: 'none', fontSize: 16, borderRadius: 99, px: 4, py: 1.3, '&:hover': { bgcolor: '#f0f9f8' } }}>
            {last ? 'Comecar 🚀' : 'Proximo'}
          </Button>
        </Stack>
      </Box>
      <style>{`@keyframes onbFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}`}</style>
    </Dialog>
  );
};
