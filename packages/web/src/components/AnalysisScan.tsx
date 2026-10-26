import { Box, Typography, useTheme } from '@mui/material';
import { DrExameRobot } from './DrExameRobot';
import { tealText } from '../theme';

/**
 * AnalysisScan (26/10 — premium): cena "a IA está LENDO seu exame".
 *  - Documento estilizado (tema-aware) com LINHA DE SCANNER varrendo (varredura
 *    + brilho) e trail em gradiente.
 *  - Chips de valores (ex.: "Glicose 92") aparecendo UM A UM conforme a leitura
 *    avança, com pop suave; ao fim do ciclo tudo respira e recomeça (loop limpo).
 *  - Dr. Exame ao lado: SVG vivo (olhos piscam) com estrelinha ✨ — mesma
 *    linguagem do boot (DrExameRobot compartilhado).
 *  - HONESTIDADE: as frases de estágio continuam em quem usa o componente
 *    (ExtractionProgress) — aqui é percepção visual de leitura, não promessa de
 *    etapas técnicas (a extração real é 1 job assíncrono).
 *
 * Perf: só transform/opacity no scanner/chips (compositor); will-change só na
 * linha. prefers-reduced-motion: scanner para no meio (opacity pulse leve),
 * chips todos visíveis estáticos, robô para de piscar (regra do DrExameRobot).
 */

/** Valores de exemplo REALISTAS (faixa normal) — não são do usuário, é a cena. */
const CHIPS = [
  { label: 'Glicose', value: '92' },
  { label: 'Hemoglobina', value: '14,1' },
  { label: 'Colesterol', value: '178' },
  { label: 'TSH', value: '2,1' },
  { label: 'Vitamina D', value: '32' },
];

/** Linhas de texto do "documento" (larguras variadas = laudo de verdade). */
const LINES = [0.86, 0.94, 0.72, 0.9, 0.6, 0.8];

// Ciclo-mestre: 5.2s = varredura 3.0s (58%) + hold 1.4s + reset 0.8s.
// Chips entram DURANTE a varredura (percepção "lendo item por item").
const CYCLE_S = 5.2;
const SWEEP_END = 58; // % do ciclo em que a varredura termina

const chipKeyframes = CHIPS.map((_, i) => {
  const at = 8 + i * ((SWEEP_END - 14) / (CHIPS.length - 1)); // 8% → 52%
  const end = Math.min(at + 8, SWEEP_END + 2);
  return `@keyframes asChip${i} {
  0%, ${at.toFixed(1)}% { opacity: 0; transform: translateY(7px) scale(0.86); }
  ${end.toFixed(1)}% { opacity: 1; transform: translateY(0) scale(1); }
  86% { opacity: 1; transform: translateY(0) scale(1); }
  93%, 100% { opacity: 0; transform: translateY(0) scale(1); }
}`;
}).join('\n        ');

