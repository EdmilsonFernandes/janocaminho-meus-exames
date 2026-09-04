import { useState, useRef, useEffect } from 'react';
import { Box, Card, CardContent, Button, TextField, Typography, Alert, Chip, Stack, LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions, Checkbox, FormControlLabel, Link as MuiLink } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import { Title, useNotify, useRedirect, useRefresh, useLogout } from 'react-admin';
import { API_URL, token, fetchPublicConfig } from '../../config';
import { confirmDialog } from '../../components/ConfirmDialog';
import { useSelectedPatient } from '../../patient-context';
import { CREDIT_COSTS } from '../../components/CreditBadge';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

const MAX_BYTES = 32 * 1024 * 1024; // 32 MB por arquivo (limite do Claude)
const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
// Scanner ML Kit é plugin GOOGLE (Android-only). No iOS o botão "Escanear" não existe —
// o caminho "PDF ou foto" (input file) cobre e a câmera do sistema faz a foto.
const isAndroid = isNative && Capacitor.getPlatform() === 'android';
const UPLOAD_CONSENT_KEY = 'meus_exames_upload_disclosure_v1';

async function uploadOne(file: File | Blob, filename: string, pid: string | null, title?: string) {
  if (file.size > MAX_BYTES) throw Object.assign(new Error(`${filename} excede 32MB`), { tooBig: true });
  // SEM token = sessão já expirou (limpa no boot/401 anterior). Não tenta enviar (seria 401
  // de novo): sinaliza authExpired pra UI deslogar e pedir re-login, em vez de "Falha no envio".
  if (!token()) throw Object.assign(new Error('Sua sessão expirou. Faça login novamente.'), { authExpired: true });
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
      // 401 = sessão expirada. Token JWT expirado NÃO se cura com retry → para imediatamente e
      // sinaliza authExpired (UI desloga + mensagem clara). Antes ficava preso em 3 retries
      // inúteis mostrando "Token inválido ou expirado" enterrado no erro do upload.
      if (r.status === 401) {
        const e = await r.json().catch(() => ({}));
        throw Object.assign(new Error(e.message || e.error || 'Sua sessão expirou. Faça login novamente.'), { authExpired: true });
      }
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        const err: any = new Error(e.message || e.error || 'Falha no envio');
        err.code = e.error;
        throw err;
      }
      return r.json();
    } catch (e: any) {
      lastErr = e;
      if (e?.tooBig || e?.code === 'free_limit' || e?.authExpired) throw e;
      if (attempt < 3) {
        await new Promise((res) => setTimeout(res, 1500 * attempt));
      }
    }
  }
  throw lastErr ?? new Error('Falha no envio após 3 tentativas. Verifique sua conexão.');
}

