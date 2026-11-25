/**
 * FILA ÚNICA DOS MODAIS AUTOMÁTICOS (25/11/26).
 *
 * Problema: na conferência a 390px apareceram três modais sozinhos na mesma sessão
 * (objetivo por cima do Radar, comemoração na Home, altura/peso na Agenda). Quem fecha
 * três modais aprende a fechar sem ler — inclusive o alerta de saúde.
 *
 * Regras (todo modal que abre SEM o usuário pedir passa por aqui):
 *  1. no máximo UM por sessão do app (variável de módulo + sessionStorage `coldDialogWinner`,
 *     a mesma chave do claimColdDialog — WhatsNew/MOTD/patrocinador continuam enxergando a vaga);
 *  2. nunca fora da Home (rota `/`): quem entrou direto em outra tela veio fazer outra coisa;
 *  3. prioridade: alerta de saúde > comemoração > cadastro (objetivo, perfil, tour, biometria);
 *  4. quem perde a vez NÃO grava nada: tenta de novo em outra sessão, pela regra de "já visto"
 *     que cada modal já tinha.
 * Abertura pedida pelo usuário (tocar num card) NÃO passa pela fila.
 *
 * Como a prioridade funciona com decisões assíncronas: cada candidato se ANUNCIA assim que
 * monta (`announce` = "ainda estou descobrindo se quero abrir") e depois PEDE (`request`) ou
 * DESISTE (`withdraw`). Um pedido só é atendido quando nenhum candidato de prioridade MAIOR
 * ainda está decidindo — assim o perfil (rápido) não passa na frente do alerta (que espera rede).
 */
import { claimColdDialog, isColdDialogFree } from './coldDialog';

export type AutoModalKind = 'health' | 'celebration' | 'signup';

export const AUTO_MODAL_PRIORITY: Record<AutoModalKind, number> = {
  health: 3,
  celebration: 2,
  signup: 1,
};

export interface AutoModalDeps {
  /** A pessoa está na Home agora? */
  isHome: () => boolean;
  /** A vaga da sessão ainda está livre no armazenamento compartilhado? */
  isFree: () => boolean;
  /** Reserva a vaga no armazenamento compartilhado; false = outro levou antes. */
  claim: (id: string) => boolean;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** Teto para um candidato ficar "decidindo" (rede travada não segura a fila pra sempre). */
  decideTimeoutMs: number;
}

interface Entry {
  kind: AutoModalKind;
  state: 'deciding' | 'wanting';
  onGrant?: () => void;
  onDeny?: () => void;
  timer?: unknown;
}

export interface AutoModalQueue {
  /** "Posso querer abrir — espere eu decidir." Segura candidatos de prioridade menor. */
  announce: (id: string, kind: AutoModalKind) => void;
  /** "Quero abrir agora." `onGrant` = pode abrir; `onDeny` = perdeu a vez nesta sessão. */
  request: (id: string, kind: AutoModalKind, onGrant: () => void, onDeny?: () => void) => void;
  /** "Não quero mais" (nada a mostrar, erro de rede, componente desmontou). Sem callbacks. */
  withdraw: (id: string) => void;
  /** Espia: ainda dá pra algum modal automático abrir agora? (vaga livre + Home) */
  canOpen: () => boolean;
  /** Quem levou a vaga nesta sessão (null = ninguém por esta fila). */
  winner: () => string | null;
}

export function createAutoModalQueue(deps: AutoModalDeps): AutoModalQueue {
  let winner: string | null = null;
  const entries = new Map<string, Entry>();

  const taken = () => winner !== null || !deps.isFree();

  const drop = (id: string): Entry | undefined => {
    const e = entries.get(id);
    if (!e) return undefined;
    if (e.timer !== undefined) deps.clearTimer(e.timer);
    entries.delete(id);
    return e;
  };

  /** Nega todos os pedidos pendentes (menos `exceptId`) — callbacks só depois de limpar o estado. */
  const denyWanting = (exceptId?: string) => {
    const denied: Entry[] = [];
    for (const [id, e] of Array.from(entries)) {
      if (e.state !== 'wanting' || id === exceptId) continue;
      entries.delete(id);
      denied.push(e);
    }
    for (const e of denied) e.onDeny?.();
  };

  const evaluate = () => {
    let topId: string | null = null;
    let top: Entry | null = null;
    for (const [id, e] of entries) {
      if (e.state !== 'wanting') continue;
      // Empate de prioridade: quem pediu primeiro (ordem de inserção do Map).
      if (!top || AUTO_MODAL_PRIORITY[e.kind] > AUTO_MODAL_PRIORITY[top.kind]) { top = e; topId = id; }
    }
    if (!top || topId === null) return;
    if (taken() || !deps.isHome()) { denyWanting(); return; }
    const topPriority = AUTO_MODAL_PRIORITY[top.kind];
    for (const e of entries.values()) {
      if (e.state === 'deciding' && AUTO_MODAL_PRIORITY[e.kind] > topPriority) return; // espera o mais importante decidir
    }
    if (!deps.claim(topId)) { denyWanting(); return; }
    winner = topId;
    entries.delete(topId);
    denyWanting();
    top.onGrant?.();
  };

  const withdraw = (id: string) => {
    if (drop(id)) evaluate();
  };

  return {
    announce: (id, kind) => {
      drop(id);
      const entry: Entry = { kind, state: 'deciding' };
      entry.timer = deps.setTimer(() => {
        const cur = entries.get(id);
        if (cur === entry && cur.state === 'deciding') withdraw(id);
      }, deps.decideTimeoutMs);
      entries.set(id, entry);
    },
    request: (id, kind, onGrant, onDeny) => {
      drop(id); // reinsere: a ordem do Map vira a ordem dos PEDIDOS
      entries.set(id, { kind, state: 'wanting', onGrant, onDeny });
      evaluate();
    },
    withdraw,
    canOpen: () => !taken() && deps.isHome(),
    winner: () => winner,
  };
}

/** Home = rota `/` do HashRouter (hash vazio, `#/` ou `#/?demo=1`). */
export function isHomeHash(hash: string): boolean {
  const path = hash.replace(/^#/, '').split('?')[0];
  return path === '' || path === '/';
}

export function isHomeRoute(): boolean {
  try { return isHomeHash(window.location.hash); } catch { return false; }
}

/** Fila do app (uma por processo). */
export const autoModalQueue: AutoModalQueue = createAutoModalQueue({
  isHome: isHomeRoute,
  isFree: isColdDialogFree,
  claim: claimColdDialog,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  decideTimeoutMs: 10_000,
});
