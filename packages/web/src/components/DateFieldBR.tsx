import { useEffect, useRef, useState } from 'react';
import { TextField, InputAdornment, IconButton, Box } from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

/**
 * Campo de data SEMPRE em dd/mm/aaaa (pt-BR), independente do locale do device/WebView.
 *
 * O <input type="date"> nativo mostra mm-dd-aaaa em Android WebViews com locale en-US
 * (ignora o lang do documento). Este componente controla a EXIBIÇÃO no padrão BR e mantém
 * o calendário nativo (ícone → showPicker()). value/onChange em ISO (yyyy-mm-dd), igual ao
 * type=date original — drop-in replacement.
 */
const isoToBr = (iso?: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
};
const brToIso = (br: string): string => {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};
const maskBr = (v: string): string =>
  v.replace(/\D/g, '').slice(0, 8)
    .replace(/(\d{2})(\d)/, '$1/$2')
    .replace(/(\d{2}\/\d{2})(\d)/, '$1/$2');

interface Props {
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  helperText?: string;
  fullWidth?: boolean;
  size?: 'small' | 'medium';
}

export const DateFieldBR = ({ value, onChange, label, helperText, fullWidth, size }: Props) => {
  const [text, setText] = useState(isoToBr(value));
  const dateRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setText(isoToBr(value)); }, [value]);

  const handleText = (raw: string) => {
    const masked = maskBr(raw);
    setText(masked);
    onChange(brToIso(masked)); // '' enquanto incompleto — o pai usa `dob || null`
  };

  const openPicker = () => {
    try { (dateRef.current as any)?.showPicker?.(); } catch { /* fallback: digitar no campo */ }
  };

  return (
    <Box sx={{ position: 'relative', width: fullWidth ? '100%' : 'auto' }}>
      <TextField
        label={label}
        value={text}
        onChange={(e) => handleText(e.target.value)}
        placeholder="dd/mm/aaaa"
        helperText={helperText}
        fullWidth={fullWidth}
        size={size}
        inputMode="numeric"
        InputLabelProps={{ shrink: true }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton onClick={openPicker} size="small" edge="end" aria-label="Abrir calendário" tabIndex={-1}>
                <CalendarMonthIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      {/* input type="date" oculto — só pra acionar o calendário nativo (showPicker) */}
      <input
        ref={dateRef}
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1, right: 12, bottom: 18, pointerEvents: 'none' }}
        tabIndex={-1}
        aria-hidden
      />
    </Box>
  );
};
