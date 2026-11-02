import { useEffect, useState } from 'react';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
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
      setDesc('');
      setAmount('');
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
      await load();
    } catch {
      /* ignore */
    }
  };

  const total = items.reduce((s, i) => s + i.amount, 0);

  // Totais por categoria para resumo rápido de IR
  const byCategory = CATEGORIES.map((cat) => ({
    category: cat,
    total: items
      .filter((i) => i.category === cat)
      .reduce((s, i) => s + i.amount, 0),
    count: items.filter((i) => i.category === cat).length,
  })).filter((c) => c.count > 0);

  // Histórico AGRUPADO POR MÊS (desc)
  const months = (() => {
    const map = new Map<string, Expense[]>();
    for (const i of [...items].sort((a, b) =>
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
      <div className={`reui-scope ${themeClass} space-y-4`}>
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

        {/* RESUMO — ReUI Frame com total acumulado + divisão por categoria */}
        <Frame>
          <FrameHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <FrameTitle>Resumo financeiro em saúde</FrameTitle>
              <FrameDescription>
                {items.length} lançamento{items.length === 1 ? '' : 's'} registrado
                {items.length === 1 ? '' : 's'} · mantenha os comprovantes fiscais para dedução no IRPF
              </FrameDescription>
            </div>
            <ReuiBadge variant="primary-light" size="sm">
              IRPF Saúde
            </ReuiBadge>
          </FrameHeader>

          <FramePanel className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3.5">
              <IconTile tone="primary" size="lg">
                <WalletReceiptIcon size={24} />
              </IconTile>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Total acumulado
                </div>
                <div className="font-heading text-2xl font-extrabold tracking-tight text-primary tabular-nums sm:text-3xl">
                  {brl(total)}
                </div>
              </div>
            </div>

            {byCategory.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {byCategory.map((c) => (
                  <ReuiBadge
                    key={c.category}
                    variant={CATEGORY_BADGE[c.category] ?? 'outline'}
                    size="sm"
                    className="tabular-nums"
                  >
                    {c.category}: <strong>{brl(c.total)}</strong>
                  </ReuiBadge>
                ))}
              </div>
            )}
          </FramePanel>
        </Frame>

        {/* FORMULÁRIO — ReUI InputGroup (R$) + ReUI Select (corrige bug de <option> nativo) */}
        <Frame>
          <FrameHeader>
            <FrameTitle>Registrar nova despesa</FrameTitle>
            <FrameDescription>
              Informe o estabelecimento ou descrição, valor, data e categoria fiscal
            </FrameDescription>
          </FrameHeader>

          <FramePanel>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <FieldLabelWithHint label="Descrição" required>
                  <ReuiInput
                    placeholder="Consulta, exame laboratorial, farmácia..."
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
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
                <FieldLabelWithHint label="Categoria">
                  <Select
                    value={category}
                    onValueChange={(val) => {
                      if (val) setCategory(val);
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

          <FrameFooter className="flex items-center justify-end">
            <button
              type="button"
              disabled={saving || !desc.trim() || !amount}
              onClick={add}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              <AddRoundedIcon sx={{ fontSize: 16 }} />
              {saving ? 'Salvando…' : 'Salvar despesa'}
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
                        className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/30"
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

                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm font-extrabold text-foreground tabular-nums">
                            {brl(item.amount)}
                          </span>
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
