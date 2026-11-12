/**
 * Composição corporal (bioimpedância) — /composicao.
 *
 * Plano ReUI: superfície operacional · arquétipo "Frame stack" · família Frame ·
 * densidade padrão (alvos de toque de celular) · regiões: última avaliação (barra do
 * corpo + indicadores com régua), evolução (blocos + gráfico), histórico · cada região
 * com vazio/carregando/erro · sem animação de entrada.
 *
 * Blocos de origem: chart-6 (blocos + gráfico), stats-18 (medidor segmentado),
 * chart-8 (célula de indicador: título + selo, valor, fatos).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNotify } from 'react-admin';
import { ArrowDownRight, ArrowUpRight, ChartLine, History, Minus, Plus, RotateCw, Scale, Trash2, TriangleAlert } from 'lucide-react';
import { cn } from 'cn';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Frame, FrameDescription, FrameFooter, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
import { Badge } from '@/components/reui/badge';
import { IconTile } from '@/components/reui/icon-tile';
import { Alert, AlertDescription, AlertTitle } from '@/components/reui/alert';
import { ListEmpty } from '@/components/reui/list-empty';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CompositionBar, RangeMeter, type CompositionPart } from '@/components/bodycomp/meters';
import { TrendPlot, TrendTiles } from '@/components/bodycomp/trend';
import { NewReadingDialog } from '@/components/bodycomp/new-reading-dialog';
import {
  METRICS, TREND_KEYS, ZONE_LABEL, deltaOf, deviceLabel, formatDate, formatDelta, formatMetric, formatNumber, formatWithUnit,
  isStale, rangeFor, timeAgo, zoneOf,
  type BodyCompositionResponse, type BodyReading, type MetricKey,
} from '@/components/bodycomp/model';

/** Indicadores da última avaliação, na ordem de leitura; só aparece o que foi medido. */
const INDICATORS: MetricKey[] = [
  'bodyFatPct', 'skeletalMuscleKg', 'bmi', 'fatMassKg', 'bodyWaterL', 'bmrKcal', 'proteinKg', 'mineralKg', 'visceralFatLevel', 'waistHipRatio',
];

/** Por que uma medida sem faixa não ganha selo — dito, em vez de um vazio. */
const NO_RANGE_NOTE: Partial<Record<MetricKey, string>> = {
  skeletalMuscleKg: 'Sem faixa única: acompanhe a tendência, sempre no mesmo aparelho.',
  bmrKcal: 'Estimativa do aparelho para a energia gasta em repouso.',
  visceralFatLevel: 'Escala própria de cada marca — não compare aparelhos diferentes.',
  waistHipRatio: 'Estimativa do aparelho, não medida com fita.',
  bodyFatPct: 'Sem faixa de referência para a sua idade.',
};

function IndicatorCell({
  metric,
  reading,
  previous,
  reference,
}: {
  metric: MetricKey;
  reading: BodyReading;
  previous: BodyReading | undefined;
  reference: BodyCompositionResponse['reference'];
}) {
  const value = reading[metric];
  if (value == null) return null;
  const spec = METRICS[metric];
  const range = rangeFor(metric, reading, reference);
  const zone = range ? zoneOf(value, range.low, range.high) : null;
  const delta = deltaOf(metric, reading, previous);
  const DeltaIcon = delta == null ? null : delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;

  return (
    <div className="flex min-w-0 flex-col gap-3 bg-card p-4 sm:last:odd:col-span-2">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <h3 className="m-0 min-w-0 truncate text-sm font-medium text-muted-foreground">{spec.label}</h3>
        {zone ? <Badge variant={zone === 'in' ? 'success-light' : 'warning-light'}>{ZONE_LABEL[zone]}</Badge> : null}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="m-0 flex items-baseline gap-1">
          <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{formatMetric(metric, value)}</span>
          {spec.unit ? <span className="text-sm text-muted-foreground">{spec.unit}</span> : null}
        </p>
        {delta != null && DeltaIcon ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <DeltaIcon className="size-3.5" aria-hidden="true" />
            {delta === 0 ? 'igual à anterior' : `${formatDelta(metric, delta)} desde a anterior`}
          </span>
        ) : null}
      </div>
      {range ? (
        <>
          <RangeMeter value={value} range={range} unit={spec.unit} decimals={spec.decimals} label={spec.label} />
          <p className="m-0 text-xs text-muted-foreground">{range.owner}</p>
        </>
      ) : (
        <p className="m-0 text-xs text-muted-foreground">{NO_RANGE_NOTE[metric] ?? 'Sem faixa de referência nesta avaliação.'}</p>
      )}
    </div>
  );
}

