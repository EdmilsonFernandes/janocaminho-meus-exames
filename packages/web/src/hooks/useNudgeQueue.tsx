// @vitest-environment node
import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';

/** FILA DE NUDGES (05/10, anti-bombardeio de modais) — MOTD, WhatsNew, checklist e
 *  companhia podem disputar a tela no mount do dashboard (dois Dialogs abertos = os
 *  dois perdem). O provedor executa UM por vez: open → aguarda o close (promise) →
 *  delay 400ms → próximo. Prioridade MAIOR primeiro (empate = ordem de chegada);
 *  fila cheia (3+ pendentes) descarta e LOGA — nudge bom é nudge raro.
 *
 *  Contrato do openFn: abre o modal e devolve uma promise que RESOLVE quando ele
 *  fecha (quem enfileira guarda o resolve e chama no próprio dismiss). */

export const NUDGE_GAP_MS = 400;
export const NUDGE_MAX_QUEUE = 3;

export type NudgeEnqueueResult = 'queued' | 'duplicate' | 'discarded';

export interface NudgeQueue {
  enqueue(id: string, priority: number, open: () => Promise<void> | void): NudgeEnqueueResult;
  /** Nº de nudges pendentes (sem contar o ativo) — telemetria/teste. */
  size(): number;
}

/** Motor puro (sem React) — testável com fake timers; o hook abaixo só embrulha. */
export function createNudgeQueue(gapMs: number = NUDGE_GAP_MS, maxQueue: number = NUDGE_MAX_QUEUE): NudgeQueue {
  type Item = { id: string; priority: number; open: () => Promise<void>; seq: number };
  const queue: Item[] = [];
  let active: Item | null = null;
  let seq = 0;

  const drain = () => {
    if (active || queue.length === 0) return;
    // Prioridade decide NA HORA de abrir (não na entrada): quem chega depois com
    // prioridade maior pode furar a fila — mas nunca o modal que já está na tela.
    queue.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
    active = queue.shift()!;
    Promise.resolve()
      .then(() => active!.open())
      .then(closeCurrent, closeCurrent);
  };
  const closeCurrent = () => {
    active = null;
    if (queue.length > 0) setTimeout(drain, gapMs); // respiro entre atos
  };

  return {
    enqueue(id, priority, open) {
      if (active?.id === id) return 'duplicate';
      if (queue.some((i) => i.id === id)) return 'duplicate';
      if (queue.length >= maxQueue) {
        // Nudge bom é nudge raro: com a fila cheia, o NOVO perde (o antigo já
        // prometeu). Loga — silêncio aqui escondia o bombardeio que a fila evita.
        console.warn(`[nudge-queue] "${id}" descartado — fila cheia (${queue.length} pendentes)`);
        return 'discarded';
      }
      queue.push({ id, priority, open: async () => { await open(); }, seq: seq++ });
      drain();
      return 'queued';
    },
    size() { return queue.length; },
  };
}

// ───────────────────────── React (provider + hook) ─────────────────────────

const NudgeQueueContext = createContext<NudgeQueue | null>(null);

/** Fallback fora do provider ( teste/SSR/rota esquecida): fila compartilhada do módulo
 *  — degrada com dignidade: serializa igual, só sem poder reiniciar por árvore. */
const moduleQueue = createNudgeQueue();

export function NudgeQueueProvider({ children }: { children: ReactNode }) {
  const ref = useRef<NudgeQueue | null>(null);
  if (!ref.current) ref.current = createNudgeQueue();
  const enqueue = useCallback((id: string, priority: number, open: () => Promise<void> | void) => ref.current!.enqueue(id, priority, open), []);
  const value = useMemo(() => ({ enqueue, size: () => ref.current!.size() }), [enqueue]);
  return <NudgeQueueContext.Provider value={value}>{children}</NudgeQueueContext.Provider>;
}

/** Enfileira um nudge: `enqueue('motd', 80, () => new Promise(res => { abrir(); guardar res; }))`.
 *  Sem provider na árvore → usa a fila do módulo (nunca quebra o modal hospede). */
export function useNudgeQueue(): NudgeQueue {
  return useContext(NudgeQueueContext) ?? moduleQueue;
}
