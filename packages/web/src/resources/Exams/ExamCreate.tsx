import { useState, useRef, useEffect } from 'react';
import { plural } from '../../utils/format';
import { Box, Card, CardContent, Button, TextField, Typography, Alert, Chip, Stack, LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions, Checkbox, FormControlLabel, Link as MuiLink, IconButton } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import EmailIcon from '@mui/icons-material/Email';
import ForwardToInboxIcon from '@mui/icons-material/ForwardToInbox';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import RedeemIcon from '@mui/icons-material/Redeem';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Title, useNotify, useRedirect, useRefresh, useLogout } from 'react-admin';
import { API_URL, token, fetchPublicConfig } from '../../config';
import { confirmDialog } from '../../components/ConfirmDialog';
import { useSelectedPatient } from '../../patient-context';
import { CREDIT_COSTS } from '../../components/CreditBadge';
import { takeExamFiles } from '../../utils/examHandoff';
import { usePlanInfo } from '../../utils/planInfo';
import { notifyInsufficientCredits } from '../../utils/credits-events';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { RADIUS } from '../../theme';

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

/** Preview do arquivo selecionado (wizard etapa 1): imagem vira miniatura real;
 *  PDF vira tile de documento. O usuário CONFIRMA que é o arquivo certo antes de
 *  avançar — X remove/troca. */
