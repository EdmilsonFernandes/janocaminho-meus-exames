import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { API_URL } from '../../config';
import { ConsolidatedReportBody } from '../report/ConsolidatedReportBody';
import { EmptyState } from '../EmptyState';
import { DrExame } from '../DrExame';

/**
 * DoctorConsolidatedReport — relatório consolidado do paciente (viewer médico READ-ONLY).
 * Busca /api/doctor/patients/:pid/analyses/consolidated/latest (Bearer doctorToken).
 *  - analysis null → EmptyState (📑 Relatório ainda não gerado) + botão [↻ Atualizar] (refetch).
 *  - analysis presente → header "Atualizado em {createdAt}" + [↻ Atualizar] + hero read-only
 *    (Dr.Exame + resumo, SEM ações share/speak/print/regen — o médico só VÊ) +
 *    <ConsolidatedReportBody analysis sourceExams />.
 * Refresh = re-fetch + setState (NUNCA reload/navigate(0) — crasha o APK).
 */
export const DoctorConsolidatedReport = ({ patientId, token, patientName, onOpenExam }: { patientId: string; token: string; patientName?: string; onOpenExam?: (id: string) => void }) => {
  const [analysis, setAnalysis] = useState<any>(null);
  const [sourceExams, setSourceExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    const h: Record<string, string> = { Authorization: `Bearer ${token}` };
    fetch(`${API_URL}/doctor/patients/${patientId}/analyses/consolidated/latest`, { headers: h })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setAnalysis(d?.analysis ?? null);
        setSourceExams(d?.sourceExams ?? []);
        setLoaded(true);
      })
      .catch(() => { setAnalysis(null); setSourceExams([]); setLoaded(true); })
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [patientId, token]);

  // Primeira carga — NUNCA chamar load() durante o render (setRefreshing durante o
  // render = React #301 hooks violation). useEffect é o padrão canônico (igual aos
  // outros Doctor*). Roda na monta e quando patientId/token mudam.
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [load]);

  if (loading && !loaded) {
    return <Box sx={{ textAlign: 'center', py: 5 }}><CircularProgress sx={{ color: '#20b2aa' }} /></Box>;
  }

  const resumo = analysis?.structured?.resumoGeral;
  const createdAt = analysis?.createdAt ? new Date(analysis.createdAt).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' }) : '';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header + atualizar */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap" useFlexGap>
        <Box>
          <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 18, color: 'text.primary' }}>Relatório completo</Typography>
          {createdAt && <Typography variant="caption" color="text.secondary">Atualizado em {createdAt}</Typography>}
        </Box>
        <Button size="small" variant="outlined" startIcon={refreshing ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />} onClick={load} disabled={refreshing}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 99, color: '#20b2aa', borderColor: '#20b2aa' }}>
          {refreshing ? 'Atualizando…' : '↻ Atualizar'}
        </Button>
      </Stack>

      {!analysis ? (
        <EmptyState
          emoji="📑"
          title="Relatório ainda não gerado"
          desc={`${patientName || 'O paciente'} ainda não gerou o relatório completo no app.`}
        />
      ) : (
        <>
          {/* Hero read-only — Dr.Exame + resumo (SEM share/speak/print/regen do ReportHero). */}
          <Card sx={{ overflow: 'hidden', position: 'relative', background: 'linear-gradient(135deg, rgba(32,178,170,.12), rgba(212,165,116,.08))', border: '1px solid', borderColor: 'rgba(32,178,170,.25)' }}>
            <AutoAwesomeIcon sx={{ position: 'absolute', right: -14, bottom: -20, fontSize: 150, color: '#d4a574', opacity: 0.12, pointerEvents: 'none' }} />
            <CardContent sx={{ position: 'relative' }}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Box sx={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(32,178,170,.22), rgba(32,178,170,.04))' }}>
                  <DrExame size={40} sx={{ borderRadius: '50%' }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>Relatório consolidado 🩺</Typography>
                  <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Análise educativa — não substitui consulta médica</Typography>
                </Box>
              </Stack>
              {resumo && <Typography sx={{ mt: 2, fontSize: '1.05rem', lineHeight: 1.7, wordBreak: 'break-word' }}>{resumo}</Typography>}
            </CardContent>
          </Card>

          <ConsolidatedReportBody analysis={analysis} sourceExams={sourceExams} onOpenExam={onOpenExam} />
        </>
      )}
    </Box>
  );
};
