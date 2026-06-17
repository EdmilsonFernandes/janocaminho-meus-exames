import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Chip, Button, CircularProgress, Alert, Divider, Stack,
} from '@mui/material';
import { Title, useNotify } from 'react-admin';
import { API_URL, token } from '../../config';
import { HealthSummary } from '../../components/HealthSummary';
import { ValueBar } from '../../components/ValueBar';
import { ExplainItem, ExplainButton } from '../../components/ExplainItem';
import { ExtractionProgress } from '../../components/ExtractionProgress';
import { AnimatedDoctor } from '../../components/AnimatedDoctor';

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

  useEffect(() => {
    let active = true;
    let timer: any;
    const load = async () => {
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
  const nm = exam?.rawExtraction?.nameMatch as any;
  const nameBlock = !!nm?.mismatch && !exam?.rawExtraction?.nameAttested;
  const attest = async () => {
    setAttesting(true);
    try {
      await fetch(`${API_URL}/exams/${id}/attest`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
      setExam({ ...exam, rawExtraction: { ...exam?.rawExtraction, nameAttested: true } });
      notify('Titularidade confirmada. Já pode gerar a análise.', { type: 'success' });
    } catch { notify('Falha ao confirmar', { type: 'error' }); }
    finally { setAttesting(false); }
  };

  const generateSummary = async () => {
    if (nameBlock) { notify('Confirme a titularidade deste exame antes de gerar a análise.', { type: 'warning' }); return; }
    setGenLoading(true);
    try {
      const r = await fetch(`${API_URL}/analyses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ examId: id }),
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
    if (!pdfUrl) {
      const r = await fetch(`${API_URL}/exams/${id}/file`, { headers: { Authorization: `Bearer ${token()}` } });
      const url = URL.createObjectURL(await r.blob());
      setPdfUrl(url);
      window.open(`${url}#page=${page}`);
    } else { window.open(`${pdfUrl}#page=${page}`); }
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
  const abnormal = items.filter((i) => i.isAbnormal);
  const grouped = items.reduce((acc: any, it: any) => { (acc[it.panel ?? 'Geral'] ??= []).push(it); return acc; }, {});
  const fm = (f: string) => flagMeta[f] ?? flagMeta.UNKNOWN;

  return (
    <Box sx={{ maxWidth: 1080, mx: 'auto', p: { xs: 1, md: 2 } }}>
      <Title title={exam.title} />

      {/* Cabeçalho */}
      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
            <Typography variant="h5" component="h1" title={exam.title} sx={{ fontSize: { xs: '1.15rem', md: '1.5rem' }, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minWidth: 0 }}>{exam.title}</Typography>
            <Chip color={statusColor[exam.status] ?? 'default'} label={statusLabel[exam.status] ?? exam.status} />
            {exam.kind === 'IMAGING' && <Chip variant="outlined" label="Imagem" />}
            {exam.kind === 'LAB_PANEL' && <Chip variant="outlined" label="Laboratorial" />}
            {exam.reviewRequired && <Chip color="warning" label="verificar citações" />}
          </Stack>
          <Typography color="text.secondary">
            {exam.performedAt ? new Date(exam.performedAt).toLocaleDateString('pt-BR') : 'Data não identificada'}
            {exam.sourceLab ? ` • ${exam.sourceLab}` : ''}
            {exam.pageCount ? ` • ${exam.pageCount} pág.` : ''}
          </Typography>
          {(exam.rawExtraction?.patientName || exam.rawExtraction?.requestingDoctor) && (
            <Typography color="text.secondary" sx={{ fontSize: '0.85rem', mt: 0.5 }}>
              {exam.rawExtraction?.patientName ? `👤 ${exam.rawExtraction.patientName}` : ''}
              {exam.rawExtraction?.requestingDoctor ? ` • 🩺 ${exam.rawExtraction.requestingDoctor}` : ''}
            </Typography>
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

      {/* BLOQUEIO SUAVE: nome do documento ≠ perfil */}
      {nameBlock && (
        <Card sx={{ mt: 2, borderLeft: '6px solid', borderColor: 'error.main' }}>
          <CardContent>
            <Typography sx={{ fontWeight: 700, color: 'error.main' }}>⚠️ Possível divergência de titularidade</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              O nome no documento (<strong>{nm.docName}</strong>) difere do perfil (<strong>{nm.profileName}</strong> — similaridade {Math.round((nm.score || 0) * 100)}%).
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Se o exame é realmente deste paciente, confirme para liberar a análise.</Typography>
            <Box sx={{ mt: 1.5 }}><Button size="small" variant="contained" onClick={attest} disabled={attesting}>Confirmo que este exame é do paciente</Button></Box>
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
              ) : (
                <Typography sx={{ fontWeight: 700, color: 'success.main' }}>
                  ✅ Todos os {items.length} valores estão dentro da faixa de referência.
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* itens por painel */}
          {Object.entries(grouped).map(([panel, list]: any) => (
            <Card key={panel} sx={{ mt: 2 }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="h6" sx={{ mb: 1 }}>{panel}</Typography>
                <Stack divider={<Divider sx={{ borderColor: '#eef2f7', my: 0.5 }} />}>
                  {(list as any[]).map((it) => {
                    const m = fm(it.flag);
                    const out = it.isAbnormal;
                    return (
                      <Box key={it.id} sx={{
                        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, py: 1.25,
                        borderLeft: out ? '5px solid' : '5px solid transparent',
                        borderColor: out ? (m.color === 'error' ? 'error.main' : 'warning.main') : 'transparent',
                        pl: 1, borderRadius: 1,
                        background: out ? (m.color === 'error' ? 'rgba(198,40,40,.06)' : 'rgba(230,81,0,.06)') : 'transparent',
                      }}>
                        <Box sx={{ flex: '1 1 60%', minWidth: 220 }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" useFlexGap spacing={1}>
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                              <Typography sx={{ fontWeight: 700, fontSize: '1.08rem' }}>{it.name}</Typography>
                              <ExplainButton onClick={() => setExplain(it)} />
                            </Stack>
                            <Chip color={m.color} label={m.label} size="small" />
                          </Stack>
                          <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', mt: 0.25 }}>
                            <strong>Referência:</strong> {fmtRef(it)}
                          </Typography>
                          <ValueBar value={it.valueNumeric} low={it.refLow} high={it.refHigh} />
                        </Box>
                        <Box sx={{ flex: '0 0 auto', textAlign: 'right', pr: 1 }}>
                          <Typography component="span" sx={{
                            fontSize: '1.7rem', fontWeight: 800, lineHeight: 1,
                            color: out ? (m.color === 'error' ? 'error.main' : 'warning.main') : 'success.main',
                          }}>{it.valueText ?? '—'}</Typography>
                          {it.unit ? <Typography component="span" sx={{ color: 'text.secondary', ml: 0.5, fontSize: '0.85rem' }}>{it.unit}</Typography> : null}
                          <Box>
                            <Button size="small" sx={{ fontSize: '0.75rem', minWidth: 0, p: 0 }} onClick={() => openCitation(it.extractedPage)}>
                              pág. {it.extractedPage}
                            </Button>
                          </Box>
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              </CardContent>
            </Card>
          ))}
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
                  if (d.html) {
                    const blob = new Blob([d.html], { type: 'text/html' });
                    window.open(URL.createObjectURL(blob), '_blank');
                  }
                }}>
                Gerar documento
              </Button>
            </Stack>
            <Typography variant="body2" sx={{ color: '#555', mt: 0.5 }}>
              1 página com valores alterados + perfil clínico + comparação. Pronto para levar na consulta.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* RESUMO de IA */}
      {exam.status === 'EXTRACTED' && (
        <Box sx={{ mt: 2 }}>
          {summary ? <HealthSummary analysis={summary} /> : (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>Análise de saúde</Typography>
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                  Gera um resumo educativo comparando com o exame anterior e os pontos a levar ao médico.
                </Typography>
                <Button variant="contained" size="large" onClick={generateSummary} disabled={genLoading}>
                  {genLoading ? <CircularProgress size={22} /> : 'Gerar resumo'}
                </Button>
                {genLoading && <AnimatedDoctor text="Dr. Exame está analisando seu exame…" />}
              </CardContent>
            </Card>
          )}
        </Box>
      )}

      {/* CHAT */}
      {exam.status === 'EXTRACTED' && summary && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Pergunte sobre este exame</Typography>
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

      <ExplainItem open={!!explain} item={explain} onClose={() => setExplain(null)} />
    </Box>
  );
};
