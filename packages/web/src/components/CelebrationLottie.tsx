import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { celebrationLottie } from './celebration-lottie-data';

/**
 * CelebrationLottie — camada ambiente Lottie do momento "1º exame" (piloto lottie-web).
 *
 * Desenho (skill motion-design): alegria com sobriedade premium — anel explosivo,
 * confete radial e sparkles na paleta da marca, ATRÁS do robô (o herói visual continua
 * sendo o DrExame). Carrega o player light sob demanda (import dinâmico): quem nunca
 * celebra não baixa o chunk.
 *
 * Robustez:
 *  - prefere reduced-motion → não carrega nada (o momento informativo segue no modal);
 *  - falha de carga (offline/chunk) → some em silêncio: o ConfettiCanvas CSS/canvas
 *    existente já cobre o efeito — o piloto nunca pode REGREDIR a celebração;
 *  - SSR-safe: nenhuma API de browser no render (efeito só roda no client).
 *
 * ⚠️ NÃO renomear para caixa-irmã do arquivo de dados (ex.: `celebrationLottie.ts`):
 * Windows/macOS são case-insensitive e o resolver colide os módulos (bug caçado em 16/11).
 */
export const CelebrationLottie = ({ size = 210 }: { size?: number }) => {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    let anim: import('lottie-web').AnimationItem | null = null;
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    } catch { /* segue */ }
    void (async () => {
      try {
        const lottie = (await import('lottie-web/build/player/lottie_light')).default;
        if (!alive || !host.current) return;
        anim = lottie.loadAnimation({
          container: host.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: celebrationLottie,
        });
        setReady(true);
      } catch {
        /* fallback silencioso — ConfettiCanvas cobre */
      }
    })();
    return () => {
      alive = false;
      anim?.destroy();
    };
  }, []);

  // opacity 0→1 no load: nunca "pisca" um retângulo vazio.
  return (
    <Box
      ref={host}
      aria-hidden="true"
      sx={{
        position: 'absolute',
        width: size,
        height: size,
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        opacity: ready ? 1 : 0,
        transition: 'opacity .35s ease',
        pointerEvents: 'none',
      }}
    />
  );
};
