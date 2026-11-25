/**
 * "Suas aplicações" — diário do que a pessoa JÁ aplicou, no Radar Hormonal.
 *
 * Plano ReUI: superfície operacional · família Frame · um painel por composto do protocolo +
 * histórico recolhido. Controles como vêm (Button, Badge, Input, Alert).
 *
 * É um diário, não um conselheiro: mostra a última aplicação, a próxima PREVISTA pelo intervalo
 * que a própria pessoa cadastrou e, se ela pedir, cria um lembrete comum. Nunca diz "aplique
 * agora" nem liga o aviso ao nível estimado.
 *
 * Estados: carregando · falha ao buscar (com tentar de novo) · nenhum registro · com registros ·
 * registrando (botão ocupado, sem duplo envio) · JÁ REGISTRADO HOJE (botão some; 2ª dose só com
 * confirmação — trava de dose dupla) · atraso · apagar com confirmação em dois toques.
 *
 * Redesign 24/11 (feedback do dono): "Apliquei hoje" em verde parecia STATUS e não ação, não mudava
 * depois do toque e permitia dose dupla; 3 botões de 40px não cabiam em 316px; histórico ficava
 * escondido no fim. Agora: ação no infinitivo, confirmação visível, histórico aberto por composto.
 */
import { useState } from 'react';
import { useNotify } from 'react-admin';
import { BellPlus, CalendarDays, CircleCheck, Syringe, Trash2, TriangleAlert, X } from 'lucide-react';
import { API_URL, token } from '../../config';
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
import { Badge } from '@/components/reui/badge';
import { IconTile } from '@/components/reui/icon-tile';
import { Alert, AlertDescription, AlertTitle } from '@/components/reui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CompoundIcon } from '@/components/radar/compound-picker';
import { compoundById, doseStatus, getDoseMg, type RadarProtocolItem } from '@/utils/hormoneRadar';

export interface HormoneDose {
  id: string;
  compoundId: string;
  doseMg: number;
  takenAt: string;
}

const DAY_MS = 86_400_000;
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).split('.').join('').replace(' de ', ' ');
const n0 = (v: number) => Math.round(v).toLocaleString('pt-BR');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
/** Quantas aplicações aparecem abertas por composto antes do "ver todas". */
const HISTORY_OPEN = 4;

function ago(ms: number, now: number): string {
  const days = Math.floor((now - ms) / DAY_MS);
  if (days <= 0) return 'hoje';
  return days === 1 ? 'ontem' : `há ${days} dias`;
}

