import { useCallback, useMemo, useRef, useState } from 'react';
import { Box, Typography, useMediaQuery, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import { useNavigate } from 'react-router-dom';
import { Title, useLocale, useTranslate } from 'react-admin';
import { AppCard } from '../components/AppCard';
import { SecondaryButton } from '../components/SecondaryButton';
import { CardSkeleton, ScoreSkeleton } from '../components/Skeleton';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Section } from '../components/dashboard/Section';
import { CREDIT_COSTS } from '../components/CreditBadge';
import { usePrefersReducedMotion } from '../components/useCardPress';
import { IconTile as ReuiIconTile } from '../components/reui/icon-tile';
import { useReuiThemeSync } from '../components/reui/useReuiThemeSync';
import { usePanorama } from '../hooks/usePanorama';
import { RADIUS, tealText } from '../theme';
import { ageText, presentPanorama, type PanoramaKey } from '../utils/panoramaPresenter';
import { panoramaSpeech } from '../utils/panoramaSpeech';
import { usePlanInfo } from '../utils/planInfo';
import { ConsolidatedReportSection, type ConsolidatedReportSectionState } from './ConsolidatedReport';
import { AreaIcon } from '../components/panorama/AreaIcon';
import { AreaRow } from '../components/panorama/AreaRow';
import { AreaTile } from '../components/panorama/AreaTile';
import { ChangeCard } from '../components/panorama/ChangeCard';
import { PanoramaAiCard } from '../components/panorama/PanoramaAiCard';
import { PanoramaHero } from '../components/panorama/PanoramaHero';
import { PanoramaListen } from '../components/panorama/PanoramaListen';
import { SnapRow } from '../components/panorama/SnapRow';
import { StorySheet } from '../components/panorama/StorySheet';

const NO_REPORT: ConsolidatedReportSectionState = { hasReport: false, loading: false, generating: false, generatedAt: null, canGenerate: false, noCredits: false };
const focusRing = { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } as const;

/** Assinante com plano ativo — a mesma regra do cartão do menu (`user.planExpiresAt`). */
const hasActivePlan = (): boolean => {
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    return !!(u?.planExpiresAt && new Date(u.planExpiresAt).getTime() > Date.now());
  } catch {
    return false;
  }
};

/** Nota discreta à direita do título da seção ("desde a última vez", "3 áreas"). */
const SideNote = ({ children }: { children: string }) => (
  <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: 'text.secondary' }}>{children}</Typography>
);

/**
 * Panorama da sua saúde (rota /relatorio) — como a pessoa está, o que mudou, as áreas, o que
 * falta completar e a análise do Dr. Exame (o relatório consolidado que já existia mora aqui).
 *
 * Tudo aqui é FATO vindo do servidor e frase composta no apresentador (`presentPanorama`); não
 * custa crédito e não chama IA. A única ação paga é a análise — e é o único botão destaque.
 * Computador: duas colunas, com a da direita (completar + análise + perguntar) fixa ao rolar.
 *
 * Celular (27/11/26 — "rolagem infinita"): a tela cheia media 3,5 telas ANTES do relatório. Agora
 * o topo tem as duas ações (ouvir o panorama, ir para a análise), as áreas são uma lista de
 * linhas em vez de azulejos, o cartão da análise some quando ela já existe (o botão do topo faz
 * o papel dele) e o relatório abre recolhido, com "Ler a análise completa".
 */
