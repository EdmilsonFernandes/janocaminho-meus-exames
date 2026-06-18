import { useState, useRef } from 'react';
import { Box, Card, CardContent, Button, TextField, Typography, Alert, Chip, Stack, LinearProgress } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { Title, useNotify, useRedirect, useRefresh } from 'react-admin';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

const MAX_BYTES = 32 * 1024 * 1024; // 32 MB por arquivo (limite do Claude)
const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

async function uploadOne(file: File | Blob, filename: string, pid: string | null, title?: string) {
  if (file.size > MAX_BYTES) throw Object.assign(new Error(`${filename} excede 32MB`), { tooBig: true });
  const fd = new FormData();
  fd.append('file', file, filename);
  if (pid) fd.append('patientId', pid);
  if (title?.trim()) fd.append('title', title.trim());

  let lastErr: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(`${API_URL}/exams`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: fd });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        const err: any = new Error(e.message || e.error || 'Falha no envio');
        err.code = e.error;
        throw err;
      }
      return r.json();
    } catch (e: any) {
      lastErr = e;
      if (e?.tooBig || e?.code === 'free_limit') throw e; // não retenta erros definitivos
      if (attempt < 3) {
        notifyRetry(attempt);
        await new Promise((res) => setTimeout(res, 1500 * attempt)); // espera crescente
      }
    }
  }
  throw lastErr ?? new Error('Falha no envio após 3 tentativas. Verifique sua conexão.');
}

// Avisa o usuário que está retentando (rede móvel instável = "failed to fetch")
function notifyRetry(attempt: number) {
  try { console.warn(`[upload] retentando (tentativa ${attempt + 1}/3)…`); } catch { /* */ }
}

export const ExamCreate = () => {
  const [pid] = useSelectedPatient();
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null);
  const notify = useNotify();
  const redirect = useRedirect();
  const refresh = useRefresh();

  const onPick = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    const tooBig = arr.filter((f) => f.size > MAX_BYTES).map((f) => f.name);
    const ok = arr.filter((f) => f.size <= MAX_BYTES);
    setFiles((prev) => [...prev, ...ok]);
    if (tooBig.length) notify(`${tooBig.length} arquivo(s) acima de 32MB foram ignorados.`, { type: 'warning' });
  };

  const takePhoto = async () => {
    try {
      const photo = await Camera.getPhoto({ quality: 92, resultType: CameraResultType.DataUrl, source: CameraSource.Camera, correctOrientation: true, saveToGallery: false });
      const blob = await (await fetch(photo.dataUrl!)).blob();
      await uploadOne(blob, `foto-${Date.now()}.jpg`, pid, title || 'Foto do exame');
      notify('Foto enviada! Extraindo…', { type: 'success' });
      redirect('list', 'exams');
    } catch (e: any) {
      if (e?.code === 'free_limit') { notify('Você atingiu o limite gratuito. Assine para continuar.', { type: 'warning' }); redirect('/planos'); return; }
      if (e?.message !== 'User cancelled photos app') notify(e.message || 'Falha na foto', { type: 'error' });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length) { notify('Selecione ao menos um arquivo.', { type: 'error' }); return; }
    // Trava mole de duplicata por NOME: se o nome do arquivo (sem extensão) bate com
    // o título de um exame já enviado deste paciente, pergunta antes. (O bloqueio forte
    // por arquivo idêntico é por sha256, no backend.)
    try {
      const r = await fetch(`${API_URL}/exams?_start=0&_end=200${pid ? `&patientId=${pid}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } });
      const existing: any[] = r.ok ? await r.json() : [];
      const norm = (s: string) => (s || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
      const titles = existing.map((ex) => norm(ex.title));
      const suspicious = files.some((f) => {
        const n = norm(f.name);
        return n.length > 3 && titles.some((t) => t === n || (t.length > 3 && (t.includes(n) || n.includes(t))));
      });
      if (suspicious && !window.confirm('Parece que você já enviou um exame com nome parecido pra este perfil. Quer enviar mesmo assim?')) return;
    } catch { /* falhou a checagem — segue o upload (sha256 continua protegendo) */ }
    setBusy(true);
    setProgress({ done: 0, total: files.length, errors: [] });
    const errors: string[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const res: any = await uploadOne(files[i], files[i].name, pid, title || files[i].name.replace(/\.pdf$/i, ''));
        if (res?.duplicate) notify(`"${files[i].name}": este documento já foi enviado (duplicata ignorada).`, { type: 'info' });
        else if (res?.duplicateElsewhere) notify(`"${files[i].name}": este mesmo arquivo já está em outro perfil seu.`, { type: 'warning' });
        setProgress({ done: i + 1, total: files.length, errors });
      } catch (err: any) {
        if (err?.code === 'free_limit') {
          notify('Você atingiu o limite gratuito. Assine para enviar mais exames.', { type: 'warning' });
          redirect('/planos');
          setBusy(false);
          return;
        }
        errors.push(`${files[i].name}: ${err.message}`);
        setProgress({ done: i + 1, total: files.length, errors });
      }
    }
    setBusy(false);
    if (errors.length === files.length) {
      notify('Nenhum envio concluído.', { type: 'error' });
    } else {
      notify(`${files.length - errors.length} de ${files.length} exame(s) enviado(s) e extraindo.`, { type: 'success' });
      refresh();
      redirect('list', 'exams');
    }
  };

  const pct = progress ? (progress.done / progress.total) * 100 : 0;

  return (
    <Box>
      <Title title="Enviar exames" />
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Enviar resultado(s) de exame</Typography>
          <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 560 }}>
            <Button variant="outlined" component="label" startIcon={<UploadFileIcon />} sx={{ justifyContent: 'flex-start' }}>
              {files.length ? `${files.length} arquivo(s) selecionado(s)` : 'Escolher PDF / imagem (vários)'}
              <input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf" onChange={(e) => { onPick(e.target.files); if (e.target) e.target.value = ''; }} />
            </Button>
            {files.length > 0 && (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {files.map((f, i) => (
                  <Chip key={i} label={f.name} onDelete={() => setFiles(files.filter((_, j) => j !== i))} />
                ))}
              </Stack>
            )}
            {isNative && (
              <>
                <Alert severity="info" icon={<PhotoCameraIcon />} sx={{ py: 0 }}>
                  📷 Para a <strong>foto ficar nítida</strong>: boa iluminação, documento centralizado e ocupando a tela, sem reflexo nem sombra. A IA lê melhor fotos nítidas.
                </Alert>
                <Button variant="outlined" color="secondary" startIcon={<PhotoCameraIcon />} onClick={takePhoto}>
                  Tirar foto do exame
                </Button>
              </>
            )}
            <TextField label="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Hemograma — junho/2026" />
            <Alert severity="info">
              A IA lê cada exame por <strong>visão</strong> e extrai os valores em segundo plano. Limite de <strong>32 MB</strong> por arquivo.
            </Alert>
            {progress && (
              <Box>
                <Typography variant="body2">Enviando {progress.done}/{progress.total}…</Typography>
                <LinearProgress variant="determinate" value={pct} sx={{ my: 0.5 }} />
                {progress.errors.map((er, i) => <Typography key={i} variant="caption" color="error">⚠ {er}</Typography>)}
              </Box>
            )}
            <Box>
              <Button type="submit" variant="contained" size="large" disabled={busy || !files.length}>
                {busy ? 'Enviando…' : `Enviar ${files.length || ''} e extrair`}
              </Button>
              <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>✓ Envio e extração grátis — você só usa créditos na interpretação (resumo/chat/relatório).</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
