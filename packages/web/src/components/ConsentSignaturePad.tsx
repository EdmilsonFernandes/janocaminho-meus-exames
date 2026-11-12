import { useRef, useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import CreateIcon from '@mui/icons-material/Create';
import { tealText } from '../theme';

/**
 * Assinatura desenhada do consentimento de teleconsulta (Art. 15 — lote ReUI 04/11).
 * Canvas simples (pointer events, funciona no dedo), OPCIONAL no fluxo: o onChange
 * devolve o dataURL PNG (ou null quando vazio) e quem chama decide se envia junto
 * com o aceite (PUT /reminders/:id/consent { signature }). Sem persistência aqui.
 */
export const ConsentSignaturePad = ({ onChange }: { onChange: (dataUrl: string | null) => void }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [strokes, setStrokes] = useState(0);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current;
    if (!c) return;
    c.setPointerCapture(e.pointerId);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = ref.current?.getContext('2d');
    if (!ctx || !ref.current) return;
    const p = pos(e);
    ctx.strokeStyle = '#0f1818';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const c = ref.current;
    setStrokes((s) => s + 1);
    if (c) onChange(c.toDataURL('image/png'));
  };

  const clear = () => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    setStrokes(0);
    onChange(null);
  };

  return (
    <Box sx={{ mt: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
        <CreateIcon sx={{ fontSize: 16, color: (t) => tealText(t.palette.mode) }} />
        <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>
          Assine o termo <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>(opcional — com o dedo)</Box>
        </Typography>
        {strokes > 0 && (
          <Button size="small" onClick={clear} sx={{ ml: 'auto', minWidth: 0, fontSize: 12, fontWeight: 700, color: 'text.secondary', textTransform: 'none' }}>limpar</Button>
        )}
      </Box>
      <canvas
        ref={ref}
        width={640}
        height={180}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        aria-label="Área de assinatura do consentimento"
        role="img"
        style={{
          width: '100%', height: 110, touchAction: 'none', borderRadius: 12,
          border: '1.5px dashed rgba(32,178,170,.45)', background: '#fff', display: 'block',
        }}
      />
      {strokes === 0 && (
        <Typography sx={{ fontSize: 12, color: 'text.disabled', mt: 0.5, textAlign: 'center' }}>
          sua assinatura fica anexada ao termo, com data e hora
        </Typography>
      )}
    </Box>
  );
};
