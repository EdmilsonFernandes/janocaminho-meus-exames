import { useState, useEffect, useRef } from 'react';
import { Dialog, Box, Typography, Button, MobileStepper } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNavigate } from 'react-router-dom';
import { DrExame } from './DrExame';
import { tealText } from '../theme';
import { API_URL, token } from '../config';
import { claimColdDialog } from '../utils/coldDialog';

const SLIDES = [
  { emoji: '📄', title: 'Envie seu exame', desc: 'Mande o PDF ou foto do exame. O Dr. Exame extrai todos os valores automaticamente — em segundos.' },
  { emoji: '🤖', title: 'Entenda cada valor', desc: 'A IA explica em português simples, mostra sua leitura de risco e compara com exames anteriores.' },
  { emoji: '🩺', title: 'Pronto pro médico', desc: 'Relatório completo + perguntas prontas pra consulta. Compartilhe com seu médico com 1 toque.' },
];

/**
 * Onboarding em tela cheia sobre o app — coach-mark do 1º exame ("Envie seu exame").
 * Regras de abertura (júri de design E4+):
 *  - SÓ para quem tem ZERO exames (stats.exams===0): quem já tem painel não aprende
 *    nada com o tour do upload — sela e nunca mais pergunta;
 *  - NUNCA empilha: entra na bateria do claimColdDialog (máx 1 diálogo de cold-load
 *    por sessão) e espera modais já abertos fecharem;
 *  - NUNCA fora do dashboard: o coach-mark aponta pro CTA de upload — se o usuário
 *    caiu noutra rota (ex.: navegação interna pro Perfil), a âncora está fora da
 *    viewport e abrir ali só atrapalha (não sela: abre no próximo boot no dashboard).
 * UI: CTA único e grande no rodapé + fade suave por slide (key) + swipe + "Pular".
 */
export const Onboarding = () => {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const touchX = useRef<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let done = false;
    let iv: number | undefined;
    let kill: number | undefined;
    try { if (localStorage.getItem('onboarded')) return; } catch { return; }
    // Zero exames? 1 GET leve (máx 1 row) decide — o tour é do PRIMEIRO exame.
    fetch(`${API_URL}/exams?_start=0&_end=1`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: unknown) => {
        if (done) return;
        if (!Array.isArray(rows)) return; // resposta inesperada → não decide (não sela)
        if (rows.length > 0) {
          // Já tem exame → o coach-mark "Envie seu exame" não ensina nada. Sela em silêncio.
          try { localStorage.setItem('onboarded', '1'); } catch { /* storage off */ }
          return;
        }
        // Fora do dashboard (ex.: veio por navegação interna pro /perfil) → a âncora do
        // coach-mark está fora da viewport: NÃO abrir. Não sela — o próximo boot no
        // dashboard ainda mostra (usuário novo não perde o tour por causa de um redirect).
        const hash = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
        const path = (hash || window.location.pathname || '/').split('?')[0];
        if (path !== '/' && path !== '') return;
        // Anti-empilhamento: espera dialogs de cold-load fecharem (WhatsNew/MOTD/quiz…);
        // se em 30s não deu, desiste SEM selar (pergunta no próximo boot). Depois disputa
        // o slot ÚNICO da sessão — nunca 2 modais de boot (guard global claimColdDialog).
        iv = window.setInterval(() => {
          if (done) return;
          if (document.querySelector('.MuiDialog-root')) return;
          done = true;
          window.clearInterval(iv);
          if (claimColdDialog('onboarding')) setShow(true);
        }, 1200);
        kill = window.setTimeout(() => { done = true; if (iv) window.clearInterval(iv); }, 30000);
      })
      .catch(() => { /* offline → sem certeza sobre exames: não abre nem sela */ });
    return () => { done = true; if (iv) window.clearInterval(iv); if (kill) window.clearTimeout(kill); };
  }, []);
  if (!show) return null;

  const last = step === SLIDES.length - 1;
  const finish = () => { localStorage.setItem('onboarded', '1'); setShow(false); };
  // Momento da verdade é o 1º exame (pesquisa de ativação: conversão mediana = 24min no
  // dia 0) — o CTA final cai DIRETO no upload, não na lista vazia.
  const finishAndGo = () => { finish(); navigate('/exams/create'); };
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

        {/* Conteúdo central — fade por step (keyframes no sx: <style> no meio do DOM
            vazava "@keyframes…" no texto acessível do dialog — júri E4+ #12) */}
        <Box key={step} sx={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'onbIn .35s ease both',
          '@keyframes onbIn': { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        }}>
          {/* Mascote Dr. Exame em card circular translúcido (identidade no momento mais
              quente da jornada). Pulse suave + float premium. */}
          <Box sx={{
            width: 132, height: 132, mb: 3, borderRadius: '50%', bgcolor: 'rgba(255,255,255,.18)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,.35)',
            boxShadow: '0 10px 30px rgba(0,0,0,.18)', animation: 'onbFloat 2.6s ease-in-out infinite',
            '@keyframes onbFloat': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-12px)' } },
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}>
            <DrExame size={88} sx={{ borderRadius: '50%' }} />
          </Box>
          <Typography variant="h4" sx={{ fontWeight: 900, mb: 2, fontFamily: 'Poppins, sans-serif' }}>{s.title}</Typography>
          <Typography sx={{ fontSize: 17, opacity: 0.92, maxWidth: 340, lineHeight: 1.6 }}>{s.desc}</Typography>
        </Box>

        {/* Barra fixa embaixo: dots + CTA grande + dica */}
        <Box>
          <MobileStepper variant="dots" steps={SLIDES.length} position="static" activeStep={step}
            sx={{ bgcolor: 'transparent', justifyContent: 'center', mb: 2,
              '& .MuiMobileStepper-dot': { bgcolor: 'rgba(255,255,255,.32)', width: 8, height: 8, mx: 0.5, transition: 'all .2s' },
              '& .MuiMobileStepper-dotActive': { bgcolor: '#fff', width: 22, borderRadius: '999px' } }}
            nextButton={<Box />} backButton={<Box />} />
          <Button fullWidth onClick={last ? finishAndGo : next} endIcon={!last ? <ArrowForwardIcon /> : null}
            sx={{
              bgcolor: '#fff', color: (t) => tealText(t.palette.mode), fontWeight: 800, textTransform: 'none', fontSize: 17, borderRadius: '999px', py: 1.5,
              animation: 'onbPulse 2.4s ease-in-out infinite',
              '@keyframes onbPulse': { '0%,100%': { boxShadow: '0 8px 22px rgba(0,0,0,.16)' }, '50%': { boxShadow: '0 12px 30px rgba(0,0,0,.28)' } },
              '&:hover': { bgcolor: '#f0f9f8' },
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}>
            {last ? 'Começar 🚀' : 'Próximo'}
          </Button>
          <Typography sx={{ textAlign: 'center', mt: 1.5, opacity: 0.85, fontSize: 13 }}>{hint}</Typography>
        </Box>
      </Box>
    </Dialog>
  );
};
