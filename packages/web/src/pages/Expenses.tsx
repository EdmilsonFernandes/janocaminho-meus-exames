import { useEffect, useState } from 'react';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { cn } from 'cn';
import { useNotify, useTranslate } from 'react-admin';
import { confirmDialog } from '../components/ConfirmDialog';
import { API_URL, apiHeaders, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { printPage } from '../utils/nativeDoc';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { ListSkeleton } from '../components/Skeleton';
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
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FieldLabelWithHint,
  IconTile,
} from '@/components/reui/patterns';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  ReuiInput,
} from '@/components/reui/form-controls';
import { WalletReceiptIcon } from '@/components/reui/icons';
import { GlassGlow } from '../components/motion/GlassGlow';

interface Expense {
  id: string;
  description: string;
  category: string;
  amount: number;
  spentAt: string;
}

const CATEGORIES = ['Exame', 'Consulta', 'Farmácia', 'Procedimento', 'Outro'] as const;

const CATEGORY_BADGE: Record<
  string,
  'primary-light' | 'info-light' | 'warning-light' | 'success-light' | 'outline'
> = {
  Exame: 'primary-light',
  Consulta: 'info-light',
  Farmácia: 'warning-light',
  Procedimento: 'success-light',
  Outro: 'outline',
};

const CATEGORY_BAR_CLASS: Record<string, string> = {
  Exame: 'bg-primary',
  Consulta: 'bg-info',
  Farmácia: 'bg-warning',
  Procedimento: 'bg-success',
  Outro: 'bg-muted-foreground',
};

function detectExpenseCategory(text: string): string | null {
  const s = text.trim();
  if (!s) return null;
  if (
    /farm[aá]cia|rem[eé]dio|medicamento|droga|drogaria|durateston|duratesteron|deposteron|cipionato|enantato|masteron|ozempic|mounjaro|comprimido|caixa|vitamina|suplemento/i.test(
      s
    )
  ) {
    return 'Farmácia';
  }
  if (
    /endoscopia|colonoscopia|cirurgia|procedimento|bi[oó]psia|infiltra[çc][aã]o|laser|cauteriza/i.test(
      s
    )
  ) {
    return 'Procedimento';
  }
  if (
    /consulta|retorno|m[eé]dico|psic[oó]log|nutricion|dentista|odonto|psiquiatra|cardiolog|endocrinolog|urolog|ginecolog|dermatolog/i.test(
      s
    )
  ) {
    return 'Consulta';
  }
  if (
    /exame|raio.?x|resson[aâ]ncia|tomografia|ultrassom|hemograma|sangue|laborat[oó]rio|check.?up|eletro|ecocardiograma/i.test(
      s
    )
  ) {
    return 'Exame';
  }
  return null;
}

