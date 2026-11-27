import type { ReactNode } from 'react';
import { Box, CircularProgress, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import { useLocale, useTranslate } from 'react-admin';
import { AppCard } from '../AppCard';
import { DrExame } from '../DrExame';
import { GradientButton } from '../GradientButton';
import { SecondaryButton } from '../SecondaryButton';
import { RADIUS, tealText } from '../../theme';
import type { ConsolidatedReportSectionState } from '../../pages/ConsolidatedReport';

const HEAD = 'Poppins, sans-serif';

/**
 * PanoramaAiCard — o cartão "Análise do Dr. Exame": o convite pago (o único botão destaque da
 * tela quando ainda não há análise) e o status dela quando já existe.
 *
 * Os dois CTAs não competem: sem relatório, o botão "Gerar análise · N créditos" mora AQUI e a
 * seção do relatório não mostra convite nenhum; com relatório, este cartão vira "Análise gerada
 * em dd/mm" + "Ver análise", e quem manda na seção é o próprio relatório (atualizar, ouvir, PDF,
 * compartilhar, perguntas).
 * A estrelinha de IA é branca sobre o teal da marca (identidade do app — ver DESIGN_SYSTEM).
 */
export const PanoramaAiCard = ({ state, cost, free, onGenerate, onSeeAnalysis, onUploadExam }: {
  state: ConsolidatedReportSectionState;
  cost: number;
  /** Assinante com o benefício ativo: não gasta crédito. */
  free: boolean;
  onGenerate: () => void;
  onSeeAnalysis: () => void;
  onUploadExam: () => void;
}) => {
  const translate = useTranslate();
  const theme = useTheme();
  const locale = useLocale();
  const dark = theme.palette.mode === 'dark';
  const features = [
    translate('panorama.ai.feat_text_audio'),
    translate('panorama.ai.feat_pdf'),
    translate('panorama.ai.feat_questions'),
  ];
  const generatedDate = state.generatedAt
    ? new Date(state.generatedAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'pt-BR', locale === 'en' ? { month: 'short', day: 'numeric' } : { day: '2-digit', month: '2-digit' })
    : '';

  const statusBand = (icon: ReactNode, text: string) => (
    <Box component="p" role="status" sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1, minHeight: 44, px: 1.5, borderRadius: RADIUS.button, bgcolor: (t) => alpha(t.palette.primary.main, dark ? 0.16 : 0.10), color: (t) => tealText(t.palette.mode), fontWeight: 800, fontSize: 14, lineHeight: 1.35 }}>
      {icon}
      {text}
    </Box>
  );

  return (
    <AppCard sx={{ p: { xs: 2, md: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <DrExame size={44} sx={{ borderRadius: '50%', flexShrink: 0 }} />
        <Typography component="h2" sx={{ fontFamily: HEAD, fontSize: 17, fontWeight: 700, lineHeight: 1.25, display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
          {translate('panorama.ai.title')}
          <Box
            component="span"
            role="img"
            aria-label={translate('panorama.ai.ia')}
            title={translate('panorama.ai.ia')}
            sx={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'inline-grid', placeItems: 'center', bgcolor: '#20b2aa', color: '#fff' }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 14 }} />
          </Box>
        </Typography>
      </Box>

      <Typography sx={{ mt: 1.25, fontSize: 14, lineHeight: 1.5, color: 'text.primary' }}>{translate('panorama.ai.desc')}</Typography>

      <Box role="list" sx={{ mt: 1, display: { xs: 'none', md: 'flex' }, flexWrap: 'wrap', gap: 0.75 }}>
        {features.map((f) => (
          <Box
            key={f}
            role="listitem"
            sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, color: 'text.primary', bgcolor: (t) => alpha(t.palette.text.primary, dark ? 0.08 : 0.07), borderRadius: RADIUS.sm, px: 1.25, py: 0.5 }}
          >
            {f}
          </Box>
        ))}
      </Box>

      {state.loading
        ? statusBand(<CircularProgress size={18} sx={{ color: 'inherit' }} />, translate('panorama.ai.generating'))
        : state.generating
          ? statusBand(<CircularProgress size={18} sx={{ color: 'inherit' }} />, translate('panorama.ai.updating'))
          : state.hasReport
            ? (
              <>
                {statusBand(<CheckCircleOutlineRoundedIcon sx={{ fontSize: 20 }} />, translate('panorama.ai.generated_on', { date: generatedDate }))}
                <SecondaryButton fullWidth onClick={onSeeAnalysis} endIcon={<ArrowDownwardRoundedIcon />} sx={{ mt: 1.25 }}>
                  {translate('panorama.ai.see_analysis')}
                </SecondaryButton>
                <Typography sx={{ mt: 1.25, fontSize: 13, lineHeight: 1.45, color: 'text.secondary', textAlign: 'center' }}>{translate('panorama.ai.free_rest')}</Typography>
              </>
            )
            : state.canGenerate
              ? (
                <>
                  <GradientButton fullWidth startIcon={<AutoAwesomeIcon />} onClick={onGenerate} sx={{ mt: 2.25, fontSize: 15, fontWeight: 800 }}>
                    {free ? translate('panorama.ai.generate_free') : translate('panorama.ai.generate', { smart_count: cost })}
                  </GradientButton>
                  <Typography sx={{ mt: 1, fontSize: 13, lineHeight: 1.45, color: 'text.secondary', textAlign: 'center' }}>
                    {translate(free ? 'panorama.ai.free_rest' : 'panorama.ai.free_for_subscribers')}
                  </Typography>
                </>
              )
              : (
                <>
                  <Typography sx={{ mt: 2.25, fontSize: 14, lineHeight: 1.5, color: 'text.secondary', textAlign: 'center' }}>{translate('panorama.ai.no_exams')}</Typography>
                  <SecondaryButton fullWidth onClick={onUploadExam} sx={{ mt: 1 }}>
                    {translate('panorama.todo.exams.cta')}
                  </SecondaryButton>
                </>
              )}
    </AppCard>
  );
};
