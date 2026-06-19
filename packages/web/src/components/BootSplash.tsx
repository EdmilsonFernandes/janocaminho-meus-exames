import { Box, Typography } from '@mui/material';
import { DrExame } from './DrExame';

/** Tela de boot/splash premium — mostra enquanto o app inicializa (auth/data).
 *  Fundo teal + DrExame respirando + linha de batimento + "Meus Exames". */
export const BootSplash = ({ title = 'Meus Exames', subtitle = 'Seu assistente de saúde com IA' }: { title?: string; subtitle?: string }) => (
  <Box sx={{
    position: 'fixed', inset: 0, zIndex: 9999,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5,
    background: 'linear-gradient(160deg,#20b2aa 0%,#178f89 100%)', color: '#fff',
  }}>
    <Box sx={{ animation: 'bootBreathe 2s ease-in-out infinite' }}>
      <DrExame size={118} sx={{ borderRadius: '24%', boxShadow: '0 18px 44px rgba(0,0,0,.28)' }} />
    </Box>
    <Typography variant="h4" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', letterSpacing: '-0.02em', mt: 0.5 }}>{title}</Typography>
    <Typography sx={{ opacity: 0.92, fontSize: 15 }}>{subtitle}</Typography>

    {/* linha de batimento cardíaco */}
    <Box sx={{ width: 200, height: 26, mt: 1, opacity: 0.95, '& path': { strokeDasharray: 260, animation: 'bootBeat 2.4s linear infinite' } }}>
      <svg viewBox="0 0 200 26" fill="none" preserveAspectRatio="none">
        <path d="M0 13 H46 L54 4 L64 22 L74 13 H118 L128 7 L138 19 L148 13 H200" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Box>

    <Box sx={{ display: 'flex', gap: 0.6, mt: 1.5 }}>
      {[0, 1, 2].map((i) => (
        <Box key={i} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#fff', animation: `bootDot 1.2s ${i * 0.15}s ease-in-out infinite` }} />
      ))}
    </Box>

    <style>{`
      @keyframes bootBreathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-8px) scale(1.05)}}
      @keyframes bootDot{0%,80%,100%{opacity:.3;transform:scale(.7)}40%{opacity:1;transform:scale(1.15)}}
      @keyframes bootBeat{0%{stroke-dashoffset:260}45%{stroke-dashoffset:0}55%{stroke-dashoffset:0}100%{stroke-dashoffset:-260}}
    `}</style>
  </Box>
);
