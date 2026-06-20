import { useRef } from 'react';
import { Box } from '@mui/material';

/** Input de código OTP com N quadradinhos premium (auto-avança + cola). */
export const OtpInput = ({ value, onChange, length = 6 }: { value: string; onChange: (v: string) => void; length?: number }) => {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) => { const el = refs.current[Math.max(0, Math.min(i, length - 1))]; el?.focus(); el?.select(); };
  return (
    <Box sx={{ display: 'flex', gap: { xs: 0.75, sm: 1 }, justifyContent: 'center' }}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el: any) => { refs.current[i] = el; }}
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={(e: any) => {
            const c = e.target.value.replace(/\D/g, '').slice(-1);
            if (!c) return;
            const arr = value.split('');
            arr[i] = c;
            onChange(arr.join('').slice(0, length));
            focus(i + 1);
          }}
          onKeyDown={(e: any) => { if (e.key === 'Backspace' && !value[i]) focus(i - 1); }}
          onPaste={(e: any) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
            if (pasted) { onChange(pasted); focus(Math.min(pasted.length, length - 1)); }
          }}
          onFocus={(e: any) => e.target.select()}
          style={{
            width: 44, height: 52, textAlign: 'center', fontSize: 22, fontWeight: 800,
            borderRadius: 12, border: `2px solid ${value[i] ? '#20b2aa' : '#cfd8dc'}`,
            outline: 'none', background: '#fff', color: '#0f3d3a',
            fontFamily: 'Poppins, Inter, sans-serif', transition: 'border-color .15s',
          }}
        />
      ))}
    </Box>
  );
};
