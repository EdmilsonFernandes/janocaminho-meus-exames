import { useState, useRef } from 'react';
import { Avatar, IconButton, Box, Typography } from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { API_URL, token, photoUrlFor } from '../config';

/**
 * Upload de foto com preview circular. Cache-bust controlado por `version` (sincroniza
 * com o pai) ou por contador interno (uso isolado). `onUploaded` avisa o pai p/ atualizar.
 * `hideLabel` = só o avatar editável (p/ usar dentro de cabeçalhos).
 */
export const PhotoUpload = ({
  patientId, photoUrl, size = 80, hideLabel, version, onUploaded,
  endpoint, src, authToken,
}: {
  patientId?: string; photoUrl?: string | null; size?: number; hideLabel?: boolean; version?: number; onUploaded?: () => void;
  endpoint?: string; src?: string; authToken?: string;
}) => {
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
      <Box sx={{ position: 'relative', display: 'inline-block' }}>
        <Avatar src={preview} sx={{
          width: size, height: size,
          bgcolor: hideLabel ? 'rgba(255,255,255,.25)' : 'primary.main',
          fontSize: size * 0.35, fontWeight: 800,
          border: hideLabel ? '3px solid rgba(255,255,255,.7)' : '3px solid #e6f1f0',
        }}>
          ?
        </Avatar>
        <IconButton
          size="small"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !targetUrl}
          sx={{ position: 'absolute', bottom: -2, right: -2, bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' }, width: 28, height: 28 }}
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
