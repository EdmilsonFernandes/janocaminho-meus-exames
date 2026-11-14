// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';

// O módulo captura o window.fetch no momento do import; por isso o "fetch real" é trocado antes.
const real = vi.fn();
let offlineEmptyBody: typeof import('./fetch-cache').offlineEmptyBody;

beforeAll(async () => {
  // O projeto testa em Node (sem jsdom): o mínimo de navegador que o módulo usa é montado aqui.
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = globalThis;
  g.localStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  window.fetch = real as unknown as typeof window.fetch;
  ({ offlineEmptyBody } = await import('./fetch-cache'));
});

describe('cache offline: resposta vazia', () => {
  it('serve tanto a quem espera lista quanto a quem espera objeto', () => {
    const body = offlineEmptyBody();
    expect(Array.isArray(body)).toBe(true);
    expect(body.filter(Boolean)).toEqual([]);
    expect(body.map((x) => x)).toEqual([]);
    expect(body.items).toEqual([]);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('sem rede e sem cache: GET da API devolve o vazio que não quebra em .filter', async () => {
    real.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const res = await window.fetch('https://exemplo.test/api/qualquer-lista-sem-cache');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => body.filter((x: unknown) => x)).not.toThrow();
    expect(body.items).toEqual([]);
    // quem clona a resposta antes de ler recebe o mesmo formato
    real.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const again = await window.fetch('https://exemplo.test/api/outra-lista-sem-cache');
    expect(Array.isArray(await again.clone().json())).toBe(true);
  });

  it('requisição cancelada pelo app não vira "vazio": o erro propaga', async () => {
    real.mockRejectedValueOnce(Object.assign(new Error('cancelada'), { name: 'AbortError' }));
    await expect(window.fetch('https://exemplo.test/api/lista-cancelada')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('POST que falha continua propagando o erro', async () => {
    real.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(window.fetch('https://exemplo.test/api/coisa', { method: 'POST' })).rejects.toThrow('Failed to fetch');
  });
});
