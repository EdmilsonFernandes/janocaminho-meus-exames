import { useEffect, useState, type CSSProperties } from 'react';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { cn } from 'cn';
import { confirmDialog } from '../components/ConfirmDialog';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { useReuiThemeSync } from '@/components/reui/useReuiThemeSync';
import {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
  FrameFooter,
} from '@/components/reui/frame';
import { Badge as ReuiBadge } from '@/components/reui/badge';
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from '@/components/reui/alert';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import {
  FieldLabelWithHint,
  IconTile,
} from '@/components/reui/patterns';
import { ReuiInput } from '@/components/reui/form-controls';
import { SyringeVaccineIcon } from '@/components/reui/icons';
import { GlassGlow } from '../components/motion/GlassGlow';

const QUICK_VACCINES = [
  'Influenza (Gripe)',
  'COVID-19',
  'Hepatite B',
  'Dupla Adulto (dT)',
  'Febre Amarela',
  'Tríplice Viral',
  'Herpes Zóster',
  'Pneumocócica',
];

const VACCINE_BOOSTER_MONTHS: Record<string, { months: number | null; label: string }> = {
  'Influenza (Gripe)': { months: 12, label: 'Reforço anual (+1 ano)' },
  'COVID-19': { months: 12, label: 'Reforço anual (+1 ano)' },
  'Hepatite B': { months: 6, label: 'Esquema 3 doses (+6 meses)' },
  'Dupla Adulto (dT)': { months: 120, label: 'Reforço a cada 10 anos' },
  'Febre Amarela': { months: null, label: 'Dose única (sem reforço)' },
  'Tríplice Viral': { months: null, label: 'Esquema completo' },
  'Herpes Zóster': { months: 2, label: '2ª dose em 2 meses' },
  'Pneumocócica': { months: 60, label: 'Avaliar reforço em 5 anos' },
};

function findBoosterRule(vaccineName: string) {
  const trimmed = vaccineName.trim();
  if (!trimmed) return null;
  if (VACCINE_BOOSTER_MONTHS[trimmed]) return VACCINE_BOOSTER_MONTHS[trimmed];
  if (/covid/i.test(trimmed)) return VACCINE_BOOSTER_MONTHS['COVID-19'];
  if (/influenza|gripe/i.test(trimmed)) return VACCINE_BOOSTER_MONTHS['Influenza (Gripe)'];
  if (/hepatite\s*b/i.test(trimmed)) return VACCINE_BOOSTER_MONTHS['Hepatite B'];
  if (/dupla|\bdt\b|t[eé]tano/i.test(trimmed)) return VACCINE_BOOSTER_MONTHS['Dupla Adulto (dT)'];
  if (/febre\s*amarela/i.test(trimmed)) return VACCINE_BOOSTER_MONTHS['Febre Amarela'];
  if (/tr[ií]plice/i.test(trimmed)) return VACCINE_BOOSTER_MONTHS['Tríplice Viral'];
  if (/z[oó]ster/i.test(trimmed)) return VACCINE_BOOSTER_MONTHS['Herpes Zóster'];
  if (/pneumo/i.test(trimmed)) return VACCINE_BOOSTER_MONTHS['Pneumocócica'];
  return null;
}

