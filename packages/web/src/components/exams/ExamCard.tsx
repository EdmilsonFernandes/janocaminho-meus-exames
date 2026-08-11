import { Card, CardContent, Typography, Box, Stack, Chip } from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import ImageIcon from '@mui/icons-material/Image';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { ExplainButton } from '../ExplainItem';
import { LabBadge } from '../LabBadge';
import { cleanExtractedLabel } from '../../utils/examDisplay';
import { categorizeExam } from '../../utils/medicalData';
import { fmtDateShort } from '../../utils/format';

const kindLabel: Record<string, string> = { LAB_PANEL: 'Laboratorial', IMAGING: 'Imagem', OTHER: 'Outro' };

/**
 * ExamCard — cartão de exame READ-ONLY (visualizador). Espelha o renderCard do ExamList
 * (mesmo borderLeft teal, ícone por kind, título + ExplainButton, pílula de data, LabBadge,
 * linha do médico, caption com categoria + contagem, chip de status), SEM:
 *  - IconButton de excluir
 *  - LinearProgress (processando)
 *  - bloco FAILED re-extrair
 * O status no portal do médico é sempre EXTRACTED → chip estável "Concluído" teal.
 * `onOpen(exam.id)` dispara a abertura do detalhe.
 */
export const ExamCard = ({ exam, onOpen }: { exam: any; onOpen: (id: string) => void }) => {
  const TEAL = '#20b2aa';
  const cc = categorizeExam(exam);
  const titleInfo = cleanExtractedLabel(exam.title, `Exame ${kindLabel[exam.kind] ?? ''}`.trim(), 58);
  const labInfo = cleanExtractedLabel(exam.sourceLab, '', 46);
  const doctorInfo = cleanExtractedLabel((exam as any)?.rawExtraction?.requestingDoctor, '', 46);
  const Icon = exam.kind === 'IMAGING' ? ImageIcon : exam.kind === 'LAB_PANEL' ? ScienceIcon : DescriptionOutlinedIcon;
  const abnormalCount = exam.items?.length ?? exam._count?.items ?? 0;

  return (
    <Card variant="outlined" onClick={() => onOpen(exam.id)} sx={{ cursor: 'pointer', borderRadius: 3, borderLeft: `4px solid ${TEAL}`, overflow: 'hidden', maxWidth: '100%' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Icon sx={{ color: TEAL, flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
            <Typography title={titleInfo.original || exam.title} sx={{ fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{titleInfo.text || 'Exame'}</Typography>
            <Box onClick={(e) => e.stopPropagation()} sx={{ flexShrink: 0, mt: -0.5 }}><ExplainButton name={exam.title} /></Box>
          </Box>
          {exam.performedAt && (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.5, mb: 0.25, px: 1, py: 0.3, borderRadius: 99, bgcolor: 'rgba(32,178,170,.10)' }}>
              <CalendarMonthIcon sx={{ fontSize: 14, color: 'primary.main' }} />
              <Typography component="span" sx={{ fontWeight: 700, color: 'primary.dark', fontSize: '0.78rem', lineHeight: 1 }}>{fmtDateShort(exam.performedAt)}</Typography>
            </Box>
          )}
          {exam.sourceLab && <Box sx={{ display: 'block', mb: 0.25 }}><LabBadge raw={exam.sourceLab} /></Box>}
          {!labInfo.text && labInfo.suspicious && <Typography variant="caption" sx={{ display: 'block', color: 'warning.main', fontWeight: 700, lineHeight: 1.3 }}>🏥 Laboratório em revisão</Typography>}
          {doctorInfo.text && <Typography variant="caption" title={`Dr. ${doctorInfo.original}`} sx={{ display: 'block', color: 'text.secondary', fontWeight: 600, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🩺 Dr. {doctorInfo.text}</Typography>}
          <Typography variant="caption" color="text.secondary">{cc.cat}{abnormalCount ? ` • ${abnormalCount} alterado(s)` : ''}</Typography>
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
            <Chip size="small" label="Concluído" sx={{ bgcolor: TEAL + '18', color: TEAL, fontWeight: 700, height: 20 }} />
            {abnormalCount > 0 && <Chip size="small" label={`${abnormalCount} alterado(s)`} sx={{ bgcolor: '#f59e0b18', color: '#b45309', fontWeight: 700, height: 20 }} />}
          </Stack>
        </Box>
        <ChevronRightIcon sx={{ color: 'text.disabled', flexShrink: 0 }} />
      </CardContent>
    </Card>
  );
};
