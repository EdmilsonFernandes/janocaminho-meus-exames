import { useEffect, useState } from 'react';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
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

export const VaccinesPage = () => {
  const [pid] = useSelectedPatient();
  const themeClass = useReuiThemeSync();
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [nextDate, setNextDate] = useState('');
  const [lot, setLot] = useState('');
  const [formOpen, setFormOpen] = useState(false);

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

  return (
    <PageContainer width="content" sx={{ pb: { xs: 10, sm: 5 } }}>
      <div className={`reui-scope ${themeClass} space-y-4`}>
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
              Verifique os cartões destacados abaixo e atualize quando aplicar o reforço no posto ou clínica.
            </AlertDescription>
          </Alert>
        )}

        {/* Resumo KPI em ReUI Frame */}
        <Frame>
          <FramePanel className="grid grid-cols-3 divide-x divide-border p-0">
            <div className="p-3.5 text-center sm:p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Registradas
              </div>
              <div className="mt-0.5 font-heading text-xl font-extrabold text-primary tabular-nums sm:text-2xl">
                {items.length}
              </div>
            </div>
            <div className="p-3.5 text-center sm:p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Próximas doses
              </div>
              <div className="mt-0.5 font-heading text-xl font-extrabold text-foreground tabular-nums sm:text-2xl">
                {upcomingCount}
              </div>
            </div>
            <div className="p-3.5 text-center sm:p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Atrasadas
              </div>
              <div
                className={`mt-0.5 font-heading text-xl font-extrabold tabular-nums sm:text-2xl ${
                  overdueCount > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {overdueCount}
              </div>
            </div>
          </FramePanel>
        </Frame>

        {/* Formulário de registro (ReUI Frame colapsável + sugestões rápidas) */}
        <Frame>
          <FrameHeader className="flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <IconTile tone="primary" size="sm">
                <AddCircleOutlineIcon sx={{ fontSize: 18 }} />
              </IconTile>
              <div>
                <FrameTitle>Registrar vacina</FrameTitle>
                <FrameDescription>
                  Escolha um imunizante comum ou digite o nome, lote e data do reforço
                </FrameDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-bold text-foreground transition hover:bg-muted cursor-pointer"
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
            <FramePanel className="space-y-3.5">
              {/* Sugestões rápidas de imunizantes */}
              <div>
                <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Preenchimento rápido
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_VACCINES.map((q) => {
                    const selected = name === q;
                    return (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setName(q)}
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
          )}

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
            <FrameHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <FrameTitle>Histórico de imunização</FrameTitle>
                <FrameDescription>
                  Vacinas aplicadas e lembretes de próximas doses
                </FrameDescription>
              </div>
              <ReuiBadge variant="primary-light" size="sm">
                {items.length} registro{items.length === 1 ? '' : 's'}
              </ReuiBadge>
            </FrameHeader>

            {items.map((v) => {
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
                      <div className="mt-2">
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
            })}
          </Frame>
        )}
      </div>
    </PageContainer>
  );
};