// O scanner (ML Kit) devolve scannedImages como URI de arquivo (file:/// ou content://).
// O fetch() do WebView do Capacitor NÃO lê file:// → "Failed to fetch" imediato (nem chega no back).
// convertFileSrc troca por URL servida pelo Capacitor (https://localhost/_capacitor_file_/...);
// fallback Filesystem.readFile p/ content://. (A câmera usa DataUrl → fetch direto funciona.)
async function fetchScannedBlob(uri: string): Promise<Blob> {
  if (uri.startsWith('data:')) return (await fetch(uri)).blob();
  try {
    return await (await fetch(Capacitor.convertFileSrc(uri))).blob();
  } catch {
    const { Filesystem } = await import('@capacitor/filesystem');
    const r = await Filesystem.readFile({ path: uri });
    const b64 = typeof r.data === 'string' ? r.data : '';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: 'image/jpeg' });
  }
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
  const [uploadConsentAccepted, setUploadConsentAccepted] = useState(() => {
    try { return localStorage.getItem(UPLOAD_CONSENT_KEY) === 'accepted'; } catch { return false; }
  });
  const [consentOpen, setConsentOpen] = useState(() => {
    try { return localStorage.getItem(UPLOAD_CONSENT_KEY) !== 'accepted'; } catch { return true; }
  });
  const [consentChecked, setConsentChecked] = useState(false);
  // Duplicata detectada → dialog PROEMINENTE (não um toast fraco) pra o usuário entender que o doc já existe.
  const [dupInfo, setDupInfo] = useState<{ dups: string[]; elsewhere: string[]; sent: number } | null>(null);
  // Banner de 1º exame: mostra só se o user ainda NÃO tem nenhum exame (incentivo p/ o upload +
  // o bônus de créditos). bonus vem do /public/config (freeSignup) → sempre bate c/ o server.
  const [isFirstExam, setIsFirstExam] = useState<boolean | null>(null);
  const [firstBonus, setFirstBonus] = useState(45);
  const notify = useNotify();
  const redirect = useRedirect();
  const refresh = useRefresh();
  const logout = useLogout();

  useEffect(() => {
    fetchPublicConfig().then((c) => setFirstBonus(c.freeSignup)).catch(() => {});
    // Banner só pra quem NUNCA teve 1º exame: examCount===0 E ainda não recebeu o bônus.
    // Assim o user que extraiu, deletou tudo e volta NÃO vê a msg de novo (bônus já foi, 1x só).
    Promise.all([
      fetch(`${API_URL}/exams?_start=0&_end=1`, { headers: { Authorization: `Bearer ${token()}` } }).then((r) => (r.ok ? r.json() : [])).then((rows: any[]) => Array.isArray(rows) ? rows.length : 0).catch(() => -1),
      fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token()}` } }).then((r) => (r.ok ? r.json() : null)).then((d: any) => d?.user?.firstExamBonusGranted === true).catch(() => false),
    ]).then(([count, granted]) => {
      if (count < 0) { setIsFirstExam(null); return; }
      setIsFirstExam(count === 0 && !granted);
    });
  }, []);

  const ensureUploadConsent = () => {
    if (uploadConsentAccepted) return true;
    setConsentOpen(true);
    return false;
  };

  const acceptUploadConsent = () => {
    try { localStorage.setItem(UPLOAD_CONSENT_KEY, 'accepted'); } catch { /* localStorage indisponível */ }
    setUploadConsentAccepted(true);
    setConsentOpen(false);
  };

  const onPick = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    const tooBig = arr.filter((f) => f.size > MAX_BYTES).map((f) => f.name);
    const ok = arr.filter((f) => f.size <= MAX_BYTES);
    setFiles((prev) => [...prev, ...ok]);
    if (tooBig.length) notify(`${tooBig.length} arquivo(s) acima de 32MB foram ignorados.`, { type: 'warning' });
  };

  const takePhoto = async () => {
    if (!ensureUploadConsent()) return;
    try {
      const photo = await Camera.getPhoto({ quality: 92, resultType: CameraResultType.DataUrl, source: CameraSource.Camera, correctOrientation: true, saveToGallery: false });
      const blob = await (await fetch(photo.dataUrl!)).blob();
      const res: any = await uploadOne(blob, `foto-${Date.now()}.jpg`, pid, title || 'Foto do exame');
      if (res?.duplicate) { refresh(); setDupInfo({ dups: ['Foto capturada'], elsewhere: [], sent: 0 }); return; }
      notify('Foto enviada! Extraindo…', { type: 'success' });
      redirect('list', 'exams');
    } catch (e: any) {
      if (e?.authExpired) { notify(e.message || 'Sua sessão expirou. Faça login novamente.', { type: 'warning' }); logout(); return; }
      if (e?.code === 'free_limit' || e?.code === 'no_credits_upload') { notify(e.message || 'Sem créditos para enviar. Assine ou recarregue.', { type: 'warning' }); redirect('/planos'); return; }
      if (e?.message !== 'User cancelled photos app') notify(e.message || 'Falha na foto', { type: 'error' });
    }
  };

  // SCANNER de documento (ML Kit): captura automática, detecção de borda, correção de
  // perspectiva e filtro documento — a imagem chega LIMPA pro tesseract (OCR) → GLM.
  // Resulta em foto tão legível quanto PDF. Fallback pra câmera normal se indisponível.
  const scanDocument = async () => {
    if (!ensureUploadConsent()) return;
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
          const blob = await fetchScannedBlob(imgs[i]);
          const name = imgs.length > 1 ? (title || 'Exame escaneado') + ` (${i + 1}/${imgs.length})` : (title || 'Exame escaneado');
          const res: any = await uploadOne(blob, `scan-${Date.now()}-${i + 1}.jpg`, pid, name);
          if (res?.duplicate) dups.push(name);
          setProgress({ done: i + 1, total: imgs.length, errors });
        } catch (err: any) {
          if (err?.authExpired) { notify(err.message || 'Sua sessão expirou. Faça login novamente.', { type: 'warning' }); logout(); setBusy(false); return; }
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
      notify('Scanner indisponível agora. Usando a câmera normal. Tente o scanner novamente em instantes.', { type: 'info' });
      takePhoto();
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length) { notify('Selecione ao menos um arquivo.', { type: 'error' }); return; }
    if (!ensureUploadConsent()) return;
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
      if (suspicious && !(await confirmDialog({ title: 'Exame duplicado?', message: 'Parece que você já enviou um exame com nome parecido pra este perfil. Quer enviar mesmo assim?', confirmLabel: 'Enviar', tone: 'warning' }))) return;
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
        if (err?.authExpired) {
          notify(err.message || 'Sua sessão expirou. Faça login novamente.', { type: 'warning' });
          logout();
          setBusy(false);
          return;
        }
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
    <Box sx={{ maxWidth: 600, mx: 'auto', pb: { xs: 10, sm: 5 }, px: { xs: 1, sm: 0 } }}>
      <Title title="Enviar exames" />
      {/* Cabeçalho */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2.5 }}>
        <Box sx={{ width: 48, height: 48, borderRadius: '16px', background: 'linear-gradient(135deg,#20b2aa,#178f89)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 24px rgba(32,178,170,.35)', flexShrink: 0 }}>
          <UploadFileIcon sx={{ color: '#fff', fontSize: 26 }} />
        </Box>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2, fontFamily: 'Poppins, sans-serif' }}>Enviar exames</Typography>
          <Typography variant="body2" color="text.secondary">PDF ou foto: a IA extrai os valores para você.</Typography>
        </Box>
      </Stack>

      {/* BÔNUS DE 1º EXAME */}
      {isFirstExam === true && (
        <Alert
          icon={false}
          sx={{
            mb: 2.5, borderRadius: '16px', p: { xs: 1.5, sm: 2 }, alignItems: 'center',
            bgcolor: 'rgba(32,178,170,.09)', border: '1px solid rgba(32,178,170,.30)',
            '& .MuiAlert-message': { width: '100%' },
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ fontSize: 32, lineHeight: 1 }}>🎁</Box>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 800, color: 'text.primary', fontSize: { xs: 15, sm: 16 }, lineHeight: 1.25, fontFamily: 'Poppins, sans-serif' }}>
                Envie seu primeiro exame e ganhe <Box component="span" sx={{ color: '#178f89' }}>{firstBonus} créditos</Box>!
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                Use para conversar com a IA sobre seu exame, gerar relatório e tirar dúvidas com o médico. É de graça: só enviar o PDF. ✨
              </Typography>
            </Box>
          </Stack>
        </Alert>
      )}

      <Card sx={{ borderRadius: '16px', border: '1px solid rgba(32,178,170,0.25)', boxShadow: '0 16px 40px rgba(32,178,170,.12)', bgcolor: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(20px)' }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, textAlign: 'center', fontWeight: 600 }}>Escolha como quer enviar seu exame</Typography>

          <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* 2 CAMINHOS — Escanear (recomendado, mobile) + PDF/galeria. */}
            <Stack direction="row" spacing={2} sx={{ flexWrap: { xs: 'nowrap', sm: 'nowrap' } }}>
              {/* Caminho 1: Escanear */}
              {isAndroid && (
                <Box onClick={busy ? undefined : scanDocument} sx={{
                  flex: 1, cursor: busy ? 'wait' : 'pointer', borderRadius: '16px', p: { xs: 2, sm: 2.5 }, textAlign: 'center',
                  border: '2px solid #20b2aa', bgcolor: 'rgba(32,178,170,.08)', transition: 'all .2s ease', position: 'relative',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75,
                  '&:active': { transform: 'scale(.97)' }, '&:hover': { bgcolor: 'rgba(32,178,170,.15)', boxShadow: '0 8px 24px rgba(32,178,170,0.18)' },
                }}>
                  <Box sx={{ position: 'absolute', top: 8, right: 8, fontSize: 10, fontWeight: 800, color: '#fff', bgcolor: '#20b2aa', px: 0.8, py: 0.2, borderRadius: '999px', letterSpacing: '0.04em' }}>RECOMENDADO</Box>
                  <Box sx={{ fontSize: 38 }}>📷</Box>
                  <Typography sx={{ fontWeight: 800, fontSize: 15, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>Escanear</Typography>
                  <Typography variant="caption" color="text.secondary">A câmera ajusta borda,<br />luz e nitidez pra você ✨</Typography>
                </Box>
              )}
              {/* Caminho 2: PDF (leitura perfeita) ou foto da galeria */}
              <Box component="label" sx={{
                flex: 1, cursor: 'pointer', borderRadius: '16px', p: { xs: 2.5, sm: 3 }, textAlign: 'center',
                border: files.length ? '2px solid #20b2aa' : '2px dashed rgba(32,178,170,0.35)',
                bgcolor: files.length ? 'rgba(32,178,170,.08)' : 'rgba(32,178,170,.03)', transition: 'all .2s ease',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                '&:active': { transform: 'scale(.97)' }, '&:hover': { borderColor: '#20b2aa', bgcolor: 'rgba(32,178,170,.08)', boxShadow: '0 8px 24px rgba(32,178,170,0.12)' },
              }} onClick={(e) => { if (!ensureUploadConsent()) e.preventDefault(); }}>
                <input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf" onChange={(e) => { onPick(e.target.files); if (e.target) e.target.value = ''; }} />
                <Box sx={{ fontSize: 40 }}>📄</Box>
                <Typography sx={{ fontWeight: 800, fontSize: 16, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>{files.length ? `${files.length} arquivo(s) selecionado(s)` : 'PDF ou foto'}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>PDF tem leitura perfeita ·<br />foto da galeria: várias de uma vez</Typography>
              </Box>
            </Stack>

            {/* Dica amigável */}
            <Box sx={{ px: 2, py: 1.25, borderRadius: '16px', bgcolor: 'rgba(32,178,170,.06)', border: '1px solid', borderColor: 'rgba(32,178,170,.22)' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.5, display: 'block' }}>
                💡 <strong>Para o Dr. Exame ler perfeitamente:</strong> use <strong>Escanear</strong> (ajusta a foto pra você) ou envie um <strong>PDF</strong>. Evite fotos escuras ou desfocadas.
              </Typography>
            </Box>

            {/* Arquivos selecionados */}
            {files.length > 0 && (
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {files.map((f, i) => (<Chip key={i} label={f.name} onDelete={() => setFiles(files.filter((_, j) => j !== i))} sx={{ borderRadius: '8px', maxWidth: '100%', fontWeight: 600 }} />))}
              </Stack>
            )}

            <TextField label="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Hemograma - junho/2026" size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }} />

            {progress && (
              <Box sx={{ bgcolor: 'background.default', p: 2, borderRadius: '16px' }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.75 }}>Enviando {progress.done}/{progress.total}…</Typography>
                <LinearProgress variant="determinate" value={pct} sx={{ height: 10, borderRadius: '999px', bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { borderRadius: '999px', bgcolor: '#20b2aa' } }} />
                {progress.errors.map((er, i) => <Typography key={i} variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>⚠ {er}</Typography>)}
              </Box>
            )}

            {/* ÚNICO botão primário */}
            <Button type="submit" variant="contained" size="large" fullWidth disabled={busy || !files.length} sx={{ borderRadius: '999px', py: 1.5, textTransform: 'none', fontWeight: 800, fontSize: 16, bgcolor: '#20b2aa', color: '#ffffff', boxShadow: '0 10px 28px rgba(32,178,170,.35)', '&:hover': { bgcolor: '#178f89' }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'text.disabled' } }}>
              {busy ? 'Enviando…' : `Enviar ${files.length ? files.length + ' arquivo(s)' : ''} e extrair com IA →`}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', mt: 0.5, fontWeight: 600 }}>
              📤 <strong>1 crédito</strong> por envio (grátis) · <strong>Premium</strong>: 6 envios grátis/mês
            </Typography>
          </Box>
        </CardContent>
      </Card>

      <Dialog open={consentOpen} onClose={() => setConsentOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: 'text.primary' }}>Antes de enviar seu exame</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2, borderRadius: '12px' }}>
            O Meus Exames usa PDF, foto ou câmera para extrair dados de saúde e gerar uma análise educativa com IA.
          </Alert>
          <Stack spacing={1.25} sx={{ mb: 2 }}>
            {[
              'O arquivo enviado e os valores extraídos ficam na sua conta e podem ser processados no servidor do Meus Exames.',
              'A IA pode receber o conteúdo necessário para extrair e explicar seus exames. Não usamos seus exames para treinar modelos.',
              'A análise é educativa: não diagnostica, não prescreve e não substitui consulta médica.',
              'Você pode apagar exames, exportar seus dados e excluir sua conta pelo Perfil.',
            ].map((text, i) => (
              <Stack key={i} direction="row" spacing={1.25} alignItems="flex-start">
                <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: 'rgba(32,178,170,.12)', color: '#178f89', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, mt: 0.15 }}>{i + 1}</Box>
                <Typography variant="body2" sx={{ lineHeight: 1.55 }}>{text}</Typography>
              </Stack>
            ))}
          </Stack>
          <FormControlLabel
            control={<Checkbox checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} color="primary" />}
            label={<Typography variant="body2">Li e entendi este aviso. Concordo em enviar meus exames para processamento.</Typography>}
            sx={{ alignItems: 'flex-start', m: 0 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Detalhes completos em <MuiLink href="#/termos" target="_blank" rel="noopener">Termos e Política de Privacidade</MuiLink>.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConsentOpen(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>Agora não</Button>
          <Button onClick={acceptUploadConsent} disabled={!consentChecked} variant="contained" sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: '#20b2aa', '&:hover': { bgcolor: '#178f89' } }}>
            Entendi e aceito
          </Button>
        </DialogActions>
      </Dialog>

      {/* DUPLICATA — aviso PROEMINENTE "de cara": o documento já existe no histórico. */}
      <Dialog open={!!dupInfo} onClose={() => { setDupInfo(null); redirect('list', 'exams'); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 800, color: 'text.primary' }}>📄 Documento já enviado</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 1.5, borderRadius: '12px' }}>
            {(dupInfo?.dups.length ?? 0) === 1
              ? 'Este arquivo já está no seu histórico (conteúdo idêntico) e não foi adicionado de novo.'
              : `${dupInfo?.dups.length ?? 0} arquivos já estão no seu histórico (conteúdo idêntico) e não foram adicionados de novo.`}
          </Alert>
          {(dupInfo?.dups ?? []).map((n, i) => <Typography key={i} variant="body2" sx={{ wordBreak: 'break-all', pl: 1 }}>• {n}</Typography>)}
          {dupInfo?.elsewhere.length ? <Alert severity="info" sx={{ mt: 1.5, borderRadius: '12px' }}>Esse mesmo arquivo também está em outro perfil seu.</Alert> : null}
          <Typography variant="body2" sx={{ mt: 1.75, fontWeight: 600 }}>
            {dupInfo && dupInfo.sent > 0 ? `✅ ${dupInfo.sent} exame(s) novo(s) enviado(s) e extraindo.` : 'Nenhum exame novo foi adicionado.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2.5, gap: 1 }}>
          <Button onClick={() => { setDupInfo(null); redirect('list', 'exams'); }} variant="contained" sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: '#178f89' }}>Ver meus exames</Button>
          <Button onClick={() => setDupInfo(null)} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Enviar outro</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
