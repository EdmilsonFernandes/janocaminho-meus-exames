import { useState, useRef, type ReactNode } from 'react';
import { Popover, IconButton, Box, Typography, CircularProgress, Button } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import { explainExam, type ExamExplain } from '../data/examDictionary';
import { API_URL, token } from '../config';

// Cache de sessão: 2ª vez que abre o mesmo "?" não vai na rede (o backend também
// cacheia em arquivo, então a 1ª vez de QUALQUER usuário já fica salva p/ todos).
const memCache = new Map<string, ExamExplain>();

type FetchState = 'idle' | 'loading' | 'ok' | 'error';

/**
 * Botão "?" reutilizável: abre um POPOVER acessível (balão, não tela cheia) com a explicação.
 * Usa o dicionário local primeiro; se não tiver, consulta a IA (/items/explain).
 *
 * Acessibilidade:
 *  - Trigger é <IconButton> com aria-busy durante o fetch.
 *  - `aria-labelledby` liga o trigger ao título do popover (mesmo id).
 *  - Foco move para dentro do popover ao abrir; Tab fica trapado; Esc fecha (default do Popover).
 *  - Falha mostra motivo + botão de retry (silencioso nunca mais).
 *
 * Use em qualquer lugar que mencione um exame:
 *   <ExplainButton name={it.name} nameCanonical={it.nameCanonical} />
 */
export const ExplainButton = ({ name, nameCanonical, size = 'small' }: { name: string; nameCanonical?: string; size?: 'small' | 'medium' }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<ExamExplain | null>(null);
  const [state, setState] = useState<FetchState>('idle');
  const [errorReason, setErrorReason] = useState<string>('');
  const titleId = `explain-title-${(nameCanonical || name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const firstFocusRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);

  const fetchData = async () => {
    const local = explainExam(nameCanonical || name);
    if (local) { setData(local); setState('ok'); setErrorReason(''); return; }
    const key = (nameCanonical || name).toLowerCase();
    const cached = memCache.get(key);
    if (cached) { setData(cached); setState('ok'); setErrorReason(''); return; }
    setData(null); setState('loading'); setErrorReason('');
    try {
      const r = await fetch(`${API_URL}/items/explain`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ name }),
      });
      if (r.ok) { const d = await r.json(); memCache.set(key, d); setData(d); setState('ok'); return; }
      // Erro HTTP com mensagem útil (limite de taxa, off-line, etc.).
      let reason = 'Não consegui obter do servidor agora.';
      try { const d = await r.json(); if (d?.error) reason = String(d.error); } catch { /* */ }
      setErrorReason(reason); setState('error');
    } catch (e: any) {
      setErrorReason(e?.message ? String(e.message) : 'Falha de rede — verifique sua conexão.');
      setState('error');
    }
  };

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    setAnchor(e.currentTarget);
    // Só busca se ainda não temos dados (local, cache ou fetch anterior).
    if (state === 'idle') void fetchData();
  };

  const handleRetry = () => { setState('loading'); setErrorReason(''); void fetchData(); };

  const onEntered = () => {
    // Move o foco para dentro do popover (retry se visível, senão o corpo). Trap fica por conta do Popover.
    firstFocusRef.current?.focus();
  };

  const renderBody = (): ReactNode => {
    if (state === 'loading') {
      return <Box sx={{ textAlign: 'center', py: 1 }}><CircularProgress size={22} /></Box>;
    }
    if (state === 'ok' && data) {
      return (
        <>
          <Typography id={titleId} sx={{ fontWeight: 800, color: 'primary.dark', fontSize: '1.05rem' }}>{data.titulo}</Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>{data.resumo}</Typography>
          {data.analogia && <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>💡 {data.analogia}</Typography>}
          {data.alterado && (
            <Typography variant="caption" sx={{ display: 'block', mt: 1, p: 1, bgcolor: 'rgba(245,158,11,.08)', borderRadius: '8px', lineHeight: 1.5 }}>⚠️ {data.alterado}</Typography>
          )}
        </>
      );
    }
    if (state === 'error') {
      return (
        <>
          <Typography id={titleId} sx={{ fontWeight: 800, color: 'primary.dark', fontSize: '1.05rem' }}>Não foi possível carregar</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>{errorReason || 'Tente novamente em instantes.'}</Typography>
          <Button
            ref={(el: HTMLButtonElement) => { firstFocusRef.current = el; }}
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRetry}
            sx={{ mt: 1.5, borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}
          >Tentar novamente</Button>
        </>
      );
    }
    return null;
  };

  return (
    <>
      <IconButton
        size={size}
        onClick={handleOpen}
        aria-busy={state === 'loading'}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        sx={{ color: 'primary.main', padding: size === 'small' ? 0.5 : 1 }}
        title="O que é este exame?"
        aria-label="O que é este exame?"
      >
        <HelpOutlineIcon fontSize={size} />
      </IconButton>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        TransitionProps={{ onEntered }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{
          paper: {
            'aria-labelledby': titleId,
            role: 'dialog',
            sx: { maxWidth: 'min(340px, 90vw)', borderRadius: '12px', mt: 0.5 },
          },
        }}
      >
        <Box sx={{ p: 2, maxWidth: 'min(340px, 90vw)' }}>
          {renderBody()}
          <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>*Educativo. Sempre confirme com seu médico.</Typography>
        </Box>
      </Popover>
    </>
  );
};
