import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, Dialog } from '@mui/material';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { API_URL, token } from '../config';
import { chipA11y } from '../utils/chipA11y';
import { usePrivacyMode } from '../hooks/usePrivacyMode';
import { RADIUS } from '../theme';

/**
 * ExamFilePreview — miniatura do arquivo que o paciente enviou num exame que FALHOU
 * ("o que foi que eu mandou?": foto torta, documento errado, pedido em vez do resultado).
 *
 * Por que não é um <img src="/exams/:id/file?...">: a rota do arquivo só aceita
 * `Authorization: Bearer` e <img> não envia header. A 1ª versão (21/11) passava o token na URL
 * (dava 401) e ainda dependia de `filePath`, que a API nunca expõe → a preview nunca apareceu.
 * Aqui o arquivo baixa por fetch (com header, posse validada no server) e vira object URL.
 *
 * Requisitos: `exam.fileKind === 'image'` (a API manda 'image' | 'pdf'); PDF não tem miniatura.
 * Respeita o modo privacidade (o mesmo que borra o nome do exame): com o modo ligado a foto fica
 * OCULTA até o toque — laudo tem nome e CPF no cabeçalho, borrado ainda vazaria o layout.
 */
const cache = new Map<string, Promise<Blob | null>>();

/** Baixa o arquivo do exame com header de auth. Cacheia por exame; falha NÃO fica em cache. */
export function loadExamFileBlob(examId: string): Promise<Blob | null> {
  let pending = cache.get(examId);
  if (!pending) {
    pending = (async () => {
      try {
        const r = await fetch(`${API_URL}/exams/${examId}/file`, { headers: { Authorization: `Bearer ${token()}` } });
        if (!r.ok) return null;
        // Offline, o fetch-cache devolve 200 com um JSON vazio: não é imagem, então não mostra nada.
        if (r.headers.get('X-Offline-Empty')) return null;
        const blob = await r.blob();
        return blob.size > 0 && blob.type.startsWith('image/') ? blob : null;
      } catch {
        return null;
      }
    })();
    pending.then((b) => { if (!b) cache.delete(examId); });
    cache.set(examId, pending);
  }
  return pending;
}

export const ExamFilePreview = ({
  examId,
  size = 80,
  alt = 'Foto enviada',
  sx,
}: {
  examId: string;
  /** Lado da miniatura em px (aceita responsivo, ex.: { xs: 120, sm: 160 }). */
  size?: number | Record<string, number>;
  alt?: string;
  sx?: any;
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);
  // Modo privacidade (mesmo do PrivacyText): a foto de um exame tem nome/CPF no cabeçalho do
  // laudo — com o modo ligado ela fica OCULTA (não só borrada) até o toque; revela por 5s.
  const { privacyOn } = usePrivacyMode();
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);
    loadExamFileBlob(examId).then((blob) => {
      if (!active) return;
      if (!blob) { setFailed(true); return; }
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [examId]);

  // Todos os hooks já rodaram acima (React #310: nada de hook depois de return).
  const reveal = (e: React.SyntheticEvent) => {
    e.stopPropagation(); // não abre o exame — o toque aqui é só pra VER
    setRevealed(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRevealed(false), 5000);
  };
  if (failed) return null; // sem rede/arquivo: o card de falha segue utilizável, só sem a foto
  if (!url) {
    return (
      <Box aria-label="Carregando a foto enviada" role="img" sx={{ width: size, height: size, flexShrink: 0, borderRadius: '10px', bgcolor: 'action.hover', display: 'grid', placeItems: 'center', ...sx }}>
        <CircularProgress size={18} color="inherit" />
      </Box>
    );
  }
  if (privacyOn && !revealed) {
    return (
      <Box
        {...chipA11y()}
        aria-label="Foto oculta pelo modo privacidade. Toque para revelar por 5 segundos"
        title="Toque para revelar por 5 segundos"
        onClick={reveal}
        sx={{
          width: size, height: size, flexShrink: 0, borderRadius: '10px', display: 'grid', placeItems: 'center',
          border: '1px dashed', borderColor: 'divider', bgcolor: 'action.hover', color: 'text.secondary', cursor: 'pointer', ...sx,
        }}
      >
        <VisibilityOffOutlinedIcon />
      </Box>
    );
  }
  return (
    <>
      <Box
        component="img"
        src={url}
        alt={alt}
        {...chipA11y()}
        aria-label="Ampliar a foto enviada"
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); setZoom(true); }}
        sx={{
          display: 'block', width: size, height: size, flexShrink: 0, objectFit: 'cover',
          borderRadius: '10px', border: '1px solid', borderColor: 'divider', cursor: 'zoom-in',
          transition: 'opacity .15s ease', '&:hover': { opacity: 0.85 }, ...sx,
        }}
      />
      {/* Ampliar em Dialog (e não window.open): funciona igual no navegador e no APK, sem sair do app. */}
      <Dialog open={zoom} onClose={() => setZoom(false)} maxWidth="sm" fullWidth aria-label="Foto enviada ampliada"
        slotProps={{ paper: { sx: { borderRadius: RADIUS.card, bgcolor: 'background.paper', p: 0.5 } } }}>
        <Box component="img" src={url} alt={alt} onClick={() => setZoom(false)}
          sx={{ display: 'block', width: '100%', maxHeight: '80dvh', objectFit: 'contain', cursor: 'zoom-out' }} />
      </Dialog>
    </>
  );
};

export default ExamFilePreview;
