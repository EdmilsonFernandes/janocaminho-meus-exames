// @vitest-environment node
/**
 * useSportsProfile POR PACIENTE — regressão do bug 27/10/26: o GET lia sempre o titular e o
 * cache era um só por usuário, então a lente esportiva do titular aparecia no painel de
 * qualquer dependente (inclusive de uma criança de 4 anos). Contrato:
 *  1. a URL leva ?patientId= do paciente pedido (sem pid = titular, compat);
 *  2. cada paciente tem o seu cache e os seus assinantes — nada cruza entre eles;
 *  3. falha de rede no dependente NUNCA devolve o perfil (ativo) do titular.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../config', () => ({ API_URL: '/api', token: () => 't' }));

type Mod = typeof import('./useSportsProfile');
let mod: Mod;
let fetchMock: ReturnType<typeof vi.fn>;

const TITULAR_ATIVO = { id: 's1', patientId: 'tit', active: true, modality: 'Musculação' };

beforeEach(async () => {
  (globalThis as any).window = { addEventListener: vi.fn() };
  fetchMock = vi.fn();
  (globalThis as any).fetch = fetchMock;
  mod = await import('./useSportsProfile');
  mod.invalidateSportsProfile();
});

const ok = (profile: unknown) => ({ ok: true, json: async () => ({ profile, enabled: 1 }) });

describe('sportsProfileUrl', () => {
  it('leva ?patientId= codificado; sem pid é a rota do titular', () => {
    expect(mod.sportsProfileUrl('dep 1')).toBe('/api/sports/profile?patientId=dep%201');
    expect(mod.sportsProfileUrl(null)).toBe('/api/sports/profile');
    expect(mod.sportsProfileUrl('')).toBe('/api/sports/profile');
  });
});

describe('useSportsProfile — perfil do paciente selecionado', () => {
  it('busca o dependente pela URL dele e só notifica quem assina o dependente', async () => {
    const titular: unknown[] = [];
    const dependente: unknown[] = [];
    const offT = mod.subscribeForTests((s) => titular.push(s), 'tit');
    const offD = mod.subscribeForTests((s) => dependente.push(s), 'dep');

    fetchMock.mockResolvedValueOnce(ok(null));
    await mod.handleSportsProfileChanged('dep');

    expect(fetchMock).toHaveBeenCalledWith('/api/sports/profile?patientId=dep', expect.anything());
    expect(titular).toHaveLength(0);
    expect((dependente[0] as { profile: unknown }).profile).toBeNull();
    offT(); offD();
  });

  it('falha de rede no dependente NÃO devolve a lente ativa do titular', async () => {
    fetchMock.mockResolvedValueOnce(ok(TITULAR_ATIVO));
    await mod.handleSportsProfileChanged('tit'); // titular com lente ATIVA em cache

    const dependente: unknown[] = [];
    const off = mod.subscribeForTests((s) => dependente.push(s), 'dep');
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await mod.handleSportsProfileChanged('dep');

    const last = dependente[dependente.length - 1] as { profile: typeof TITULAR_ATIVO | null };
    expect(last.profile).toBeNull(); // antes: cache único → devolvia o perfil do titular
    off();
  });

  it('menor de idade (eligible=false do servidor) nunca liga a lente, mesmo com row legado ativo', async () => {
    const seen: unknown[] = [];
    const off = mod.subscribeForTests((s) => seen.push(s), 'kid');
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ profile: { ...TITULAR_ATIVO, patientId: 'kid' }, enabled: 1, eligible: false }) });
    await mod.handleSportsProfileChanged('kid');
    const s = seen[seen.length - 1] as Parameters<typeof mod.lensActive>[0];
    expect(s.eligible).toBe(false);
    expect(mod.lensActive(s)).toBe(false);
    off();
  });

  it('servidor antigo (sem eligible) → trata como elegível; desconhecido não bloqueia', () => {
    expect(mod.lensActive({ profile: TITULAR_ATIVO, enabled: true, eligible: true })).toBe(true);
    expect(mod.lensActive({ profile: TITULAR_ATIVO, enabled: true, eligible: null })).toBe(true);
    expect(mod.lensActive({ profile: { ...TITULAR_ATIVO, active: false }, enabled: true, eligible: true })).toBe(false);
  });

  it('o cache do titular continua dele (falha depois mantém o último estado DELE)', async () => {
    fetchMock.mockResolvedValueOnce(ok(TITULAR_ATIVO));
    await mod.handleSportsProfileChanged('tit');
    const seen: unknown[] = [];
    const off = mod.subscribeForTests((s) => seen.push(s), 'tit');
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await mod.handleSportsProfileChanged('tit');
    expect((seen[seen.length - 1] as { profile: { active: boolean } }).profile.active).toBe(true);
    off();
  });
});
