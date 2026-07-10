import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Chip, Button, CircularProgress, Alert, Divider, Stack,
  Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Title, useNotify } from 'react-admin';
import { API_URL, token } from '../../config';
import { confirmDialog } from '../../components/ConfirmDialog';
import { Capacitor } from '@capacitor/core';
import { openBlobFile } from '../../utils/nativeDoc';
import { HealthSummary } from '../../components/HealthSummary';
import { displayStatus } from '../../utils/examStatus';
import { ValueBar } from '../../components/ValueBar';
import { RefBar } from '../../components/RefBar';
import { Sparkline } from '../../components/Sparkline';
import { ExplainButton } from '../../components/ExplainItem';
import { TelemedicineButton } from '../../components/TelemedicineButton';
import { fmtVal, unitSuffix } from '../../utils/format';
import { categorizeExam } from '../../utils/medicalData';
import { ExtractionProgress } from '../../components/ExtractionProgress';
import { AnimatedDoctor } from '../../components/AnimatedDoctor';
import { CreditBadge, CREDIT_COSTS } from '../../components/CreditBadge';
import { ConfirmSpend } from '../../components/ConfirmSpend';
import { DocPreview } from '../../components/DocPreview';
import { cleanExtractedLabel } from '../../utils/examDisplay';

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
    } finally { setBusy(false); }
  };
  if (editing) return (
    <Box component="input" value={v} autoFocus disabled={busy}
      onChange={(e: any) => setV(e.target.value)} onBlur={save}
      onKeyDown={(e: any) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setV(it.valueText ?? ''); setEditing(false); } }}
      sx={{ fontSize: '1.4rem', fontWeight: 800, p: '2px 6px', borderRadius: 1, border: '2px solid #20b2aa', outline: 'none', width: 150, bgcolor: 'background.paper', color }} />
  );
  return (
    <Typography onClick={() => setEditing(true)} title="Toque para corrigir o valor"
      sx={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.2, color, cursor: 'pointer', borderBottom: '2px dotted rgba(32,178,170,.45)', '&:hover': { color: '#178f89' } }}>
      {fmtVal(it)} <Box component="span" sx={{ fontSize: '0.8rem', opacity: 0.6 }}>✏️</Box>
    </Typography>
  );
};

const statusColor: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  EXTRACTED: 'success', FAILED: 'error', UPLOADED: 'warning', EXTRACTING: 'info',
};
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

