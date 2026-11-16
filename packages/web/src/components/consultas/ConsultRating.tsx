import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useNotify } from 'react-admin';
import { Rating } from '@/components/reui/rating';
import { API_URL, token } from '../../config';

/**
 * ConsultRating — avaliação pós-consulta em estrelas ("Como foi o atendimento?").
 * Isolada (sem ciclo de import): usada nas TELECONSULTAS (MinhasConsultas) e nas
 * CONSULTAS REGISTRADAS do paciente (presencial — dono 10/11).
 * Grava no POST /teleconsulta/:id/feedback (upsert por ator no audit; o endpoint
 * aceita reminder de type 'teleconsulta' E 'consulta').
 *
 * 15/11: a nota era gravada, mas a tela nunca lia de volta — ao reabrir o histórico o card
 * voltava a perguntar e parecia que não tinha salvado. Agora lê a nota já dada (GET do mesmo
 * endereço), mostra as estrelas preenchidas e deixa trocar.
 */
export const ConsultRating = ({ reminderId }: { reminderId: string }) => {
  const [stars, setStars] = useState(0);
  const [saved, setSaved] = useState(0); // nota que está gravada no servidor (0 = nenhuma)
  const [busy, setBusy] = useState(false);
  const notify = useNotify();

  useEffect(() => {
    let ignore = false;
    fetch(`${API_URL}/teleconsulta/${reminderId}/feedback`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const n = Number(d?.rating);
        if (!ignore && Number.isInteger(n) && n >= 1 && n <= 5) { setSaved(n); setStars(n); }
      })
      .catch(() => { /* sem rede: fica como "ainda não avaliou"; avaliar de novo só regrava */ });
    return () => { ignore = true; };
  }, [reminderId]);

  const save = (v: number) => {
    if (busy || v === saved) return;
    setStars(v);
    setBusy(true);
    fetch(`${API_URL}/teleconsulta/${reminderId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ rating: v }),
    })
      .then((r) => {
        if (r.ok) { setSaved(v); notify('Avaliação salva. Obrigado!', { type: 'success' }); return; }
        setStars(saved); // não salvou: volta a mostrar o que está gravado de verdade
        notify('Não deu pra salvar a avaliação — toque de novo em instantes.', { type: 'warning' });
      })
      .catch(() => { setStars(saved); notify('Sem conexão pra salvar a avaliação — tente de novo online.', { type: 'warning' }); })
      .finally(() => setBusy(false));
  };

  return (
    <Box
      onClick={(e) => e.stopPropagation()}
      sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', pt: 1.25, mt: 1.25, borderTop: '1px dashed', borderColor: 'divider' }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
        {saved ? 'Sua avaliação' : 'Como foi o atendimento?'}
      </Typography>
      <Rating rating={stars} editable={!busy} onRatingChange={save} size="sm" />
      {saved > 0 && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {busy ? 'salvando…' : 'salva 💚 · toque para trocar'}
        </Typography>
      )}
    </Box>
  );
};