const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;
/** Meio-dia local: imune a TZ (o parse cru de date-only caía no dia anterior em UTC-3). */
const fmtDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
const monthLabel = (key: string) => {
  const s = new Date(`${key}-01T12:00:00`).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const ExpensesPage = () => {
  const translate = useTranslate();
  const [pid] = useSelectedPatient();
  const notify = useNotify();
  const themeClass = useReuiThemeSync();
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<string>('Exame');
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [autoDetectedCat, setAutoDetectedCat] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    if (!pid) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(
        `${API_URL}/expenses?patientId=${pid}&_start=0&_end=200`,
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      if (r.ok) setItems(await r.json());
    } catch {
      /* ignore */
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, [pid]);

  const cancelEdit = () => {
    setEditingId(null);
    setDesc('');
    setAmount('');
    setDate(new Date().toISOString().slice(0, 10));
    setCategory('Exame');
    setCategoryTouched(false);
    setAutoDetectedCat(null);
  };

  const add = async () => {
    if (!pid || !desc.trim() || !amount) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/expenses`, {
        method: 'POST',
        headers: apiHeaders(true),
        body: JSON.stringify({
          patientId: pid,
          description: desc.trim(),
          category,
          amount: parseFloat(amount),
          spentAt: date,
        }),
      });
      if (!r.ok) throw new Error('Falha ao salvar');
      if (editingId) {
        await fetch(`${API_URL}/expenses/${editingId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token()}` },
        });
      }
      setDesc('');
      setAmount('');
      setEditingId(null);
      setCategoryTouched(false);
      setAutoDetectedCat(null);
      await load();
    } catch (e: any) {
      notify(e.message, { type: 'error' });
    }
    setSaving(false);
  };

  const del = async (id: string) => {
    if (
      !(await confirmDialog({
        title: 'Excluir lançamento',
        message:
          'Apagar este lançamento? Afeta o total e o relatório de IR.',
        confirmLabel: 'Excluir',
      }))
    )
      return;
    try {
      await fetch(`${API_URL}/expenses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (editingId === id) cancelEdit();
      await load();
    } catch {
      /* ignore */
    }
  };

  const years = Array.from(new Set(items.map((i) => i.spentAt.slice(0, 4)))).sort(
    (a, b) => b.localeCompare(a)
  );
  const effectiveYear =
    selectedYear === 'all' || years.includes(selectedYear) ? selectedYear : 'all';

  const yearFilteredItems =
    effectiveYear === 'all'
      ? items
      : items.filter((i) => i.spentAt.slice(0, 4) === effectiveYear);

  const total = yearFilteredItems.reduce((s, i) => s + i.amount, 0);

  // Totais por categoria para resumo rápido de IR
  const byCategory = CATEGORIES.map((cat) => ({
    category: cat,
    total: yearFilteredItems
      .filter((i) => i.category === cat)
      .reduce((s, i) => s + i.amount, 0),
    count: yearFilteredItems.filter((i) => i.category === cat).length,
  })).filter((c) => c.count > 0);

  const effectiveCategory =
    selectedCategory === 'all' ||
    byCategory.some((c) => c.category === selectedCategory)
      ? selectedCategory
      : 'all';

  const filteredItems =
    effectiveCategory === 'all'
      ? yearFilteredItems
      : yearFilteredItems.filter((i) => i.category === effectiveCategory);

  // Histórico AGRUPADO POR MÊS (desc)
  const months = (() => {
    const map = new Map<string, Expense[]>();
    for (const i of [...filteredItems].sort((a, b) =>
      b.spentAt.localeCompare(a.spentAt)
    )) {
      const key = i.spentAt.slice(0, 7);
      const arr = map.get(key) ?? [];
      arr.push(i);
      map.set(key, arr);
    }
    return [...map.entries()];
  })();

  return (
    <PageContainer width="content">
      <div className={`reui-scope dx-island ${themeClass} space-y-4`}>
        <PageHeader
          icon={<WalletReceiptIcon size={24} />}
          title={translate('page.expenses')}
          subtitle="Consultas, exames e farmácia: registre e veja para onde vai seu investimento em saúde — organizado para o Imposto de Renda."
          actions={
            items.length > 0 ? (
              <button
                type="button"
                onClick={() => printPage()}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/20 cursor-pointer"
              >
                <PrintOutlinedIcon sx={{ fontSize: 15 }} />
                Relatório para IR
              </button>
            ) : undefined
          }
        />

        {/* RESUMO — ReUI Frame com vidro + filtro por ano/categoria + barra proporcional stats-4 */}
        <Frame>
          <FrameHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <FrameTitle>Resumo financeiro em saúde</FrameTitle>
              <FrameDescription>
                {yearFilteredItems.length} lançamento
                {yearFilteredItems.length === 1 ? '' : 's'} registrado
                {yearFilteredItems.length === 1 ? '' : 's'} · mantenha os comprovantes fiscais para dedução no IRPF
              </FrameDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {years.length > 0 && (
                <div
                  role="group"
                  aria-label="Filtrar por ano do IRPF"
                  className="inline-flex items-center rounded-full border border-border bg-card/70 p-0.5"
                >
                  <button
                    type="button"
                    aria-pressed={effectiveYear === 'all'}
                    onClick={() => setSelectedYear('all')}
                    className={cn(
                      'cursor-pointer rounded-full px-2.5 py-1 text-xs font-semibold transition tabular-nums',
                      effectiveYear === 'all'
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Todos
                  </button>
                  {years.map((y) => (
                    <button
                      key={y}
                      type="button"
                      aria-pressed={effectiveYear === y}
                      onClick={() => setSelectedYear(y)}
                      className={cn(
                        'cursor-pointer rounded-full px-2.5 py-1 text-xs font-semibold transition tabular-nums',
                        effectiveYear === y
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              )}
              <ReuiBadge variant="primary-light" size="sm">
                IRPF Saúde
              </ReuiBadge>
            </div>
          </FrameHeader>

          <FramePanel className="dx-glass relative flex flex-col gap-4 overflow-hidden">
            <GlassGlow />
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3.5">
                <IconTile tone="primary" size="lg">
                  <WalletReceiptIcon size={24} />
                </IconTile>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {effectiveYear === 'all'
                      ? 'Total acumulado'
                      : `Total em ${effectiveYear}`}
                  </div>
                  <div className="font-heading text-2xl font-extrabold tracking-tight text-primary tabular-nums sm:text-3xl">
                    {brl(total)}
                  </div>
                </div>
              </div>

              {byCategory.length > 0 && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por categoria">
                  {byCategory.map((c) => {
                    const active = effectiveCategory === c.category;
                    return (
                      <button
                        key={c.category}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setSelectedCategory((prev) =>
                            prev === c.category ? 'all' : c.category
                          )
                        }
                        className={cn(
                          'cursor-pointer rounded-sm transition outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active && 'ring-2 ring-primary/50 shadow-xs',
                          effectiveCategory !== 'all' && !active && 'opacity-55 hover:opacity-90'
                        )}
                      >
                        <ReuiBadge
                          variant={CATEGORY_BADGE[c.category] ?? 'outline'}
                          size="sm"
                          className="gap-1.5 tabular-nums"
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              'size-1.5 rounded-full',
                              CATEGORY_BAR_CLASS[c.category] ?? 'bg-muted-foreground'
                            )}
                          />
                          {c.category}: <strong>{brl(c.total)}</strong>
                        </ReuiBadge>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {byCategory.length > 0 && total > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-medium">
                    Distribuição por categoria · toque para filtrar
                  </span>
                  {effectiveCategory !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('all')}
                      className="cursor-pointer font-semibold text-primary hover:underline"
                    >
                      Filtrando: {effectiveCategory} · Limpar
                    </button>
                  )}
                </div>
                <div
                  aria-label="Proporção de gastos por categoria"
                  className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted/70 p-0.5"
                >
                  {byCategory.map((c) => {
                    const pct = Math.max(4, Math.round((c.total / total) * 100));
                    const active = effectiveCategory === c.category;
                    return (
                      <button
                        key={c.category}
                        type="button"
                        title={`${c.category}: ${brl(c.total)} (${Math.round((c.total / total) * 100)}%)`}
                        onClick={() =>
                          setSelectedCategory((prev) =>
                            prev === c.category ? 'all' : c.category
                          )
                        }
                        style={{ width: `${pct}%` }}
                        className={cn(
                          'h-full cursor-pointer rounded-full transition-opacity',
                          CATEGORY_BAR_CLASS[c.category] ?? 'bg-muted-foreground',
                          effectiveCategory !== 'all' && !active && 'opacity-30'
                        )}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </FramePanel>
        </Frame>

        {/* FORMULÁRIO — ReUI InputGroup (R$) + ReUI Select + detecção automática de categoria */}
        <Frame>
          <FrameHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <FrameTitle>
                  {editingId ? 'Corrigir despesa' : 'Registrar nova despesa'}
                </FrameTitle>
                {editingId && (
                  <ReuiBadge variant="warning-light" size="xs">
                    Editando lançamento
                  </ReuiBadge>
                )}
              </div>
              <FrameDescription>
                Informe o estabelecimento ou descrição, valor, data e categoria fiscal
              </FrameDescription>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="cursor-pointer rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground transition hover:bg-muted"
              >
                Cancelar edição
              </button>
            )}
          </FrameHeader>

          <FramePanel>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <FieldLabelWithHint label="Descrição" required>
                  <ReuiInput
                    placeholder="Consulta, exame laboratorial, farmácia..."
                    value={desc}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDesc(val);
                      if (!categoryTouched) {
                        const detected = detectExpenseCategory(val);
                        if (detected) {
                          setCategory(detected);
                          setAutoDetectedCat(detected);
                        } else {
                          setAutoDetectedCat(null);
                        }
                      }
                    }}
                  />
                </FieldLabelWithHint>
              </div>

              <div className="sm:col-span-2">
                <FieldLabelWithHint label="Valor" required>
                  <InputGroup>
                    <InputGroupAddon className="font-bold text-primary">
                      R$
                    </InputGroupAddon>
                    <InputGroupInput
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="tabular-nums"
                    />
                  </InputGroup>
                </FieldLabelWithHint>
              </div>

              <div className="sm:col-span-3">
                <FieldLabelWithHint label="Data">
                  <ReuiInput
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="tabular-nums"
                  />
                </FieldLabelWithHint>
              </div>

              <div className="sm:col-span-2">
                <FieldLabelWithHint
                  label="Categoria"
                  hint={autoDetectedCat ? 'Automática' : undefined}
                >
                  <Select
                    value={category}
                    onValueChange={(val) => {
                      if (val) {
                        setCategory(val);
                        setCategoryTouched(true);
                        setAutoDetectedCat(null);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full h-9">
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldLabelWithHint>
              </div>
            </div>
          </FramePanel>

          <FrameFooter className="flex items-center justify-end gap-2">
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="cursor-pointer rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-foreground transition hover:bg-muted"
              >
                Cancelar
              </button>
            )}
            <button
              type="button"
              disabled={saving || !desc.trim() || !amount}
              onClick={add}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              <AddRoundedIcon sx={{ fontSize: 16 }} />
              {saving
                ? 'Salvando…'
                : editingId
                  ? 'Atualizar despesa'
                  : 'Salvar despesa'}
            </button>
          </FrameFooter>
        </Frame>

        {/* HISTÓRICO AGRUPADO POR MÊS */}
        {loading ? (
          <ListSkeleton count={3} />
        ) : items.length === 0 ? (
          <Frame>
            <FramePanel className="p-6">
              <Empty className="border-0 p-4 md:p-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ReceiptLongOutlinedIcon sx={{ fontSize: 22 }} />
                  </EmptyMedia>
                  <EmptyTitle>Nenhuma despesa registrada</EmptyTitle>
                  <EmptyDescription>
                    Comece registrando consultas, exames e medicamentos no formulário acima para organizar seu histórico anual e declaração de IRPF.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </FramePanel>
          </Frame>
        ) : months.length === 0 ? (
          <Frame>
            <FramePanel className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="m-0 text-sm font-semibold text-foreground">
                Nenhum lançamento encontrado para os filtros atuais.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedYear('all');
                  setSelectedCategory('all');
                }}
                className="cursor-pointer rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-muted"
              >
                Limpar filtros
              </button>
            </FramePanel>
          </Frame>
        ) : (
          <div className="space-y-3">
            {months.map(([key, list]) => {
              const monthTotal = list.reduce((s, i) => s + i.amount, 0);
              return (
                <Frame key={key} spacing="sm">
                  <FrameHeader className="flex flex-row items-center justify-between gap-2">
                    <div>
                      <FrameTitle>{monthLabel(key)}</FrameTitle>
                      <FrameDescription>
                        {list.length} lançamento{list.length === 1 ? '' : 's'} no mês
                      </FrameDescription>
                    </div>
                    <ReuiBadge
                      variant="primary-light"
                      size="default"
                      className="font-extrabold tabular-nums"
                    >
                      {brl(monthTotal)}
                    </ReuiBadge>
                  </FrameHeader>

                  <FramePanel className="divide-y divide-border p-0 overflow-hidden">
                    {list.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          'flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/30',
                          editingId === item.id &&
                            'bg-primary/5 ring-1 ring-inset ring-primary/30'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-foreground">
                            {item.description}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <ReuiBadge
                              variant={CATEGORY_BADGE[item.category] ?? 'outline'}
                              size="xs"
                            >
                              {item.category}
                            </ReuiBadge>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {fmtDate(item.spentAt)}
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="mr-1 text-sm font-extrabold text-foreground tabular-nums">
                            {brl(item.amount)}
                          </span>
                          <button
                            type="button"
                            aria-label={`Corrigir ${item.description}`}
                            title="Corrigir lançamento ou categoria"
                            onClick={() => {
                              const suggested = detectExpenseCategory(
                                item.description
                              );
                              const nextCat =
                                suggested && suggested !== item.category
                                  ? suggested
                                  : item.category;
                              setEditingId(item.id);
                              setDesc(item.description);
                              setAmount(String(item.amount));
                              setDate(item.spentAt.slice(0, 10));
                              setCategory(nextCat);
                              setCategoryTouched(false);
                              setAutoDetectedCat(
                                suggested && suggested !== item.category
                                  ? suggested
                                  : null
                              );
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-primary/10 hover:text-primary cursor-pointer"
                          >
                            <EditOutlinedIcon sx={{ fontSize: 17 }} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Excluir ${item.description}`}
                            onClick={() => del(item.id)}
                            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                          >
                            <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </FramePanel>
                </Frame>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
};
