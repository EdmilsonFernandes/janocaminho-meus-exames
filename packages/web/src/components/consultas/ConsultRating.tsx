import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useNotify } from 'react-admin';
import { Rating } from '@/components/reui/rating';
import { API_URL, token } from '../../config';

/**
 * ConsultRating — avaliação pós-consulta em estrelas ("Como foi o atendimento?").
 * Isolada (sem ciclo de import): usada nas TELECONSULTAS (MinhasConsultas) e nas
 * CONSULTAS REGISTRADAS do paciente (presencial — dono 10/11).
 * Grava no POST /teleconsulta/:id/feedback (upsert por ator no audit; o endpoint
 * aceita reminder de type 'teleconsulta' E 'consulta'). Falha AVISA (antes era
 * silenciosa — "não tá gravando").
 */
export const ConsultRating = ({ reminderId }: { reminderId: string }) => {
  const [stars, setStars] = useState(0);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const notify = useNotify();
  if (sent) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pt: 1.25, mt: 1.25, borderTop: '1px dashed', borderColor: 'divider' }}>
        <Rating rating={stars} size="sm" />
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Obrigado pela avaliação 💚</Typography>
      </Box>
    );
  }
  return (
    <Box
      onClick={(e) => e.stopPropagation()}
      sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', pt: 1.25, mt: 1.25, borderTop: '1px dashed', borderColor: 'divider' }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Como foi o atendimento?</Typography>
      <Rating
        rating={stars}
        editable={!busy}
        onRatingChange={(v) => {
          if (busy) return;
          setStars(v);
          setBusy(true);
          fetch(`${API_URL}/teleconsulta/${reminderId}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
            body: JSON.stringify({ rating: v }),
          })
            .then((r) => {
              if (r.ok) setSent(true);
              else notify('Não deu pra salvar a avaliação — toque de novo em instantes.', { type: 'warning' });
            })
            .catch(() => notify('Sem conexão pra salvar a avaliação — tente de novo online.', { type: 'warning' }))
            .finally(() => setBusy(false));
        }}
        size="sm"
      />
    </Box>
  );
};
