import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CircularProgress, Stack, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import StopIcon from '@mui/icons-material/Stop';
import PrintIcon from '@mui/icons-material/Print';
import { API_URL } from '../../config';
import { severityOf, type ScreeningType } from '@meus-exames/shared';
import { ConsolidatedReportBody } from '../report/ConsolidatedReportBody';
import { EmptyState } from '../EmptyState';
import { DrExame } from '../DrExame';
import { RobotAnalysis } from '../RobotAnalysis';
import { RADIUS } from '../../theme';
import { speakText, stopSpeakText } from '../../utils/nativeDoc';
import { Frame, FrameHeader, FramePanel, FrameFooter } from '@/components/reui/frame';
import { Badge } from '@/components/reui/badge';
import { IconTile } from '@/components/reui/icon-tile';
import { FileText, Sparkles, Activity } from 'lucide-react';

/**
 * DoctorConsolidatedReport — relatório consolidado do paciente (viewer médico READ-ONLY).
 * Busca /api/doctor/patients/:pid/analyses/consolidated/latest (Bearer doctorToken).
 *  - analysis null → EmptyState (📑 Relatório ainda não gerado) + botão [↻ Atualizar] (refetch).
 *  - analysis presente → header "Atualizado em {createdAt}" + [↻ Atualizar] + cabeçalho flat
 *    read-only (Dr.Exame + resumo, SEM ações share/speak/print/regen — o médico só VÊ) +
 *    <ConsolidatedReportBody analysis sourceExams />.
 * Refresh = re-fetch + setState (NUNCA reload/navigate(0) — crasha o APK).
 */
