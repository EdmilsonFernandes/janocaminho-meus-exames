import { useState, useRef } from 'react';
import { Avatar, IconButton, Box, Typography } from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { API_URL, token, photoUrlFor } from '../config';
import { tealText } from '../theme';

/**
 * Upload de foto com preview circular. Cache-bust controlado por `version` (sincroniza
 * com o pai) ou por contador interno (uso isolado). `onUploaded` avisa o pai p/ atualizar.
 * `hideLabel` = só o avatar editável (p/ usar dentro de cabeçalhos).
 */
export const PhotoUpload = ({
  patientId, photoUrl, size = 80, hideLabel, version, onUploaded, fallback,
  endpoint, src, authToken, appearance,
}: {
  patientId?: string; photoUrl?: string | null; size?: number; hideLabel?: boolean; version?: number; onUploaded?: () => void;
  fallback?: string; endpoint?: string; src?: string; authToken?: string;
  /** 'surface' = avatar sobre fundo claro (Perfil 28/11/26): borda branca, câmera pequena e presa à
   *  borda da foto, com a área de toque estendida (o visual fica 32px; o toque, 48px). */
  appearance?: 'surface';
}) => {
  const surface = appearance === 'surface';
  const inputRef = useRef<HTMLInputElement>(null);
  const [localVer, setLocalVer] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localSrc, setLocalSrc] = useState<string | undefined>(undefined); // preview instantâneo do arquivo escolhido
  const ver = version ?? localVer;
  const targetUrl = endpoint ?? (patientId ? `${API_URL}/patients/${patientId}/photo` : null);
  const auth = authToken ?? token();
  const preview = localSrc ?? src ?? (patientId && photoUrl ? photoUrlFor(patientId, ver) : undefined);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetUrl) return;
    // preview LOCAL instantâneo: mostra a foto nova na hora (antes/depois do upload),
    // em vez de ficar na foto antiga até o servidor responder.
    setLocalSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
    setUploading(true);
    const fd = new FormData();
    fd.append('photo', file);
    try {
      const r = await fetch(targetUrl, {
        method: 'POST', headers: { Authorization: `Bearer ${auth}` }, body: fd,
      });
      if (r.ok) {
        setLocalVer((v) => v + 1);
        setSaved(true);
        onUploaded?.(); // pai recarrega p/ sincronizar outros avatares
      } else {
        console.error('photo upload failed:', r.status, await r.text());
      }
    } catch (err) { console.error('photo upload error:', err); }
    finally { setUploading(false); }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: hideLabel ? 0 : 2, mb: hideLabel ? 0 : 2 }}>
      <Box sx={{ position: 'relative', display: surface ? 'block' : 'inline-block', lineHeight: surface ? 0 : undefined }}>
        <Avatar src={preview} sx={surface ? {
          width: size, height: size, fontSize: size * 0.38, fontWeight: 800, fontFamily: 'Poppins, sans-serif',
          color: '#0f6e68', background: 'linear-gradient(145deg, #e6f7f5, #c9ece8)',
          border: '3px solid', borderColor: 'background.paper',
        } : {
          width: size, height: size,
          bgcolor: hideLabel ? 'rgba(255,255,255,.25)' : 'primary.main',
          fontSize: size * 0.35, fontWeight: 800,
          border: hideLabel ? '3px solid rgba(255,255,255,.7)' : '3px solid',
          borderColor: hideLabel ? undefined : 'divider',
        }}>
          {fallback || '?'}
        </Avatar>
        <IconButton
          // 'surface': sem sizeSmall — o tema põe position:relative no small em tela de toque e a câmera
          // saía do canto da foto (ia parar embaixo, centralizada). O toque de 48px vem do ::after abaixo.
          size={surface ? 'medium' : 'small'}
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !targetUrl}
          aria-label="Trocar foto"
          sx={surface ? {
            position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, minWidth: 0, minHeight: 0, p: 0,
            bgcolor: 'primary.main', color: '#fff', border: '2.5px solid', borderColor: 'background.paper',
            boxShadow: '0 2px 8px rgba(15,110,104,.35)', '&:hover': { bgcolor: 'primary.dark' },
            '&::after': { content: '""', position: 'absolute', inset: -8, borderRadius: '50%' },
          } : { position: 'absolute', bottom: -2, right: -2, bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' }, width: 28, height: 28 }}
        >
          <PhotoCameraIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <input ref={inputRef} type="file" hidden accept="image/jpeg,image/png" onChange={onFile} />
      </Box>
      {!hideLabel && (
        <Box>
          <Typography variant="body2" sx={{ color: saved ? 'success.main' : 'text.secondary', fontWeight: saved ? 700 : 400 }}>
            {uploading ? 'Enviando...' : saved ? '✓ Foto salva' : 'Clique na câmera para enviar/trocar a foto'}
          </Typography>
        </Box>
      )}
    </Box>
  );
};
