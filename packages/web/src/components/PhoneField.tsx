import { TextField, InputAdornment, Typography } from '@mui/material';
import type { TextFieldProps } from '@mui/material';

/**
 * Máscara BR progressiva (ReUI phone-input, de-para 30/10):
 *   celular  (11) 98765-4321 · fixo (11) 3456-7890 · com DDI +55 (11) 98765-4321.
 * NUNCA descarta dígito que o usuário deu (links wa.me fazem replace(/\D/g,'') —
 * número colado com 55 continua com 55; só a exibição ganha forma).
 */
export const formatBrPhone = (raw: string): string => {
  const d = String(raw ?? '').replace(/\D/g, '').slice(0, 13);
  if (!d) return '';
  // Com DDI 55 (12-13 dígitos): +55 (XX) XXXX[X]-XXXX
  if (d.startsWith('55') && d.length > 11) {
    const r = d.slice(2);
    const p = r.length > 10 ? [r.slice(0, 2), r.slice(2, 7), r.slice(7)] : [r.slice(0, 2), r.slice(2, 6), r.slice(6)];
    return `+55 (${p[0]})${p[1] ? ` ${p[1]}` : ''}${p[2] ? `-${p[2]}` : ''}`;
  }
  const local = d.slice(0, 11);
  if (local.length <= 2) return `(${local}`;
  if (local.length <= 6) return `(${local.slice(0, 2)}) ${local.slice(2)}`;
  if (local.length <= 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
};

/** Campo de telefone BR — mesmo TextField do app com máscara ao vivo e DDI visual. */
export const PhoneField = ({ value, onChange, InputProps, inputProps, ...rest }: Omit<TextFieldProps, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void }) => (
  <TextField
    {...rest}
    value={formatBrPhone(value)}
    onChange={(e) => onChange(formatBrPhone(e.target.value))}
    inputProps={{ inputMode: 'tel', maxLength: 20, ...(inputProps ?? {}) }}
    InputProps={{
      startAdornment: (
        <InputAdornment position="start">
          <Typography component="span" aria-hidden sx={{ fontSize: 15, lineHeight: 1 }}>🇧🇷</Typography>
        </InputAdornment>
      ),
      ...(InputProps ?? {}),
    }}
  />
);
