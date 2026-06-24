import { useState, useEffect, useRef } from 'react';
import { Dialog, Box, Typography, Button, MobileStepper } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

const SLIDES = [
  { emoji: '📋', title: 'Sua saúde centralizada', desc: 'Todos os seus exames em um só lugar, organizados por data. Nunca mais perca um resultado.' },
  { emoji: '🤖', title: 'IA que lê seus resultados', desc: 'O Dr. Exame explica cada valor em português simples, compara com exames anteriores e destaca o que precisa de atenção.' },
  { emoji: '🩺', title: 'Pronto pro médico', desc: 'Relatório de 1 página + perguntas prontas para sua consulta. Compartilhe por link seguro.' },
];

/**
 * Onboarding em tela cheia sobre o app.
 * - CTA único e grande no rodapé (impossível não ver) → resolve "não sei que tem que clicar em Próximo".
 * - Fade suave por slide (key) → sem "piscar/sumir" entre passos.
 * - Swipe (arrastar) + "Pular" discreto no topo.
 */
export const Onboarding = () => {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const touchX = useRef<number | null>(null);

  useEffect(() => { if (!localStorage.getItem('onboarded')) setShow(true); }, []);
  if (!show) return null;

  const last = step === SLIDES.length - 1;
  const finish = () => { localStorage.setItem('onboarded', '1'); setShow(false); };
  const next = () => { if (last) { finish(); return; } setStep((s) => Math.min(s + 1, SLIDES.length - 1)); };
  const back = () => { setStep((s) => Math.max(s - 1, 0)); };

  // Swipe: esquerda = próximo, direita = anterior.
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (dx < -45) next();
    else if (dx > 45) back();
  };

  const s = SLIDES[step];
  const hint = step === 0
    ? 'Toque em Próximo para continuar →'
    : last ? 'Tudo pronto pra começar!' : `Etapa ${step + 1} de ${SLIDES.length}`;

  return (
    <Dialog open={show} fullScreen
      sx={{ '& .MuiDialog-paper': { background: 'linear-gradient(160deg,#20b2aa,#178f89)' } }}>
      <Box onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        sx={{ height: '100%', display: 'flex', flexDirection: 'column', color: '#fff', textAlign: 'center', px: 4, pt: 6, pb: 3 }}>

        {/* Pular — topo direito, discreto (não compete com o CTA) */}
        {!last && (
          <Button onClick={finish} size="small"
            sx={{ position: 'absolute', top: 10, right: 12, color: 'rgba(255,255,255,.82)', textTransform: 'none', fontWeight: 700, minWidth: 0 }}>
            Pular
          </Button>
        )}

        {/* Conteúdo central — fade por step (não "some" abrupto) */}
        <Box key={step} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: 'onbIn .35s ease both' }}>
          <Box sx={{ fontSize: 80, mb: 3, animation: 'onbFloat 2.6s ease-in-out infinite' }}>{s.emoji}</Box>
          <Typography variant="h4" sx={{ fontWeight: 900, mb: 2, fontFamily: 'Poppins, sans-serif' }}>{s.title}</Typography>
          <Typography sx={{ fontSize: 17, opacity: 0.92, maxWidth: 340, lineHeight: 1.6 }}>{s.desc}</Typography>
        </Box>

        {/* Barra fixa embaixo: dots + CTA grande + dica */}
        <Box>
          <MobileStepper variant="dots" steps={SLIDES.length} position="static" activeStep={step}
            sx={{ bgcolor: 'transparent', justifyContent: 'center', mb: 2,
              '& .MuiMobileStepper-dot': { bgcolor: 'rgba(255,255,255,.32)', width: 8, height: 8, mx: 0.5, transition: 'all .2s' },
              '& .MuiMobileStepper-dotActive': { bgcolor: '#fff', width: 22, borderRadius: 99 } }}
            nextButton={<Box />} backButton={<Box />} />
          <Button fullWidth onClick={next} endIcon={!last ? <ArrowForwardIcon /> : null}
            sx={{ bgcolor: '#fff', color: '#178f89', fontWeight: 800, textTransform: 'none', fontSize: 17, borderRadius: 99, py: 1.5,
              animation: 'onbPulse 2.4s ease-in-out infinite', '&:hover': { bgcolor: '#f0f9f8' } }}>
            {last ? 'Começar 🚀' : 'Próximo'}
          </Button>
          <Typography sx={{ textAlign: 'center', mt: 1.5, opacity: 0.85, fontSize: 13 }}>{hint}</Typography>
        </Box>
      </Box>

      <style>{`
        @keyframes onbFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @keyframes onbIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes onbPulse{0%,100%{box-shadow:0 8px 22px rgba(0,0,0,.16)}50%{box-shadow:0 12px 30px rgba(0,0,0,.28)}}
      `}</style>
    </Dialog>
  );
};