export const AnalysisScan = ({ label }: { label?: string }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const ink = isDark ? '#2c3b39' : '#d9e6e4'; // linhas do "texto"
  const paper = theme.palette.background.paper;

  return (
    <Box
      role="status"
      aria-live="polite"
      aria-label={label || 'Analisando exame'}
      sx={{ width: '100%', maxWidth: 348, mx: 'auto', textAlign: 'center' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 1.5 }}>
        {/* Dr. Exame vivo ao lado (escuta o documento, ✨ no peito) */}
        <Box
          className="as-robo"
          sx={{ flexShrink: 0, animation: 'asBob 3.4s ease-in-out infinite', mb: 1.5 }}
        >
          <DrExameRobot size={72} />
        </Box>

        {/* Documento com scanner */}
        <Box
          sx={{
            position: 'relative',
            width: 118,
            height: 150,
            flexShrink: 0,
            borderRadius: 3.5,
            bgcolor: paper,
            border: '1px solid',
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,80,74,0.14)',
            boxShadow: isDark
              ? '0 10px 26px rgba(0,0,0,0.45)'
              : '0 10px 26px rgba(15,80,74,0.14)',
            overflow: 'hidden',
            p: 1.2,
            textAlign: 'left',
          }}
        >
          {/* Cabeçalho do laudo */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, mb: 1 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'rgba(32,178,170,0.8)' }} />
            <Box sx={{ height: 4, width: 42, borderRadius: 2, bgcolor: 'rgba(32,178,170,0.35)' }} />
          </Box>
          {/* Linhas do "texto" */}
          {LINES.map((w, i) => (
            <Box
              key={i}
              sx={{
                height: 4,
                width: `${w * 100}%`,
                borderRadius: 2,
                bgcolor: ink,
                opacity: 0.75,
                mb: '7px',
              }}
            />
          ))}
          {/* Trail do scanner (gradiente atrás da linha) */}
          <Box
            className="as-trail"
            sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 8,
              height: 120,
              background: 'linear-gradient(180deg, rgba(32,178,170,0.22) 0%, rgba(32,178,170,0.02) 100%)',
              transform: 'translateY(0)',
              animation: `asSweep ${CYCLE_S}s ease-in-out infinite`,
              pointerEvents: 'none',
            }}
          />
          {/* Linha de scanner */}
          <Box
            className="as-scan"
            sx={{
              position: 'absolute',
              left: 6,
              right: 6,
              top: 8,
              height: 2.5,
              borderRadius: 2,
              bgcolor: '#20b2aa',
              boxShadow: `0 0 10px rgba(32,178,170,0.9), 0 0 22px rgba(32,178,170,0.45)`,
              transform: 'translateY(0)',
              animation: `asSweep ${CYCLE_S}s ease-in-out infinite`,
              willChange: 'transform',
              pointerEvents: 'none',
            }}
          />
        </Box>

        {/* Chips de valores — um a um conforme "lê" */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 0.65,
            pb: 0.5,
            minWidth: 104,
          }}
        >
          {CHIPS.map((c, i) => (
            <Box
              key={c.label}
              className="as-chip"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                py: 0.3,
                borderRadius: 999,
                bgcolor: 'rgba(32,178,170,0.12)',
                border: '1px solid rgba(32,178,170,0.28)',
                opacity: 0,
                animation: `asChip${i} ${CYCLE_S}s ease-out infinite`,
                whiteSpace: 'nowrap',
              }}
            >
              <Typography
                component="span"
                sx={{ fontSize: 10.5, fontWeight: 700, color: (t) => tealText(t.palette.mode) }}
              >
                {c.label}
              </Typography>
              <Typography component="span" sx={{ fontSize: 10.5, fontWeight: 800, color: (t) => tealText(t.palette.mode) }}>
                {c.value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {label && (
        <Typography
          sx={{ mt: 1.5, fontSize: 13, fontWeight: 700, color: (t) => tealText(t.palette.mode), fontFamily: '"Poppins",sans-serif' }}
        >
          {label}
        </Typography>
      )}

      <style>{`
        @keyframes asBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        /* Varredura: desce lendo (0→58%), segura, some e volta ao topo (loop limpo) */
        @keyframes asSweep {
          0% { transform: translateY(0); opacity: 1; }
          ${SWEEP_END}% { transform: translateY(118px); opacity: 1; }
          84% { transform: translateY(118px); opacity: 1; }
          92% { transform: translateY(118px); opacity: 0; }
          92.01% { transform: translateY(0); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        ${chipKeyframes}
        /* prefers-reduced-motion: leitura "congelada" no meio + chips todos visíveis */
        @media (prefers-reduced-motion: reduce) {
          .as-robo { animation: none !important; }
          .as-scan { animation: asScanHold 2.4s ease-in-out infinite !important; }
          .as-trail { opacity: 0.4; animation: none !important; transform: translateY(46px) !important; }
          .as-chip { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
        @keyframes asScanHold { 0%, 100% { transform: translateY(46px); opacity: 0.75; } 50% { opacity: 1; } }
      `}</style>
    </Box>
  );
};