export const DoctorConsolidatedReport = ({ patientId, token, patientName, onOpenExam }: { patientId: string; token: string; patientName?: string; onOpenExam?: (id: string) => void }) => {
  const [analysis, setAnalysis] = useState<any>(null);
  const [sourceExams, setSourceExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  // Rastreamento de saúde mental (PHQ-9/GAD-7) — linha discreta no relatório. Só chega
  // até aqui se o share inclui scope 'summary' (validado no endpoint; a tab Relatório
  // também só existe com esse scope). Falha silenciosa → null (não bloqueia o relatório).
  const [mental, setMental] = useState<{ phq9: any | null; gad7: any | null } | null>(null);

  const load = useCallback(() => {
    const h: Record<string, string> = { Authorization: `Bearer ${token}` };
    fetch(`${API_URL}/doctor/patients/${patientId}/analyses/consolidated/latest`, { headers: h })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setAnalysis(d?.analysis ?? null);
        setSourceExams(d?.sourceExams ?? []);
        setLoaded(true);
      })
      .catch(() => { setAnalysis(null); setSourceExams([]); setLoaded(true); })
      .finally(() => { setLoading(false); });
  }, [patientId, token]);

  // GERA (ou regenera) o relatório no framing do MÉDICO (audience:doctor — "O paciente X
  // apresenta..."). Grátis pro médico. Sem POST o relatório sai no tom leigo do paciente.
  const generate = useCallback(() => {
    setGenerating(true); setGenError('');
    const h: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    fetch(`${API_URL}/doctor/patients/${patientId}/analyses/consolidated`, { method: 'POST', headers: h })
      .then(async (r) => { const d = r.ok ? await r.json() : null; if (!r.ok) throw new Error(d?.error || 'Falha ao gerar.'); return d; })
      .then((d) => { setAnalysis(d?.analysis ?? null); setSourceExams(d?.sourceExams ?? []); setLoaded(true); })
      .catch((e: any) => setGenError(e?.message || 'Não foi possível gerar agora (IA). Tente novamente.'))
      .finally(() => { setLoading(false); setGenerating(false); });
  }, [patientId, token]);

  // Primeira carga — NUNCA chamar load() durante o render (setRefreshing durante o
  // render = React #301 hooks violation). useEffect é o padrão canônico (igual aos
  // outros Doctor*). Roda na monta e quando patientId/token mudam.
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [load]);

  // Interrompe a narração ao sair da tela (não deixa o áudio sangrar p/ outras abas).
  useEffect(() => () => { stopSpeakText(); }, []);

  // PHQ-9/GAD-7 mais recentes do paciente (mesma permissão do relatório — scope summary).
  useEffect(() => {
    fetch(`${API_URL}/doctor/patients/${patientId}/mental-screenings/latest`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMental(d ?? { phq9: null, gad7: null }))
      .catch(() => setMental({ phq9: null, gad7: null }));
  }, [patientId, token]);

  const mentalLine = (t: ScreeningType, row: any): string | null =>
    row ? `${t === 'phq9' ? 'PHQ-9' : 'GAD-7'}: ${row.total} (${severityOf(t, row.total).label}) · ${row.createdAt ? new Date(row.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}` : null;
  const mentalLines = [mentalLine('phq9', mental?.phq9), mentalLine('gad7', mental?.gad7)].filter(Boolean) as string[];

  if (loading && !loaded) {
    return <Box sx={{ textAlign: 'center', py: 5 }}><CircularProgress /></Box>;
  }

  const resumo = analysis?.structured?.resumoGeral;
  const createdAt = analysis?.createdAt ? new Date(analysis.createdAt).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' }) : '';

  // Texto narrável = resumo geral + títulos dos pontos de atenção (igual ao app do
  // paciente, que usa speakText do utils/nativeDoc — TTS nativo pt-BR no APK, speechSynthesis no web).
  const speakableText = [
    resumo,
    ...(analysis?.structured?.pontosAtencao ?? []).map((p: any) => (typeof p === 'string' ? p : p?.titulo || p?.texto || '')),
  ].filter(Boolean).join('. ');
  const toggleSpeak = () => {
    if (!speakableText) return;
    if (speaking) { stopSpeakText(); setSpeaking(false); }
    else { speakText(speakableText, { onDone: () => setSpeaking(false), onFail: () => setSpeaking(false) }); setSpeaking(true); }
  };

  // BRIEF EM PDF DE 1 PÁGINA (pesquisa ago/2026: clínicos frustrados com despejo de exames
  // D2C sem contexto — STAT jan/2026; Function/Superpower não têm portal). Abre janela
  // print-friendly A4 e chama print() → "Salvar como PDF". Sem dependência externa.
  const printBrief = () => {
    const w = window.open('', '_blank', 'width=820,height=960');
    if (!w) return;
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    const pontos = (analysis?.structured?.pontosAtencao ?? [])
      .map((p: any) => {
        const t = esc(typeof p === 'string' ? p : p?.titulo || '');
        const x = esc(typeof p === 'string' ? '' : p?.texto || '');
        return `<li>${t ? `<b>${t}.</b> ` : ''}${x}</li>`;
      }).join('');
    const exams = (sourceExams ?? [])
      .map((e: any) => `<li>${esc(e?.title || e?.examTitle || 'Exame')} — ${esc(e?.performedAt ? new Date(e.performedAt).toLocaleDateString('pt-BR') : 'sem data')}</li>`)
      .join('');
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Brief — ${esc(patientName || 'Paciente')}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; font-size: 12px; line-height: 1.5; margin: 0; }
  header { border-bottom: 3px solid #20b2aa; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
  h1 { font-size: 17px; margin: 0; color: #0f5f5a; }
  .meta { font-size: 10.5px; color: #6b7280; }
  h2 { font-size: 12.5px; color: #178f89; text-transform: uppercase; letter-spacing: .05em; margin: 14px 0 5px; }
  ul { margin: 0; padding-left: 18px; } li { margin-bottom: 4px; }
  .resumo { background: #f0faf9; border-left: 3px solid #20b2aa; padding: 8px 10px; }
  footer { margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 6px; font-size: 9.5px; color: #9ca3af; }
</style></head><body>
<header><h1>Brief de consulta — ${esc(patientName || 'Paciente')}</h1><span class="meta">Dr. Exame · ${esc(createdAt || new Date().toLocaleString('pt-BR'))}</span></header>
${resumo ? `<h2>Resumo geral</h2><div class="resumo">${esc(resumo)}</div>` : ''}
${pontos ? `<h2>Pontos de atenção</h2><ul>${pontos}</ul>` : ''}
${mentalLines.length ? `<h2>Rastreamento de saúde mental</h2><ul>${mentalLines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
${exams ? `<h2>Exames considerados (${sourceExams.length})</h2><ul>${exams}</ul>` : ''}
<footer>Documento educativo gerado pelo Dr. Exame (IA) com base nos exames compartilhados pelo paciente — não substitui avaliação médica. Valores extraídos diretamente dos laudos originais.</footer>
<script>window.onload = () => setTimeout(() => window.print(), 150);</script>
</body></html>`);
    w.document.close();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {generating ? (
        <Card sx={{ p: { xs: 2.5, md: 4 }, textAlign: 'center', borderRadius: RADIUS.card }}>
          <RobotAnalysis label="Lendo os exames e montando a análise clínica" />
        </Card>
      ) : !analysis ? (
        <>
          {genError && <Alert severity="warning" sx={{ borderRadius: RADIUS.sectionCard }}>{genError}</Alert>}
          <EmptyState
            emoji="📑"
            title="Relatório do paciente"
            desc={`Gere a análise consolidada dos exames de ${patientName || 'do paciente'} no seu tom clínico — educativo, sem diagnóstico.`}
            cta="✨ Gerar relatório"
            onCta={generate}
          />
        </>
      ) : (
        <>
          {/* Dossiê Executivo ReUI — unifica Cabeçalho + Ações + Resumo da Análise + PHQ-9/GAD-7 sem repetir datas */}
          <Frame variant="default">
            <FrameHeader className="flex flex-row items-center justify-between gap-3 flex-wrap pb-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <IconTile size="sm" variant="soft" className="text-teal-600">
                  <Sparkles className="size-4" />
                </IconTile>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-heading text-[15px] font-extrabold text-foreground">
                      Dossiê Clínico Consolidado
                    </span>
                    <Badge variant="info-light" size="xs">
                      Dr. Exame IA · Suporte Clínico
                    </Badge>
                  </div>
                  {createdAt && (
                    <p className="text-[11.5px] text-muted-foreground">
                      Gerado em {createdAt}
                      {analysis?.structured?.recency?.baseDate
                        ? ` · Exame mais recente: ${analysis.structured.recency.baseDate}`
                        : ''}
                    </p>
                  )}
                </div>
              </div>
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
                <Button size="small" variant="outlined" color="primary" startIcon={speaking ? <StopIcon /> : <RecordVoiceOverIcon />} onClick={toggleSpeak} disabled={!speakableText}
                  sx={{ textTransform: 'none', fontWeight: 700, borderRadius: RADIUS.pill, fontSize: 12 }}>
                  {speaking ? 'Parar' : 'Ouvir'}
                </Button>
                <Button size="small" variant="outlined" color="primary" startIcon={<PrintIcon />} onClick={printBrief}
                  sx={{ textTransform: 'none', fontWeight: 700, borderRadius: RADIUS.pill, fontSize: 12 }}>
                  Brief PDF
                </Button>
                <Button size="small" variant="outlined" color="primary" startIcon={generating ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />} onClick={generate} disabled={generating}
                  sx={{ textTransform: 'none', fontWeight: 700, borderRadius: RADIUS.pill, fontSize: 12 }}>
                  {generating ? 'Gerando…' : '↻ Atualizar'}
                </Button>
              </Stack>
            </FrameHeader>
            <FramePanel className="p-4 sm:p-5 space-y-3">
              <div className="flex items-start gap-3">
                <DrExame size={34} sx={{ borderRadius: '50%', flexShrink: 0, mt: 0.25 }} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-primary">
                    Síntese clínica dos exames compartilhados
                  </div>
                  {resumo && (
                    <Typography sx={{ lineHeight: 1.68, fontSize: 14, color: 'text.primary', wordBreak: 'break-word' }}>
                      {resumo}
                    </Typography>
                  )}
                </div>
              </div>
              {mentalLines.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border/60">
                  <Badge variant="outline" size="xs" className="gap-1 font-semibold">
                    <Activity className="size-3 text-teal-600" />
                    Rastreamento mental autorreportado
                  </Badge>
                  {mentalLines.map((line, idx) => (
                    <Badge key={idx} variant="info-light" size="xs" className="font-bold">
                      {line}
                    </Badge>
                  ))}
                </div>
              )}
            </FramePanel>
            <FrameFooter className="px-4 py-2 text-[11px] text-muted-foreground flex items-center justify-between flex-wrap gap-2">
              <span>Análise educativa estruturada — apoia a revisão clínica e não substitui conduta médica.</span>
              {sourceExams.length > 0 && (
                <span className="font-semibold text-foreground">{sourceExams.length} laudos analisados</span>
              )}
            </FrameFooter>
          </Frame>

          <ConsolidatedReportBody analysis={analysis} sourceExams={sourceExams} onOpenExam={onOpenExam} hideDuplicateSummary />
        </>
      )}

      {/* FEATURE E — REMOVIDO do relatório do médico (29/09, pedido do dono): títulos em
          inglês do ClinicalTrials.gov e sem valor claro na consulta — "não quero só
          preencher dados, quero valor agregado". O endpoint continua no server; se um dia
          voltar, volta CURADO (título PT + contexto de por que aquele médico/paciente)
          e pro lado certo do público. Ver components/doctors/ClinicalTrialsCard.tsx. */}
    </Box>
  );
};