export const PanoramaPage = () => {
  const navigate = useNavigate();
  const translate = useTranslate();
  const locale = (useLocale() as string) === 'en' ? 'en' : 'pt';
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const reduced = usePrefersReducedMotion();
  const reuiTheme = useReuiThemeSync();
  const { pid, status, data, retry } = usePanorama();
  const planInfo = usePlanInfo();
  const [storyIndex, setStoryIndex] = useState<number | null>(null);
  const [report, setReport] = useState<ConsolidatedReportSectionState>(NO_REPORT);
  const generateRef = useRef<(() => void) | null>(null);
  // Celular: o relatório (longo) começa recolhido; "Ver análise" e "Ler a análise completa" abrem.
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const model = useMemo(
    () => (data ? presentPanorama(data.panorama, data.health, { t: translate, locale }) : null),
    [data, translate, locale],
  );
  const speech = useMemo(() => (model ? panoramaSpeech(model, translate) : ''), [model, translate]);
  const cost = CREDIT_COSTS.consolidated;
  // Assinante com o benefício ativo não gasta crédito (o servidor decide no POST; aqui é só o rótulo).
  const free = useMemo(() => hasActivePlan() && (planInfo ? planInfo.premiumPerks.consolidatedFree !== false : false), [planInfo, pid]);
  const generateLabel = free ? translate('panorama.ai.generate_free') : translate('panorama.ai.generate', { smart_count: cost });
  const updated = model ? ageText(model.generatedAge, translate) : '';

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [reduced]);

  const openStory = (key: PanoramaKey) => {
    const i = model?.tiles.findIndex((t) => t.key === key) ?? -1;
    if (i >= 0) setStoryIndex(i);
  };

  // "Gerar análise" (cartão ou fim da história): fecha a folha, dispara a geração da SEÇÃO e
  // leva a pessoa até o cartão de progresso, que aparece onde o relatório vai ficar.
  const seeAnalysis = () => {
    setAnalysisOpen(true);
    window.setTimeout(() => scrollTo('panorama-analysis'), 60);
  };

  const generate = () => {
    setStoryIndex(null);
    setAnalysisOpen(true);
    window.setTimeout(() => {
      generateRef.current?.();
      scrollTo('panorama-analysis');
    }, 80);
  };

  const reportBusy = report.loading || report.generating;
  const analysisCollapsed = !desktop && report.hasReport && !reportBusy && !analysisOpen;
  const nothingToComplete = model ? model.todo.length === 0 : false;
  const allLoaded = model ? model.unavailable.length === 0 : false;
  const subtitle = model ? (
    <>
      <Box component="strong" sx={{ fontWeight: 800 }}>{translate('panorama.subtitle_count', { filled: model.filled, total: model.total })}</Box>
      {' · '}
      {updated === translate('panorama.age.now') ? translate('panorama.updated_now') : translate('panorama.updated_ago', { age: updated })}
    </>
  ) : undefined;

  return (
    <PageContainer width="content" sx={{ overflowX: 'hidden' }}>
      <Title title={translate('page.report')} />
      <PageHeader icon={<PublicOutlinedIcon />} title={translate('panorama.title')} subtitle={subtitle} />

      {status === 'loading' && (
        <Box aria-busy="true" aria-label={translate('ra.page.loading')}>
          <AppCard sx={{ p: 2, mb: 3 }}><ScoreSkeleton /></AppCard>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr' }, gap: 1.25 }}>
            {Array.from({ length: 6 }, (_, i) => (
              <AppCard key={i}><CardSkeleton lines={2} /></AppCard>
            ))}
          </Box>
        </Box>
      )}

      {status === 'error' && (
        <AppCard role="alert" sx={{ p: { xs: 2.5, md: 3 }, textAlign: 'center' }}>
          <CloudOffOutlinedIcon sx={{ fontSize: 36, color: 'text.secondary', mb: 1 }} />
          <Typography sx={{ fontWeight: 800, fontSize: 17, fontFamily: 'Poppins, sans-serif', mb: 0.5 }}>{translate('panorama.load.error')}</Typography>
          <Typography color="text.secondary" sx={{ fontSize: 14, mb: 2.5 }}>{translate('ra.message.error')}</Typography>
          <SecondaryButton onClick={retry} sx={{ minWidth: 180 }}>{translate('panorama.load.retry')}</SecondaryButton>
        </AppCard>
      )}

      {status === 'no-patient' && (
        <Typography color="text.secondary" sx={{ mt: 2 }}>{translate('panorama.load.no_patient')}</Typography>
      )}

      {model && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) 340px' }, gap: { xs: 0, md: 2.75 }, alignItems: 'start' }}>
            {/* ── coluna principal: herói, o que mudou, suas áreas ── */}
            <Box sx={{ minWidth: 0 }}>
              <PanoramaHero
                hero={model.hero}
                onComplete={() => scrollTo('panorama-complete')}
                actions={(
                  <>
                    <PanoramaListen text={speech} lang={locale === 'en' ? 'en-US' : 'pt-BR'} />
                    {report.hasReport && (
                      <SecondaryButton onClick={seeAnalysis} endIcon={<ArrowDownwardRoundedIcon />} sx={{ minHeight: 44, borderRadius: RADIUS.pill, px: 1.75, fontSize: 14 }}>
                        {translate('panorama.ai.see_analysis')}
                      </SecondaryButton>
                    )}
                  </>
                )}
              />

              <Section label={translate('panorama.changes.title')} action={<SideNote>{translate('panorama.changes.since')}</SideNote>}>
                <SnapRow
                  label={translate('panorama.changes.title')}
                  emptyText={translate('panorama.changes.empty')}
                  items={model.changes.map((card, i) => (
                    <ChangeCard
                      key={`${card.key}-${i}`}
                      card={card}
                      layout={desktop ? 'row' : 'carousel'}
                      onOpen={model.tiles.some((t) => t.key === card.key) ? () => openStory(card.key) : undefined}
                    />
                  ))}
                />
              </Section>

              <Section label={translate('panorama.areas.title')} action={<SideNote>{translate('panorama.areas.hint')}</SideNote>}>
                {desktop ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
                    {model.tiles.map((tile) => <AreaTile key={tile.key} tile={tile} onOpen={openStory} />)}
                  </Box>
                ) : (
                  <AppCard sx={{ p: 0, overflow: 'hidden' }}>
                    {model.tiles.map((tile, i) => <AreaRow key={tile.key} tile={tile} onOpen={openStory} last={i === model.tiles.length - 1} />)}
                  </AppCard>
                )}
                {model.unavailable.length > 0 && (
                  <Box role="status" sx={{ mt: 2, border: '1px dashed', borderColor: 'divider', borderRadius: RADIUS.card, p: { xs: 1.5, md: 2 } }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{translate('panorama.unavailable.title')}</Typography>
                    {model.unavailable.map((u) => (
                      <Typography key={u.key} sx={{ mt: 0.5, fontSize: 13, lineHeight: 1.45, color: 'text.secondary' }}>
                        {u.name} · {translate('panorama.status.unavailable')}
                      </Typography>
                    ))}
                    <SecondaryButton onClick={retry} sx={{ mt: 1.25 }}>{translate('panorama.status.retry')}</SecondaryButton>
                  </Box>
                )}
              </Section>
            </Box>

            {/* ── coluna da direita: fixa ao rolar no computador ── */}
            <Box sx={{ minWidth: 0, position: { md: 'sticky' }, top: { md: 88 }, maxHeight: { md: 'calc(100vh - 104px)' }, overflowY: { md: 'auto' }, overscrollBehavior: { md: 'contain' } }}>
              {!(nothingToComplete && !allLoaded) && (
                <Box id="panorama-complete" sx={{ scrollMarginTop: { xs: 72, md: 88 } }}>
                  <Section label={translate('panorama.complete.title')} action={nothingToComplete ? undefined : <SideNote>{translate('panorama.complete.count', { smart_count: model.todo.length })}</SideNote>}>
                    {nothingToComplete ? (
                      <Typography sx={{ fontSize: 14, lineHeight: 1.5, color: 'text.secondary' }}>{translate('panorama.complete.done', { smart_count: model.total })}</Typography>
                    ) : (
                      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {model.todo.map((item) => (
                          <Box component="li" key={item.key}>
                            <Box
                              component="button"
                              type="button"
                              onClick={() => navigate(item.to)}
                              aria-label={`${item.name}: ${item.why}. ${item.cta}`}
                              sx={{
                                display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', minHeight: 60, p: '10px 12px', textAlign: 'left', font: 'inherit', color: 'text.primary',
                                bgcolor: (t) => alpha(t.palette.background.paper, 0.7),
                                border: '1px dashed', borderColor: (t) => alpha(t.palette.text.primary, t.palette.mode === 'dark' ? 0.32 : 0.3),
                                borderRadius: RADIUS.md, cursor: 'pointer', appearance: 'none',
                                '&:focus-visible': focusRing, '&:hover': { borderColor: (t) => alpha(t.palette.primary.main, 0.55) },
                              }}
                            >
                              {/* ReUI: azulejo "elevated" neutro (ilha Tailwind, tema sincronizado) para o convite. */}
                              <span className={`reui-scope ${reuiTheme}`}>
                                <ReuiIconTile variant="elevated" size="sm" className="text-muted-foreground">
                                  <AreaIcon area={item.key} />
                                </ReuiIconTile>
                              </span>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography component="span" sx={{ display: 'block', fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{item.name}</Typography>
                                <Typography component="span" sx={{ display: 'block', fontSize: 13, lineHeight: 1.35, color: 'text.secondary' }}>{item.why}</Typography>
                              </Box>
                              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 44, color: (t) => tealText(t.palette.mode), fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>
                                {item.cta}
                                <ArrowForwardRoundedIcon sx={{ fontSize: 18 }} />
                              </Box>
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Section>
                </Box>
              )}

              {/* Celular com análise pronta: o botão "Ver análise" do topo substitui este cartão. */}
              {(desktop || !report.hasReport) && (
                <Section sx={{ mt: { xs: 3, md: 0 } }}>
                  <PanoramaAiCard
                    state={report}
                    cost={cost}
                    free={free}
                    onGenerate={generate}
                    onSeeAnalysis={seeAnalysis}
                    onUploadExam={() => navigate('/exams')}
                  />
                </Section>
              )}

              <SecondaryButton fullWidth startIcon={<AutoAwesomeIcon />} onClick={() => navigate('/chat')} sx={{ mt: { xs: 1.5, md: 2 } }}>
                {translate('panorama.ask')}
              </SecondaryButton>
            </Box>
          </Box>

          {/* ── análise do Dr. Exame: o relatório consolidado que já existia, agora como seção ── */}
          <Box id="panorama-analysis" data-testid="panorama-analysis" sx={{ mt: { xs: 3, md: 4 }, scrollMarginTop: { xs: 72, md: 88 } }}>
            <Box sx={analysisCollapsed ? { position: 'relative', maxHeight: 340, overflow: 'hidden' } : undefined}>
              <ConsolidatedReportSection generateRef={generateRef} onState={setReport} noExamsElsewhere />
              {analysisCollapsed && (
                <Box aria-hidden sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 110, pointerEvents: 'none', background: (t) => `linear-gradient(${alpha(t.palette.background.default, 0)}, ${t.palette.background.default})` }} />
              )}
            </Box>
            {!desktop && report.hasReport && !reportBusy && (
              <SecondaryButton
                fullWidth
                aria-expanded={!analysisCollapsed}
                onClick={() => { if (analysisCollapsed) setAnalysisOpen(true); else { setAnalysisOpen(false); scrollTo('panorama-analysis'); } }}
                endIcon={<ExpandMoreRoundedIcon sx={{ transform: analysisCollapsed ? 'none' : 'rotate(180deg)' }} />}
                sx={{ mt: 1.25 }}
              >
                {translate(analysisCollapsed ? 'panorama.analysis.expand' : 'panorama.analysis.collapse')}
              </SecondaryButton>
            )}
          </Box>

          <Typography component="p" sx={{ mt: { xs: 2.25, md: 3 }, mb: 1, px: 0.5, fontSize: 13, lineHeight: 1.5, color: 'text.secondary', textAlign: 'center' }}>
            {translate('panorama.disclaimer')}
          </Typography>
        </>
      )}

      <StorySheet
        tiles={model?.tiles ?? []}
        areaIndex={storyIndex}
        onAreaChange={setStoryIndex}
        onClose={() => setStoryIndex(null)}
        onGenerate={generate}
        generateLabel={generateLabel}
        navigate={(to) => navigate(to)}
      />
    </PageContainer>
  );
};
