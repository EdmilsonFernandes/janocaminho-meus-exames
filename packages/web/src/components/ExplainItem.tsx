import { useState } from 'react';
import { Popover, IconButton, Box, Typography, CircularProgress } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { explainExam, type ExamExplain } from '../data/examDictionary';
import { API_URL, token } from '../config';

// Cache de sessão: 2ª vez que abre o mesmo "?" não vai na rede (o backend também
// cacheia em arquivo, então a 1ª vez de QUALQUER usuário já fica salva p/ todos).
const memCache = new Map<string, ExamExplain>();

/**
 * Botão "?" reutilizável: abre um POPOVER (balão, não tela cheia) com a explicação.
 * Usa o dicionário local primeiro; se não tiver, consulta a IA (/items/explain).
 * Use em qualquer lugar que mencione um exame: <ExplainButton name={it.name} nameCanonical={it.nameCanonical} />
 */
export const ExplainButton = ({ name, nameCanonical, size = 'small' }: { name: string; nameCanonical?: string; size?: 'small' | 'medium' }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<ExamExplain | null>(null);
  const [loading, setLoading] = useState(false);

  const open = async (e: React.MouseEvent<HTMLElement>) => {
    setAnchor(e.currentTarget);
    const local = explainExam(nameCanonical || name);
    if (local) { setData(local); setLoading(false); return; }
    const key = (nameCanonical || name).toLowerCase();
    const cached = memCache.get(key);
    if (cached) { setData(cached); setLoading(false); return; }
    setData(null); setLoading(true);
    try {
      const r = await fetch(`${API_URL}/items/explain`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ name }),
      });
      if (r.ok) { const d = await r.json(); memCache.set(key, d); setData(d); }
    } catch { /* */ }
    setLoading(false);
  };

  return (
    <>
      <IconButton size={size} onClick={open} sx={{ color: 'primary.main', padding: size === 'small' ? 0.5 : 1 }} title="O que é este exame?">
        <HelpOutlineIcon fontSize={size} />
      </IconButton>
      <Popover
        open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{ paper: { sx: { maxWidth: 340, borderRadius: 3, mt: 0.5 } } }}>
        <Box sx={{ p: 2, maxWidth: 340 }}>
          {loading ? (
            <Box sx={{ textAlign: 'center', py: 1 }}><CircularProgress size={22} /></Box>
          ) : data ? (
            <>
              <Typography sx={{ fontWeight: 800, color: '#178f89', fontSize: '1.05rem' }}>{data.titulo}</Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>{data.resumo}</Typography>
              {data.analogia && <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>💡 {data.analogia}</Typography>}
              {data.alterado && (
                <Typography variant="caption" sx={{ display: 'block', mt: 1, p: 1, bgcolor: 'rgba(245,158,11,.08)', borderRadius: 1, lineHeight: 1.5 }}>⚠️ {data.alterado}</Typography>
              )}
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">Sem explicação disponível agora.</Typography>
          )}
          <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>*Educativo. Sempre confirme com seu médico.</Typography>
        </Box>
      </Popover>
    </>
  );
};
