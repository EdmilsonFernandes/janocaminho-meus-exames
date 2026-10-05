// @vitest-environment node
/**
 * useNudgeQueue — testes do MOTOR (createNudgeQueue) com fake timers: ordem por
 * prioridade, UM por vez (close → gap 400ms → próximo), descarte com fila cheia e
 * dedupe por id. Sem DOM/RTL (mesma convenção dos testes do web: node puro).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createNudgeQueue, NUDGE_GAP_MS, NUDGE_MAX_QUEUE } from './useNudgeQueue';

/** openFn que registra a ordem e só "fecha" quando o teste resolve. */
function makeOpen(log: string[], name: string) {
  let resolveClose!: () => void;
  const promise = new Promise<void>((r) => { resolveClose = r; });
  const open = vi.fn(() => { log.push(`open:${name}`); return promise; });
  return { open, close: () => resolveClose() };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('createNudgeQueue — ordem e serialização', () => {
  it('executa UM por vez: o segundo só abre depois do close do primeiro + gap 400ms', async () => {
    const q = createNudgeQueue();
    const log: string[] = [];
    const a = makeOpen(log, 'a');
    const b = makeOpen(log, 'b');
    expect(q.enqueue('a', 10, a.open)).toBe('queued');
    expect(q.enqueue('b', 20, b.open)).toBe('queued');

    await vi.advanceTimersByTimeAsync(0); // microtask: primeiro abre JÁ (sem gap inicial)
    expect(log).toEqual(['open:a']);
    expect(q.size()).toBe(1); // b pendente enquanto a está na tela

    a.close();
    await vi.advanceTimersByTimeAsync(NUDGE_GAP_MS - 1); // gap ainda não passou
    expect(log).toEqual(['open:a']);
    await vi.advanceTimersByTimeAsync(1);
    expect(log).toEqual(['open:a', 'open:b']);

    b.close();
    await vi.advanceTimersByTimeAsync(NUDGE_GAP_MS);
    expect(log).toEqual(['open:a', 'open:b']); // fila vazia: ninguém mais abre
  });

  it('prioridade MAIOR primeiro (avaliada na hora de abrir, não na entrada)', async () => {
    const q = createNudgeQueue();
    const log: string[] = [];
    const low = makeOpen(log, 'low');
    const high = makeOpen(log, 'high');
    const mid = makeOpen(log, 'mid');
    q.enqueue('low', 10, low.open);
    q.enqueue('high', 50, high.open);
    q.enqueue('mid', 20, mid.open);

    await vi.advanceTimersByTimeAsync(0);
    low.close(); // primeiro da fila serializa; os dois restantes disputam por prioridade
    await vi.advanceTimersByTimeAsync(NUDGE_GAP_MS);
    expect(log).toEqual(['open:low', 'open:high']); // 50 furou o 20

    high.close();
    await vi.advanceTimersByTimeAsync(NUDGE_GAP_MS);
    expect(log).toEqual(['open:low', 'open:high', 'open:mid']);
  });

  it('empate de prioridade → ordem de chegada (FIFO estável)', async () => {
    const q = createNudgeQueue();
    const log: string[] = [];
    const first = makeOpen(log, 'first');
    const second = makeOpen(log, 'second');
    q.enqueue('first', 10, first.open);
    q.enqueue('second', 10, second.open);
    await vi.advanceTimersByTimeAsync(0);
    first.close();
    await vi.advanceTimersByTimeAsync(NUDGE_GAP_MS);
    expect(log).toEqual(['open:first', 'open:second']);
  });

  it('abre o primeiro sem esperar o gap (gap é ENTRE atos, não antes do primeiro)', async () => {
    const q = createNudgeQueue();
    const log: string[] = [];
    q.enqueue('solo', 1, makeOpen(log, 'solo').open);
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toEqual(['open:solo']);
  });
});

describe('createNudgeQueue — descarte e dedupe', () => {
  it('fila cheia (3 pendentes) → descarta o novo e LOGA', async () => {
    const q = createNudgeQueue();
    const log: string[] = [];
    const active = makeOpen(log, 'active');
    q.enqueue('active', 100, active.open);
    await vi.advanceTimersByTimeAsync(0);
    // 3 pendentes = teto
    const p = makeOpen(log, 'p1');
    const p2 = makeOpen(log, 'p2');
    const p3 = makeOpen(log, 'p3');
    expect(q.enqueue('p1', 1, p.open)).toBe('queued');
    expect(q.enqueue('p2', 1, p2.open)).toBe('queued');
    expect(q.enqueue('p3', 1, p3.open)).toBe('queued');
    expect(q.size()).toBe(NUDGE_MAX_QUEUE);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const extra = makeOpen(log, 'extra');
    expect(q.enqueue('extra', 99, extra.open)).toBe('discarded'); // mesmo com prioridade alta
    expect(extra.open).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('extra');
    warn.mockRestore();
  });

  it('id duplicado (pendente ou ativo) → não reenfileira', async () => {
    const q = createNudgeQueue();
    const log: string[] = [];
    const a1 = makeOpen(log, 'a');
    const active = makeOpen(log, 'x');
    q.enqueue('x', 100, active.open);
    await vi.advanceTimersByTimeAsync(0);
    q.enqueue('a', 1, a1.open);
    expect(q.enqueue('a', 5, makeOpen(log, 'a-copy').open)).toBe('duplicate'); // pendente
    expect(q.enqueue('x', 5, makeOpen(log, 'x-copy').open)).toBe('duplicate'); // ativo
    expect(q.size()).toBe(1);
  });

  it('openFn sincrono (sem promise) também serializa', async () => {
    const q = createNudgeQueue();
    const log: string[] = [];
    q.enqueue('sync', 1, () => { log.push('open:sync'); }); // resolve imediato = close já
    q.enqueue('next', 1, makeOpen(log, 'next').open);
    await vi.advanceTimersByTimeAsync(NUDGE_GAP_MS);
    expect(log).toEqual(['open:sync', 'open:next']);
  });
});
