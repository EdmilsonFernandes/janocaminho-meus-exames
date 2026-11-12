import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircularProgress } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ScienceIcon from '@mui/icons-material/Science';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import { API_URL } from '../../../config';
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
  AlertDescription,
} from '@/components/reui/alert';
import {
  FieldLabelWithHint,
  IconTile,
} from '@/components/reui/patterns';
import { ReuiInput } from '@/components/reui/form-controls';

const DUE_OPTIONS = [30, 60, 90, 180] as const;

/** Sugestões de analito (qualquer texto é aceito; o match automático usa canonicalName no server). */
const ANALYTE_SUGGESTIONS = [
  'Hemograma completo',
  'Glicemia de jejum',
  'Hemoglobina glicada (HbA1c)',
  'Colesterol total',
  'LDL colesterol',
  'HDL colesterol',
  'Triglicerídeos',
  'Creatinina',
  'Ureia',
  'TGO (AST)',
  'TGP (ALT)',
  'PCR ultrassensível',
  'Ferritina',
  'Vitamina D',
  'Vitamina B12',
  'TSH',
  'T4 livre',
  'PSA',
];

type ChecklistItem = {
  id: string;
  analyteName: string;
  instruction: string | null;
  dueAt: string;
  status: string; // pending | collected | expired
  collectedAt: string | null;
};

const daysLeft = (dueAt: string): number =>
  Math.ceil((new Date(dueAt).getTime() - Date.now()) / 86400_000);

