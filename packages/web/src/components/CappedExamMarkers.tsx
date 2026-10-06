import { useState, type ReactNode } from 'react';
import { Box, Button, Stack } from '@mui/material';
import { ExamMarker } from './ExamMarker';
import { refScaleSuspect } from '../utils/alertPriority';
import { RADIUS } from '../theme';

const CAP = 4;

/**
 * CappedExamMarkers — lista de valores alterados com teto de exibição.
 * Exames com muitos alterados (hemograma com 10+) viravam um muro confuso dentro
 * do Accordion. Mostra os CAP primeiros (já ordenados por prioridade 🔴→🟡 no caller)
 * + "ver todos" inline. Compartilhado entre paciente (/alterados) e portal médico.
 * `extra` (E5.3): render opcional POR ITEM abaixo do marker — usado pelo portal médico
 * para o controle de revisão; o app do paciente não passa (comportamento inalterado).
 */
export const CappedExamMarkers = ({ items, extra }: { items: any[]; extra?: (it: any) => ReactNode }) => {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, CAP);
  return (
    <Stack spacing={0.75}>
      {shown.map((it) => (
        <Box key={it.id}>
          <ExamMarker it={it} suspect={refScaleSuspect(it)} />
          {extra?.(it)}
        </Box>
      ))}
      {items.length > CAP && (
        <Button
          size="small"
          onClick={() => setAll(!all)}
          sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 700, borderRadius: RADIUS.pill }}
        >
          {all ? 'Mostrar menos' : `Ver todos os ${items.length} alterados`}
        </Button>
      )}
    </Stack>
  );
};
