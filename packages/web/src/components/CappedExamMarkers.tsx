import { useState } from 'react';
import { Button, Stack } from '@mui/material';
import { ExamMarker } from './ExamMarker';
import { refScaleSuspect } from '../utils/alertPriority';
import { RADIUS } from '../theme';

const CAP = 4;

/**
 * CappedExamMarkers — lista de valores alterados com teto de exibição.
 * Exames com muitos alterados (hemograma com 10+) viravam um muro confuso dentro
 * do Accordion. Mostra os CAP primeiros (já ordenados por prioridade 🔴→🟡 no caller)
 * + "ver todos" inline. Compartilhado entre paciente (/alterados) e portal médico.
 */
export const CappedExamMarkers = ({ items }: { items: any[] }) => {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, CAP);
  return (
    <Stack spacing={0.75}>
      {shown.map((it) => (
        <ExamMarker key={it.id} it={it} suspect={refScaleSuspect(it)} />
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