/** Do que o peso é feito. Sem músculo medido, reparte só em gordura e massa livre de gordura. */
function partsOf(reading: BodyReading): CompositionPart[] | null {
  const { weightKg, fatMassKg, skeletalMuscleKg } = reading;
  if (weightKg == null || fatMassKg == null || fatMassKg <= 0 || fatMassKg >= weightKg) return null;
  const fat: CompositionPart = { key: 'fat', label: 'Gordura', kg: fatMassKg, swatch: 'bg-copper-500' };
  if (skeletalMuscleKg != null && skeletalMuscleKg > 0 && fatMassKg + skeletalMuscleKg < weightKg) {
    return [
      fat,
      { key: 'muscle', label: 'Músculo esquelético', kg: skeletalMuscleKg, swatch: 'bg-sky-600 dark:bg-sky-400' },
      { key: 'rest', label: 'Restante (água, ossos, órgãos)', kg: weightKg - fatMassKg - skeletalMuscleKg, swatch: 'bg-muted-foreground/35' },
    ];
  }
  return [fat, { key: 'lean', label: 'Massa livre de gordura', kg: weightKg - fatMassKg, swatch: 'bg-sky-600 dark:bg-sky-400' }];
}

function LoadingState() {
  return (
    <Frame role="status" aria-label="Carregando suas avaliações">
      <FrameHeader>
        <Skeleton className="h-5 w-40" />
      </FrameHeader>
      <FramePanel className="flex flex-col gap-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </FramePanel>
      <FramePanel className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </FramePanel>
    </Frame>
  );
}

