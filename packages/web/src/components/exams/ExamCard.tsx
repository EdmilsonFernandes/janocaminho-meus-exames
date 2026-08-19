import { Card, CardContent, Typography, Box, IconButton } from '@mui/material';
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

  return (
    <Card
      variant="outlined"
      onClick={() => onOpen(exam.id)}
      sx={(t) => ({
        cursor: 'pointer',
        borderRadius: RADIUS.card,
        overflow: 'hidden',
        maxWidth: '100%',
        transition: 'box-shadow 180ms ease, border-color 180ms ease',
        '&:hover': { boxShadow: t.shadows[4], borderColor: alpha(t.palette.primary.main, 0.45) },
        '&:focus-visible': { outline: `2px solid ${t.palette.primary.dark}`, outlineOffset: 2 },
      })}
    >
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Icon sx={{ color: 'primary.main', flexShrink: 0 }} />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
            <Typography
              variant="subtitle1"
              title={titleInfo.original || exam.title}
              sx={{ fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}
            >
              {titleInfo.text || 'Exame'}
            </Typography>
            <Box onClick={(e) => e.stopPropagation()} sx={{ flexShrink: 0, mt: -0.5 }}>
              <ExplainButton name={exam.title} />
            </Box>
          </Box>

          {dt && (
            <Box
              sx={(t) => ({
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                mt: 0.5,
                mb: 0.25,
                px: 1,
                py: 0.3,
                borderRadius: RADIUS.pill,
                bgcolor: alpha(t.palette.primary.main, 0.1),
              })}
            >
              <CalendarMonthIcon sx={{ fontSize: 14, color: 'primary.main' }} />
              <Typography component="span" sx={{ fontWeight: 700, color: 'primary.dark', fontSize: '0.78rem', lineHeight: 1 }}>
                {dt}{ago ? ` • ${ago}` : ''}
              </Typography>
            </Box>
          )}

          {exam.sourceLab && <Box sx={{ display: 'block', mb: 0.25 }}><LabBadge raw={exam.sourceLab} /></Box>}
          {!labInfo.text && labInfo.suspicious && (
            <Typography variant="caption" sx={{ display: 'block', color: 'warning.main', fontWeight: 700, lineHeight: 1.3 }}>
              🏥 Laboratório em revisão
            </Typography>
          )}
          {doctorInfo.text && (
            <Typography
              variant="caption"
              title={`Dr. ${doctorInfo.original}`}
              sx={{ display: 'block', color: 'text.secondary', fontWeight: 600, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              🩺 Dr. {doctorInfo.text}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            {cc.cat}{abnormalCount ? ` • ${abnormalCount} alterado(s)` : ''}
          </Typography>
        </Box>

        {onOpenPdf && (
          <IconButton
            aria-label="Abrir PDF original"
            onClick={(e) => { e.stopPropagation(); onOpenPdf(); }}
            size="small"
            sx={(t) => ({
              flexShrink: 0,
              color: 'primary.main',
              width: 44,
              height: 44,
              borderRadius: RADIUS.button,
              border: `1px solid ${alpha(t.palette.primary.main, 0.25)}`,
              '&:hover': { bgcolor: alpha(t.palette.primary.main, 0.1), borderColor: t.palette.primary.main },
            })}
          >
            <PictureAsPdfOutlined />
          </IconButton>
        )}
      </CardContent>
    </Card>
  );
};