const FilePreview = ({ file, onRemove }: { file: File; onRemove: () => void }) => {
  const isImg = file.type.startsWith('image/');
  const [url] = useState<string | null>(() => (isImg ? URL.createObjectURL(file) : null));
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return (
    <Box sx={{ position: 'relative', p: 1.25, borderRadius: RADIUS.card, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', width: { xs: '100%', sm: 210 } }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        {/* ReUI file-type (dono 30/10): tile TIPADO — PDF vermelho com selo de extensão,
            imagem mostra a miniatura real. O usuário bate o olho e sabe o que vai subir. */}
        <Box sx={{
          position: 'relative', width: 52, height: 52, borderRadius: RADIUS.button, overflow: 'hidden', flexShrink: 0,
          bgcolor: isImg ? 'rgba(32,178,170,.10)' : 'rgba(220,38,38,.08)', display: 'grid', placeItems: 'center',
          boxShadow: `inset 0 0 0 1px ${isImg ? 'rgba(32,178,170,.25)' : 'rgba(220,38,38,.22)'}`,
        }}>
          {url ? (
            <Box component="img" src={url} alt={`Preview de ${file.name}`} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <DescriptionOutlinedIcon sx={{ fontSize: 26, color: isImg ? '#178f89' : '#dc2626' }} />
          )}
          {!isImg && (
            <Box aria-hidden sx={{ position: 'absolute', bottom: 2, right: 2, px: 0.5, py: '1px', borderRadius: '6px', bgcolor: '#dc2626', color: '#fff', fontSize: 8.5, fontWeight: 800, letterSpacing: '.04em', lineHeight: 1.4 }}>
              {(file.name.split('.').pop() || 'PDF').toUpperCase().slice(0, 4)}
            </Box>
          )}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {file.type.startsWith('image/') ? 'imagem' : 'PDF'} · {Math.max(1, Math.round(file.size / 1024))} KB · pronto ✓
          </Typography>
        </Box>
      </Stack>
      <IconButton
        size="small"
        onClick={onRemove}
        aria-label={`Remover ${file.name}`}
        sx={{ position: 'absolute', top: -10, right: -10, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 3px 10px rgba(0,0,0,.12)', '&:hover': { bgcolor: 'action.hover' } }}
      >
        <CloseIcon sx={{ fontSize: 15 }} />
      </IconButton>
    </Box>
  );
};

export const ExamCreate = () => {
  const [pid] = useSelectedPatient();
  const planInfo = usePlanInfo(); // custos vivos (uploadRules) — fim do "enviar é grátis" hardcode
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
  // Escape "não tenho o PDF agora": 1 clique → registra adiamento + lembrete por e-mail.
  const [deferDone, setDeferDone] = useState(false);
  const [deferLoading, setDeferLoading] = useState(false);
  // Envio por E-MAIL (R2): código pessoal + endereço da caixa (busca sob demanda ao expandir).
  const [emailInfo, setEmailInfo] = useState<{ code: string; inbox: string; enabled?: boolean } | null>(null);
  const [method, setMethod] = useState<'upload' | 'email'>('upload');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Erro "de verdade" (todos os envios falharam): card amigável c/ tentar de novo,
  // não toast que some antes de ser lido.
  const [hardError, setHardError] = useState<string | null>(null);
  const notify = useNotify();
  const redirect = useRedirect();
  const refresh = useRefresh();
  const logout = useLogout();

  useEffect(() => {
    // Handoff do first-exam flow: arquivo(s) arrastado(s) no dashboard chegam aqui.
    const stashed = takeExamFiles();
    if (stashed.length) {
      const tooBig = stashed.filter((f) => f.size > MAX_BYTES);
      const ok = stashed.filter((f) => f.size <= MAX_BYTES);
      if (ok.length) setFiles((prev) => [...prev, ...ok]);
      if (tooBig.length) notify(`${tooBig.length} arquivo(s) acima de 32MB foram ignorados.`, { type: 'warning' });
    }
    fetchPublicConfig().then((c) => setFirstBonus(c.freeSignup)).catch(() => {});
    // Código de envio por e-mail no MOUNT: define se o card existe (enabled) e já
    // deixa o código pronto pro copiar (sem fetch na hora do clique).
    fetch(`${API_URL}/exams/email-upload-code${pid ? `?patientId=${pid}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.code) setEmailInfo({ code: d.code, inbox: d.inbox, enabled: !!d.enabled }); })
      .catch(() => {});
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

  const deferFirst = async () => {
    if (deferLoading || deferDone) return;
    setDeferLoading(true);
    try {
      const r = await fetch(`${API_URL}/exams/defer-first`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) throw new Error();
      setDeferDone(true);
      notify('Sem pressa! Enviamos um lembrete pro seu e-mail — o Dr. Exame espera você. 💚', { type: 'success' });
      setTimeout(() => redirect('/'), 1400);
    } catch {
      notify('Não deu pra agendar o lembrete agora — pode tentar de novo.', { type: 'warning' });
    }
    setDeferLoading(false);
  };

  const copy = (text: string, label: string, key?: string) => {
    try {
      navigator.clipboard.writeText(text);
      if (key) {
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2200);
      }
      notify(`${label} copiado!`, { type: 'success' });
    } catch {
      notify('Não deu pra copiar — anote aí 😅', { type: 'warning' });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!ensureUploadConsent()) return;
    if (e.dataTransfer?.files?.length) {
      onPick(e.dataTransfer.files);
    }
  };

  const mailtoHref = emailInfo
    ? `mailto:${emailInfo.inbox}?subject=${encodeURIComponent(emailInfo.code)}&body=${encodeURIComponent(
        `Olá Dr. Exame,\n\nSegue em anexo o arquivo do meu exame médico para extração e análise inteligente.\n\nCódigo de importação: ${emailInfo.code}`
      )}`
    : 'mailto:contato@janocaminho.com.br';

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
      // 402 de upload abre o MESMO dialog de oferta das features de IA (pack mais barato em
      // 1 toque) — antes era toast + redirect seco pro /planos, sem oferta contextual.
      if (e?.code === 'free_limit' || e?.code === 'no_credits_upload') { notifyInsufficientCredits({ message: e.message, feature: 'UPLOAD' }); return; }
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
          if (err?.code === 'free_limit' || err?.code === 'no_credits_upload') { notifyInsufficientCredits({ message: err.message, feature: 'UPLOAD' }); setBusy(false); return; }
          errors.push(`Página ${i + 1}: ${err.message}`);
          setProgress({ done: i + 1, total: imgs.length, errors });
        }
      }
      setBusy(false);
      if (errors.length === imgs.length) { setHardError(errors[0] || 'Nenhum envio concluído. Verifique sua conexão e tente de novo.'); notify('Não deu pra enviar — veja o aviso abaixo.', { type: 'error' }); return; }
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
    setHardError(null);
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
          notifyInsufficientCredits({ message: err.message, feature: 'UPLOAD' });
          setBusy(false);
          return;
        }
        errors.push(`${files[i].name}: ${err.message}`);
        setProgress({ done: i + 1, total: files.length, errors });
      }
    }
    setBusy(false);
    if (errors.length === files.length) {
      setHardError(errors[0] || 'Nenhum envio concluído. Verifique sua conexão e tente de novo.');
      notify('Não deu pra enviar — veja o aviso abaixo.', { type: 'error' });
      return;
    }
    const sent = files.length - errors.length - dups.length;
    refresh();
    if (dups.length || elsewhere.length) {
      // Duplicata → dialog "de cara" em vez do sucesso enganoso ("X enviados e extraindo"). Não redireciona.
      setDupInfo({ dups, elsewhere, sent });
    } else {
      notify(`${sent} de ${plural(files.length, 'exame')} enviados e extraindo.`, { type: 'success' });
      redirect('list', 'exams');
    }
  };

  const pct = progress ? (progress.done / progress.total) * 100 : 0;

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', pb: { xs: 10, sm: 6 }, px: { xs: 1.5, sm: 0 } }}>
      <Title title="Enviar exames" />

      {/* Cabeçalho de Página */}
      <Stack direction="row" alignItems="center" spacing={1.75} sx={{ mb: 2.5 }}>
        <Box sx={{
          width: 52,
          height: 52,
          borderRadius: RADIUS.card,
          background: 'linear-gradient(135deg,#20b2aa,#178f89)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 24px rgba(32,178,170,.35)',
          flexShrink: 0,
        }}>
          <UploadFileIcon sx={{ color: '#fff', fontSize: 28 }} />
        </Box>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2, fontFamily: 'Poppins, sans-serif' }}>
            Enviar exames
          </Typography>
          <Typography variant="body2" color="text.secondary">
            PDF, foto ou e-mail: a IA lê e extrai os valores para você.
          </Typography>
        </Box>
      </Stack>

      {/* ESCAPE HONESTO: quem não tem o PDF em mãos no 1º acesso */}
      {isFirstExam === true && !deferDone && (
        <Box
          component="button"
          onClick={deferFirst}
          sx={{
            display: 'flex',
            width: '100%',
            mb: 2,
            px: 2,
            py: 1.25,
            gap: 1.25,
            alignItems: 'center',
            borderRadius: RADIUS.button,
            cursor: 'pointer',
            textAlign: 'left',
            bgcolor: 'action.hover',
            border: '1px dashed',
            borderColor: 'divider',
            color: 'text.secondary',
            transition: 'all .15s ease',
            '&:hover': { bgcolor: 'action.selected', borderColor: 'rgba(32,178,170,.5)' },
          }}
        >
          <ChatBubbleOutlineIcon sx={{ fontSize: 22, color: 'primary.main', flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>
              Não tem seu exame em mãos agora?
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              Sem problema — {deferLoading ? 'agendando…' : 'a gente te lembra por e-mail quando quiser voltar'}.
            </Typography>
          </Box>
        </Box>
      )}

      {/* BÔNUS DE 1º EXAME */}
      {isFirstExam === true && (
        <Alert
          icon={false}
          sx={{
            mb: 2.5,
            borderRadius: RADIUS.card,
            p: { xs: 1.75, sm: 2 },
            alignItems: 'center',
            bgcolor: 'rgba(32,178,170,.09)',
            border: '1px solid rgba(32,178,170,.30)',
            '& .MuiAlert-message': { width: '100%' },
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <RedeemIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 800, color: 'text.primary', fontSize: { xs: 15, sm: 16 }, lineHeight: 1.25, fontFamily: 'Poppins, sans-serif' }}>
                Envie seu primeiro exame e ganhe <Box component="span" sx={{ color: '#178f89' }}>{Math.max(1, Math.floor(firstBonus / 10))} leituras grátis</Box>!
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                Use para conversar com a IA sobre seu exame, gerar relatório e tirar dúvidas com o médico. É de graça: só enviar o laudo. ✨
              </Typography>
            </Box>
          </Stack>
        </Alert>
      )}

      {/* SELETOR SEGMENTADO DE MÉTODOS (Apple / Linear style) */}
      <Box sx={{
        display: 'flex',
        p: 0.5,
        borderRadius: RADIUS.card,
        bgcolor: 'action.hover',
        mb: 2.5,
        border: '1px solid',
        borderColor: 'divider',
      }}>
        <Button
          onClick={() => setMethod('upload')}
          sx={{
            flex: 1,
            py: 1.1,
            borderRadius: RADIUS.button,
            fontWeight: 700,
            fontSize: { xs: 13, sm: 14 },
            textTransform: 'none',
            color: method === 'upload' ? 'text.primary' : 'text.secondary',
            bgcolor: method === 'upload' ? 'background.paper' : 'transparent',
            boxShadow: method === 'upload' ? '0 4px 14px rgba(0,0,0,0.08)' : 'none',
            transition: 'all .2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.85,
            '&:hover': {
              bgcolor: method === 'upload' ? 'background.paper' : 'action.selected',
            },
          }}
        >
          <UploadFileIcon sx={{ fontSize: 19, color: method === 'upload' ? '#20b2aa' : 'inherit' }} />
          <span>Arquivo ou Foto</span>
        </Button>

        <Button
          onClick={() => setMethod('email')}
          sx={{
            flex: 1,
            py: 1.1,
            borderRadius: RADIUS.button,
            fontWeight: 700,
            fontSize: { xs: 12.5, sm: 14 },
            textTransform: 'none',
            color: method === 'email' ? 'text.primary' : 'text.secondary',
            bgcolor: method === 'email' ? 'background.paper' : 'transparent',
            boxShadow: method === 'email' ? '0 4px 14px rgba(0,0,0,0.08)' : 'none',
            transition: 'all .2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.6,
            minWidth: 0,
            '&:hover': {
              bgcolor: method === 'email' ? 'background.paper' : 'action.selected',
            },
          }}
        >
          <EmailIcon sx={{ fontSize: 18, color: method === 'email' ? '#20b2aa' : 'inherit', flexShrink: 0 }} />
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Encaminhar por E-mail</Box>
          <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Via E-mail</Box>
          <Box sx={{
            fontSize: 12,
            fontWeight: 800,
            bgcolor: method === 'email' ? 'rgba(32,178,170,.18)' : 'rgba(32,178,170,.12)',
            color: '#178f89',
            px: 0.75,
            py: 0.2,
            borderRadius: RADIUS.pill,
            display: { xs: 'none', sm: 'inline-flex' },
            letterSpacing: '0.02em',
            flexShrink: 0,
          }}>
            PRÁTICO
          </Box>
        </Button>
      </Box>

      {/* ABA 1: ENVIAR ARQUIVO / FOTO */}
      {method === 'upload' && (
        <Card sx={{
          borderRadius: RADIUS.card,
          border: '1px solid rgba(32,178,170,0.25)',
          boxShadow: '0 16px 40px rgba(32,178,170,.12)',
          bgcolor: 'background.paper',
          overflow: 'hidden',
          position: 'relative',
        }}>
          <Box sx={{ height: 4, background: 'linear-gradient(90deg, #20b2aa, #178f89)' }} />
          <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
            <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              
              {/* Opções de Captura */}
              {isAndroid ? (
                <Stack direction="row" spacing={2}>
                  {/* Caminho 1: Escanear com ML Kit */}
                  <Box
                    onClick={busy ? undefined : scanDocument}
                    sx={{
                      flex: 1,
                      cursor: busy ? 'wait' : 'pointer',
                      borderRadius: RADIUS.card,
                      p: { xs: 2, sm: 2.5 },
                      textAlign: 'center',
                      border: '2px solid #20b2aa',
                      bgcolor: 'rgba(32,178,170,.08)',
                      transition: 'all .2s ease',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 0.75,
                      '&:active': { transform: 'scale(.97)' },
                      '&:hover': { bgcolor: 'rgba(32,178,170,.14)', boxShadow: '0 8px 24px rgba(32,178,170,0.18)' },
                    }}
                  >
                    <Box sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      fontSize: 12,
                      fontWeight: 800,
                      color: '#fff',
                      bgcolor: '#20b2aa',
                      px: 0.8,
                      py: 0.2,
                      borderRadius: RADIUS.pill,
                      letterSpacing: '0.04em',
                    }}>
                      RECOMENDADO
                    </Box>
                    <DocumentScannerIcon sx={{ fontSize: 36, color: '#20b2aa' }} />
                    <Typography sx={{ fontWeight: 800, fontSize: 15, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>
                      Escanear
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      A câmera ajusta borda,<br />luz e nitidez pra você ✨
                    </Typography>
                  </Box>

                  {/* Caminho 2: Galeria ou PDF */}
                  <Box
                    component="label"
                    sx={{
                      flex: 1,
                      cursor: 'pointer',
                      borderRadius: RADIUS.card,
                      p: { xs: 2, sm: 2.5 },
                      textAlign: 'center',
                      border: files.length ? '2px solid #20b2aa' : '2px dashed rgba(32,178,170,0.35)',
                      bgcolor: files.length ? 'rgba(32,178,170,.08)' : 'rgba(32,178,170,.03)',
                      transition: 'all .2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 0.75,
                      '&:active': { transform: 'scale(.97)' },
                      '&:hover': { borderColor: '#20b2aa', bgcolor: 'rgba(32,178,170,.08)' },
                    }}
                    onClick={(e) => { if (!ensureUploadConsent()) e.preventDefault(); }}
                  >
                    <input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf" onChange={(e) => { onPick(e.target.files); if (e.target) e.target.value = ''; }} />
                    <DescriptionOutlinedIcon sx={{ fontSize: 36, color: '#20b2aa' }} />
                    <Typography sx={{ fontWeight: 800, fontSize: 15, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>
                      {files.length ? `${files.length} selecionado(s)` : 'PDF ou Galeria'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                      Vários de uma vez ·<br />leitura perfeita de PDF
                    </Typography>
                  </Box>
                </Stack>
              ) : (
                /* Desktop / Web Dropzone */
                <Box
                  component="label"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={(e) => { if (!ensureUploadConsent()) e.preventDefault(); }}
                  sx={{
                    cursor: 'pointer',
                    borderRadius: RADIUS.hero,
                    py: { xs: 3.5, sm: 4.5 },
                    px: 3,
                    textAlign: 'center',
                    border: files.length || isDragging ? '2.5px dashed #20b2aa' : '2px dashed rgba(32,178,170,0.35)',
                    bgcolor: isDragging ? 'rgba(32,178,170,0.12)' : files.length ? 'rgba(32,178,170,0.06)' : 'rgba(32,178,170,0.03)',
                    transition: 'all .2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1.5,
                    '&:hover': {
                      borderColor: '#20b2aa',
                      bgcolor: 'rgba(32,178,170,0.08)',
                      boxShadow: '0 8px 24px rgba(32,178,170,0.10)',
                    },
                  }}
                >
                  <input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf" onChange={(e) => { onPick(e.target.files); if (e.target) e.target.value = ''; }} />
                  {/* Ícone estático (audit 21/10): float infinito no idle viola a regra
                      "animação infinita só em live/processing" e gastava bateria à toa. */}
                  <Box sx={{
                    width: 60,
                    height: 60,
                    borderRadius: '50%',
                    bgcolor: 'rgba(32,178,170,0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#178f89',
                  }}>
                    <UploadFileIcon sx={{ fontSize: 32 }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: { xs: 16, sm: 18 }, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>
                      {files.length ? `${files.length} arquivo(s) pronto(s) para envio` : 'Arraste seu PDF ou fotos aqui'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      ou clique para selecionar do seu computador
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                    <Chip size="small" label="PDF (leitura imediata)" sx={{ bgcolor: 'rgba(32,178,170,0.12)', color: '#0f766e', fontWeight: 700, fontSize: 12 }} />
                    <Chip size="small" label="JPG / PNG" sx={{ bgcolor: 'action.hover', color: 'text.secondary', fontWeight: 600, fontSize: 12 }} />
                    <Chip size="small" label="Até 32 MB" sx={{ bgcolor: 'action.hover', color: 'text.secondary', fontWeight: 600, fontSize: 12 }} />
                  </Stack>
                </Box>
              )}

              {/* Arquivos selecionados — PREVIEW com miniatura (wizard: confirme que
                  é o arquivo certo) + X pra remover/trocar. */}
              {files.length > 0 && (
                <Box sx={{ p: 2, borderRadius: RADIUS.card, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', mb: 1.25 }}>
                    Confira antes de analisar ({files.length}):
                  </Typography>
                  <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
                    {files.map((f, i) => (
                      <FilePreview key={`${f.name}-${i}`} file={f} onRemove={() => setFiles(files.filter((_, j) => j !== i))} />
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Dica amigável */}
              <Box sx={{ px: 2, py: 1.25, borderRadius: RADIUS.card, bgcolor: 'rgba(32,178,170,.06)', border: '1px solid', borderColor: 'rgba(32,178,170,.22)' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.5, display: 'block' }}>
                  💡 <strong>Dica do Dr. Exame:</strong> Laudos originais em <strong>PDF</strong> emitidos pelo laboratório têm 100% de nitidez e leitura instantânea pela IA.
                </Typography>
              </Box>

              {/* Campo de título opcional */}
              <TextField
                label="Título ou identificação do exame (opcional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Hemograma completo - Julho/2026"
                size="small"
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: RADIUS.button } }}
              />

              {/* Barra de Progresso */}
              {progress && (
                <Box sx={{ bgcolor: 'background.default', p: 2, borderRadius: RADIUS.card }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.75 }}>
                    Enviando {progress.done}/{progress.total}…
                  </Typography>
                  <LinearProgress variant="determinate" value={pct} sx={{ height: 10, borderRadius: RADIUS.pill, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { borderRadius: RADIUS.pill, bgcolor: '#20b2aa' } }} />
                  {progress.errors.map((er, i) => (
                    <Typography key={i} variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                      ⚠ {er}
                    </Typography>
                  ))}
                </Box>
              )}

              {/* ERRO elegante (wizard): card amigável + tentar de novo — não alert feio. */}
              {hardError && (
                <Box sx={{
                  p: 2, borderRadius: RADIUS.card,
                  bgcolor: 'rgba(234,88,12,.07)',
                  border: '1px solid rgba(234,88,12,.35)',
                  display: 'flex', alignItems: 'center', gap: 1.75,
                }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: RADIUS.button, bgcolor: 'rgba(234,88,12,.14)', display: 'grid', placeItems: 'center', flexShrink: 0 }} aria-hidden="true"><WarningAmberIcon sx={{ fontSize: 24, color: '#c2410c' }} /></Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 14.5, color: 'text.primary' }}>
                      Não deu pra enviar
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5, mt: 0.25 }}>
                      {hardError}
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<RefreshIcon sx={{ fontSize: 17 }} />}
                    onClick={() => { setHardError(null); setProgress(null); }}
                    sx={{ borderRadius: RADIUS.pill, textTransform: 'none', fontWeight: 800, flexShrink: 0, borderColor: 'rgba(234,88,12,.4)', color: '#c2410c', '&:hover': { borderColor: '#c2410c', bgcolor: 'rgba(234,88,12,.06)' } }}
                  >
                    Tentar novamente
                  </Button>
                </Box>
              )}

              {/* Botão de Ação Primário */}
              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={busy || !files.length}
                sx={{
                  borderRadius: RADIUS.pill,
                  py: 1.6,
                  textTransform: 'none',
                  fontWeight: 800,
                  fontSize: 16,
                  background: 'linear-gradient(135deg, #20b2aa, #178f89)',
                  color: '#ffffff',
                  boxShadow: '0 10px 28px rgba(32,178,170,.35)',
                  '&:hover': { background: 'linear-gradient(135deg, #1ca299, #0f766e)' },
                  '&.Mui-disabled': { background: 'action.disabledBackground', color: 'text.disabled' },
                }}
              >
                {busy ? 'Enviando e analisando com IA…' : files.length ? 'Analisar exame com IA →' : 'Enviar e extrair com IA →'}
              </Button>

              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', fontWeight: 600 }}>
                📤 <strong>1º exame grátis</strong> · depois {planInfo?.uploadRules?.freeCost ?? 1} 💎 por envio · <strong>Premium</strong>: {planInfo?.uploadRules?.premiumFreeQuota ?? 6} envios grátis/mês
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* ABA 2: ENCAMINHAR POR E-MAIL (VOUCHER ULTRA-PREMIUM) */}
      {method === 'email' && (
        <Card sx={{
          borderRadius: RADIUS.card,
          border: '1px solid rgba(32,178,170,0.28)',
          boxShadow: '0 20px 48px rgba(32,178,170,.12), 0 4px 12px rgba(0,0,0,.03)',
          bgcolor: 'background.paper',
          overflow: 'hidden',
          position: 'relative',
        }}>
          {/* Barra de destaque superior — teal apenas (cobre é assinatura PREMIUM, fora daqui) */}
          <Box sx={{ height: 6, background: 'linear-gradient(90deg, #178f89, #20b2aa)' }} />

          <CardContent sx={{ p: { xs: 2, sm: 3.5 } }}>
            {/* Header compacto */}
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
              <Box sx={{
                width: 44,
                height: 44,
                borderRadius: RADIUS.button,
                background: 'linear-gradient(135deg, #093330, #178f89)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 16px rgba(23,143,137,0.3)',
                flexShrink: 0,
              }}>
                <EmailIcon sx={{ color: '#fff', fontSize: 22 }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: { xs: 15, sm: 18 }, lineHeight: 1.2 }}>
                  Encaminhe pelo e-mail
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35, display: 'block' }}>
                  Copie os dados abaixo e encaminhe o PDF do laudo
                </Typography>
              </Box>
            </Stack>

            {/* Box Voucher — estilo PIX, compacto */}
            <Box sx={{
              borderRadius: RADIUS.card,
              p: { xs: 1.5, sm: 2.25 },
              bgcolor: 'action.hover',
              border: '1px solid',
              borderColor: 'divider',
              mb: 2,
            }}>
              {/* Campo 1: Destinatário */}
              <Box sx={{ mb: 1.25 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 0.4, fontSize: 12 }}>
                  Para (destinatário)
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{
                    bgcolor: 'background.paper',
                    py: 1,
                    px: { xs: 1.25, sm: 1.5 },
                    borderRadius: RADIUS.button,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Stack direction="row" spacing={0.85} alignItems="center" sx={{ minWidth: 0, flex: 1, mr: 1 }}>
                    <EmailIcon sx={{ fontSize: 18, color: '#178f89', flexShrink: 0 }} />
                    <Typography
                      sx={{
                        fontWeight: 700,
                        fontSize: { xs: 12.5, sm: 14 },
                        color: 'text.primary',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {emailInfo?.inbox || 'contato@janocaminho.com.br'}
                    </Typography>
                  </Stack>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => copy(emailInfo?.inbox || 'contato@janocaminho.com.br', 'Endereço de e-mail', 'inbox')}
                    startIcon={copiedKey === 'inbox' ? <CheckIcon sx={{ fontSize: 14 }} /> : <ContentCopyIcon sx={{ fontSize: 14 }} />}
                    sx={{
                      borderRadius: RADIUS.sm,
                      textTransform: 'none',
                      fontWeight: 700,
                      fontSize: 12,
                      px: 1.25,
                      py: 0.4,
                      color: copiedKey === 'inbox' ? '#10b981' : '#178f89',
                      borderColor: copiedKey === 'inbox' ? '#10b981' : 'rgba(32,178,170,0.4)',
                      bgcolor: copiedKey === 'inbox' ? 'rgba(16,185,129,0.08)' : 'transparent',
                      flexShrink: 0,
                    }}
                  >
                    {copiedKey === 'inbox' ? 'Copiado!' : 'Copiar'}
                  </Button>
                </Stack>
              </Box>

              {/* Campo 2: Assunto (Código) */}
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 0.4, fontSize: 12 }}>
                  Assunto (cole o código)
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{
                    bgcolor: 'rgba(32,178,170,0.08)',
                    py: 1,
                    px: { xs: 1.25, sm: 1.5 },
                    borderRadius: RADIUS.button,
                    border: '1.5px dashed #20b2aa',
                  }}
                >
                  <Stack direction="row" spacing={0.85} alignItems="center" sx={{ minWidth: 0, flex: 1, mr: 1 }}>
                    <AutoAwesomeIcon sx={{ fontSize: 18, color: '#178f89', flexShrink: 0 }} />
                    <Typography
                      sx={{
                        fontWeight: 900,
                        fontSize: { xs: 16, sm: 19 },
                        color: '#0f766e',
                        letterSpacing: '0.08em',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {emailInfo?.code || 'CARREGANDO...'}
                    </Typography>
                  </Stack>
                  {/* Ação secundária em outlined (audit 21/10): contained teal competia com
                      o CTA gradiente "Abrir E-mail" — 1 ação primária por tela. */}
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => copy(emailInfo?.code || '', 'Código de assunto', 'code')}
                    startIcon={copiedKey === 'code' ? <CheckIcon sx={{ fontSize: 14 }} /> : <ContentCopyIcon sx={{ fontSize: 14 }} />}
                    sx={{
                      borderRadius: RADIUS.sm,
                      textTransform: 'none',
                      fontWeight: 800,
                      fontSize: 12,
                      px: 1.35,
                      py: 0.5,
                      color: copiedKey === 'code' ? '#10b981' : '#178f89',
                      borderColor: copiedKey === 'code' ? '#10b981' : 'rgba(32,178,170,0.4)',
                      bgcolor: copiedKey === 'code' ? 'rgba(16,185,129,0.08)' : 'transparent',
                      flexShrink: 0,
                    }}
                  >
                    {copiedKey === 'code' ? 'Copiado!' : 'Copiar'}
                  </Button>
                </Stack>
              </Box>
            </Box>

            {/* Botão Mágico: Abrir meu App de E-mail */}
            <Button
              component="a"
              href={mailtoHref}
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
              fullWidth
              startIcon={<ForwardToInboxIcon />}
              endIcon={<OpenInNewIcon sx={{ fontSize: 17 }} />}
              sx={{
                borderRadius: RADIUS.pill,
                py: { xs: 1.35, sm: 1.5 },
                fontSize: { xs: 14, sm: 16 },
                fontWeight: 800,
                textTransform: 'none',
                background: 'linear-gradient(135deg, #20b2aa, #178f89)',
                color: '#fff',
                boxShadow: '0 10px 28px rgba(32,178,170,.35)',
                mb: 2,
                '&:hover': {
                  background: 'linear-gradient(135deg, #178f89, #0f5f5a)',
                  boxShadow: '0 12px 32px rgba(23,143,137,.45)',
                },
              }}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Abrir meu aplicativo de E-mail</Box>
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Abrir E-mail</Box>
            </Button>

            {/* Status do Robô Ouvindo */}
            <Box sx={{
              p: 2,
              borderRadius: RADIUS.card,
              bgcolor: 'rgba(16,185,129,0.07)',
              border: '1px solid rgba(16,185,129,0.22)',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}>
              <Box sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: '#10b981',
                boxShadow: '0 0 0 4px rgba(16,185,129,0.25)',
                flexShrink: 0,
              }} />
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 13, color: '#065f46' }}>
                  Robô do Dr. Exame conectado e aguardando seu envio
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, lineHeight: 1.4 }}>
                  Assim que você encaminhar, o PDF é processado com IA e o laudo entra na sua conta em ~30 segundos.
                </Typography>
              </Box>
            </Box>

            {/* Dica rodapé */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, textAlign: 'center', fontSize: 12, lineHeight: 1.45 }}>
              📌 Código exclusivo deste perfil · 1 exame · PDF até 8 MB · Válido 30 dias
            </Typography>
          </CardContent>
        </Card>
      )}

      <Dialog open={consentOpen} onClose={() => setConsentOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: 'text.primary' }}>Antes de enviar seu exame</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2, borderRadius: RADIUS.button }}>
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
                <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: 'rgba(32,178,170,.12)', color: '#178f89', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0, mt: 0.15 }}>{i + 1}</Box>
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
          <Button onClick={acceptUploadConsent} disabled={!consentChecked} variant="contained" sx={{ borderRadius: RADIUS.pill, textTransform: 'none', fontWeight: 800, bgcolor: '#20b2aa', '&:hover': { bgcolor: '#178f89' } }}>
            Entendi e aceito
          </Button>
        </DialogActions>
      </Dialog>

      {/* DUPLICATA — aviso PROEMINENTE "de cara": o documento já existe no histórico. */}
      <Dialog open={!!dupInfo} onClose={() => { setDupInfo(null); redirect('list', 'exams'); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 800, color: 'text.primary' }}>📄 Documento já enviado</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 1.5, borderRadius: RADIUS.button }}>
            {(dupInfo?.dups.length ?? 0) === 1
              ? 'Este arquivo já está no seu histórico (conteúdo idêntico) e não foi adicionado de novo.'
              : `${dupInfo?.dups.length ?? 0} arquivos já estão no seu histórico (conteúdo idêntico) e não foram adicionados de novo.`}
          </Alert>
          {(dupInfo?.dups ?? []).map((n, i) => <Typography key={i} variant="body2" sx={{ wordBreak: 'break-all', pl: 1 }}>• {n}</Typography>)}
          {dupInfo?.elsewhere.length ? <Alert severity="info" sx={{ mt: 1.5, borderRadius: RADIUS.button }}>Esse mesmo arquivo também está em outro perfil seu.</Alert> : null}
          <Typography variant="body2" sx={{ mt: 1.75, fontWeight: 600 }}>
            {dupInfo && dupInfo.sent > 0 ? `✅ ${plural(dupInfo.sent, 'exame novo enviado', 'exames novos enviados')} e extraindo.` : 'Nenhum exame novo foi adicionado.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2.5, gap: 1 }}>
          <Button onClick={() => { setDupInfo(null); redirect('list', 'exams'); }} variant="contained" sx={{ borderRadius: RADIUS.pill, textTransform: 'none', fontWeight: 700, bgcolor: '#178f89' }}>Ver meus exames</Button>
          <Button onClick={() => setDupInfo(null)} sx={{ borderRadius: RADIUS.pill, textTransform: 'none', fontWeight: 700 }}>Enviar outro</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