export const BodyCompositionPage = () => {
  useReuiThemeSync();
  const notify = useNotify();
  const [pid] = useSelectedPatient();
  const [data, setData] = useState<BodyCompositionResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [metric, setMetric] = useState<MetricKey>('weightKg');
  const [toDelete, setToDelete] = useState<BodyReading | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const query = pid ? `?patientId=${encodeURIComponent(pid)}` : '';
      const response = await fetch(`${API_URL}/body-composition${query}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!response.ok) throw new Error(String(response.status));
      setData(await response.json());
    } catch {
      setFailed(true);
    }
  }, [pid]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  const items = data?.items ?? [];
  const latest = items[0];
  const previous = items[1];
  const oldestFirst = useMemo(() => [...(data?.items ?? [])].reverse(), [data]);
  const parts = latest ? partsOf(latest) : null;
  const trendBand = latest ? (metric === 'bodyFatPct' ? rangeFor(metric, latest, data?.reference ?? null) : null) : null;
  const devices = useMemo(() => new Set((data?.items ?? []).map((item) => deviceLabel(item))), [data]);

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const response = await fetch(`${API_URL}/body-composition/${toDelete.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      if (!response.ok && response.status !== 404) throw new Error(String(response.status));
      setToDelete(null);
      notify('Avaliação excluída.', { type: 'info' });
      await load();
    } catch {
      notify('Não foi possível excluir. Tente de novo.', { type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const newButton = (
    <Button size="lg" className="h-10" onClick={() => setDialogOpen(true)}>
      <Plus aria-hidden="true" />
      Nova avaliação
    </Button>
  );

  return (
    <PageContainer width="content" sx={{ pb: { xs: 10, sm: 5 } }}>
      <PageHeader
        icon={<Scale className="size-6" />}
        title="Composição corporal"
        subtitle="Gordura, músculo e água do seu corpo, avaliação por avaliação."
        actions={items.length > 0 ? <div className="dx-island [&_button]:font-[inherit]">{newButton}</div> : undefined}
      />

      <div className="dx-island flex flex-col gap-4 [&_button]:font-[inherit]">
        {failed ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Não foi possível carregar suas avaliações</AlertTitle>
            <AlertDescription>
              <Button variant="outline" size="lg" className="mt-2" onClick={() => void load()}>
                <RotateCw aria-hidden="true" />
                Tentar de novo
              </Button>
            </AlertDescription>
          </Alert>
        ) : !data ? (
          <LoadingState />
        ) : !latest ? (
          <Frame>
            <FramePanel>
              <ListEmpty
                icon={<Scale aria-hidden="true" />}
                title="Nenhuma avaliação ainda"
                description="Fez uma bioimpedância? Envie o laudo (PDF ou foto) de qualquer aparelho, leia o QR da folha InBody ou digite os valores para acompanhar gordura, músculo e água ao longo do tempo."
                action={newButton}
              />
            </FramePanel>
          </Frame>
        ) : (
          <>
            {isStale(latest.measuredAt) ? (
              <Alert variant="warning">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>Sua última avaliação é de {timeAgo(latest.measuredAt)}</AlertTitle>
                <AlertDescription>
                  <p className="m-0">Os valores abaixo são de {formatDate(latest.measuredAt)} e podem não refletir seu corpo hoje.</p>
                </AlertDescription>
              </Alert>
            ) : null}

            {/* Última avaliação */}
            <Frame>
              <FrameHeader className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
                  <IconTile variant="frame" size="sm" aria-hidden="true">
                    <Scale aria-hidden="true" />
                  </IconTile>
                  <div className="flex min-w-0 flex-col gap-px">
                    <FrameTitle role="heading" aria-level={2}>Última avaliação</FrameTitle>
                    <FrameDescription className="tabular-nums">
                      {formatDate(latest.measuredAt)} · {timeAgo(latest.measuredAt)}
                    </FrameDescription>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{deviceLabel(latest)}</Badge>
                  {latest.needsReview ? <Badge variant="warning-light">Conferir com a folha</Badge> : null}
                </div>
              </FrameHeader>

              {latest.weightKg != null ? (
                <FramePanel className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="m-0 flex items-baseline gap-1.5">
                      <span className="text-3xl leading-none font-semibold tracking-tight tabular-nums">{formatMetric('weightKg', latest.weightKg)}</span>
                      <span className="text-sm text-muted-foreground">kg de peso</span>
                    </p>
                    {deltaOf('weightKg', latest, previous) != null ? (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDelta('weightKg', deltaOf('weightKg', latest, previous)!)} desde {formatDate(previous!.measuredAt)}
                      </span>
                    ) : null}
                  </div>
                  {parts ? (
                    <>
                      <CompositionBar parts={parts} totalKg={latest.weightKg} />
                      <dl className="m-0 flex flex-col gap-2">
                        {parts.map((part) => (
                          <div key={part.key} className="flex items-center justify-between gap-3 text-sm">
                            <dt className="flex min-w-0 items-center gap-2">
                              <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', part.swatch)} />
                              <span className="min-w-0 truncate">{part.label}</span>
                            </dt>
                            <dd className="m-0 flex shrink-0 items-baseline gap-2 tabular-nums">
                              <span className="font-medium">{formatNumber(part.kg, 1)} kg</span>
                              <span className="w-12 text-end text-xs text-muted-foreground">{formatNumber((part.kg / latest.weightKg!) * 100, 0)} %</span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  ) : null}
                </FramePanel>
              ) : null}

              <FramePanel className="grid gap-px bg-border p-0! sm:grid-cols-2">
                {INDICATORS.map((key) => (
                  <IndicatorCell key={key} metric={key} reading={latest} previous={previous} reference={data.reference} />
                ))}
              </FramePanel>

              <FrameFooter>
                <p className="m-0 text-xs text-muted-foreground">
                  Bioimpedância é uma estimativa e varia com hidratação, refeição e horário. As faixas são educativas e não substituem a avaliação de um profissional de saúde.
                </p>
              </FrameFooter>
            </Frame>

            {/* Evolução */}
            <Frame>
              <FrameHeader className="flex-row items-center gap-3">
                <IconTile variant="frame" size="sm" aria-hidden="true">
                  <ChartLine aria-hidden="true" />
                </IconTile>
                <div className="flex min-w-0 flex-col gap-px">
                  <FrameTitle role="heading" aria-level={2}>Evolução</FrameTitle>
                  <FrameDescription>
                    {items.length === 1 ? '1 avaliação registrada' : `${items.length} avaliações · variação desde a anterior`}
                  </FrameDescription>
                </div>
              </FrameHeader>
              <FramePanel className="@container">
                <TrendTiles keys={TREND_KEYS} active={metric} latest={latest} previous={previous} onSelect={setMetric} />
              </FramePanel>
              <FramePanel className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className={cn('size-2 rounded-full', METRICS[metric].swatch)} />
                    {METRICS[metric].label}{METRICS[metric].unit ? `, em ${METRICS[metric].unit}` : ''}
                  </span>
                  {trendBand ? (
                    <span className="flex items-center gap-1.5 tabular-nums">
                      <span aria-hidden="true" className="h-2 w-3 rounded-sm border border-dashed border-success/60 bg-success/15" />
                      Faixa de referência: {formatNumber(trendBand.low, 1)} a {formatNumber(trendBand.high, 1)} %
                    </span>
                  ) : null}
                </div>
                <TrendPlot readings={oldestFirst} metric={metric} band={trendBand} />
                {devices.size > 1 ? (
                  <p className="m-0 text-xs text-muted-foreground">
                    Há avaliações de aparelhos diferentes ({[...devices].join(', ')}). Parte da variação pode ser do aparelho, não do corpo.
                  </p>
                ) : null}
              </FramePanel>
            </Frame>

            {/* Histórico */}
            <Frame>
              <FrameHeader className="flex-row items-center gap-3">
                <IconTile variant="frame" size="sm" aria-hidden="true">
                  <History aria-hidden="true" />
                </IconTile>
                <FrameTitle role="heading" aria-level={2}>Histórico</FrameTitle>
              </FrameHeader>
              <FramePanel className="p-0!">
                <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-medium tabular-nums">{formatDate(item.measuredAt)}</span>
                          <Badge variant="outline" size="sm">{deviceLabel(item)}</Badge>
                        </div>
                        <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                          {(['weightKg', 'bodyFatPct', 'skeletalMuscleKg'] as MetricKey[])
                            .filter((key) => item[key] != null)
                            .map((key) => (
                              <span key={key} className="whitespace-nowrap">{METRICS[key].short} {formatWithUnit(key, item[key] as number)}</span>
                            ))}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        className="size-10 shrink-0 bg-transparent text-muted-foreground"
                        aria-label={`Excluir avaliação de ${formatDate(item.measuredAt)}`}
                        onClick={() => setToDelete(item)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </FramePanel>
            </Frame>
          </>
        )}
      </div>

      <NewReadingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        patientId={pid}
        onSaved={({ duplicate }) => {
          notify(duplicate ? 'Esta folha já estava registrada.' : 'Avaliação salva.', { type: duplicate ? 'info' : 'success' });
          void load();
        }}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(open) => { if (!open && !deleting) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta avaliação?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? `A avaliação de ${formatDate(toDelete.measuredAt)} sai do histórico e do gráfico. Não dá para desfazer.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="lg" disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="lg" disabled={deleting} onClick={() => void remove()}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
};