function calcSuggestedNextDate(baseDateIso: string, vaccineName: string): string {
  const rule = findBoosterRule(vaccineName);
  if (!rule?.months) return '';
  const clean = baseDateIso.slice(0, 10);
  const d = clean ? new Date(`${clean}T12:00:00`) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + rule.months);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const VaccinesPage = () => {
  const [pid] = useSelectedPatient();
  const themeClass = useReuiThemeSync();
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [nextDate, setNextDate] = useState('');
  const [lot, setLot] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'upcoming' | 'overdue'>('all');

  const load = async () => {
    if (!pid) return;
    const r = await fetch(`${API_URL}/vaccines?patientId=${pid}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (r.ok) setItems(await r.json());
  };
  useEffect(() => {
    load();
    /* eslint-disable-next-line */
  }, [pid]);

  const add = async () => {
    if (!name.trim() || !date) return;
    await fetch(`${API_URL}/vaccines`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify({
        patientId: pid,
        name: name.trim(),
        dateApplied: date,
        nextDoseDate: nextDate || null,
        lot: lot || null,
      }),
    });
    setName('');
    setNextDate('');
    setLot('');
    load();
  };

  // Carteira de vacinação: exclusão confirmada (dado de saúde — sem delete de 1 toque).
  const del = async (id: string) => {
    if (
      !(await confirmDialog({
        title: 'Excluir vacina',
        message: 'Apagar este registro da carteira de vacinação?',
        confirmLabel: 'Excluir',
      }))
    )
      return;
    await fetch(`${API_URL}/vaccines/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` },
    });
    load();
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const overdue = (d: string) => new Date(d) < new Date();
  const overdueCount = items.filter(
    (v) => v.nextDoseDate && overdue(v.nextDoseDate)
  ).length;
  const upcomingCount = items.filter(
    (v) => v.nextDoseDate && !overdue(v.nextDoseDate)
  ).length;
  const filteredItems = items.filter((v) => {
    if (statusFilter === 'upcoming') return v.nextDoseDate && !overdue(v.nextDoseDate);
    if (statusFilter === 'overdue') return v.nextDoseDate && overdue(v.nextDoseDate);
    return true;
  });
  const boosterRule = findBoosterRule(name);

  return (
    <PageContainer width="content" sx={{ pb: { xs: 10, sm: 5 } }}>
      <div className={`reui-scope dx-island ${themeClass} space-y-4`}>
        <PageHeader
          icon={<SyringeVaccineIcon size={24} />}
          title="Carteira de Vacinação"
          subtitle="Registre suas vacinas, lotes e próximas doses — útil na consulta médica e em viagens."
          actions={
            <button
              type="button"
              onClick={() => setFormOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:opacity-95 cursor-pointer"
            >
              <AddCircleOutlineIcon sx={{ fontSize: 15 }} />
              {formOpen ? 'Fechar formulário' : 'Nova vacina'}
            </button>
          }
        />

        {/* Alerta de doses vencidas */}
        {overdueCount > 0 && (
          <Alert variant="warning">
            <WarningAmberIcon sx={{ fontSize: 18 }} />
            <AlertTitle>
              {overdueCount === 1
                ? '1 dose de reforço está com data vencida'
                : `${overdueCount} doses de reforço estão com data vencida`}
            </AlertTitle>
            <AlertDescription>
              Verifique os cartões destacados abaixo e toque em “Registrar reforço hoje” quando aplicar no posto ou clínica.
            </AlertDescription>
          </Alert>
        )}

        {/* Resumo KPI em ReUI Frame + chart-6/metric-tiles com filtro interativo e vidro */}
        <Frame>
          <FramePanel className="dx-glass relative overflow-hidden p-0!">
            <GlassGlow />
            {(() => {
              const kpiTiles = [
                {
                  id: 'all' as const,
                  label: 'Registradas',
                  count: items.length,
                  dot: null,
                  numTone: 'text-primary',
                  swatch: 'bg-primary',
                },
                {
                  id: 'upcoming' as const,
                  label: 'Próximas doses',
                  count: upcomingCount,
                  dot: 'bg-info',
                  numTone: 'text-info',
                  swatch: 'bg-info',
                },
                {
                  id: 'overdue' as const,
                  label: 'Atrasadas',
                  count: overdueCount,
                  dot: overdueCount > 0 ? 'bg-destructive' : 'bg-success',
                  numTone:
                    overdueCount > 0
                      ? 'text-destructive'
                      : 'text-emerald-600 dark:text-emerald-400',
                  swatch: overdueCount > 0 ? 'bg-destructive' : 'bg-success',
                },
              ];
              const activeIdx = Math.max(
                0,
                kpiTiles.findIndex((t) => t.id === statusFilter)
              );
              const activeSwatch = kpiTiles[activeIdx].swatch;
              return (
                <div
                  role="group"
                  aria-label="Filtrar carteira de vacinação"
                  className="relative grid grid-cols-3 divide-x divide-border/70"
                >
                  {kpiTiles.map((opt) => {
                    const active = statusFilter === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setStatusFilter(opt.id)}
                        className={cn(
                          'min-w-0 cursor-pointer px-1.5 py-3.5 text-center transition-colors outline-none hover:bg-muted/40 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:p-4',
                          active && 'bg-card/80'
                        )}
                      >
                        <div className="flex min-h-8 items-center justify-center gap-1.5 text-xs leading-4 font-semibold text-muted-foreground">
                          {opt.dot ? (
                            <span
                              aria-hidden="true"
                              className={cn('size-1.5 shrink-0 rounded-full', opt.dot)}
                            />
                          ) : null}
                          <span className={cn(active && 'text-foreground font-bold')}>
                            {opt.label}
                          </span>
                        </div>
                        <div
                          className={cn(
                            'mt-0.5 font-heading text-xl font-extrabold tabular-nums sm:text-2xl',
                            opt.numTone
                          )}
                        >
                          {opt.count}
                        </div>
                      </button>
                    );
                  })}
                  <span
                    aria-hidden="true"
                    style={{ '--tile-x': `${activeIdx * 100}%` } as CSSProperties}
                    className="pointer-events-none absolute start-0 bottom-0 h-full w-1/3 translate-x-(--tile-x) transition-[translate] duration-300 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none"
                  >
                    <span
                      className={cn(
                        'absolute inset-x-4 bottom-0 h-0.5 rounded-full transition-colors duration-300 sm:inset-x-6',
                        activeSwatch
                      )}
                    />
                  </span>
                </div>
              );
            })()}
          </FramePanel>
        </Frame>

        {/* Formulário de registro (ReUI Frame colapsável + sugestões rápidas) */}
        <Frame>
          <FrameHeader className="flex flex-row items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <IconTile tone="primary" size="sm">
                <AddCircleOutlineIcon sx={{ fontSize: 18 }} />
              </IconTile>
              <div className="min-w-0">
                <FrameTitle>Registrar vacina</FrameTitle>
                <FrameDescription>
                  Escolha um imunizante comum ou digite o nome, lote e data do reforço
                </FrameDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen((o) => !o)}
              aria-expanded={formOpen}
              className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-border bg-card px-3.5 text-xs font-bold whitespace-nowrap text-foreground transition-colors duration-200 hover:bg-muted"
            >
              {formOpen ? 'Recolher' : 'Abrir'}
              <ExpandMoreIcon
                sx={{
                  fontSize: 16,
                  transform: formOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform .2s',
                }}
              />
            </button>
          </FrameHeader>

          {/* Fix 04/11 (dono: "abrir quebrado no app"): MUI Collapse mede a altura do
              conteúdo — com FramePanel/grid interno a medição zera e o form "abre" com
              altura 0 (invisível) no WebView. Render condicional direto: sem transição,
              mas SEMPRE visível. Se quiser animação depois: motion com altura auto. */}
          {formOpen && (
            <>
              <FramePanel className="space-y-3.5">
                {/* Sugestões rápidas de imunizantes */}
                <div>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Preenchimento rápido
                    </span>
                    {boosterRule && (
                      <ReuiBadge variant="info-light" size="xs">
                        {boosterRule.label}
                      </ReuiBadge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_VACCINES.map((q) => {
                      const selected = name === q;
                      return (
                        <button
                          key={q}
                          type="button"
                          onClick={() => {
                            setName(q);
                            setNextDate(calcSuggestedNextDate(date, q));
                          }}
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                            selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-muted/40 text-foreground hover:border-primary/40 hover:bg-primary/5'
                          }`}
                        >
                          {q}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-4">
                    <FieldLabelWithHint label="Imunizante / Vacina" required>
                      <ReuiInput
                        placeholder="Ex.: Influenza, COVID-19..."
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </FieldLabelWithHint>
                  </div>

                  <div className="sm:col-span-3">
                    <FieldLabelWithHint label="Aplicada em" required>
                      <ReuiInput
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="tabular-nums"
                      />
                    </FieldLabelWithHint>
                  </div>

                  <div className="sm:col-span-3">
                    <FieldLabelWithHint label="Próxima dose" hint="Opcional">
                      <ReuiInput
                        type="date"
                        value={nextDate}
                        onChange={(e) => setNextDate(e.target.value)}
                        className="tabular-nums"
                      />
                    </FieldLabelWithHint>
                  </div>

                  <div className="sm:col-span-2">
                    <FieldLabelWithHint label="Lote" hint="Opcional">
                      <ReuiInput
                        placeholder="Ex.: 24A"
                        value={lot}
                        onChange={(e) => setLot(e.target.value)}
                      />
                    </FieldLabelWithHint>
                  </div>
                </div>
              </FramePanel>

              <FrameFooter className="flex justify-end">
                <button
                  type="button"
                  onClick={add}
                  disabled={!name.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  <AddCircleOutlineIcon sx={{ fontSize: 16 }} />
                  Adicionar à carteira
                </button>
              </FrameFooter>
            </>
          )}
        </Frame>

        {/* CARTEIRA DE VACINAS */}
        {items.length === 0 ? (
          <Frame>
            <FramePanel className="p-6">
              <Empty className="border-0 p-4 md:p-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SyringeVaccineIcon size={22} />
                  </EmptyMedia>
                  <EmptyTitle>Carteira de vacinação vazia</EmptyTitle>
                  <EmptyDescription>
                    Registre suas vacinas e datas de reforço para tê-las sempre à mão em consultas e viagens.
                  </EmptyDescription>
                </EmptyHeader>
                <button
                  type="button"
                  onClick={() => setFormOpen(true)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:opacity-95 cursor-pointer"
                >
                  <AddCircleOutlineIcon sx={{ fontSize: 16 }} />
                  Registrar primeira vacina
                </button>
              </Empty>
            </FramePanel>
          </Frame>
        ) : (
          <Frame id="carteira" spacing="sm">
            <FrameHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <FrameTitle>Histórico de imunização</FrameTitle>
                <FrameDescription>
                  {statusFilter === 'all'
                    ? 'Vacinas aplicadas e lembretes de próximas doses'
                    : statusFilter === 'upcoming'
                      ? 'Mostrando apenas vacinas com próxima dose em dia'
                      : 'Mostrando apenas vacinas com reforço vencido'}
                </FrameDescription>
              </div>
              <div className="flex items-center gap-2">
                {statusFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className="cursor-pointer rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground transition hover:bg-muted"
                  >
                    Mostrar todas
                  </button>
                )}
                <ReuiBadge variant="primary-light" size="sm">
                  {filteredItems.length} registro{filteredItems.length === 1 ? '' : 's'}
                </ReuiBadge>
              </div>
            </FrameHeader>

            {filteredItems.length === 0 ? (
              <FramePanel className="flex flex-col items-center gap-2 py-8 text-center">
                <p className="m-0 text-sm font-semibold text-foreground">
                  Nenhuma vacina neste filtro.
                </p>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className="cursor-pointer rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-muted"
                >
                  Mostrar todas ({items.length})
                </button>
              </FramePanel>
            ) : (
              filteredItems.map((v) => {
                const hasNext = !!v.nextDoseDate;
                const isOverdue = hasNext && overdue(v.nextDoseDate);
                return (
                  <FramePanel
                    key={v.id}
                    className={`flex items-start gap-3.5 p-4 ${
                      isOverdue ? 'ring-1 ring-destructive/40 bg-destructive/[0.03]' : ''
                    }`}
                  >
                    <IconTile
                      tone={isOverdue ? 'destructive' : 'primary'}
                      size="md"
                      className="mt-0.5"
                    >
                      <SyringeVaccineIcon size={20} />
                    </IconTile>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-extrabold text-foreground">
                          {v.name}
                        </span>
                        {v.lot && (
                          <ReuiBadge variant="outline" size="xs" className="tabular-nums">
                            Lote: {v.lot}
                          </ReuiBadge>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <CalendarMonthIcon sx={{ fontSize: 14 }} />
                          Aplicada em {fmt(v.dateApplied)}
                        </span>
                      </div>

                      {hasNext && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <ReuiBadge
                            variant={isOverdue ? 'destructive' : 'warning-light'}
                            size="sm"
                            className="tabular-nums"
                          >
                            {isOverdue ? (
                              <WarningAmberIcon sx={{ fontSize: 13 }} />
                            ) : (
                              <CheckCircleIcon sx={{ fontSize: 13 }} />
                            )}
                            Próxima dose: {fmt(v.nextDoseDate)}
                            {isOverdue ? ' (vencida)' : ''}
                          </ReuiBadge>

                          {isOverdue && (
                            <button
                              type="button"
                              onClick={() => {
                                const todayIso = new Date().toISOString().slice(0, 10);
                                setName(v.name);
                                setDate(todayIso);
                                setNextDate(calcSuggestedNextDate(todayIso, v.name));
                                setLot('');
                                setFormOpen(true);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary transition hover:bg-primary/20 cursor-pointer"
                            >
                              <CheckCircleIcon sx={{ fontSize: 13 }} />
                              Registrar reforço hoje
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      aria-label={`Excluir vacina ${v.name}`}
                      onClick={() => del(v.id)}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                    >
                      <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
                    </button>
                  </FramePanel>
                );
              })
            )}
          </Frame>
        )}
      </div>
    </PageContainer>
  );
};
