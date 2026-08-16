import { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, CircularProgress, IconButton, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
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
import { RADIUS } from '../../theme';

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
  const theme = useTheme();
  // Hooks ANTES dos early-returns (React #310).
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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

  if (loading) return <Box sx={{ textAlign: 'center', py: 5 }}><CircularProgress sx={{ color: 'primary.main' }} /></Box>;
  if (!exam) return <EmptyState emoji="📄" title="Exame indisponível" desc="Não foi possível carregar este exame agora. Tente novamente." />;

  const titleInfo = cleanExtractedLabel(exam.title, 'Exame', 80);
  const doctorInfo = cleanExtractedLabel(exam.rawExtraction?.requestingDoctor, '', 46);
  const cc = categorizeExam(exam);
  const items = exam.items ?? [];
  const findings = exam.kind === 'IMAGING' && exam.rawExtraction?.findings ? exam.rawExtraction.findings : null;
  // Caption de tipo/categoria sob o título (era 3 chips separados — ruído).
  const kindStr = exam.kind === 'IMAGING' ? 'Imagem' : exam.kind === 'LAB_PANEL' ? 'Laboratorial' : '';
  const catStr = cc.key !== 'image' && cc.key !== 'other' ? cc.cat : '';
  const subtitle = [kindStr, catStr].filter(Boolean).join(' · ');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Header sticky: back + título + PDF sempre acessíveis sem scroll up. */}
      <Box
        sx={(t) => ({
          position: 'sticky',
          top: 'env(safe-area-inset-top)',
          zIndex: 1100,
          bgcolor: alpha(t.palette.background.paper, 0.92),
          backdropFilter: 'blur(6px)',
          borderBottom: `1px solid ${t.palette.divider}`,
          borderRadius: RADIUS.card,
        })}
      >
        {/* Mobile: back circular + título full-width (2 linhas); ações em LINHA PRÓPRIA abaixo —
            antes "Abrir laudo" + chip espremiam o título numa linha quebrada (feedback E4b). */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.75, sm: 1 }} alignItems={{ sm: 'center' }} sx={{ p: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, width: '100%' }}>
            {isMobile ? (
              <IconButton onClick={onBack} size="small" aria-label="Voltar" sx={{ flexShrink: 0, color: 'primary.dark', bgcolor: (t) => alpha(t.palette.primary.main, 0.1), '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.18) } }}>
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            ) : (
              <Button onClick={onBack} startIcon={<ArrowBackIcon />} sx={{ flexShrink: 0, textTransform: 'none', fontWeight: 700, color: 'primary.dark', borderRadius: RADIUS.pill, minWidth: 'auto', px: 1.5 }}>
                Voltar
              </Button>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" component="h1" title={titleInfo.original || exam.title} sx={{ fontWeight: 700, display: '-webkit-box', WebkitLineClamp: isMobile ? 2 : 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', minWidth: 0, lineHeight: 1.2 }}>
                {titleInfo.text || 'Exame'}
              </Typography>
              {subtitle && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{subtitle}</Typography>}
            </Box>
            {!isMobile && <Chip color="success" label="Concluído" size="small" sx={{ flexShrink: 0 }} />}
          </Stack>
          {isMobile ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
              <Chip color="success" label="Concluído" size="small" sx={{ flexShrink: 0 }} />
              <Box sx={{ flex: 1 }} />
              {exam.filePath && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={pdfLoading ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfIcon />}
                  onClick={openPdf}
                  sx={(t) => ({
                    flexShrink: 0,
                    color: t.palette.primary.main,
                    borderColor: t.palette.primary.main,
                    textTransform: 'none',
                    fontWeight: 700,
                    borderRadius: RADIUS.pill,
                    '&:hover': { borderColor: t.palette.primary.dark, bgcolor: alpha(t.palette.primary.main, 0.06) },
                  })}
                >
                  Abrir laudo
                </Button>
              )}
            </Stack>
          ) : (
            exam.filePath && (
              <Button
                size="small"
                variant="outlined"
                startIcon={pdfLoading ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfIcon />}
                onClick={openPdf}
                sx={(t) => ({
                  flexShrink: 0,
                  color: t.palette.primary.main,
                  borderColor: t.palette.primary.main,
                  textTransform: 'none',
                  fontWeight: 700,
                  borderRadius: RADIUS.pill,
                  '&:hover': { borderColor: t.palette.primary.dark, bgcolor: alpha(t.palette.primary.main, 0.06) },
                })}
              >
                Abrir laudo
              </Button>
            )
          )}
        </Stack>
      </Box>

      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
            {exam.performedAt ? (
              <Box sx={(t) => ({ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.3, borderRadius: RADIUS.pill, bgcolor: alpha(t.palette.primary.main, 0.1) })}>
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
