import { Box, Stack, Typography } from '@mui/material';

/**
 * ProcessingStages — feedback de processamento com ETAPAS VISUAIS (insight
 * Kantesti: barra percentual + etapas nomeadas em vez de skeleton mudo).
 * O pipeline real é: extração dos valores (pdftotext → IA) → análise → resumo.
 * Aqui vira 3 passos: o concluído em check, o corrente pulsando, o futuro
 * apagado. SEM percentual falso — o servidor não expõe progresso real; o que
 * avança é a ETAPA, não um número inventado.
 */

const TEAL = '#20b2aa';

export const STAGE_LABELS = ['📄 Extraindo valores…', '🤖 Analisando com IA…', '📊 Gerando resumo…'] as const;

export const ProcessingStages = ({ active, labels = STAGE_LABELS }: { active: 0 | 1 | 2; labels?: readonly string[] }) => (
  <Stack
    direction="row"
    spacing={0}
    alignItems="center"
    sx={{ width: '100%' }}
    aria-label={`Etapas do processamento: ${labels[active]} é a etapa atual`}
  >
    {labels.map((label, idx) => {
      const done = idx < active;
      const current = idx === active;
      return (
        <Stack key={label} direction="row" alignItems="center" sx={{ flex: idx === labels.length - 1 ? '0 1 auto' : '1 1 0', minWidth: 0 }}>
          <Stack alignItems="center" sx={{ minWidth: 0, flexShrink: 0 }}>
            <Box
              sx={{
                width: 22, height: 22, borderRadius: '50%',
                display: 'grid', placeItems: 'center',
                fontSize: 11, fontWeight: 800,
                border: '2px solid',
                borderColor: done || current ? TEAL : 'rgba(15,95,90,.25)',
                bgcolor: done ? TEAL : 'transparent',
                color: done ? '#fff' : current ? TEAL : 'text.disabled',
                ...(current ? {
                  animation: 'psPulse 1.6s ease-in-out infinite',
                  '@keyframes psPulse': {
                    '0%, 100%': { boxShadow: '0 0 0 0 rgba(32,178,170,.35)' },
                    '50%': { boxShadow: '0 0 0 6px rgba(32,178,170,0)' },
                  },
                  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                } : {}),
              }}
              aria-hidden="true"
            >
              {done ? '✓' : idx + 1}
            </Box>
            <Typography
              noWrap
              sx={{
                fontSize: 10.5, fontWeight: current ? 800 : 600, mt: 0.4,
                color: done ? 'text.secondary' : current ? 'text.primary' : 'text.disabled',
                maxWidth: { xs: 84, sm: 120 },
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {label}
            </Typography>
          </Stack>
          {idx < labels.length - 1 && (
            <Box sx={{
              flex: 1, height: 2, mx: 0.5, mb: 2.2, borderRadius: 1, minWidth: 10,
              bgcolor: done ? TEAL : 'rgba(15,95,90,.18)',
            }} />
          )}
        </Stack>
      );
    })}
  </Stack>
);
