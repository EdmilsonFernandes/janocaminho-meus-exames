import { useState, useRef } from 'react';
import { Box, Card, CardContent, Button, TextField, Typography, Alert, Chip, Stack, LinearProgress } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import { Title, useNotify, useRedirect, useRefresh } from 'react-admin';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { CREDIT_COSTS } from '../../components/CreditBadge';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

const MAX_BYTES = 32 * 1024 * 1024; // 32 MB por arquivo (limite do Claude)
const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

async function uploadOne(file: File | Blob, filename: string, pid: string | null, title?: string) {
  if (file.size > MAX_BYTES) throw Object.assign(new Error(`${filename} excede 32MB`), { tooBig: true });
  // Chrome mobile: FormData + File do <input> pode dar "failed to fetch". Lendo como
  // ArrayBuffer → criando um Blob NOVO (desacoplado do input) → Chrome lida corretamente.
  const buf = await file.arrayBuffer();
  const blob = new Blob([buf], { type: (file as File).type || 'application/octet-stream' });
  const fd = new FormData();
  fd.append('file', blob, filename);
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
      if (e?.tooBig || e?.code === 'free_limit') throw e;
      if (attempt < 3) {
        await new Promise((res) => setTimeout(res, 1500 * attempt));
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
      if (e?.code === 'free_limit' || e?.code === 'no_credits_upload') { notify(e.message || 'Sem créditos para enviar. Assine ou recarregue.', { type: 'warning' }); redirect('/planos'); return; }
      if (e?.message !== 'User cancelled photos app') notify(e.message || 'Falha na foto', { type: 'error' });
    }
  };

  // SCANNER de documento (ML Kit): captura automática, detecção de borda, correção de
  // perspectiva e filtro documento — a imagem chega LIMPA pro tesseract (OCR) → GLM.
  // Resulta em foto tão legível quanto PDF. Fallback pra câmera normal se indisponível.
  const scanDocument = async () => {
    try {
      const { DocumentScanner } = await import('@capacitor-mlkit/document-scanner');
      const result = await DocumentScanner.scanDocument({ galleryImportAllowed: true, pageLimit: 5, resultFormats: 'JPEG', scannerMode: 'FULL' });
      const imgs = result.scannedImages ?? [];
      if (!imgs.length) { notify('Nenhuma página capturada.', { type: 'info' }); return; }
      setBusy(true);
      setProgress({ done: 0, total: imgs.length, errors: [] });
      const errors: string[] = [];
      for (let i = 0; i < imgs.length; i++) {
        try {
          const blob = await (await fetch(imgs[i])).blob();
          const name = imgs.length > 1 ? (title || 'Exame escaneado') + ` (${i + 1}/${imgs.length})` : (title || 'Exame escaneado');
          await uploadOne(blob, `scan-${Date.now()}-${i + 1}.jpg`, pid, name);
          setProgress({ done: i + 1, total: imgs.length, errors });
        } catch (err: any) {
          if (err?.code === 'free_limit' || err?.code === 'no_credits_upload') { notify(err.message || 'Sem créditos para enviar.', { type: 'warning' }); redirect('/planos'); setBusy(false); return; }
          errors.push(`Página ${i + 1}: ${err.message}`);
          setProgress({ done: i + 1, total: imgs.length, errors });
        }
      }
      setBusy(false);
      if (errors.length === imgs.length) notify('Nenhum envio concluído.', { type: 'error' });
      else { notify(`${imgs.length - errors.length} de ${imgs.length} página(s) enviada(s) e extraindo.`, { type: 'success' }); refresh(); redirect('list', 'exams'); }
    } catch (e: any) {
      if (e?.message && /cancel/i.test(e.message)) return; // usuário cancelou o scanner
      // Scanner indisponível (módulo ML Kit ainda baixando, ou RAM < 1.7GB) → câmera normal
      notify('Scanner indisponível agora — usando a câmera normal. Tente o scanner novamente em instantes.', { type: 'info' });
      takePhoto();
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
        if (err?.code === 'free_limit' || err?.code === 'no_credits_upload') {
          notify(err.message || 'Sem créditos para enviar exame. Assine o mensal ou recarregue créditos.', { type: 'warning' });
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
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      <Title title="Enviar exames" />
      {/* Cabeçalho */}
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 2.5 }}>
        <Box sx={{ width: 46, height: 46, borderRadius: 2.5, background: 'linear-gradient(135deg,#20b2aa,#178f89)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 22px rgba(32,178,170,.30)' }}>
          <UploadFileIcon sx={{ color: '#fff' }} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>Enviar exames</Typography>
          <Typography variant="caption" color="text.secondary">PDF ou foto — a IA extrai os valores pra você.</Typography>
        </Box>
      </Stack>

      <Card sx={{ borderRadius: 4, border: '1px solid #e6f1f0', boxShadow: '0 12px 32px rgba(15,61,58,.07)' }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* DROPZONE — borda tracejada, vira teal quando tem arquivo */}
            <Box component="label" sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, textAlign: 'center',
              py: { xs: 3, sm: 3.75 }, px: 2, borderRadius: 3, cursor: 'pointer',
              border: '2px dashed', borderColor: files.length ? '#20b2aa' : '#bfe0dc',
              bgcolor: files.length ? 'rgba(32,178,170,.05)' : '#f6fbfa',
              transition: 'all .15s', '&:hover': { borderColor: '#20b2aa', bgcolor: 'rgba(32,178,170,.07)' },
            }}>
              <input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf" onChange={(e) => { onPick(e.target.files); if (e.target) e.target.value = ''; }} />
              <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: '#e0f2f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><UploadFileIcon sx={{ color: '#178f89', fontSize: 26 }} /></Box>
              <Box>
                <Typography sx={{ fontWeight: 700, color: '#0f3d3a' }}>{files.length ? `${files.length} arquivo(s) selecionado(s)` : 'Toque pra escolher PDF ou foto'}</Typography>
                <Typography variant="caption" color="text.secondary">Vários arquivos de uma vez · até 32 MB cada</Typography>
              </Box>
            </Box>

            {files.length > 0 && (
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {files.map((f, i) => (<Chip key={i} label={f.name} onDelete={() => setFiles(files.filter((_, j) => j !== i))} sx={{ borderRadius: 1.5, maxWidth: '100%' }} />))}
              </Stack>
            )}

            {isNative && (
              <>
                <Alert severity="success" icon={<DocumentScannerIcon />} sx={{ borderRadius: 2.5, alignItems: 'flex-start', '& .MuiAlert-message': { fontSize: 13.5 } }}>
                  <strong>Scanner inteligente</strong>: detecta as bordas do papel, corta o fundo, estica a foto (corrige perspectiva) e deixa o texto nítido — a IA lê tão bem quanto um PDF. Dica: boa iluminação, sem reflexo.
                </Alert>
                <Button variant="contained" size="large" startIcon={<DocumentScannerIcon />} onClick={scanDocument} disabled={busy} sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' }, borderRadius: 99, py: 1.2, textTransform: 'none', fontWeight: 800, bgcolor: '#0f3d3a', '&:hover': { bgcolor: '#0a2e2b' } }}>
                  📷 Escanear exame (câmera)
                </Button>
              </>
            )}

            <TextField label="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Hemograma — junho/2026" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />

            {progress && (
              <Box sx={{ bgcolor: '#f6fbfa', p: 1.5, borderRadius: 2.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f3d3a', mb: 0.5 }}>Enviando {progress.done}/{progress.total}…</Typography>
                <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 99, bgcolor: '#d6ece8', '& .MuiLinearProgress-bar': { borderRadius: 99 } }} />
                {progress.errors.map((er, i) => <Typography key={i} variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>⚠ {er}</Typography>)}
              </Box>
            )}

            <Button type="submit" variant="contained" size="large" disabled={busy || !files.length} sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' }, borderRadius: 99, py: 1.3, px: 4, textTransform: 'none', fontWeight: 800, fontSize: 15, bgcolor: '#20b2aa', boxShadow: '0 12px 26px rgba(32,178,170,.30)', '&:hover': { bgcolor: '#178f89' }, '&.Mui-disabled': { bgcolor: '#bfe0dc' } }}>
              {busy ? 'Enviando…' : `Enviar ${files.length || ''} e extrair com IA →`}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: { xs: 'center', sm: 'left' } }}>
              📤 <strong>1 crédito</strong> por envio (plano grátis) · <strong>Premium</strong>: 6 envios grátis/mês por perfil, depois 5 créditos.
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
