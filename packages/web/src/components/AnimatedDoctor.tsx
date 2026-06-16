import { Box, Typography } from '@mui/material';
import { DrExame } from './DrExame';

/** Dr. Exame "respirando" — loader animado premium pra operações de IA. */
export const AnimatedDoctor = ({ text = 'Dr. Exame está pensando…', size = 88 }: { text?: string; size?: number }) => (
  <Box sx={{ textAlign: 'center', py: 3 }}>
    <Box sx={{ display: 'inline-block', animation: 'drBreathe 2.2s ease-in-out infinite' }}>
      <DrExame size={size} sx={{ borderRadius: '22%', boxShadow: '0 8px 24px rgba(42,147,184,.3)' }} />
    </Box>
    <Typography sx={{ mt: 1.5, fontWeight: 700, color: '#2a93b8' }}>{text}</Typography>
    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', mt: 1 }}>
      {[0, 1, 2].map((i) => (
        <Box key={i} sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#2a93b8', animation: `drDot 1.2s ${i * 0.2}s ease-in-out infinite` }} />
      ))}
    </Box>
    <style>{`
      @keyframes drBreathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-7px) scale(1.04)}}
      @keyframes drDot{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1.2)}
    `}</style>
  </Box>
);
