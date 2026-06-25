import { useState, useRef } from 'react';
import { Box, Card, CardContent, Button, TextField, Typography, Alert, Chip, Stack, LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
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
  // Duplicata detectada → dialog PROEMINENTE (não um toast fraco) pra o usuário entender que o doc já existe.
  const [dupInfo, setDupInfo] = useState<{ dups: string[]; elsewhere: string[]; sent: number } | null>(null);
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
      const res: any = await uploadOne(blob, `foto-${Date.now()}.jpg`, pid, title || 'Foto do exame');
      if (res?.duplicate) { refresh(); setDupInfo({ dups: ['Foto capturada'], elsewhere: [], sent: 0 }); return; }
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
      const dups: string[] = [];
      for (let i = 0; i < imgs.length; i++) {
        try {
          const blob = await (await fetch(imgs[i])).blob();
          const name = imgs.length > 1 ? (title || 'Exame escaneado') + ` (${i + 1}/${imgs.length})` : (title || 'Exame escaneado');
          const res: any = await uploadOne(blob, `scan-${Date.now()}-${i + 1}.jpg`, pid, name);
          if (res?.duplicate) dups.push(name);
          setProgress({ done: i + 1, total: imgs.length, errors });
        } catch (err: any) {
          if (err?.code === 'free_limit' || err?.code === 'no_credits_upload') { notify(err.message || 'Sem créditos para enviar.', { type: 'warning' }); redirect('/planos'); setBusy(false); return; }
          errors.push(`Página ${i + 1}: ${err.message}`);
          setProgress({ done: i + 1, total: imgs.length, errors });
        }
      }
      setBusy(false);
      if (errors.length === imgs.length) { notify('Nenhum envio concluído.', { type: 'error' }); return; }
      const sent = imgs.length - errors.length - dups.length;
      refresh();
      if (dups.length) setDupInfo({ dups, elsewhere: [], sent });
      else { notify(`${imgs.length - errors.length} de ${imgs.length} página(s) enviada(s) e extraindo.`, { type: 'success' }); redirect('list', 'exams'); }
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
    const dups: string[] = [];
    const elsewhere: string[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const res: any = await uploadOne(files[i], files[i].name, pid, title || files[i].name.replace(/\.pdf$/i, ''));
        if (res?.duplicate) dups.push(files[i].name);
        else if (res?.duplicateElsewhere) elsewhere.push(files[i].name);
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
    if (errors.length === files.length) { notify('Nenhum envio concluído.', { type: 'error' }); return; }
    const sent = files.length - errors.length - dups.length;
    refresh();
    if (dups.length || elsewhere.length) {
      // Duplicata → dialog "de cara" em vez do sucesso enganoso ("X enviados e extraindo"). Não redireciona.
      setDupInfo({ dups, elsewhere, sent });
    } else {
      notify(`${sent} de ${files.length} exame(s) enviado(s) e extraindo.`, { type: 'success' });
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
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>Escolha como quer enviar seu exame</Typography>

          <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 2 CAMINHOS — cards clicáveis (não competem, são MÉTODOS) */}
            <Stack direction="row" spacing={1.5} sx={{ flexWrap: { xs: 'nowrap', sm: 'nowrap' } }}>
              {/* Caminho 1: Escanear (só mobile nativo) */}
              {isNative && (
                <Box onClick={busy ? undefined : scanDocument} sx={{
                  flex: 1, cursor: busy ? 'wait' : 'pointer', borderRadius: 3, p: { xs: 2, sm: 2.5 }, textAlign: 'center',
                  border: '2px solid #e2e8f0', bgcolor: '#f8fafb', transition: 'all .15s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75,
                  '&:active': { transform: 'scale(.97)' }, '&:hover': { borderColor: '#20b2aa', bgcolor: 'rgba(32,178,170,.05)' },
                }}>
                  <Box sx={{ fontSize: 36 }}>📷</Box>
                  <Typography sx={{ fontWeight: 800, fontSize: 15, color: '#0f3d3a' }}>Escanear</Typography>
                  <Typography variant="caption" color="text.secondary">Digitalize com a câmera<br />bordas automáticas + nítido</Typography>
                </Box>
              )}
              {/* Caminho 2: PDF / Imagem */}
              <Box component="label" sx={{
                flex: 1, cursor: 'pointer', borderRadius: 3, p: { xs: 2, sm: 2.5 }, textAlign: 'center',
                border: '2px solid', borderColor: files.length ? '#20b2aa' : '#e2e8f0',
                bgcolor: files.length ? 'rgba(32,178,170,.05)' : '#f8fafb', transition: 'all .15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75,
                '&:active': { transform: 'scale(.97)' }, '&:hover': { borderColor: '#20b2aa', bgcolor: 'rgba(32,178,170,.05)' },
              }}>
                <input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf" onChange={(e) => { onPick(e.target.files); if (e.target) e.target.value = ''; }} />
                <Box sx={{ fontSize: 36 }}>📄</Box>
                <Typography sx={{ fontWeight: 800, fontSize: 15, color: '#0f3d3a' }}>{files.length ? `${files.length} arquivo(s)` : 'PDF / Imagem'}</Typography>
                <Typography variant="caption" color="text.secondary">Selecione da galeria<br />vários de uma vez · até 32 MB</Typography>
              </Box>
            </Stack>

            {/* Arquivos selecionados */}
            {files.length > 0 && (
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {files.map((f, i) => (<Chip key={i} label={f.name} onDelete={() => setFiles(files.filter((_, j) => j !== i))} sx={{ borderRadius: 1.5, maxWidth: '100%' }} />))}
              </Stack>
            )}

            <TextField label="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Hemograma — junho/2026" size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />

            {progress && (
              <Box sx={{ bgcolor: '#f6fbfa', p: 1.5, borderRadius: 2.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f3d3a', mb: 0.5 }}>Enviando {progress.done}/{progress.total}…</Typography>
                <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 99, bgcolor: '#d6ece8', '& .MuiLinearProgress-bar': { borderRadius: 99 } }} />
                {progress.errors.map((er, i) => <Typography key={i} variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>⚠ {er}</Typography>)}
              </Box>
            )}

            {/* ÚNICO botão primário — não compete com os caminhos */}
            <Button type="submit" variant="contained" size="large" fullWidth disabled={busy || !files.length} sx={{ borderRadius: 99, py: 1.3, textTransform: 'none', fontWeight: 800, fontSize: 15, bgcolor: '#20b2aa', boxShadow: '0 8px 22px rgba(32,178,170,.25)', '&:hover': { bgcolor: '#178f89' }, '&.Mui-disabled': { bgcolor: '#d6ece8' } }}>
              {busy ? 'Enviando…' : `Enviar ${files.length || ''} e extrair com IA →`}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
              📤 <strong>1 crédito</strong> por envio (grátis) · <strong>Premium</strong>: 6 envios grátis/mês
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* DUPLICATA — aviso PROEMINENTE "de cara": o documento já existe no histórico. */}
      <Dialog open={!!dupInfo} onClose={() => { setDupInfo(null); redirect('list', 'exams'); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 800, color: '#0f3d3a' }}>📄 Documento já enviado</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 2 }}>
            {(dupInfo?.dups.length ?? 0) === 1
              ? 'Este arquivo já está no seu histórico (conteúdo idêntico) e não foi adicionado de novo.'
              : `${dupInfo?.dups.length ?? 0} arquivos já estão no seu histórico (conteúdo idêntico) e não foram adicionados de novo.`}
          </Alert>
          {(dupInfo?.dups ?? []).map((n, i) => <Typography key={i} variant="body2" sx={{ wordBreak: 'break-all', pl: 1 }}>• {n}</Typography>)}
          {dupInfo?.elsewhere.length ? <Alert severity="info" sx={{ mt: 1.5, borderRadius: 2 }}>Esse mesmo arquivo também está em outro perfil seu.</Alert> : null}
          <Typography variant="body2" sx={{ mt: 1.75, fontWeight: 600 }}>
            {dupInfo && dupInfo.sent > 0 ? `✅ ${dupInfo.sent} exame(s) novo(s) enviado(s) e extraindo.` : 'Nenhum exame novo foi adicionado.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2.5, gap: 1 }}>
          <Button onClick={() => { setDupInfo(null); redirect('list', 'exams'); }} variant="contained" sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700, bgcolor: '#178f89' }}>Ver meus exames</Button>
          <Button onClick={() => setDupInfo(null)} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700 }}>Enviar outro</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