export const ExamShow = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const [exam, setExam] = useState<any>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [explain, setExplain] = useState<any | null>(null);
  const [attesting, setAttesting] = useState(false);
  const [docHtml, setDocHtml] = useState('');
  const [docOpen, setDocOpen] = useState(false);
  const [docTitle, setDocTitle] = useState('Documento');
  const [confirmSpend, setConfirmSpend] = useState<{ open: boolean; credits: number; title: string; desc?: string; onYes: () => void }>({ open: false, credits: 0, title: '', onYes: () => {} });

  useEffect(() => {
    let active = true;
    let timer: any;
    let attempts = 0;
    const load = async () => {
      attempts++;
      if (attempts > 60) { notify('A extração está demorando mais que o normal. Pode continuar usando o app — avisamos quando terminar.', { type: 'warning' }); return; }
      const r = await fetch(`${API_URL}/exams/${id}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!active || !r.ok) return;
      const d = await r.json();
      if (!active) return;
      setExam(d);
      if (d.status === 'UPLOADED' || d.status === 'EXTRACTING') timer = setTimeout(load, 3000);
    };
    load();
    return () => { active = false; clearTimeout(timer); };
  }, [id]);

  const summary = exam?.analyses?.[0] ?? null;
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
        notify('💎 Sem créditos. Compre um pacote (PIX) ou assine o mensal em “Planos e Créditos”.', { type: 'warning' });
        setGenLoading(false);
        return;
      }
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Falha'); }
      const analysis = await r.json();
      setExam({ ...exam, analyses: [analysis, ...(exam.analyses ?? [])] });
      window.dispatchEvent(new Event('creditsChanged'));
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
      if (r.status === 402) { const e = await r.json().catch(() => ({})); notify(e.message || 'Sem créditos para conversar.', { type: 'warning' }); setChatMessages((m) => m.slice(0, -2)); setChatBusy(false); return; }
      if (!r.ok || !r.body) throw new Error('falha');
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop() ?? '';
        for (const p of parts) {
          const line = p.startsWith('data: ') ? p.slice(6) : p;
          try { const evt = JSON.parse(line); if (evt.delta) setChatMessages((m) => { const c = [...m]; c[idx] = { role: 'assistant', text: (c[idx]?.text ?? '') + evt.delta }; return c; }); } catch { /* */ }
        }
      }
    } catch { notify('Erro no chat', { type: 'error' }); }
    finally { setChatBusy(false); window.dispatchEvent(new Event('creditsChanged')); }
  };

  if (!exam) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

  const items: any[] = exam.items ?? [];
  const cc = categorizeExam(exam); // categoria do exame (dominante pelos itens) — badge no header
  const titleInfo = cleanExtractedLabel(exam.title, kindLabel[exam.kind] ?? 'Exame', 72);
  const labInfo = cleanExtractedLabel(exam.sourceLab, '', 56);
  const patientInfo = cleanExtractedLabel(exam.rawExtraction?.patientName, '', 56);
  const doctorInfo = cleanExtractedLabel(exam.rawExtraction?.requestingDoctor, '', 56);
  const docNameInfo = cleanExtractedLabel(nm?.docName, 'nome detectado no documento', 64);
  const profileNameInfo = cleanExtractedLabel(nm?.profileName, 'perfil selecionado', 64);
  const headerNeedsReview = !!exam.reviewRequired || titleInfo.suspicious || labInfo.suspicious || patientInfo.suspicious || doctorInfo.suspicious || !exam.performedAt;
  const abnormal = items.filter((i) => i.isAbnormal);
  // UNKNOWN = sem faixa de referência (ou sem valor). NÃO é "dentro da faixa" — o header distingue.
  const noRef = items.filter((i) => (i.flag ?? '').toUpperCase() === 'UNKNOWN');
  const grouped = items.reduce((acc: any, it: any) => { (acc[it.panel ?? 'Geral'] ??= []).push(it); return acc; }, {});
  // Híbrido: NORMAL/HIGH/LOW/ABNORMAL/CRITICAL usam flagMeta (cores atuais preservadas).
  // UNKNOWN (sem referência ou sem valor) usa displayStatus — distingue "Interpretação depende do
  // contexto clínico" (LDL/não-HDL) de "Referência não informada". Nunca exibe '—'/UNKNOWN cru.
  const fm = (it: any) => {
    const f = (it?.flag ?? '').toUpperCase();
    if (f === 'UNKNOWN' || !flagMeta[f]) {
      const s = displayStatus(it?.flag, it?.name, it?.refLow, it?.refHigh);
      return { color: 'default' as const, label: s.short, title: s.label };
    }
    return flagMeta[f];
  };

  return (
    <Box sx={{ maxWidth: 1080, mx: 'auto', p: { xs: 1, md: 2 } }}>
      <Title title={titleInfo.text || exam.title} />

      {/* Cabeçalho */}
      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
            <Typography variant="h5" component="h1" title={titleInfo.original || exam.title} sx={{ fontSize: { xs: '1.15rem', md: '1.5rem' }, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minWidth: 0 }}>{titleInfo.text || 'Exame'}</Typography>
            <Chip color={statusColor[exam.status] ?? 'default'} label={statusLabel[exam.status] ?? exam.status} />
            {exam.kind === 'IMAGING' && <Chip variant="outlined" label="Imagem" />}
            {exam.kind === 'LAB_PANEL' && <Chip variant="outlined" label="Laboratorial" />}
            {cc.key !== 'image' && cc.key !== 'other' && <Chip size="small" sx={{ bgcolor: cc.color + '18', color: cc.color, fontWeight: 700 }} label={`${cc.emoji} ${cc.cat}`} />}
            {headerNeedsReview && <Chip color="warning" label="conferir dados" />}
          </Stack>
          <Typography color="text.secondary">
            {exam.performedAt ? new Date(exam.performedAt).toLocaleDateString('pt-BR') : 'Data não identificada'}
            {labInfo.text ? ` • ${labInfo.text}` : labInfo.suspicious ? ' • laboratório em revisão' : ''}
            {exam.pageCount ? ` • ${exam.pageCount} pág.` : ''}
          </Typography>
          {(patientInfo.text || patientInfo.suspicious || doctorInfo.text || doctorInfo.suspicious) && (
            <Typography color="text.secondary" sx={{ fontSize: '0.85rem', mt: 0.5 }}>
              {patientInfo.text ? `👤 ${patientInfo.text}` : patientInfo.suspicious ? '👤 Titular detectado em revisão' : ''}
              {doctorInfo.text ? ` • 🩺 ${doctorInfo.text}` : doctorInfo.suspicious ? ' • 🩺 Médico solicitante em revisão' : ''}
            </Typography>
          )}
          {headerNeedsReview && (
            <Alert severity="info" icon={false} sx={{ mt: 1.5, borderRadius: 2, py: 0.75, '& .MuiAlert-message': { fontSize: 13 } }}>
              Alguns dados do cabeçalho vieram da leitura automática e precisam conferência. Os valores abaixo continuam editáveis.
            </Alert>
          )}

          {exam.status === 'FAILED' && (
            <Alert severity="error" sx={{ mt: 2 }}>
              A extração falhou: {exam.extractionError}
              <Box sx={{ mt: 1 }}><Button size="small" variant="outlined" onClick={reextract} disabled={reExtracting}>Re-extrair</Button></Box>
            </Alert>
          )}
          {(exam.status === 'UPLOADED' || exam.status === 'EXTRACTING') && (
            <ExtractionProgress />
          )}
        </CardContent>
      </Card>

      {/* BLOQUEIO FORTE: CPF do documento ≠ perfil */}
      {cpfBlock && (
        <Card sx={{ mt: 2, borderLeft: '6px solid', borderColor: 'error.main', background: 'linear-gradient(135deg, rgba(220,38,38,.08), #fff)' }}>
          <CardContent>
            <Typography sx={{ fontWeight: 800, color: 'error.main' }}>CPF do exame não confere</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              O CPF detectado no documento ({identity?.docCpfMasked ?? 'não exibido'}) diverge do CPF cadastrado neste perfil ({identity?.profileCpfMasked ?? 'não exibido'}).
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Por segurança, este exame não pode gerar análise neste perfil. Exclua o exame ou acione o suporte para investigar.</Typography>
            <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button size="small" variant="outlined" color="error" onClick={rejectExam} disabled={attesting}>Excluir exame</Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* BLOQUEIO SUAVE: nome do documento ≠ perfil */}
      {nameBlock && (
        <Card sx={{ mt: 2, borderLeft: '6px solid', borderColor: 'warning.main', background: 'linear-gradient(135deg, rgba(245,158,11,.08), #fff)' }}>
          <CardContent>
            <Typography sx={{ fontWeight: 800, color: '#b45309' }}>⚠️ Confirme o titular antes da análise</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              O nome detectado no documento (<strong>{docNameInfo.text}</strong>) parece diferente do perfil selecionado (<strong>{profileNameInfo.text}</strong>).
            </Typography>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              <Chip size="small" label={`Similaridade ${Math.round((nm.score || 0) * 100)}%`} sx={{ bgcolor: '#f59e0b18', color: '#b45309', fontWeight: 800 }} />
              <Chip size="small" label="Proteção de privacidade" sx={{ bgcolor: '#0ea5e918', color: '#0369a1', fontWeight: 800 }} />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Se o exame é realmente deste paciente, confirme para liberar a análise. Se não for, exclua para evitar misturar dados de outra pessoa.</Typography>
            <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button size="small" variant="contained" onClick={attest} disabled={attesting}>✓ Confirmo que é deste paciente</Button>
              <Button size="small" variant="outlined" color="error" onClick={rejectExam} disabled={attesting}>✕ Não é deste paciente (excluir)</Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* LABORATORIAL: valores */}
      {exam.status === 'EXTRACTED' && exam.kind !== 'IMAGING' && items.length > 0 && (
        <>
          {/* banner de atenção */}
          <Card sx={{ mt: 2, borderLeft: abnormal.length ? '6px solid' : undefined, borderColor: 'warning.main' }}>
            <CardContent>
              {abnormal.length ? (
                <>
                  <Typography sx={{ fontWeight: 700, color: 'warning.main' }}>
                    🚩 {abnormal.length} valor(es) fora da faixa de referência
                  </Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                    {abnormal.map((i) => (
                      <Chip key={i.id} color="warning" variant="outlined"
                        label={`${i.name}: ${i.valueText ?? ''}`} onClick={() => openCitation(i.extractedPage)} />
                    ))}
                  </Stack>
                </>
              ) : noRef.length > 0 ? (
                <Typography sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  {noRef.length} de {items.length} valor(es) sem referência informada pelo laboratório — não foi possível classificar automaticamente.
                </Typography>
              ) : (
                <Typography sx={{ fontWeight: 700, color: 'success.main' }}>
                  ✅ Todos os {items.length} valores estão dentro da faixa de referência.
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* itens por painel — Acoordion colapsável (sem scroll infinito em exames grandes) */}
          {Object.entries(grouped).map(([panel, list]: any) => {
            const abn = (list as any[]).filter((i: any) => i.isAbnormal).length;
            const fewPanels = Object.keys(grouped).length <= 2;
            return (
            <Accordion key={panel} disableGutters elevation={0} defaultExpanded={fewPanels}
              sx={{ mt: 1.5, borderRadius: '12px !important', overflow: 'hidden', border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: '48px !important', '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}>
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', flex: '1 1 auto', minWidth: 0, wordBreak: 'break-word', overflowWrap: 'anywhere', pr: 1 }}>{panel}</Typography>
                {abn > 0 && <Chip size="small" color="error" variant="outlined" label={`${abn} alterado${abn > 1 ? 's' : ''}`} sx={{ ml: 0.5, height: 20, flexShrink: 0 }} />}
                <Chip size="small" label={`${(list as any[]).length} itens`} sx={{ ml: 0.5, bgcolor: 'rgba(0,0,0,.05)', color: 'text.secondary', height: 20, flexShrink: 0 }} />
              </AccordionSummary>
              <AccordionDetails sx={{ p: 1 }}>
                <Stack divider={<Divider sx={{ borderColor: 'divider', my: 0.5 }} />}>
                  {(list as any[]).map((it) => {
                    const m = fm(it);
                    const out = it.isAbnormal;
                    const valColor = out ? (m.color === 'error' ? 'error.main' : 'warning.main') : 'success.main';
                    return (
                      <Box key={it.id} sx={{
                        py: 1.25, pl: 1, borderRadius: 1,
                        borderLeft: out ? '5px solid' : '5px solid transparent',
                        borderColor: out ? (m.color === 'error' ? 'error.main' : 'warning.main') : 'transparent',
                        background: out ? (m.color === 'error' ? 'rgba(198,40,40,.06)' : 'rgba(230,81,0,.06)') : 'transparent',
                      }}>
                        {/* Nome (quebra linha, não corta) + ? + status */}
                        <Stack direction="row" alignItems="flex-start" useFlexGap spacing={0.5} sx={{ mb: 0.25 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', flex: 1, minWidth: 0, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.3 }}>{it.name}</Typography>
                          <ExplainButton name={it.name} nameCanonical={it.nameCanonical} />
                          <Chip color={m.color} label={m.label} size="small" sx={{ flexShrink: 0 }} />
                        </Stack>
                        {/* Valor grande + cor (vermelho alterado, laranja alerta, verde normal) + unidade + pág */}
                        <Stack direction="row" spacing={1} alignItems="baseline" useFlexGap flexWrap="wrap">
                          <EditableItemValue it={it} color={valColor} onSaved={(u) => setExam((e: any) => e ? { ...e, items: (e.items ?? []).map((i: any) => i.id === u.id ? { ...i, ...u } : i) } : e)} />
                          {unitSuffix(it) ? <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>{unitSuffix(it)}</Typography> : null}
                          <Button size="small" sx={{ fontSize: '0.75rem', minWidth: 0, p: 0 }} onClick={() => openCitation(it.extractedPage)}>pág. {it.extractedPage}</Button>
                        </Stack>
                        {/* Referência + barra visual */}
                        <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', mt: 0.25, wordBreak: 'break-word' }}>
                          <strong>Referência:</strong> {fmtRef(it)}
                        </Typography>
                        <ValueBar value={it.valueNumeric} low={it.refLow} high={it.refHigh} />
                        <RefBar value={it.valueNumeric} refLow={it.refLow} refHigh={it.refHigh} unit={it.unit} />
                        {/* Sparkline mini-gráfico (linha temporal + faixa verde) — se há histórico */}
                        {it.history && it.history.length >= 2 && (
                          <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Sparkline points={it.history.map((h: any) => ({ value: h.valueNumeric ?? h.value, date: h.date }))} refLow={it.refLow} refHigh={it.refHigh} />
                            <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>{it.history.length} medições</Typography>
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
        </>
      )}

      {/* IMAGEM: achados */}
      {exam.status === 'EXTRACTED' && exam.kind === 'IMAGING' && exam.rawExtraction?.findings && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Achados do laudo</Typography>
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
              <HealthSummary analysis={summary} />
              <Box sx={{ mt: 1.5, textAlign: 'center' }}>
                <Button size="small" variant="outlined" onClick={() => generateSummary(true)} disabled={genLoading}>
                  {genLoading ? <CircularProgress size={18} /> : '↻ Regenerar resumo'}
                </Button>{' '}
                <CreditBadge amount={CREDIT_COSTS.summary} />
              </Box>
            </>
          ) : (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>Análise de saúde</Typography>
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                  Gera um resumo educativo comparando com o exame anterior e os pontos a levar ao médico.
                </Typography>
                <Button variant="contained" size="large" onClick={() => generateSummary(false)} disabled={genLoading}>
                  {genLoading ? <CircularProgress size={22} /> : 'Gerar resumo'}
                </Button>{' '}
                <CreditBadge amount={CREDIT_COSTS.summary} />
                {genLoading && <AnimatedDoctor text="Dr. Exame está analisando seu exame…" />}
              </CardContent>
            </Card>
          )}
        </Box>
      )}
      {exam.status === 'EXTRACTED' && summary && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Pergunte sobre este exame</Typography>
            <Box sx={{ mb: 1 }}><CreditBadge amount={CREDIT_COSTS.chat} label={`${CREDIT_COSTS.chat} por pergunta`} /></Box>
            <Box sx={{ maxHeight: 320, overflowY: 'auto', mb: 1, p: 1, background: '#f3f6fb', borderRadius: 1 }}>
              {chatMessages.length === 0 && <Typography color="text.secondary">Ex.: "Por que minha hemoglobina subiu?"</Typography>}
              {chatMessages.map((m, i) => (
                <Box key={i} sx={{ textAlign: m.role === 'user' ? 'right' : 'left', mb: 1 }}>
                  <Chip color={m.role === 'user' ? 'primary' : 'default'} label={m.text || '…'} sx={{ maxWidth: '85%', whiteSpace: 'pre-wrap', height: 'auto', padding: '8px' }} />
                </Box>
              ))}
            </Box>
            <Divider sx={{ my: 1 }} />
            <Stack direction="row" spacing={1}>
              <Box component="input" value={chatInput} disabled={chatBusy} placeholder="Pergunte sobre o exame…"
                onChange={(e: any) => setChatInput(e.target.value)}
                onKeyDown={(e: any) => { if (e.key === 'Enter' && !chatBusy) sendChat(); }}
                style={{ flex: 1, padding: '10px 12px', fontSize: 16, borderRadius: 8, border: '1px solid #c4d0e0' }} />
              <Button variant="contained" onClick={sendChat} disabled={chatBusy || !chatInput.trim()}>Enviar</Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* PREPARO DE CONSULTA */}
      {exam.status === 'EXTRACTED' && (
        <Card sx={{ mt: 2, background: 'linear-gradient(135deg,#e8f5e9,#c8e6c9)', border: '1px solid #a5d6a7' }}>
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="h6" sx={{ color: '#2e7d32', flex: 1 }}>📋 Preparar visita ao médico</Typography>
              <Button variant="contained" color="success" size="large"
                onClick={async () => {
                  const r = await fetch(`${API_URL}/consulta/exams/${id}`, {
                    method: 'POST', headers: { Authorization: `Bearer ${token()}` },
                  });
                  const d = await r.json();
                  if (d.html) { setDocHtml(d.html); setDocTitle('Preparo de consulta'); setDocOpen(true); }
                }}>
                Gerar documento
              </Button>
            </Stack>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              1 página com valores alterados + perfil clínico + comparação. Pronto para levar na consulta.
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
