// @vitest-environment node
/**
 * Fila única dos modais automáticos — lógica pura (sem DOM): 1 por sessão, só na Home,
 * prioridade saúde > comemoração > cadastro, e quem perde a vez é avisado (onDeny).
 */
import { describe, expect, it } from 'vitest';
import { createAutoModalQueue, isHomeHash, type AutoModalDeps } from './autoModalQueue';

/** Dependências falsas: rota, vaga compartilhada e relógio controlados pelo teste. */
const mk = (over: Partial<{ home: boolean; storageTaken: boolean }> = {}) => {
  const env = { home: over.home ?? true, storageWinner: over.storageTaken ? 'whatsnew' : (null as string | null) };
  const timers: { fn: () => void; cleared: boolean }[] = [];
  const deps: AutoModalDeps = {
    isHome: () => env.home,
    isFree: () => env.storageWinner === null,
    claim: (id) => { if (env.storageWinner !== null) return false; env.storageWinner = id; return true; },
    setTimer: (fn) => { const t = { fn, cleared: false }; timers.push(t); return t; },
    clearTimer: (h) => { (h as { cleared: boolean }).cleared = true; },
    decideTimeoutMs: 10_000,
  };
  const fireTimers = () => { for (const t of timers.splice(0)) if (!t.cleared) t.fn(); };
  return { q: createAutoModalQueue(deps), env, fireTimers };
};

/** Registra um pedido e devolve o que aconteceu com ele. */
const ask = (q: ReturnType<typeof mk>['q'], id: string, kind: 'health' | 'celebration' | 'signup') => {
  const r = { granted: 0, denied: 0 };
  q.request(id, kind, () => { r.granted += 1; }, () => { r.denied += 1; });
  return r;
};

describe('fila de modais automáticos', () => {
  it('abre o primeiro pedido quando está na Home e a vaga está livre', () => {
    const { q, env } = mk();
    const quiz = ask(q, 'quiz', 'signup');
    expect(quiz).toEqual({ granted: 1, denied: 0 });
    expect(q.winner()).toBe('quiz');
    expect(env.storageWinner).toBe('quiz'); // reforço no armazenamento compartilhado
  });

  it('no máximo UM por sessão: o segundo pedido é negado, mesmo sendo mais importante', () => {
    const { q } = mk();
    ask(q, 'quiz', 'signup');
    const alert = ask(q, 'notif', 'health');
    expect(alert).toEqual({ granted: 0, denied: 1 }); // quem chama mostra a faixa na Home
    expect(q.winner()).toBe('quiz');
    expect(q.canOpen()).toBe(false);
  });

  it('nunca abre fora da Home — e não gasta a vaga da sessão', () => {
    const { q, env } = mk({ home: false });
    const quiz = ask(q, 'quiz', 'signup');
    expect(quiz).toEqual({ granted: 0, denied: 1 });
    expect(q.winner()).toBeNull();
    expect(env.storageWinner).toBeNull();
    // Voltou pra Home: um pedido NOVO ainda pode abrir.
    env.home = true;
    expect(ask(q, 'profile', 'signup').granted).toBe(1);
  });

  it('respeita a vaga já usada por quem não passa pela fila (WhatsNew/MOTD/patrocinador)', () => {
    const { q } = mk({ storageTaken: true });
    expect(q.canOpen()).toBe(false);
    expect(ask(q, 'notif', 'health')).toEqual({ granted: 0, denied: 1 });
  });

  it('cadastro espera o alerta de saúde decidir; se o alerta quer abrir, ele ganha', () => {
    const { q } = mk();
    q.announce('notif', 'health');
    const profile = ask(q, 'profile', 'signup');
    expect(profile).toEqual({ granted: 0, denied: 0 }); // segurado
    const alert = ask(q, 'notif', 'health');
    expect(alert.granted).toBe(1);
    expect(profile).toEqual({ granted: 0, denied: 1 });
    expect(q.winner()).toBe('notif');
  });

  it('se o alerta desiste (nada a mostrar), o próximo da fila abre', () => {
    const { q } = mk();
    q.announce('notif', 'health');
    const profile = ask(q, 'profile', 'signup');
    q.withdraw('notif');
    expect(profile).toEqual({ granted: 1, denied: 0 });
  });

  it('prioridade completa: saúde > comemoração > cadastro', () => {
    const { q } = mk();
    q.announce('notif', 'health');
    q.announce('first-exam', 'celebration');
    const quiz = ask(q, 'quiz', 'signup');
    const party = ask(q, 'first-exam', 'celebration');
    expect(quiz.granted + party.granted).toBe(0); // os dois esperam o alerta
    q.withdraw('notif');
    expect(party).toEqual({ granted: 1, denied: 0 });
    expect(quiz).toEqual({ granted: 0, denied: 1 });
  });

  it('candidato de prioridade MENOR ainda decidindo não segura ninguém', () => {
    const { q } = mk();
    q.announce('quiz', 'signup');
    expect(ask(q, 'notif', 'health').granted).toBe(1);
  });

  it('mesma prioridade: quem pediu primeiro leva', () => {
    const { q } = mk();
    q.announce('notif', 'health');
    const profile = ask(q, 'profile', 'signup');
    const quiz = ask(q, 'quiz', 'signup');
    q.withdraw('notif');
    expect(profile.granted).toBe(1);
    expect(quiz.denied).toBe(1);
  });

  it('rede travada: quem fica "decidindo" além do teto libera a fila', () => {
    const { q, fireTimers } = mk();
    q.announce('notif', 'health');
    const quiz = ask(q, 'quiz', 'signup');
    expect(quiz.granted).toBe(0);
    fireTimers();
    expect(quiz.granted).toBe(1);
    // O alerta que chega atrasado perde a vaga (vira faixa na Home).
    expect(ask(q, 'notif', 'health')).toEqual({ granted: 0, denied: 1 });
  });

  it('quem estava segurado e saiu da Home enquanto esperava é negado', () => {
    const { q, env } = mk();
    q.announce('notif', 'health');
    const quiz = ask(q, 'quiz', 'signup');
    env.home = false;
    q.withdraw('notif');
    expect(quiz).toEqual({ granted: 0, denied: 1 });
    expect(q.winner()).toBeNull();
  });

  it('withdraw de quem pediu (componente desmontou) não chama callback nenhum', () => {
    const { q } = mk();
    q.announce('notif', 'health');
    const quiz = ask(q, 'quiz', 'signup');
    q.withdraw('quiz');
    q.withdraw('notif');
    expect(quiz).toEqual({ granted: 0, denied: 0 });
    expect(q.winner()).toBeNull();
  });
});

describe('isHomeHash — rota Home do HashRouter', () => {
  it('reconhece a Home com e sem query', () => {
    expect(isHomeHash('')).toBe(true);
    expect(isHomeHash('#/')).toBe(true);
    expect(isHomeHash('#/?demo=1')).toBe(true);
  });
  it('qualquer outra tela não é Home', () => {
    expect(isHomeHash('#/radar-hormonal')).toBe(false);
    expect(isHomeHash('#/lembretes?aba=hoje')).toBe(false);
    expect(isHomeHash('#/exams/create')).toBe(false);
  });
});