export function DoseLog({
  pid, protocol, doses, loading, failed, hasStartDate, onReload, onChange,
}: {
  pid: string | null | undefined;
  protocol: RadarProtocolItem[];
  doses: HormoneDose[];
  loading: boolean;
  failed: boolean;
  /** Sem a data de início o gráfico não sabe onde encaixar as aplicações. */
  hasStartDate: boolean;
  onReload: () => void;
  onChange: (next: HormoneDose[]) => void;
}) {
  const notify = useNotify();
  const [busy, setBusy] = useState<string | null>(null);
  const [otherDate, setOtherDate] = useState<{ compoundId: string; value: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  /** Composto em que a pessoa pediu para registrar OUTRA dose no mesmo dia (2º toque). */
  const [extraDose, setExtraDose] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const now = Date.now();

  // Um painel por composto (se o mesmo composto aparece duas vezes no protocolo, vale o primeiro).
  const items = protocol.filter((p, i) => protocol.findIndex((q) => q.compoundId === p.compoundId) === i);

  const register = async (item: RadarProtocolItem, dateIso?: string) => {
    if (busy) return;
    const comp = compoundById(item.compoundId);
    setBusy(item.compoundId);
    try {
      // Data escolhida: meio-dia local, para não cair no dia anterior por fuso.
      const takenAt = dateIso ? new Date(`${dateIso}T12:00:00`).toISOString() : new Date().toISOString();
      const r = await fetch(`${API_URL}/hormone-doses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ patientId: pid, compoundId: item.compoundId, doseMg: getDoseMg(item), takenAt }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const created = (await r.json()) as HormoneDose;
      onChange([created, ...doses].sort((a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime()));
      setOtherDate(null);
      setExtraDose(null);
      notify(`Aplicação de ${comp.short} registrada.`, { type: 'success' });
    } catch {
      notify('Não foi possível registrar. Tente de novo.', { type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const remind = async (item: RadarProtocolItem, nextMs: number) => {
    if (busy) return;
    const comp = compoundById(item.compoundId);
    setBusy(`r-${item.compoundId}`);
    try {
      const due = new Date(Math.max(nextMs, now + 60 * 60 * 1000));
      if (nextMs > now) due.setHours(8, 0, 0, 0);
      const r = await fetch(`${API_URL}/reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        // Repetição quando o intervalo do protocolo bate com uma recorrência que o servidor conhece:
        // sem isso o lembrete nascia avulso e ficava parado/vencido na agenda depois da 1ª data.
        // Intervalos sem equivalente (ex.: a cada 3,5 ou 14 dias) seguem avulsos = "só a próxima".
        body: JSON.stringify({ patientId: pid, title: `Aplicação: ${comp.short}`, dueDate: due.toISOString(), type: 'medicamento', recurrence: item.freqDays === 1 ? 'diario' : item.freqDays === 7 ? 'semanal' : item.freqDays === 30 ? 'mensal' : null, note: 'Data prevista pelo intervalo que você cadastrou no Radar Hormonal.' }),
      });
      if (!r.ok) throw new Error(String(r.status));
      notify(`Lembrete criado para ${dayLabel(due.getTime())}.`, { type: 'success' });
    } catch {
      notify('Não foi possível criar o lembrete. Tente de novo.', { type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (busy) return;
    setBusy(`d-${id}`);
    try {
      const r = await fetch(`${API_URL}/hormone-doses/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) throw new Error(String(r.status));
      onChange(doses.filter((d) => d.id !== id));
      notify('Registro apagado.', { type: 'info' });
    } catch {
      notify('Não foi possível apagar. Tente de novo.', { type: 'error' });
    } finally {
      setBusy(null);
      setConfirmDelete(null);
    }
  };

  return (
    <Frame>
      <FrameHeader className="flex-row items-center gap-3">
        <IconTile variant="frame" size="sm" aria-hidden="true"><Syringe aria-hidden="true" /></IconTile>
        <div className="flex min-w-0 flex-col gap-px">
          <FrameTitle role="heading" aria-level={2}>Suas aplicações</FrameTitle>
          <FrameDescription>Registre quando aplicar. O gráfico passa a usar as datas reais, não o calendário ideal.</FrameDescription>
        </div>
      </FrameHeader>

      {failed ? (
        <FramePanel>
          <Alert variant="warning">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Não consegui buscar seus registros agora</AlertTitle>
            <AlertDescription>
              <p className="m-0">O gráfico está usando o calendário do protocolo.</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={onReload}>Tentar de novo</Button>
            </AlertDescription>
          </Alert>
        </FramePanel>
      ) : null}

      {items.map((item) => {
        const comp = compoundById(item.compoundId);
        const mine = doses.filter((d) => d.compoundId === item.compoundId);
        const st = doseStatus(item.freqDays, mine.map((d) => new Date(d.takenAt).getTime()), now);
        const isBusy = busy === item.compoundId;
        const dueToday = st.next != null && st.lateDays === 0 && st.next - now < DAY_MS && st.next >= now - DAY_MS;
        const picking = otherDate?.compoundId === item.compoundId;
        const registeredToday = mine.find((d) => sameDay(new Date(d.takenAt).getTime(), now));
        return (
          <FramePanel key={item.compoundId} className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <CompoundIcon comp={comp} className="size-11 rounded-xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <strong className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{comp.name}</strong>
                {loading ? (
                  <span role="status" className="text-xs text-muted-foreground">Carregando seus registros…</span>
                ) : st.last == null ? (
                  <span className="text-xs text-muted-foreground">Nenhuma aplicação registrada ainda.</span>
                ) : (
                  // Datas ficam SÓ na lista abaixo (próxima prevista + aplicadas) — repetir aqui era ler duas vezes.
                  <span className="text-xs text-muted-foreground">{mine.length} {mine.length === 1 ? 'aplicação registrada' : 'aplicações registradas'} · última {ago(st.last, now)}</span>
                )}
              </div>
            </div>

            {!loading && registeredToday && extraDose !== item.compoundId ? (
              <Alert variant="success">
                <CircleCheck aria-hidden="true" />
                <AlertTitle>Registrado hoje às {hhmm(new Date(registeredToday.takenAt).getTime())} · {n0(registeredToday.doseMg)} mg</AlertTitle>
                <AlertDescription>
                  <button type="button" className="-mb-2 inline-flex min-h-11 cursor-pointer items-center border-0 bg-transparent p-0 text-xs text-muted-foreground underline underline-offset-2" onClick={() => setExtraDose(item.compoundId)}>
                    Apliquei outra dose hoje
                  </button>
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex flex-col gap-2">
                {registeredToday ? (
                  <p role="alert" className="m-0 text-xs font-medium text-foreground">Você já registrou {comp.short} hoje. Confirme só se aplicou mesmo uma segunda dose.</p>
                ) : null}
                <Button size="lg" className="h-11 w-full" disabled={isBusy || loading} onClick={() => void register(item)}>
                  <Syringe aria-hidden="true" />
                  {isBusy ? 'Registrando…' : registeredToday ? `Confirmar 2ª dose · ${n0(getDoseMg(item))} mg` : `Registrar aplicação de hoje · ${n0(getDoseMg(item))} mg`}
                </Button>
                {registeredToday ? (
                  <Button variant="ghost" size="lg" className="h-11 w-full" onClick={() => setExtraDose(null)}>Cancelar</Button>
                ) : null}
              </div>
            )}

            <div className={st.next != null ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2'}>
              <Button variant="outline" size="lg" className="h-11 min-w-0 px-2" aria-expanded={picking} disabled={loading} onClick={() => setOtherDate(picking ? null : { compoundId: item.compoundId, value: todayIso() })}>
                <CalendarDays aria-hidden="true" />
                <span className="truncate">Outra data</span>
              </Button>
              {st.next != null ? (
                <Button variant="outline" size="lg" className="h-11 min-w-0 px-2" aria-label="Lembrar da próxima aplicação" disabled={busy === `r-${item.compoundId}`} onClick={() => void remind(item, st.next as number)}>
                  <BellPlus aria-hidden="true" />
                  <span className="truncate">Lembrar</span>
                </Button>
              ) : null}
            </div>

            {picking ? (
              <form
                className="flex flex-wrap items-end gap-2 rounded-lg border border-border px-3 py-3"
                onSubmit={(e) => { e.preventDefault(); if (otherDate?.value) void register(item, otherDate.value); }}
              >
                <label className="flex min-w-0 flex-1 basis-44 flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Dia em que aplicou</span>
                  <Input type="date" name="takenAt" className="h-11" required max={todayIso()} value={otherDate?.value ?? ''} onChange={(e) => setOtherDate({ compoundId: item.compoundId, value: e.target.value })} />
                </label>
                <Button type="submit" size="lg" className="h-11" disabled={isBusy || !otherDate?.value}>Registrar</Button>
              </form>
            ) : null}

            {/* Histórico deste composto, ABERTO: ponto cheio = aplicou (registrado); vazio = previsão. */}
            {!loading && (mine.length > 0 || st.next != null) ? (
              <ul aria-label={`Aplicações de ${comp.short}`} className="m-0 flex list-none flex-col rounded-lg border border-border p-0">
                {st.next != null ? (
                  <li className="flex min-h-11 items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
                    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full border-2 bg-transparent" style={{ borderColor: comp.color }} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm text-foreground">{dayLabel(st.next)}</span>
                      <span className="text-xs text-muted-foreground">Próxima prevista</span>
                    </span>
                    {st.lateDays > 0 ? <Badge variant="warning-light">Passou {st.lateDays} {st.lateDays === 1 ? 'dia' : 'dias'}</Badge> : dueToday ? <Badge variant="info-light">É hoje</Badge> : null}
                  </li>
                ) : null}
                {(expanded.has(item.compoundId) ? mine.slice(0, 60) : mine.slice(0, HISTORY_OPEN)).map((d) => {
                  const asking = confirmDelete === d.id;
                  const when = new Date(d.takenAt).getTime();
                  return (
                    <li key={d.id} className="flex min-h-11 items-center gap-3 border-b border-border px-3 py-1.5 last:border-b-0">
                      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: comp.color }} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm text-foreground">{dayLabel(when)} · {ago(when, now)}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">Aplicou {n0(d.doseMg)} mg</span>
                      </span>
                      {asking ? (
                        <span className="flex shrink-0 items-center gap-1.5">
                          <Button variant="destructive" size="sm" disabled={busy === `d-${d.id}`} onClick={() => void remove(d.id)}>Apagar</Button>
                          <Button variant="ghost" size="icon-sm" className="bg-transparent" aria-label="Cancelar" onClick={() => setConfirmDelete(null)}><X aria-hidden="true" /></Button>
                        </span>
                      ) : (
                        <Button variant="ghost" size="icon-lg" className="size-11 shrink-0 bg-transparent text-muted-foreground" aria-label={`Apagar registro de ${comp.short} de ${dayLabel(when)}`} onClick={() => setConfirmDelete(d.id)}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      )}
                    </li>
                  );
                })}
                {mine.length > HISTORY_OPEN ? (
                  <li className="px-3">
                    <button
                      type="button"
                      className="min-h-11 w-full cursor-pointer border-0 bg-transparent text-sm font-medium text-primary"
                      onClick={() => setExpanded((prev) => { const n = new Set(prev); if (n.has(item.compoundId)) n.delete(item.compoundId); else n.add(item.compoundId); return n; })}
                    >
                      {expanded.has(item.compoundId) ? 'Mostrar menos' : `Ver todas (${mine.length})`}
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </FramePanel>
        );
      })}

      {!loading && !failed && doses.length > 0 && !hasStartDate ? (
        <FramePanel>
          <p className="m-0 text-xs text-muted-foreground">Informe "Quando começou?" no bloco acima para o gráfico encaixar estas aplicações nos dias certos.</p>
        </FramePanel>
      ) : null}

    </Frame>
  );
}
