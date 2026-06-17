import { useEffect, useState } from 'react';
import { Chip } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';

/** Chip de créditos sempre visível no AppBar — toca p/ abrir Planos e Créditos. */
export const CreditsChip = () => {
  const navigate = useNavigate();
  const [credits, setCredits] = useState<number | null>(null);
  const load = () =>
    fetch(`${API_URL}/billing/status`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCredits(typeof d?.credits === 'number' ? d.credits : null));
  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener('selPatientChanged', h);
    window.addEventListener('creditsChanged', h);
    return () => { window.removeEventListener('selPatientChanged', h); window.removeEventListener('creditsChanged', h); };
  }, []);
  if (credits == null) return null;
  return (
    <Chip
      icon={<BoltIcon />}
      label={`${credits}`}
      onClick={() => navigate('/planos')}
      size="small"
      title={`Você tem ${credits} créditos — toque para comprar mais`}
      sx={{ mr: 0.5, fontWeight: 800, bgcolor: 'secondary.main', color: '#fff', '& .MuiChip-icon': { color: '#fff' } }}
    />
  );
};
