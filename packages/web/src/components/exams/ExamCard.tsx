import { Card, CardContent, Typography, Box, IconButton, Stack } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ScienceIcon from '@mui/icons-material/Science';
import ImageIcon from '@mui/icons-material/Image';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { ExplainButton } from '../ExplainItem';
import { LabBadge } from '../LabBadge';
import { cleanExtractedLabel } from '../../utils/examDisplay';
import { categorizeExam } from '../../utils/medicalData';
import { fmtDateShort } from '../../utils/format';
import { RADIUS } from '../../theme';
import { tealText } from '../../theme';

const kindLabel: Record<string, string> = { LAB_PANEL: 'Laboratorial', IMAGING: 'Imagem', OTHER: 'Outro' };

/** timeAgo — "há 7 dias" / "hoje" / "há 3 meses" (pt-BR). */
function timeAgo(d?: string | null): string {
  if (!d) return '';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days < 1) return 'hoje';
  if (days < 30) return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;
  const years = Math.floor(months / 12);
  return `há ${years} ${years === 1 ? 'ano' : 'anos'}`;
}

/**
 * ExamCard — cartão de exame READ-ONLY (área do médico). Espelha o renderCard do ExamList,
 * porém premium: pílula de data (absoluta + relativa), botão-ícone PDF na borda direita,
 * sem chip "Concluído" nem badge de anormalidade duplicado (contagem vai só na caption).
 *
 * Props:
 *  - exam: objeto Exam (com items/sourceLab/rawExtraction).
 *  - onOpen(id): abre o detalhe (card todo é clicável = "Ver resultados").
 *  - onOpenPdf?(): abre o PDF original (stopPropagation — não dispara onOpen).
 */
