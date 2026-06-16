import { useState, useRef } from 'react';
import { Avatar, IconButton, Box, Typography } from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { API_URL, token } from '../config';

/** Upload de foto com preview circular (avatar). */
export const PhotoUpload = ({ patientId, photoUrl, size = 80 }: { patientId?: string; photoUrl?: string | null; size?: number }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | undefined>(photoUrl || undefined);
  const [uploading, setUploading] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !patientId) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('photo', file);
    try {
      const r = await fetch(`${API_URL}/patients/${patientId}/photo`, {
        method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: fd,
      });
      if (r.ok) {
        const d = await r.json();
        setPreview(`${d.photoUrl}?t=${Date.now()}`); // cache-busting
      }
    } catch { /* ignore */ }
    finally { setUploading(false); }
  };

  const initials = patientId ? '?' : '?';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
      <Box sx={{ position: 'relative', display: 'inline-block' }}>
        <Avatar src={preview} sx={{ width: size, height: size, bgcolor: '#336886', fontSize: size * 0.35, border: '3px solid #e2e8f0' }}>
          {initials}
        </Avatar>
        <IconButton
          size="small"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !patientId}
          sx={{ position: 'absolute', bottom: -2, right: -2, bgcolor: '#336886', color: '#fff', '&:hover': { bgcolor: '#2a5a73' }, width: 28, height: 28 }}
        >
          <PhotoCameraIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <input ref={inputRef} type="file" hidden accept="image/jpeg,image/png" onChange={onFile} />
      </Box>
      <Box>
        <Typography variant="body2" color="text.secondary">
          {uploading ? 'Enviando...' : 'Clique na câmera para enviar uma foto'}
        </Typography>
      </Box>
    </Box>
  );
};