export const CollectionChecklistPanel = ({
  patientId,
  token,
}: {
  patientId: string;
  token: string;
}) => {
  const themeClass = useReuiThemeSync();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [dueDays, setDueDays] = useState<number>(30);
  const [instruction, setInstruction] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(
        `${API_URL}/doctor/patients/${patientId}/checklist`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!r.ok) throw new Error();
      const d = await r.json();
      setItems(d.items ?? []);
    } catch {
      setErr('Não foi possível carregar o plano de coleta.');
    } finally {
      setLoaded(true);
    }
  }, [patientId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const name = input.trim();
    if (name.length < 2) {
      setErr('Informe o exame a coletar.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const r = await fetch(
        `${API_URL}/doctor/patients/${patientId}/checklist`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            analyteName: name,
            dueInDays: dueDays,
            instruction: instruction.trim() || undefined,
          }),
        }
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao adicionar.');
      setInput('');
      setInstruction('');
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`${API_URL}/doctor/patients/${patientId}/checklist/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => void load());
  };

  const pending = useMemo(
    () => items.filter((i) => i.status === 'pending'),
    [items]
  );
  const history = useMemo(
    () => items.filter((i) => i.status !== 'pending'),
    [items]
  );

  return (
    <div className={`reui-scope ${themeClass}`}>
      <Frame>
        <FrameHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <IconTile tone="primary" size="sm">
              <ScienceIcon sx={{ fontSize: 18 }} />
            </IconTile>
            <div>
              <FrameTitle className="flex items-center gap-2">
                Plano de coleta laboratorial
                {pending.length > 0 && (
                  <ReuiBadge variant="primary-light" size="xs">
                    {pending.length} pendente{pending.length > 1 ? 's' : ''}
                  </ReuiBadge>
                )}
              </FrameTitle>
              <FrameDescription>
                Exames que o paciente deve coletar — o app lembra com push e marca ✓ quando o resultado chega
              </FrameDescription>
            </div>
          </div>
        </FrameHeader>

        {/* Formulário de prescrição de coleta */}
        <FramePanel className="space-y-3.5">
          <div>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Sugestões rápidas de exames
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ANALYTE_SUGGESTIONS.slice(0, 12).map((sug) => {
                const active = input === sug;
                return (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => setInput(sug)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-muted/40 text-foreground hover:border-primary/40 hover:bg-primary/5'
                    }`}
                  >
                    {sug}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <FieldLabelWithHint label="Exame a coletar" required>
                <ReuiInput
                  list={`analyte-datalist-${patientId}`}
                  placeholder="Ex.: Hemoglobina glicada"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <datalist id={`analyte-datalist-${patientId}`}>
                  {ANALYTE_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </FieldLabelWithHint>
            </div>

            <div className="sm:col-span-4">
              <FieldLabelWithHint label="Prazo sugerido">
                <div className="grid grid-cols-4 gap-1 rounded-lg border border-border bg-muted/30 p-1">
                  {DUE_OPTIONS.map((d) => {
                    const active = dueDays === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDueDays(d)}
                        className={`rounded-md py-1 text-xs font-extrabold tabular-nums transition cursor-pointer ${
                          active
                            ? 'bg-primary text-primary-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {d}d
                      </button>
                    );
                  })}
                </div>
              </FieldLabelWithHint>
            </div>

            <div className="sm:col-span-3">
              <FieldLabelWithHint label="Instrução" hint="Opcional">
                <ReuiInput
                  placeholder="Ex.: jejum 12h"
                  maxLength={140}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                />
              </FieldLabelWithHint>
            </div>
          </div>

          {err && (
            <Alert variant="destructive">
              <AlertDescription>{err}</AlertDescription>
            </Alert>
          )}
        </FramePanel>

        <FrameFooter className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            O paciente será notificado no celular com o prazo de {dueDays} dias.
          </span>
          <button
            type="button"
            onClick={add}
            disabled={saving || input.trim().length < 2}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <CircularProgress size={13} color="inherit" />
            ) : (
              <AddRoundedIcon sx={{ fontSize: 16 }} />
            )}
            {saving ? 'Adicionando…' : 'Adicionar ao plano'}
          </button>
        </FrameFooter>

        {/* Lista de pendentes e histórico */}
        <FramePanel className="space-y-2.5">
          {!loaded ? (
            <div className="flex justify-center py-4">
              <CircularProgress size={20} />
            </div>
          ) : (
            <>
              {pending.length === 0 ? (
                <div className="py-2 text-center text-xs font-medium text-muted-foreground">
                  Nenhum exame pendente de coleta no momento.
                </div>
              ) : (
                <div className="space-y-2">
                  {pending.map((i) => {
                    const left = daysLeft(i.dueAt);
                    const isLate = left < 0;
                    return (
                      <div
                        key={i.id}
                        className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                          isLate
                            ? 'border-destructive/35 bg-destructive/[0.03]'
                            : 'border-border bg-muted/20'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <IconTile
                            tone={isLate ? 'destructive' : 'warning'}
                            size="sm"
                          >
                            <ScheduleRoundedIcon sx={{ fontSize: 16 }} />
                          </IconTile>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-foreground">
                              {i.analyteName}
                            </div>
                            <div
                              className={`text-xs tabular-nums ${
                                isLate
                                  ? 'font-semibold text-destructive'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              Prazo:{' '}
                              {left < 0
                                ? `venceu há ${-left} d`
                                : left === 0
                                ? 'vence hoje'
                                : `em ${left} d`}
                              {i.instruction ? ` · ${i.instruction}` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <ReuiBadge
                            variant={isLate ? 'destructive' : 'warning-light'}
                            size="xs"
                          >
                            {isLate ? 'Atrasado' : 'Pendente'}
                          </ReuiBadge>
                          <button
                            type="button"
                            aria-label={`Remover ${i.analyteName} do plano`}
                            onClick={() => void remove(i.id)}
                            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                          >
                            <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {history.length > 0 && (
                <div className="pt-2">
                  <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Histórico de coletas concluídas / expiradas
                  </div>
                  <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                    {history.slice(0, 8).map((i) => {
                      const isCollected = i.status === 'collected';
                      return (
                        <div
                          key={i.id}
                          className="flex items-center justify-between gap-2 bg-card px-3 py-2 text-xs"
                        >
                          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                            {isCollected && (
                              <CheckCircleOutlineRoundedIcon
                                sx={{ fontSize: 15 }}
                                className="text-emerald-600 dark:text-emerald-400"
                              />
                            )}
                            {i.analyteName}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground tabular-nums">
                              {isCollected && i.collectedAt
                                ? new Date(i.collectedAt).toLocaleDateString(
                                    'pt-BR'
                                  )
                                : new Date(i.dueAt).toLocaleDateString('pt-BR')}
                            </span>
                            <ReuiBadge
                              variant={
                                isCollected ? 'success-light' : 'outline'
                              }
                              size="xs"
                            >
                              {isCollected ? 'Coletado ✓' : 'Expirado'}
                            </ReuiBadge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </FramePanel>
      </Frame>
    </div>
  );
};