export const ExamCard = ({ exam, onOpen, onOpenPdf }: { exam: any; onOpen: (id: string) => void; onOpenPdf?: () => void }) => {
  const cc = categorizeExam(exam);
  const titleInfo = cleanExtractedLabel(exam.title, `Exame ${kindLabel[exam.kind] ?? ''}`.trim(), 58);
  const labInfo = cleanExtractedLabel(exam.sourceLab, '', 46);
  const doctorInfo = cleanExtractedLabel((exam as any)?.rawExtraction?.requestingDoctor, '', 46);
  const Icon = exam.kind === 'IMAGING' ? ImageIcon : exam.kind === 'LAB_PANEL' ? ScienceIcon : DescriptionOutlinedIcon;
  const abnormalCount = exam.items?.length ?? exam._count?.items ?? 0;
  const dt = exam.performedAt ? fmtDateShort(exam.performedAt) : '';
  const ago = timeAgo(exam.performedAt);

  const iconBg = exam.kind === 'IMAGING' ? 'rgba(14,165,233,0.12)' : exam.kind === 'LAB_PANEL' ? 'rgba(13,148,136,0.12)' : 'rgba(99,102,241,0.12)';
  const iconColor = exam.kind === 'IMAGING' ? '#0284c7' : exam.kind === 'LAB_PANEL' ? '#0d9488' : '#6366f1';

  return (
    <Card
      variant="outlined"
      onClick={() => onOpen(exam.id)}
      sx={(t) => ({
        cursor: 'pointer',
        borderRadius: '18px',
        overflow: 'hidden',
        maxWidth: '100%',
        bgcolor: t.palette.mode === 'dark' ? '#0f172a' : '#ffffff',
        borderColor: t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
        boxShadow: t.palette.mode === 'dark' ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.02)',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: t.palette.mode === 'dark' ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(13,148,136,0.08)',
          borderColor: alpha(t.palette.primary.main, 0.45),
        },
        '&:focus-visible': { outline: `2px solid ${t.palette.primary.dark}`, outlineOffset: 2 },
      })}
    >
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.75, p: { xs: 1.75, sm: 2 }, '&:last-child': { pb: { xs: 1.75, sm: 2 } } }}>
        {/* ReUI Soft Icon Tile */}
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: '12px',
            bgcolor: iconBg,
            color: iconColor,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
            border: `1px solid ${alpha(iconColor, 0.2)}`,
          }}
        >
          <Icon sx={{ fontSize: 22 }} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                variant="subtitle1"
                title={titleInfo.original || exam.title}
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: 15, sm: 16 },
                  color: 'text.primary',
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                  lineHeight: 1.25,
                }}
              >
                {titleInfo.text || 'Exame'}
              </Typography>
            </Box>
            <Box onClick={(e) => e.stopPropagation()} sx={{ flexShrink: 0 }}>
              <ExplainButton name={exam.title} />
            </Box>
          </Box>

          {/* Badges de Metadados: Data + Lab + Categoria */}
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.65 }}>
            {dt && (
              <Box
                sx={(t) => ({
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 0.85,
                  py: 0.2,
                  borderRadius: '999px',
                  bgcolor: t.palette.mode === 'dark' ? 'rgba(13,148,136,0.18)' : 'rgba(13,148,136,0.10)',
                })}
              >
                <CalendarMonthIcon sx={{ fontSize: 13, color: 'primary.main' }} />
                <Typography component="span" sx={{ fontWeight: 700, color: (t) => tealText(t.palette.mode), fontSize: '0.75rem', lineHeight: 1 }}>
                  {dt}{ago ? ` · ${ago}` : ''}
                </Typography>
              </Box>
            )}

            {exam.sourceLab && (
              <Box sx={{ display: 'inline-flex' }}>
                <LabBadge raw={exam.sourceLab} />
              </Box>
            )}

            {doctorInfo.text && (
              <Typography
                variant="caption"
                title={`Dr. ${doctorInfo.original}`}
                sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                🩺 Dr. {doctorInfo.text}
              </Typography>
            )}
          </Stack>

          {/* Status Clínico: Alterados vs Tudo Normal */}
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.85 }}>
            {abnormalCount > 0 ? (
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 1,
                  py: 0.25,
                  borderRadius: '999px',
                  bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(239,68,68,0.16)' : 'rgba(239,68,68,0.10)',
                  border: '1px solid',
                  borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.22)',
                }}
              >
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#ef4444', flexShrink: 0 }} />
                <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 800, color: (t) => t.palette.mode === 'dark' ? '#fca5a5' : '#dc2626', lineHeight: 1 }}>
                  {abnormalCount} {abnormalCount === 1 ? 'item alterado' : 'itens alterados'}
                </Typography>
              </Box>
            ) : (
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.4,
                  px: 1,
                  py: 0.25,
                  borderRadius: '999px',
                  bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.10)',
                  border: '1px solid',
                  borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(16,185,129,0.3)' : 'rgba(16,185,129,0.2)',
                }}
              >
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#10b981', flexShrink: 0 }} />
                <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 800, color: (t) => t.palette.mode === 'dark' ? '#6ee7b7' : '#059669', lineHeight: 1 }}>
                  Todos normais
                </Typography>
              </Box>
            )}

            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem' }}>
              {cc.cat}
            </Typography>
          </Stack>
        </Box>

        {onOpenPdf && (
          <IconButton
            aria-label="Abrir PDF original do exame"
            onClick={(e) => { e.stopPropagation(); onOpenPdf(); }}
            size="small"
            sx={(t) => ({
              flexShrink: 0,
              color: 'primary.main',
              width: 42,
              height: 42,
              borderRadius: '12px',
              border: `1px solid ${alpha(t.palette.primary.main, 0.25)}`,
              bgcolor: alpha(t.palette.primary.main, 0.04),
              '&:hover': { bgcolor: alpha(t.palette.primary.main, 0.12), borderColor: t.palette.primary.main },
            })}
          >
            <PictureAsPdfOutlined sx={{ fontSize: 20 }} />
          </IconButton>
        )}
      </CardContent>
    </Card>
  );
};
