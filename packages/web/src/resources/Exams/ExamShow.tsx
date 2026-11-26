import { useEffect, useState, useRef } from 'react';
import { photoReadNotice } from '../../utils/photoReadNotice';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Chip, Button, CircularProgress, Alert, Divider, Stack,
  Accordion, AccordionSummary, AccordionDetails, Tooltip as MuiTooltip,
} from '@mui/material';
import { alpha, keyframes, lighten } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import StopIcon from '@mui/icons-material/Stop';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FlagIcon from '@mui/icons-material/Flag';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import LockIcon from '@mui/icons-material/Lock';
import CheckIcon from '@mui/icons-material/Check';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { SecondaryButton } from '../../components/SecondaryButton';
import { prettyName } from '../../utils/names';
import { Title, useNotify } from 'react-admin';
import { API_URL, token } from '../../config';
import { confirmDialog, snackbar } from '../../components/ConfirmDialog';
import { chipA11y } from '../../utils/chipA11y';
import { LabBadge } from '../../components/LabBadge';
import { Capacitor } from '@capacitor/core';
import { openBlobFile, speakText, stopSpeakText } from '../../utils/nativeDoc';
import { openExamFile } from '../../utils/examFile';
import { HealthSummary } from '../../components/HealthSummary';
import { displayStatus } from '../../utils/examStatus';
import { RefBar } from '../../components/RefBar';
import { Sparkline } from '../../components/Sparkline';
import { ExplainButton } from '../../components/ExplainItem';
import { UnitLabel } from '../../components/UnitLabel';
import { TelemedicineButton } from '../../components/TelemedicineButton';
import { fmtVal, unitSuffix, fmtDateShort, timeAgo, plural } from '../../utils/format';
import { categorizeExam } from '../../utils/medicalData';
import { tealText, RADIUS, SEM } from '../../theme';
import { WhatIsThis } from '../../components/WhatIsThis';
import { ExtractionProgress } from '../../components/ExtractionProgress';
import { ExamFailureSheet } from '../../components/ExamFailureSheet';
import { ExamFilePreview } from '../../components/ExamFilePreview';
import { AnalysisScan } from '../../components/AnalysisScan';
import { CreditBadge, CREDIT_COSTS } from '../../components/CreditBadge';
import { notifyInsufficientCredits } from '../../utils/credits-events';
import type { ClinicalGoalView } from '@meus-exames/shared';
import { ConfirmSpend } from '../../components/ConfirmSpend';
import { DocPreview } from '../../components/DocPreview';
import { cleanExtractedLabel } from '../../utils/examDisplay';
import { useClinicalGoals } from '../../hooks/useClinicalGoals';
import { goalFor, goalRangeText, withinGoal, withinRef, dualStatusText } from '../../utils/clinicalGoals';


/** Título de cartão do detalhe (25/11/26): mesmo nível do título de seção da Home (Poppins 17/700).
 *  Antes "Análise de saúde" e "Conversar" saíam num tamanho e "Preparar visita" noutro. */
const CARD_TITLE = { component: 'h2', fontFamily: '"Poppins", sans-serif', fontWeight: 700, fontSize: 17, lineHeight: 1.25 } as const;

/** Texto de apoio DENTRO de um aviso de fundo tingido: o text.secondary padrão dava 4,19:1 em cima da
 *  lavagem vermelha (medido em 25/11/26). Um pouco do texto principal mantém a hierarquia e passa de AA. */
const noteOnTint = { color: (t: Theme) => alpha(t.palette.text.primary, t.palette.mode === 'dark' ? 0.75 : 0.8) };

/** Valor do item editável inline (corrigir erro de OCR). Salva via PATCH /items/:id. */
const EditableItemValue = ({ it, color, onSaved }: { it: any; color: string; onSaved: (u: any) => void }) => {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(it.valueText ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const num = parseFloat(String(v).replace(',', '.'));
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/items/${it.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ valueText: v, valueNumeric: isNaN(num) ? null : num }) });
      if (r.ok) { const u = await r.json(); onSaved(u); setEditing(false); }
      // Falha silenciosa era o bug (audit D §S2): correção de OCR é promessa central —
      // o usuário precisa saber que NÃO salvou.
      else snackbar({ message: 'Não foi possível salvar a correção — tente de novo.', severity: 'error' });
    } catch { snackbar({ message: 'Sem conexão — a correção não foi salva.', severity: 'error' }); }
    finally { setBusy(false); }
  };
  if (editing) return (
    <Box component="input" value={v} autoFocus disabled={busy}
      onChange={(e: any) => setV(e.target.value)} onBlur={save}
      onKeyDown={(e: any) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setV(it.valueText ?? ''); setEditing(false); } }}
      sx={{ fontSize: '1.4rem', fontWeight: 800, p: '2px 6px', borderRadius: RADIUS.sm, border: '2px solid #20b2aa', outline: 'none', width: 'min(150px, 45vw)', maxWidth: '100%', bgcolor: 'background.paper', color }} />
  );
  return (
    <Typography onClick={() => setEditing(true)} title="Toque para corrigir o valor"
      {...chipA11y()} aria-label={`Corrigir valor de ${it.name ?? 'marcador'}`}
      sx={{ position: 'relative', fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.2, color, cursor: 'pointer', borderBottom: '2px dotted rgba(32,178,170,.45)', '&:hover': { color: '#178f89' },
        // Alvo de 44px sem mexer no layout (o número tem ~29px de altura).
        '&::before': { content: '""', position: 'absolute', inset: '-8px -10px' } }}>
      {fmtVal(it)}
      {/* Lápis do conjunto de ícones do app no lugar do emoji (25/11/26). */}
      <EditOutlinedIcon sx={{ fontSize: 16, ml: 0.4, opacity: 0.55, verticalAlign: 'text-bottom' }} aria-hidden="true" />
    </Typography>
  );
};

const statusColor: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  EXTRACTED: 'success', FAILED: 'error', UPLOADED: 'warning', EXTRACTING: 'info',
};

/** Waveform da narração (CSS only — barras com atrasos defasados, anima só enquanto fala). */
const waveBar = keyframes`0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}`;
const WaveBars = () => (
  <Box aria-hidden sx={{ display: 'inline-flex', alignItems: 'center', gap: '2px', height: 16, ml: 0.5 }}>
    {[0, 1, 2, 3, 4].map((i) => (
      <Box key={i} sx={{
        width: 3, height: 16, borderRadius: '2px', bgcolor: 'primary.main', transformOrigin: 'center',
        animation: `${waveBar} 1s ease-in-out ${i * 0.12}s infinite`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none', transform: 'scaleY(.6)' },
      }} />
    ))}
  </Box>
);
const statusLabel: Record<string, string> = {
  EXTRACTED: 'Pronto', FAILED: 'Falhou', UPLOADED: 'Enviado', EXTRACTING: 'Extraindo…',
};
const kindLabel: Record<string, string> = { LAB_PANEL: 'Laboratorial', IMAGING: 'Imagem', OTHER: 'Outro' };

