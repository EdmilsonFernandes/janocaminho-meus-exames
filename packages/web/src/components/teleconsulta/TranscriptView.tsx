// TranscriptView — reader premium da transcrição da teleconsulta (F3 §3b).
// Doc: docs/design/2026-10-20-f3-ux.md. Inter 15/1.75 (NUNCA monospace — só "Sala
// XXXXX" é mono, e é dado, não texto de leitura), max-width 70ch, altura máx com
// scroll interno de scrollbar fina temática, busca simples opcional, copiar p/ o
// médico (1 clique) e disclaimer "gerada por IA" no rodapé. Sem diarização
// inventada: texto corrido em parágrafos.
import { useMemo, useState, type ReactNode } from 'react';
import { Box, Button, Chip, IconButton, InputAdornment, Stack, TextField, Typography, useTheme } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import NotesIcon from '@mui/icons-material/Notes';
import { snackbar } from '../ConfirmDialog';
import { hapticLight } from '../../utils/haptic';
import { tealText } from '../../theme';
import type { TeleconsultaRole } from './types';

export interface TranscriptViewProps {
  /** Texto pronto (null = sem transcrição — quem decide esconder a seção é o container). */
  text: string | null;
  transcriptAt: string | null;
  role: TeleconsultaRole;
}

const fmtAt = (d?: string | null) => {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return `transcrita em ${dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

/** Busca sem acento (régua da casa: normalizeKey stripa acentos). */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** NFD muda o comprimento (ç → c+combining) — mapeia cada char normalizado de volta
 *  ao índice ORIGINAL p/ destacar o trecho certo (busca "cami" acha "Cami" e "câmi…"). */
const normMap = (s: string): { norm: string; map: number[] } => {
  let out = '';
  const map: number[] = [];
  let orig = 0;
  for (const cp of s) {
    const n = cp.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (let k = 0; k < n.length; k++) map.push(orig);
    out += n;
    orig += cp.length;
  }
  return { norm: out, map };
};

const highlight = (para: string, rawQuery: string): ReactNode => {
  const q = norm(rawQuery);
  if (!q) return para;
  const { norm: nPara, map } = normMap(para);
  const parts: ReactNode[] = [];
  let normPos = 0;
  let origPos = 0;
  let k = 0;
  for (;;) {
    const idx = nPara.indexOf(q, normPos);
    if (idx === -1) { parts.push(para.slice(origPos)); break; }
    const start = map[idx];
    // fim no original = índice original do PRÓXIMO char normalizado (limite = fim da string)
    const end = idx + q.length < map.length ? map[idx + q.length] : para.length;
    if (start > origPos) parts.push(para.slice(origPos, start));
    parts.push(
      <Box key={k++} component="mark" sx={{ bgcolor: 'rgba(32,178,170,.28)', color: 'inherit', borderRadius: '4px', px: 0.25 }}>
        {para.slice(start, end)}
      </Box>,
    );
    normPos = idx + q.length;
    origPos = end;
  }
  return parts;
};

export const TranscriptView = ({ text, transcriptAt, role }: TranscriptViewProps) => {
  const theme = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const isDoctor = role === 'doctor';

  const paragraphs = useMemo(() => {
    const raw = (text ?? '').replace(/\r/g, '');
    if (!raw.trim()) return [] as string[];
    return raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  }, [text]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return paragraphs.map((p) => ({ p, hit: false }));
    return paragraphs.filter((p) => norm(p).includes(q)).map((p) => ({ p, hit: true }));
  }, [paragraphs, query]);

  const copyAll = async () => {
    hapticLight();
    try {
      await navigator.clipboard.writeText(text ?? '');
      snackbar({ message: 'Transcrição copiada — cole no plano.', severity: 'success' });
    } catch {
      snackbar({ message: 'Não deu pra copiar agora.', severity: 'error' });
    }
  };

  // Sem texto: estado amigável (o container esconde a seção quando NÃO houve gravação;
  // chegar aqui com null = houve gravação mas o texto ainda não existe/prontidão variada).
  if (!text || paragraphs.length === 0) {
    return (
      <Box sx={{ p: 2, borderRadius: '12px', bgcolor: 'action.hover', textAlign: 'center' }}>
        <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>
          {text === null || text === undefined
            ? 'A transcrição desta consulta ainda não está disponível.'
            : 'A consulta foi curta — não há texto para transcrever.'}
        </Typography>
      </Box>
    );
  }

  const atLabel = fmtAt(transcriptAt);
  const showSearch = text.length > 400;

  return (
    <Box
      sx={{
        borderRadius: '16px',
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
      }}
    >
      {/* Cabeçalho do reader: data + busca + copiar (médico) */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 1.75, py: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}
      >
        <NotesIcon sx={{ fontSize: 18, color: (t) => tealText(t.palette.mode) }} aria-hidden />
        <Typography variant="caption" noWrap sx={{ color: 'text.secondary', flex: 1, minWidth: 0 }}>
          {atLabel ?? 'transcrição da consulta'}
        </Typography>
        {showSearch && !searchOpen && (
          <IconButton size="small" aria-label="Buscar na transcrição" onClick={() => { setSearchOpen(true); hapticLight(); }} sx={{ color: 'text.secondary' }}>
            <SearchIcon fontSize="small" />
          </IconButton>
        )}
        {isDoctor && (
          <Button
            size="small"
            startIcon={<ContentCopyIcon sx={{ fontSize: 16 }} />}
            onClick={() => void copyAll()}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '999px', color: (t) => tealText(t.palette.mode), minHeight: 36 }}
          >
            Copiar tudo
          </Button>
        )}
      </Stack>

      {searchOpen && (
        <Box sx={{ px: 1.75, pt: 1.25 }}>
          <TextField
            autoFocus
            size="small"
            fullWidth
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar na transcrição…"
            slotProps={{
              input: {
                startAdornment: (<InputAdornment position="start"><SearchIcon sx={{ fontSize: 17, color: 'text.secondary' }} /></InputAdornment>),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" aria-label="Fechar busca" onClick={() => { setSearchOpen(false); setQuery(''); }} sx={{ color: 'text.secondary' }}>
                      <CloseIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '999px', fontSize: 13.5, bgcolor: 'background.paper' } }}
          />
          {query.trim() && (
            <Chip
              size="small"
              label={filtered.length > 0 ? `${filtered.length} ${filtered.length === 1 ? 'trecho' : 'trechos'}` : 'nenhum trecho encontrado'}
              sx={{ mt: 0.75, height: 22, fontSize: 11.5, fontWeight: 700, bgcolor: filtered.length ? 'rgba(32,178,170,.12)' : 'rgba(245,158,11,.15)', color: filtered.length ? (t) => tealText(t.palette.mode) : (theme.palette.mode === 'dark' ? '#fbbf24' : '#92400e') }}
            />
          )}
        </Box>
      )}

      {/* Corpo: Inter 15/1.75, 70ch, scroll interno de scrollbar fina */}
      <Box
        sx={{
          maxHeight: '52dvh',
          overflowY: 'auto',
          px: 2,
          py: 1.75,
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': { bgcolor: theme.palette.mode === 'dark' ? '#2a3636' : '#e6f1f0', borderRadius: '999px' },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
        }}
      >
        <Stack spacing={1.5} sx={{ maxWidth: '70ch' }}>
          {filtered.map(({ p, hit }, i) => (
            <Typography
              key={i}
              sx={{
                fontFamily: 'Inter, sans-serif',
                fontSize: 15,
                lineHeight: 1.75,
                color: 'text.primary',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                caretColor: (t) => tealText(t.palette.mode),
                '&::selection': { bgcolor: 'rgba(32,178,170,.35)' },
              }}
            >
              {hit ? highlight(p, query.trim()) : p}
            </Typography>
          ))}
          {filtered.length === 0 && (
            <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>
              Nenhuma ocorrência de “{query.trim()}”.
            </Typography>
          )}
        </Stack>
      </Box>

      {/* Rodapé: disclaimer IA (promessa única do doc — nada além disto) */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ px: 1.75, py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" sx={{ fontSize: 11.5, color: 'text.secondary' }}>
          {isDoctor
            ? 'Transcrição gerada por IA — revise antes de usar no plano.'
            : 'Transcrição gerada por IA — revise com seu médico.'}
        </Typography>
      </Stack>
    </Box>
  );
};
