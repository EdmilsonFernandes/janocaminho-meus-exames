import { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { API_URL } from '../../config';
import { ExamItemsTable } from '../exams/ExamItemsTable';
import { LabBadge } from '../LabBadge';
import { EmptyState } from '../EmptyState';
import { cleanExtractedLabel } from '../../utils/examDisplay';
import { categorizeExam } from '../../utils/medicalData';
import { fmtDateShort } from '../../utils/format';

const kindLabel: Record<string, string> = { LAB_PANEL: 'Laboratorial', IMAGING: 'Imagem', OTHER: 'Outro' };

/**
 * DoctorExamDetail — detalhe READ-ONLY de um exame do paciente (viewer médico).
 * Busca /api/doctor/patients/:pid/exams/:eid (Bearer doctorToken). Cabeçalho (título + chips
 * status/kind/categoria + data + LabBadge + pág. + médico solicitante) + botão PDF
 * (abre .../file?token= ; web=window.open, nativo=Capacitor Browser) + body (findings p/ imagem
 * OU <ExamItemsTable> p/ laboratorial). SEM identity/chat/HealthSummary/preparo/edit.
 */
export const DoctorExamDetail = ({ patientId, examId, token, onBack }: { patientId: string; examId: string; token: string; onBack: () => void }) => {
  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const h: Record<string, string> = { Authorization: `Bearer ${token}` };
    fetch(`${API_URL}/doctor/patients/${patientId}/exams/${examId}`, { headers: h })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setExam(d?.exam ?? null))
      .catch(() => setExam(null))
      .finally(() => setLoading(false));
  }, [patientId, examId, token]);

  const openPdf = async () => {
    if (!exam?.filePath) return;
    setPdfLoading(true);
    try {
      const url = `${API_URL}/doctor/patients/${patientId}/exams/${examId}/file?token=${encodeURIComponent(token)}`;
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
          const { Browser } = await import('@capacitor/browser');
          await Browser.open({ url });
          return;
        }
      } catch { /* web fallback */ }
      window.open(url, '_blank');
    } catch { /* ignore */ } finally { setPdfLoading(false); }
  };

  if (loading) return <Box sx={{ textAlign: 'center', py: 5 }}><CircularProgress sx={{ color: '#20b2aa' }} /></Box>;
  if (!exam) return <EmptyState emoji="📄" title="Exame indisponível" desc="Não foi possível carregar este exame agora. Tente novamente." />;

  const titleInfo = cleanExtractedLabel(exam.title, 'Exame', 80);
  const doctorInfo = cleanExtractedLabel(exam.rawExtraction?.requestingDoctor, '', 46);
  const cc = categorizeExam(exam);
  const items = exam.items ?? [];
  const findings = exam.kind === 'IMAGING' && exam.rawExtraction?.findings ? exam.rawExtraction.findings : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Button onClick={onBack} startIcon={<ArrowBackIcon />} sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 700, color: 'primary.dark', borderRadius: 99, px: 1.5 }}>
        Voltar
      </Button>

      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
            <Typography variant="h5" component="h1" title={titleInfo.original || exam.title} sx={{ fontSize: { xs: '1.15rem', md: '1.5rem' }, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minWidth: 0 }}>{titleInfo.text || 'Exame'}</Typography>
            <Chip color="success" label="Concluído" />
            {exam.kind === 'IMAGING' && <Chip variant="outlined" label="Imagem" />}
            {exam.kind === 'LAB_PANEL' && <Chip variant="outlined" label="Laboratorial" />}
            {cc.key !== 'image' && cc.key !== 'other' && <Chip size="small" sx={{ bgcolor: cc.color + '18', color: cc.color, fontWeight: 700 }} label={`${cc.emoji} ${cc.cat}`} />}
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
            {exam.performedAt ? (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.3, borderRadius: 99, bgcolor: 'rgba(32,178,170,.10)' }}>
                <CalendarMonthIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                <Typography component="span" sx={{ fontWeight: 700, color: 'primary.dark', fontSize: '0.9rem', lineHeight: 1 }}>{fmtDateShort(exam.performedAt)}</Typography>
              </Box>
            ) : (
              <Typography component="span" sx={{ fontWeight: 700, color: 'warning.main', fontSize: '0.85rem' }}>Data não identificada</Typography>
            )}
            {(exam.sourceLab || exam.pageCount) && (
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                {exam.sourceLab ? <LabBadge raw={exam.sourceLab} size="md" showUnit /> : null}
                {exam.pageCount ? <Typography component="span" color="text.secondary" sx={{ fontSize: '0.85rem' }}>{exam.pageCount} pág.</Typography> : null}
              </Box>
            )}
          </Stack>
          {doctorInfo.text && (
            <Typography color="text.secondary" sx={{ fontSize: '0.85rem', mt: 0.5 }}>🩺 {doctorInfo.text}</Typography>
          )}
          {exam.filePath && (
            <Button size="small" variant="outlined" startIcon={pdfLoading ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfIcon />} onClick={openPdf}
              sx={{ mt: 1.5, color: '#20b2aa', borderColor: '#20b2aa', textTransform: 'none', fontWeight: 700, borderRadius: 99 }}>
              Ver PDF original
            </Button>
          )}
        </CardContent>
      </Card>

      {findings && findings.length > 0 ? (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Achados do laudo</Typography>
            {(findings as any[]).map((f, i) => (
              <Typography key={i} sx={{ mb: 1, fontSize: '1.02rem' }}>• {f.text}</Typography>
            ))}
            {exam.rawExtraction?.impression && (
              <Typography sx={{ mt: 1 }}><strong>Impressão:</strong> {exam.rawExtraction.impression}</Typography>
            )}
          </CardContent>
        </Card>
      ) : items.length > 0 ? (
        <ExamItemsTable items={items} />
      ) : (
        <EmptyState emoji="🧪" title="Exame sem itens extraídos" desc="Este exame não possui valores laboratoriais ou achados de laudo disponíveis para visualização." />
      )}
    </Box>
  );
};