const flagMeta: Record<string, { color: 'success' | 'warning' | 'error' | 'default'; label: string }> = {
  NORMAL: { color: 'success', label: 'Normal' },
  HIGH: { color: 'error', label: '↑ Acima' },
  LOW: { color: 'warning', label: '↓ Abaixo' },
  ABNORMAL: { color: 'error', label: 'Alterado' },
  CRITICAL: { color: 'error', label: 'Crítico' },
  UNKNOWN: { color: 'default', label: '—' },
};

function fmtRef(it: any): string {
  if (it.refText) return it.refText;
  const lo = it.refLow, hi = it.refHigh;
  if (lo != null || hi != null) {
    const range = `${lo ?? ''} a ${hi ?? ''}`.trim();
    return it.unit ? `${range} ${it.unit}` : range;
  }
  return 'não informada';
}

export const ExamShow = ({ inlineId }: { inlineId?: string } = {}) => {
  const { id: routeId } = useParams();
  const id = inlineId ?? routeId;
  const navigate = useNavigate();
  const notify = useNotify();
  const [exam, setExam] = useState<any>(null);
  // AUD-011: falha de rede/4xx deixava o spinner rodando pra sempre — o usuário
  // ficava preso sem saber se esperava ou desistia. Erro vira tela com saída.
  const [loadErr, setLoadErr] = useState<null | 'network' | 'notfound' | 'server'>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [genLoading, setGenLoading] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  // Sheet educativo de falha (pedido≠resultado / qualidade / IA): auto-abre 1× por exame
  // e reabre pelo "Entender o que houve" do Alert.
  const [failSheetOpen, setFailSheetOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; text: string; sources?: { label: string; topic: string }[] }[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [explain, setExplain] = useState<any | null>(null);
  const [attesting, setAttesting] = useState(false);
  const [docHtml, setDocHtml] = useState('');
  const [docOpen, setDocOpen] = useState(false);
  const [docTitle, setDocTitle] = useState('Documento');
  const [confirmSpend, setConfirmSpend] = useState<{ open: boolean; credits: number; title: string; desc?: string; onYes: () => void }>({ open: false, credits: 0, title: '', onYes: () => {} });
  // NARRAÇÃO DO RESUMO (🔊): server devolve o roteiro pt-BR (1 geração por exame, cobrada
  // 1x); o áudio sai do TTS do dispositivo (nativo APK / speechSynthesis web).
  const [narrLoading, setNarrLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  // Para a fala ao sair da tela (senão o áudio continua na página seguinte).
  useEffect(() => { return () => { void stopSpeakText(); }; }, []);

  const prevStatusRef = useRef<string | undefined>(undefined);
  // Meta clínica vigente (E2.4 — camada 2): chip 🎯 + texto duplo-estado no item, SEMPRE
  // além do badge da régua do laboratório. Sem meta → render idêntico ao atual.
  const clinicalGoals = useClinicalGoals();
  useEffect(() => {
    let active = true;
    let timer: any;
    let attempts = 0;
    const load = async () => {
      attempts++;
      if (attempts > 60) { notify('A extração está demorando mais que o normal. Pode continuar usando o app — avisamos quando terminar.', { type: 'warning' }); return; }
      let r: Response;
      try {
        r = await fetch(`${API_URL}/exams/${id}`, { headers: { Authorization: `Bearer ${token()}` } });
      } catch { if (active) setLoadErr('network'); return; } // AUD-011: offline não é spinner eterno
      if (!active) return;
      if (!r.ok) { setLoadErr(r.status === 404 || r.status === 403 ? 'notfound' : 'server'); return; }
      setLoadErr(null);
      const d = await r.json();
      if (!active) return;
      setExam(d);
      const prev = prevStatusRef.current;
      prevStatusRef.current = d.status;
      if (d.status === 'UPLOADED' || d.status === 'EXTRACTING') {
        timer = setTimeout(load, 3000);
      } else if (d.status === 'EXTRACTED' && (prev === 'UPLOADED' || prev === 'EXTRACTING')) {
        // acabou de extrair AGORA → bônus de 1º exame (se devido) + notificação foram concedidos
        // server-side. Avisa a wallet e o sino pra refazerem o saldo/notificações em tempo real.
        window.dispatchEvent(new Event('creditsChanged'));
        window.dispatchEvent(new Event('notificationsChanged'));
      }
    };
    load();
    return () => { active = false; clearTimeout(timer); };
  }, [id, retryTick]); // retryTick: "Tentar de novo" re-roda o efeito do zero

  const summary = exam?.analyses?.[0] ?? null;
  // TRIAGEM DE URGÊNCIA (camada 1 — determinística, computada no server junto ao resumo):
  // CRITICO/ATENCAO mostram banner; ausente/ACOMPANHAR/NORMAL → nada (relatórios antigos ok).
  const urgency = (summary?.structured as any)?.urgency as { level: string; message?: string | null } | undefined;
  const identity = exam?.rawExtraction?.identityMatch as any;
  const nm = exam?.rawExtraction?.nameMatch as any;
  const cpfBlock = identity?.method === 'cpf' && !!identity?.mismatch;
  const nameBlock = !cpfBlock && !!nm?.mismatch && !exam?.rawExtraction?.nameAttested;
  const attest = async () => {
    setAttesting(true);
    try {
      await fetch(`${API_URL}/exams/${id}/attest`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
      setExam({ ...exam, rawExtraction: { ...exam?.rawExtraction, nameAttested: true } });
      notify('Titularidade confirmada. Já pode gerar a análise.', { type: 'success' });
    } catch { notify('Falha ao confirmar', { type: 'error' }); }
    finally { setAttesting(false); }
  };
  const rejectExam = async () => {
    if (!(await confirmDialog({ title: 'Excluir exame', message: 'Este exame NÃO é deste paciente? Ele será excluído definitivamente.', confirmLabel: 'Excluir' }))) return;
    setAttesting(true);
    try {
      const r = await fetch(`${API_URL}/exams/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) throw new Error('Falha ao excluir');
      notify('Exame excluído (não era deste paciente).', { type: 'success' });
      navigate('/exams', { replace: true });
    } catch { notify('Falha ao excluir', { type: 'error' }); setAttesting(false); }
  };

  const generateSummary = async (force = false) => {
    if (cpfBlock) { notify('CPF do exame diverge do CPF cadastrado. Exclua o exame ou acione o suporte.', { type: 'error' }); return; }
    if (nameBlock) { notify('Confirme a titularidade deste exame antes de gerar a análise.', { type: 'warning' }); return; }
    if (force) {
      setConfirmSpend({ open: true, credits: CREDIT_COSTS.summary, title: 'Regenerar resumo', desc: 'Vamos gerar uma nova análise deste exame com a IA.', onYes: () => { setConfirmSpend(s => ({ ...s, open: false })); doGenerateSummary(true); } });
      return;
    }
    doGenerateSummary(false);
  };
  const doGenerateSummary = async (force: boolean) => {
    setGenLoading(true);
    try {
      const r = await fetch(`${API_URL}/analyses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ examId: id, force }),
      });
      if (r.status === 402) {
        notifyInsufficientCredits({ cost: CREDIT_COSTS.summary });
        setGenLoading(false);
        return;
      }
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Falha'); }
      const analysis = await r.json();
      setExam({ ...exam, analyses: [analysis, ...(exam.analyses ?? [])] });
      window.dispatchEvent(new Event('creditsChanged'));
      try { window.dispatchEvent(new CustomEvent('me:reportReady', { detail: { message: '✅ Resumo do exame pronto.' } })); } catch { /* best-effort */ }
    } catch (e: any) { notify(e.message, { type: 'error' }); }
    finally { setGenLoading(false); }
  };

  const reextract = async () => {
    setReExtracting(true);
    try {
      await fetch(`${API_URL}/exams/${id}/reextract`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
      setExam({ ...exam, status: 'EXTRACTING' });
    } catch { notify('Falha ao re-extrair', { type: 'error' }); }
    finally { setReExtracting(false); }
  };

  const openCitation = async (page: number) => {
    try {
      if (pdfUrl && !Capacitor.isNativePlatform()) { window.open(`${pdfUrl}#page=${page}`); return; }
      const r = await fetch(`${API_URL}/exams/${id}/file`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) throw new Error('Falha ao baixar');
      const blob = await r.blob();
      if (Capacitor.isNativePlatform()) {
        await openBlobFile(blob, `exame-${id}.pdf`); // APK: salva + Share (abre no visualizador)
      } else {
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
        window.open(`${url}#page=${page}`);
      }
    } catch { notify('Não consegui abrir o PDF do exame.', { type: 'error' }); }
  };

  /** Abre o laudo/PDF original inteiro (header). Mesmo fluxo robusto web+APK do openCitation. */
  const openPdf = async () => { if (!id) return; const ok = await openExamFile(id); if (!ok) notify('Não consegui abrir o laudo.', { type: 'error' }); };

  /** 🔊 Ouvir resumo: POST /exams/:id/narrate → roteiro pt-BR → TTS do dispositivo.
   *  1ª vez consome créditos de chat; replays usam o cache do exame (grátis). */
  const narrate = async () => {
    if (speaking || narrLoading) return;
    setNarrLoading(true);
    try {
      const r = await fetch(`${API_URL}/exams/${id}/narrate`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
      if (r.status === 402) {
        const e = await r.json().catch(() => ({}));
        notifyInsufficientCredits({ message: e.message, cost: CREDIT_COSTS.summary });
        window.dispatchEvent(new Event('creditsChanged'));
        return;
      }
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Falha ao gerar a narração'); }
      const d = await r.json();
      window.dispatchEvent(new Event('creditsChanged'));
      setSpeaking(true);
      void speakText(d.text, {
        onDone: () => setSpeaking(false),
        onFail: () => { setSpeaking(false); notify('Não consegui falar neste dispositivo.', { type: 'warning' }); },
      });
    } catch (e: any) {
      notify(e.message || 'Falha ao gerar a narração', { type: 'error' });
    } finally {
      setNarrLoading(false);
    }
  };
  const stopNarration = () => { void stopSpeakText(); setSpeaking(false); };

  /** 📄 Baixar PDF premium (4 páginas p/ levar ao médico). Web: abre em nova aba;
   *  APK: salva + Share (usuário abre no visualizador / manda pro médico). Grátis. */
  const downloadPdf = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const r = await fetch(`${API_URL}/exams/${id}/report-pdf`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Falha ao gerar o PDF'); }
      const blob = await r.blob();
      const dt = exam?.performedAt ? new Date(exam.performedAt).toISOString().slice(0, 10) : 'exame';
      await openBlobFile(blob, `relatorio-dr-exame-${dt}.pdf`);
    } catch (e: any) {
      notify(e.message || 'Não consegui gerar o PDF.', { type: 'error' });
    } finally {
      setPdfLoading(false);
    }
  };

  const sendChat = async () => {
    if (!summary) return;
    const message = chatInput.trim();
    if (!message) return;
    setChatInput('');
    setChatBusy(true);
    const idx = chatMessages.length + 1;
    setChatMessages((m) => [...m, { role: 'user', text: message }, { role: 'assistant', text: '' }]);
    try {
      const r = await fetch(`${API_URL}/analyses/${summary.id}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ message }),
      });
      if (r.status === 402) { const e = await r.json().catch(() => ({})); notifyInsufficientCredits({ message: e.message, cost: CREDIT_COSTS.chat }); setChatMessages((m) => m.slice(0, -2)); setChatBusy(false); return; }
      if (!r.ok || !r.body) throw new Error('falha');
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop() ?? '';
        for (const p of parts) {
          const line = p.startsWith('data: ') ? p.slice(6) : p;
          try {
            const evt = JSON.parse(line);
            if (evt.delta) setChatMessages((m) => { const c = [...m]; c[idx] = { role: 'assistant', text: (c[idx]?.text ?? '') + evt.delta }; return c; });
            // FEATURE C — fontes [FONTE ANO] citadas pela IA (SSE extra; vazio não é emitido).
            if (evt.type === 'sources' && Array.isArray(evt.sources)) setChatMessages((m) => { const c = [...m]; c[idx] = { role: 'assistant', text: c[idx]?.text ?? '', sources: evt.sources }; return c; });
          } catch { /* */ }
        }
      }
    } catch { notify('Erro no chat', { type: 'error' }); }
    finally { setChatBusy(false); window.dispatchEvent(new Event('creditsChanged')); }
  };

  if (!exam) {
    // AUD-011: erro de carga tem TELA (motivo + saída), não spinner eterno.
    if (loadErr) {
      return (
        <Box sx={{ p: 4, textAlign: 'center', maxWidth: 420, mx: 'auto' }}>
          <Typography sx={{ fontWeight: 800, fontSize: 17, mb: 0.5 }}>
            {loadErr === 'notfound' ? 'Exame não encontrado' : 'Não deu pra carregar o exame'}
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: 13.5, mb: 2.5 }}>
            {loadErr === 'notfound'
              ? 'Ele pode ter sido excluído, ou este link não pertence à sua conta.'
              : loadErr === 'network'
              ? 'Sem conexão agora. Verifique sua internet e tente de novo.'
              : 'Tivemos um problema ao buscar os dados. Tente de novo em instantes.'}
          </Typography>
          <Stack direction="row" spacing={1.5} justifyContent="center">
            {loadErr !== 'notfound' && (
              <Button variant="contained" onClick={() => { setLoadErr(null); setRetryTick((t) => t + 1); }} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 3 }}>
                Tentar de novo
              </Button>
            )}
            <Button variant="outlined" onClick={() => navigate('/exams')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>
              Meus exames
            </Button>
          </Stack>
        </Box>
      );
    }
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  }

  const items: any[] = exam.items ?? [];
  const cc = categorizeExam(exam); // categoria do exame (dominante pelos itens) — badge no header
  const titleInfo = cleanExtractedLabel(exam.title, kindLabel[exam.kind] ?? 'Exame', 72);
  const labInfo = cleanExtractedLabel(exam.sourceLab, '', 56);
  const patientInfo = cleanExtractedLabel(exam.rawExtraction?.patientName, '', 56);
  const doctorInfo = cleanExtractedLabel(exam.rawExtraction?.requestingDoctor, '', 56);
  const docNameInfo = cleanExtractedLabel(nm?.docName, 'nome detectado no documento', 64);
  const profileNameInfo = cleanExtractedLabel(nm?.profileName, 'perfil selecionado', 64);
  const photoNotice = exam.status === 'EXTRACTED' ? photoReadNotice(exam.rawExtraction?.photoRead) : null;
  const headerNeedsReview = !!exam.reviewRequired || titleInfo.suspicious || labInfo.suspicious || patientInfo.suspicious || doctorInfo.suspicious || !exam.performedAt;
  const abnormal = items.filter((i) => i.isAbnormal);
  // UNKNOWN = sem faixa de referência (ou sem valor). NÃO é "dentro da faixa" — o header distingue.
  const noRef = items.filter((i) => (i.flag ?? '').toUpperCase() === 'UNKNOWN');
  const grouped = items.reduce((acc: any, it: any) => { (acc[it.panel ?? 'Geral'] ??= []).push(it); return acc; }, {});
  // NUMÉRICO-PRIMEIRO (mandato 2026-08-17): valor × faixa exibida decide o chip — o rótulo
  // nunca contradiz a "Referência:" ao lado nem o caption de % . Flag armazenado = fallback
  // quando falta valor/faixa (ou escala suspeita); UNKNOWN nunca aparece cru (displayStatus).
  const fm = (it: any) => {
    const s = displayStatus(it?.flag, it?.name, it?.refLow, it?.refHigh, it?.valueNumeric);
    const toneToColor: Record<string, 'success' | 'warning' | 'error' | 'default'> = { normal: 'success', atencao: 'warning', critico: 'error', neutro: 'default', contexto: 'default' };
    if (s.tone === 'normal' || s.tone === 'atencao' || s.tone === 'critico') {
      return { color: toneToColor[s.tone], label: s.short, title: s.label };
    }
    const f = (it?.flag ?? '').toUpperCase();
    if (f === 'UNKNOWN' || !flagMeta[f]) return { color: 'default' as const, label: s.short, title: s.label };
    return flagMeta[f];
  };

  const inline = inlineId !== undefined;
  // width:'100%' OBRIGATÓRIO no root: o RaLayout-content é flex-column e `mx:'auto'` sozinho
  // desliga o stretch → o box era dimensionado por MAX-CONTENT (~521px com chips/régua sem
  // quebrar) e estourava a viewport no mobile (clipado no web, EMPURRAVA tudo pra direita no
  // APK). Mesmo padrão do PageContainer (width 100% + maxWidth + mx auto).
  return (
    <Box sx={inline ? { p: { xs: 1.5, md: 2 } } : { width: '100%', maxWidth: 1080, mx: 'auto', p: { xs: 1, md: 2 } }}>
      {!inline && <Title title={titleInfo.text || exam.title} />}

      {/* Cabeçalho */}
      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
            <Typography variant="h5" component="h1" title={titleInfo.original || exam.title} sx={{ fontSize: { xs: '1.15rem', md: '1.5rem' }, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minWidth: 0 }}>{titleInfo.text || 'Exame'}</Typography>
            {/* "Pronto" não é informação (25/11/26): todo exame com valores lidos está pronto. O chip de status
                só aparece quando diz algo diferente (Falhou, Enviado, Extraindo) — mesma regra da lista. */}
            {exam.status !== 'EXTRACTED' && <Chip color={statusColor[exam.status] ?? 'default'} label={statusLabel[exam.status] ?? exam.status} />}
            {exam.kind === 'IMAGING' && <Chip variant="outlined" label="Imagem" />}
            {exam.kind === 'LAB_PANEL' && <Chip variant="outlined" label="Laboratorial" />}
            {cc.key !== 'image' && cc.key !== 'other' && <Chip size="small" sx={{ bgcolor: cc.color + '18', fontWeight: 700, color: (t) => (t.palette.mode === 'dark' ? lighten(cc.color, 0.35) : '#334155') }} icon={<Box component={cc.icon} sx={{ fontSize: 16, color: `${cc.color} !important`, ml: 0.5, mr: -0.5 }} />} label={cc.cat} />}
            {headerNeedsReview && <Chip color="warning" label="conferir dados" />}
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
            {exam.performedAt ? (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.3, borderRadius: '999px', bgcolor: 'rgba(32,178,170,.10)' }}>
                <CalendarMonthIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                <Typography component="span" sx={{ fontWeight: 700, color: (t) => tealText(t.palette.mode), fontSize: '0.9rem', lineHeight: 1 }}>{fmtDateShort(exam.performedAt)}</Typography>
                {/* "de quando" ao lado da data (25/11/26): "07 mar 2026" sozinho obrigava a pessoa a contar meses. */}
                {timeAgo(exam.performedAt) && (
                  <Typography component="span" sx={{ fontWeight: 600, ...noteOnTint, fontSize: '0.85rem', lineHeight: 1 }}>· {timeAgo(exam.performedAt)}</Typography>
                )}
              </Box>
            ) : (
              <Typography component="span" sx={{ fontWeight: 700, color: 'warning.main', fontSize: '0.85rem' }}>Data não identificada</Typography>
            )}
            {(exam.sourceLab || labInfo.suspicious || exam.pageCount) && (
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0, maxWidth: '100%' }}>
                {exam.sourceLab ? <LabBadge raw={exam.sourceLab} size="md" showUnit /> : (labInfo.suspicious ? <Typography component="span" color="warning.main" sx={{ fontSize: '0.85rem', fontWeight: 600 }}>laboratório em revisão</Typography> : null)}
                {exam.pageCount ? <Typography component="span" color="text.secondary" sx={{ fontSize: '0.85rem', whiteSpace: 'nowrap', flexShrink: 0 }}>{exam.pageCount} pág.</Typography> : null}
              </Box>
            )}
          </Stack>
          {/* Três ações discretas em duas linhas no celular: [Abrir laudo][Baixar PDF] / [Ouvir resumo]
              (25/11/26). O único botão destaque da tela é "Gerar resumo". */}
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap rowGap={1} sx={{ mt: 1.5 }}>
            <SecondaryButton onClick={openPdf} startIcon={<PictureAsPdfOutlinedIcon />}>Abrir laudo</SecondaryButton>
            {exam.status === 'EXTRACTED' && (
              <SecondaryButton onClick={downloadPdf} disabled={pdfLoading} startIcon={pdfLoading ? <CircularProgress size={16} color="inherit" /> : <FileDownloadOutlinedIcon />}>
                Baixar PDF
              </SecondaryButton>
            )}
            {exam.status === 'EXTRACTED' && (
              speaking ? (
                <Button size="small" variant="contained" color="error" onClick={stopNarration} startIcon={<StopIcon />} sx={{ borderRadius: RADIUS.button, textTransform: 'none', fontWeight: 700, minHeight: 44 }}>
                  Parar <WaveBars />
                </Button>
              ) : (
                <SecondaryButton onClick={narrate} disabled={narrLoading} startIcon={narrLoading ? <CircularProgress size={16} color="inherit" /> : <RecordVoiceOverIcon />}>
                  Ouvir resumo ({CREDIT_COSTS.chat} crédito{CREDIT_COSTS.chat > 1 ? 's' : ''})
                </SecondaryButton>
              )
            )}
          </Stack>
          {(patientInfo.text || patientInfo.suspicious || doctorInfo.text || doctorInfo.suspicious) && (
            // Caixa normal e sem emoji (25/11/26): antes "👤 NOME EM CAIXA ALTA • 🩺 MÉDICO".
            <Typography component="div" color="text.secondary" sx={{ fontSize: 13, mt: 0.75, lineHeight: 1.4 }}>
              {[
                patientInfo.text ? prettyName(patientInfo.text) : patientInfo.suspicious ? 'Titular detectado em revisão' : '',
                doctorInfo.text ? `Dr. ${prettyName(doctorInfo.text)}` : doctorInfo.suspicious ? 'Médico solicitante em revisão' : '',
              ].filter(Boolean).join('  ·  ')}
            </Typography>
          )}
          {photoNotice && (
            <Alert severity="warning" data-photo-read sx={{ mt: 1.5, borderRadius: RADIUS.sectionCard, '& .MuiAlert-message': { fontSize: 13.5, lineHeight: 1.5 } }}>
              <Typography component="div" sx={{ fontWeight: 800, fontSize: 14, mb: 0.25 }}>{photoNotice.title}</Typography>
              {photoNotice.lines.map((l) => (<Box key={l}>{l}</Box>))}
            </Alert>
          )}
          {headerNeedsReview && !photoNotice && (
            <Alert severity="info" icon={false} sx={{ mt: 1.5, borderRadius: RADIUS.sectionCard, py: 0.75, '& .MuiAlert-message': { fontSize: 13 } }}>
              Alguns dados do cabeçalho vieram da leitura automática e precisam conferência. Os valores abaixo continuam editáveis.
            </Alert>
          )}

          {exam.status === 'FAILED' && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {/* A foto que ele enviou, logo acima do erro: dá pra ver sozinho se foi foto torta ou
                  o documento errado. Só quando o arquivo é imagem (a API manda exam.fileKind). */}
              {exam.fileKind === 'image' && (
                <Box sx={{ mb: 1.25 }}>
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 700, mb: 0.5 }}>
                    Foto que você enviou · toque para ampliar
                  </Typography>
                  <ExamFilePreview examId={exam.id} size={{ xs: 132, sm: 168 }} sx={{ borderRadius: '12px' }} />
                </Box>
              )}
              A extração falhou: {exam.extractionError}
              <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* 44px e o mesmo contorno discreto das outras ações da tela (25/11/26). */}
                <SecondaryButton onClick={reextract} disabled={reExtracting} startIcon={<RefreshIcon />}>Re-extrair</SecondaryButton>
                {/* "Entender o que houve" reabre o sheet educativo (auto-abre 1× por exame) */}
                <Button onClick={() => setFailSheetOpen(true)} sx={{ minHeight: 44, px: 2, borderRadius: RADIUS.button, textTransform: 'none', fontWeight: 700, color: 'text.secondary' }}>Entender o que houve</Button>
              </Box>
            </Alert>
          )}
          {exam.status === 'FAILED' && (
            <ExamFailureSheet exam={exam} open={failSheetOpen} onOpenChange={setFailSheetOpen} onRetry={reextract} />
          )}
          {(exam.status === 'UPLOADED' || exam.status === 'EXTRACTING') && (
            <ExtractionProgress startedAt={exam.createdAt} examId={exam.id} />
          )}
        </CardContent>
      </Card>

      {/* TRIAGEM DE URGÊNCIA (camada 1 — regras determinísticas do server, sem IA decidir):
          vermelho = procure atendimento AGORA; laranja = agende consulta. Sem banner = normal. */}
      {exam.status === 'EXTRACTED' && (urgency?.level === 'CRITICO' || urgency?.level === 'ATENCAO') && (
        <Alert
          severity={urgency.level === 'CRITICO' ? 'error' : 'warning'}
          icon={false}
          sx={{ mt: 2, borderRadius: RADIUS.sectionCard, '& .MuiAlert-message': { width: '100%' } }}
        >
          <Typography component="div" sx={{ fontWeight: 800, fontSize: '1.02rem' }}>
            {urgency.level === 'CRITICO' ? '🚨 Procure atendimento médico URGENTE' : '⚠️ Agende consulta médica'}
          </Typography>
          {urgency.message && (
            <Typography component="div" variant="body2" sx={{ mt: 0.25 }}>
              {urgency.message}
            </Typography>
          )}
        </Alert>
      )}

      {/* BLOQUEIO FORTE: CPF do documento ≠ perfil */}
      {cpfBlock && (
        <Card sx={{ mt: 2, border: '1px solid', borderColor: 'error.main', bgcolor: (t) => alpha('#dc2626', t.palette.mode === 'dark' ? 0.12 : 0.06) }}>
          <CardContent>
            <Typography {...CARD_TITLE} sx={{ color: (t) => SEM.bad[t.palette.mode] }}>
              {identity?.crossUser ? 'Este exame pertence a outro usuário' : 'CPF do exame não confere'}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {identity?.crossUser
                ? 'O CPF deste documento já está cadastrado em outra conta, então este exame foi bloqueado: ele não entra no seu histórico nem nas suas análises e não dá para gerar análise com ele — só você vê esta tela.'
                : <>O CPF detectado no documento ({identity?.docCpfMasked ?? 'não exibido'}) diverge do CPF cadastrado neste perfil ({identity?.profileCpfMasked ?? 'não exibido'}). Se o exame é de um dependente, troque o perfil no topo e envie novamente.</>}
            </Typography>
            {/* Texto enxugado (25/11/26): quando o CPF é de outra conta, os dois parágrafos repetiam
                "Por segurança" e diziam a mesma coisa. A instrução continua completa. */}
            <Typography variant="body2" sx={{ mt: 1, ...noteOnTint }}>
              {identity?.crossUser
                ? 'Se acredita que é um erro, acione o suporte. Se o exame não for seu, exclua.'
                : <>Por segurança, este exame não entrou no seu histórico nem nas suas análises: só você vê esta tela.
                    {exam.status === 'REJECTED' ? '' : ' Exclua o exame ou acione o suporte para investigar.'}</>}
            </Typography>
            <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button size="small" variant="contained" onClick={() => navigate(`/suporte?exam=${exam.id}`)} sx={{ minHeight: 44 }}>Acredito que houve um erro</Button>
              <Button size="small" variant="outlined" color="error" onClick={rejectExam} disabled={attesting} sx={{ minHeight: 44, color: (t) => SEM.bad[t.palette.mode] }}>Excluir exame</Button>
            </Box>
            {/* Enxugado (25/11/26): eram 4 linhas no celular para uma ressalva. O fato de privacidade (CPFs
                mascarados) continua dito. */}
            <Typography sx={{ display: 'block', mt: 0.75, fontSize: 13, lineHeight: 1.45, ...noteOnTint }}>
              A leitura automática pode errar em documentos rasurados ou ilegíveis. O suporte confere o arquivo original, com os CPFs mascarados.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* BLOQUEIO SUAVE: nome do documento ≠ perfil.
          (25/11/26) Mesmo tratamento do bloqueio de CPF: lavagem chapada no lugar do gradiente, ícone do
          conjunto no lugar do emoji, botões com 44px e sem os "✓"/"✕" de texto. O texto não mudou. */}
      {nameBlock && (
        <Card sx={{ mt: 2, border: '1px solid', borderColor: 'warning.main', bgcolor: (t) => alpha('#f59e0b', t.palette.mode === 'dark' ? 0.12 : 0.06) }}>
          <CardContent>
            <Typography {...CARD_TITLE} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'warning.main' }}>
              <WarningAmberIcon sx={{ fontSize: 20 }} aria-hidden="true" />
              Confirme o titular antes da análise
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              O nome detectado no documento (<strong>{docNameInfo.text}</strong>) parece diferente do perfil selecionado (<strong>{profileNameInfo.text}</strong>).
            </Typography>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              <Chip size="small" label={`Similaridade ${Math.round((nm.score || 0) * 100)}%`} sx={{ bgcolor: (t) => `rgba(245,158,11,${t.palette.mode === 'dark' ? 0.2 : 0.09})`, color: (t) => SEM.warn[t.palette.mode], fontWeight: 800 }} />
              <Chip size="small" label="Proteção de privacidade" sx={{ bgcolor: (t) => `rgba(14,165,233,${t.palette.mode === 'dark' ? 0.2 : 0.09})`, color: (t) => SEM.info[t.palette.mode], fontWeight: 800 }} />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Se o exame é realmente deste paciente, confirme para liberar a análise. Se não for, exclua para evitar misturar dados de outra pessoa.</Typography>
            <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button variant="contained" onClick={attest} disabled={attesting} startIcon={<CheckIcon />} sx={{ minHeight: 44, borderRadius: RADIUS.button, textTransform: 'none', fontWeight: 700 }}>Confirmo que é deste paciente</Button>
              <Button variant="outlined" color="error" onClick={rejectExam} disabled={attesting} sx={{ minHeight: 44, borderRadius: RADIUS.button, textTransform: 'none', fontWeight: 700 }}>Não é deste paciente (excluir)</Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* LABORATORIAL: valores */}
      {exam.status === 'EXTRACTED' && exam.kind !== 'IMAGING' && items.length > 0 && (
        <>
          {/* banner de atenção — sem a faixa lateral grossa (regra de profundidade do DS, 25/11/26);
              o estado continua no título, nos chips e na borda. */}
          <Card sx={{ mt: 2, ...(abnormal.length ? { border: '1px solid', borderColor: 'warning.main' } : {}) }}>
            <CardContent>
              {abnormal.length ? (
                <>
                  <Typography {...CARD_TITLE} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'warning.main' }}>
                    <FlagIcon sx={{ fontSize: 20 }} aria-hidden="true" />
                    {plural(abnormal.length, 'valor')} fora da faixa
                  </Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                    {abnormal.map((i) => (
                      <Chip key={i.id} color="warning" variant="outlined" sx={{ minHeight: 44, fontSize: 13.5 }}
                        label={`${i.flag === 'HIGH' ? '↑ ' : i.flag === 'LOW' ? '↓ ' : ''}${i.name}: ${i.valueText ?? ''}`} onClick={() => openCitation(i.extractedPage)} />
                    ))}
                  </Stack>
                </>
              ) : noRef.length > 0 ? (
                <Typography {...CARD_TITLE} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
                  <InfoOutlinedIcon sx={{ fontSize: 20 }} aria-hidden="true" />
                  {noRef.length} de {plural(items.length, 'valor')} sem referência informada pelo laboratório — não foi possível classificar automaticamente.
                </Typography>
              ) : (
                <Typography {...CARD_TITLE} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'success.main' }}>
                  <CheckCircleIcon sx={{ fontSize: 20 }} aria-hidden="true" />
                  Todos os {items.length} valores estão dentro da faixa
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* itens por painel — UMA lista com divisórias (25/11/26; antes cada painel era um cartão
              separado). Accordion colapsável, sem scroll infinito em exames grandes. */}
          <Box sx={{ mt: 2, borderRadius: RADIUS.sectionCard, border: '1px solid', borderColor: 'divider', overflow: 'hidden', bgcolor: 'background.paper' }}>
          {Object.entries(grouped).map(([panel, list]: any, panelIdx: number, panelList: any[]) => {
            const abn = (list as any[]).filter((i: any) => i.isAbnormal).length;
            const fewPanels = Object.keys(grouped).length <= 2;
            return (
            <Accordion key={panel} disableGutters elevation={0} defaultExpanded={fewPanels}
              sx={{ mt: 0, backgroundColor: 'transparent', borderRadius: '0 !important', overflow: 'hidden', border: 0, borderBottom: panelIdx < panelList.length - 1 ? '1px solid' : 0, borderColor: 'divider', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: '48px !important', px: 2, '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
                <Typography component="h3" sx={{ fontWeight: 700, fontSize: '1rem', flex: '1 1 auto', minWidth: 0, wordBreak: 'break-word', overflowWrap: 'anywhere', pr: 1 }}>{panel}</Typography>
                {abn > 0 && <Chip size="small" color="error" variant="outlined" label={`${abn} fora da faixa`} sx={{ ml: 0.5, height: 22, flexShrink: 0 }} />}
                <Chip size="small" label={`${(list as any[]).length} ${(list as any[]).length === 1 ? 'item' : 'itens'}`} sx={{ ml: 0.5, bgcolor: 'rgba(0,0,0,.05)', color: 'text.primary', height: 20, fontWeight: 600, flexShrink: 0 }} />
              </AccordionSummary>
              {/* p: 0 — o respiro fica em cada linha (px/py abaixo), assim a lavagem do valor fora da faixa e as
                  divisórias vão de borda a borda da seção. */}
              <AccordionDetails sx={{ p: 0 }}>
                <Stack divider={<Divider sx={{ borderColor: 'divider', my: 0.5 }} />}>
                  {(list as any[]).map((it) => {
                    const m = fm(it);
                    const out = it.isAbnormal;
                    const valColor = out ? (m.color === 'error' ? 'error.main' : 'warning.main') : 'success.main';
                    const goal: ClinicalGoalView | null = goalFor(clinicalGoals, it.nameCanonical, exam.patientId);
                    const goalText = goal ? dualStatusText(withinGoal(it.valueNumeric, goal), withinRef(it.valueNumeric, it.refLow, it.refHigh)) : null;
                    return (
                      <Box key={it.id} sx={{
                        py: 1.25, px: 2,
                        // Fora da faixa = só a lavagem (é um estado), de borda a borda da seção (25/11/26). A faixa
                        // lateral grossa de 5px saiu: é o mesmo "side-tab" que o design-system bane nos cartões.
                        background: out ? (t) => alpha(m.color === 'error' ? t.palette.error.main : t.palette.warning.main, t.palette.mode === 'dark' ? 0.16 : 0.07) : 'transparent',
                      }}>
                        {/* Nome (quebra linha, não corta) + ? + status */}
                        <Stack direction="row" alignItems="flex-start" useFlexGap spacing={0.5} sx={{ mb: 0.25 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', flex: 1, minWidth: 0, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.3 }}>{it.name}</Typography>
                          <ExplainButton name={it.name} nameCanonical={it.nameCanonical} />
                          <Chip color={m.color} label={m.label} size="small" sx={{ flexShrink: 0 }} />
                          {goal && (
                            <MuiTooltip
                              title={
                                <Box sx={{ p: 0.5, maxWidth: 280 }}>
                                  <Typography sx={{ fontWeight: 800, fontSize: 13 }}>{goalRangeText(goal)}</Typography>
                                  {goal.setBy && <Typography sx={{ fontSize: 12, opacity: 0.85, mt: 0.5 }}>{goal.setBy}</Typography>}
                                  {goal.justification && <Typography sx={{ fontSize: 12, opacity: 0.85, mt: 0.5 }}>{goal.justification}</Typography>}
                                  {goal.source && <Typography sx={{ fontSize: 12, opacity: 0.7, mt: 0.5 }}>Fonte: {goal.source}</Typography>}
                                </Box>
                              }
                              arrow
                            >
                              <Chip size="small" label="🎯 Meta clínica" sx={{ flexShrink: 0, height: 24, fontWeight: 700, bgcolor: 'rgba(212,165,116,0.16)', color: (t) => t.palette.mode === 'dark' ? '#d4a574' : '#8a6240', border: '1px dashed rgba(212,165,116,0.7)' }} />
                            </MuiTooltip>
                          )}
                        </Stack>
                        {/* Valor grande + cor (vermelho alterado, laranja alerta, verde normal) + unidade + pág */}
                        <Stack direction="row" spacing={1} alignItems="baseline" useFlexGap flexWrap="wrap">
                          <EditableItemValue it={it} color={valColor} onSaved={(u) => setExam((e: any) => e ? { ...e, items: (e.items ?? []).map((i: any) => i.id === u.id ? { ...i, ...u } : i) } : e)} />
                          {unitSuffix(it) ? <UnitLabel unit={unitSuffix(it)} /> : null}
                          {/* Link pequeno, alvo de 44px (abre o laudo nesta página — em cima do dedo não dá pra acertar 20px). */}
                          <Button size="small" sx={{ fontSize: '0.85rem', minWidth: 0, p: 0, position: 'relative', '&::before': { content: '""', position: 'absolute', inset: '-12px -8px' } }} onClick={() => openCitation(it.extractedPage)}>pág. {it.extractedPage}</Button>
                        </Stack>
                        {/* Referência + barra visual */}
                        <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', mt: 0.25, wordBreak: 'break-word' }}>
                          <strong>Referência:</strong> {fmtRef(it)}
                        </Typography>
                        {/* Régua pediátrica em uso (transparência: por que está marcado) */}
                        {String(it.refAppliesTo || '').startsWith('Pediátrico') && (
                          <Chip size="small" label={it.refAppliesTo} title="Faixa por idade (educativa) — nunca substitui o pediatra"
                            sx={{ mt: 0.25, height: 20, fontSize: '0.75rem', fontWeight: 700, bgcolor: 'rgba(32,178,170,.10)', color: (t) => tealText(t.palette.mode) }} />
                        )}
                        {/* Meta clínica (E2.4 — camada 2): texto explícito do duplo-estado.
                            REGRA DURA: meta atingida NÃO esconde "fora da referência" (e vice-versa). */}
                        {goal && (
                          <Typography variant="caption" sx={{ display: 'block', mt: 0.25, color: (t) => t.palette.mode === 'dark' ? '#d4a574' : '#8a6240', fontWeight: 700, wordBreak: 'break-word' }}>
                            🎯 Meta clínica ({goalRangeText(goal)}): {goalText ?? `definida por ${goal.setBy}`}
                          </Typography>
                        )}
                        {/* Régua visual única (RefBar): posição do valor na faixa de referência.
                            ValueBar removido (audit 21/10): duplicava a RefBar com cores de
                            marcador conflitantes (verde fixo x semântico). */}
                        <RefBar value={it.valueNumeric} refLow={it.refLow} refHigh={it.refHigh} unit={it.unit} />
                        {/* Sparkline mini-gráfico (linha temporal + faixa verde) — se há histórico */}
                        {it.history && it.history.length >= 2 && (
                          <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Sparkline points={it.history.map((h: any) => ({ value: h.valueNumeric ?? h.value, date: h.date }))} refLow={it.refLow} refHigh={it.refHigh} />
                            <Typography variant="caption" sx={{ fontSize: 12, color: 'text.secondary' }}>{it.history.length} medições</Typography>
                          </Box>
                        )}
                        {out && it.valueNumeric != null && it.refLow != null && it.refHigh != null && (
                          <Typography variant="caption" sx={{ color: m.color === 'error' ? 'error.main' : 'warning.main', fontWeight: 700, mt: 0.25, display: 'block' }}>
                            {it.valueNumeric > it.refHigh
                              ? `↑ ${Math.round((it.valueNumeric - it.refHigh) / Math.abs(it.refHigh) * 100)}% acima do limite`
                              : `↓ ${Math.round((it.refLow - it.valueNumeric) / Math.abs(it.refLow || 1) * 100)}% abaixo do limite`}
                          </Typography>
                        )}
                        {out && (<Box sx={{ mt: 1 }}><TelemedicineButton marker={it.nameCanonical} compact /></Box>)}
                      </Box>
                    );
                  })}
                </Stack>
              </AccordionDetails>
            </Accordion>
          );
          })}
          </Box>
        </>
      )}

      {/* IMAGEM: achados */}
      {exam.status === 'EXTRACTED' && exam.kind === 'IMAGING' && exam.rawExtraction?.findings && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Typography {...CARD_TITLE} sx={{ mb: 1 }}>Achados do laudo</Typography>
            {(exam.rawExtraction.findings as any[]).map((f, i) => (
              <Typography key={i} sx={{ mb: 1, fontSize: '1.02rem' }}>• {f.text}</Typography>
            ))}
            {exam.rawExtraction.impression && (
              <Typography sx={{ mt: 1 }}><strong>Impressão:</strong> {exam.rawExtraction.impression}</Typography>
            )}
          </CardContent>
        </Card>
      )}

      {/* DR. EXAME (depois dos valores): resumo + pergunte sobre este exame */}
      {exam.status === 'EXTRACTED' && (
        <Box sx={{ mt: 2 }}>
          {summary ? (
            <>
              {/* 29/09: regenerar TAMBÉM é espera de IA — antes só um spinner 18px no
                  botão (dono: "gerar resumo não veio animação"). Cena do robô durante
                  a regeneração; o resumo volta quando termina. */}
              {genLoading ? (
                <Box sx={{ py: 2 }}><AnalysisScan label="Dr. Exame está regenerando seu resumo" /></Box>
              ) : (
                <HealthSummary analysis={summary} />
              )}
              <Box sx={{ mt: 1.5, textAlign: 'center' }}>
                <SecondaryButton onClick={() => generateSummary(true)} disabled={genLoading} startIcon={genLoading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}>
                  Regenerar resumo
                </SecondaryButton>{' '}
                <CreditBadge amount={CREDIT_COSTS.summary} />
              </Box>
            </>
          ) : (
            <Card variant="outlined">
              <CardContent>
                <Typography {...CARD_TITLE} sx={{ mb: 0.75 }}>Análise de saúde</Typography>
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                  Gera um resumo educativo comparando com o exame anterior e os pontos a levar ao médico.
                </Typography>
                {/* Exame bloqueado por CPF: "Gerar resumo" seria recusado na hora. Em vez do botão destaque que
                    não funciona, a pessoa vê o motivo — o destaque da tela fica com o que resolve ("Acredito que
                    houve um erro", no aviso acima). */}
                {cpfBlock ? (
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: 'text.secondary', fontSize: 13.5 }}>
                    <LockIcon sx={{ fontSize: 18, flexShrink: 0 }} aria-hidden="true" />
                    A análise deste exame só fica disponível depois que o CPF for conferido.
                  </Stack>
                ) : (
                  <>
                    <Button variant="contained" size="large" onClick={() => generateSummary(false)} disabled={genLoading}>
                      {genLoading ? <CircularProgress size={22} /> : 'Gerar resumo'}
                    </Button>{' '}
                    <CreditBadge amount={CREDIT_COSTS.summary} />
                  </>
                )}
                {genLoading && <Box sx={{ mt: 3, pt: 1 }}><AnalysisScan label="Dr. Exame está analisando seu exame" /></Box>}
              </CardContent>
            </Card>
          )}
        </Box>
      )}
      {exam.status === 'EXTRACTED' && summary && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Typography {...CARD_TITLE} sx={{ mb: 1 }}>Conversar com Dr. Exame</Typography>
            <Box sx={{ mb: 1 }}><CreditBadge amount={CREDIT_COSTS.chat} label={`${CREDIT_COSTS.chat} por pergunta`} /></Box>
            <Box sx={{ maxHeight: 320, overflowY: 'auto', mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: RADIUS.sm }}>
              {chatMessages.length === 0 && <Typography color="text.secondary">Ex.: "Por que minha hemoglobina subiu?"</Typography>}
              {chatMessages.map((m, i) => (
                <Box key={i} sx={{ textAlign: m.role === 'user' ? 'right' : 'left', mb: 1 }}>
                  <Box sx={{ display: 'inline-block', maxWidth: '85%', px: 1.25, py: 0.75, borderRadius: RADIUS.md, whiteSpace: 'pre-wrap', wordBreak: 'break-word', bgcolor: m.role === 'user' ? 'primary.main' : 'background.paper', color: m.role === 'user' ? 'primary.contrastText' : 'text.primary', border: m.role === 'user' ? 'none' : '1px solid', borderColor: 'divider' }}>{m.text || '…'}</Box>
                  {/* FEATURE C — rodapé discreto com as diretrizes citadas (chips 12px, teal AA) */}
                  {m.role === 'assistant' && !!m.sources?.length && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center', mt: 0.5, justifyContent: 'flex-start' }}>
                      <Typography component="span" sx={{ fontSize: 12, fontWeight: 700, color: (t) => tealText(t.palette.mode) }}>📚 Fontes:</Typography>
                      {/* G4 — explainer "O que é isso?" (que diretrizes são essas) */}
                      <WhatIsThis topic="diretrizes" />
                      {m.sources.map((s, si) => (
                        <Chip key={`${s.label}-${si}`} label={s.label} size="small" sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(32,178,170,.10)', color: (t) => tealText(t.palette.mode), border: '1px solid rgba(32,178,170,.18)' }} />
                      ))}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
            <Divider sx={{ my: 1 }} />
            <Stack direction="row" spacing={1}>
              <Box component="input" value={chatInput} disabled={chatBusy} placeholder="Converse com o Dr. Exame…"
                onChange={(e: any) => setChatInput(e.target.value)}
                onKeyDown={(e: any) => { if (e.key === 'Enter' && !chatBusy) sendChat(); }}
                sx={{ flex: 1, px: 1.5, py: 1.25, fontSize: 16, borderRadius: RADIUS.sm, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', color: 'text.primary', outline: 'none' }} />
              <Button variant="contained" onClick={sendChat} disabled={chatBusy || !chatInput.trim()}>Enviar</Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* PREPARO DE CONSULTA — cartão limpo (25/11/26): sem o fundo verde, tinta é só para estado.
          "Gerar documento" é ação discreta; o único botão destaque da tela é "Gerar resumo". */}
      {exam.status === 'EXTRACTED' && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.25, sm: 2 }} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Typography {...CARD_TITLE} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: 1 }}>
                <AssignmentTurnedInIcon sx={{ fontSize: 20, color: (t) => tealText(t.palette.mode) }} aria-hidden="true" />
                Preparar visita ao médico
              </Typography>
              <SecondaryButton sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={async () => {
                  const r = await fetch(`${API_URL}/consulta/exams/${id}`, {
                    method: 'POST', headers: { Authorization: `Bearer ${token()}` },
                  });
                  const d = await r.json();
                  if (d.html) { setDocHtml(d.html); setDocTitle('Preparo de consulta'); setDocOpen(true); }
                }}>
                Gerar documento
              </SecondaryButton>
            </Stack>
            <Typography sx={{ color: 'text.secondary', mt: 0.5, fontSize: 13, lineHeight: 1.45 }}>
              1 página com os valores fora da faixa + perfil clínico + comparação. Pronto para levar na consulta.
            </Typography>
          </CardContent>
        </Card>
      )}

      <DocPreview html={docHtml} open={docOpen} onClose={() => setDocOpen(false)} title={docTitle} />
      <ConfirmSpend open={confirmSpend.open} credits={confirmSpend.credits} title={confirmSpend.title} desc={confirmSpend.desc}
        onClose={() => setConfirmSpend(s => ({ ...s, open: false }))} onConfirm={confirmSpend.onYes} />
    </Box>
  );
};
