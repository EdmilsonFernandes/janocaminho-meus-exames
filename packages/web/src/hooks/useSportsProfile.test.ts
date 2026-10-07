// @vitest-environment node
/**
 * useSportsProfile — regressão do júri E4+ ("lente stale"): o evento
 * 'sports-profile-changed' é disparado no PERFIL (wizard/toggle) com o dashboard
 * DESMONTADO, então o listener tem que viver no ESCOPO DO MÓDULO — nunca preso ao
 * mount do hook. Contrato testado aqui (sem DOM/RTL, padrão useNudgeQueue.test):
 *  1. listeners registrados no escopo do módulo;
 *  2. evento com NENHUM hook montado → refetch + NOTIFICA quem montou (o dashboard
 *     re-renderiza com a lente nova, SEM reload);
 *  3. troca de paciente limpa o cache;
 *  4. fetch falha → mantém o último estado válido (nunca regrede a null sozinho).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../config', () => ({ API_URL: '/api', token: () => 't' }));

type Mod = typeof import('./useSportsProfile');
let mod: Mod;
let addEventListener: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

const PROFILE_A = { id: 's1', patientId: 'p1', active: false, modality: 'Corrida' };
const PROFILE_B = { id: 's1', patientId: 'p1', active: true, modality: 'Musculação' };

beforeEach(async () => {
  // window fake ANTES do 1º import — o registro do listener roda no load do módulo.
  addEventListener = vi.fn();
  (globalThis as any).window = { addEventListener };
  fetchMock = vi.fn();
  (globalThis as any).fetch = fetchMock;
  mod = await import('./useSportsProfile');
  mod.invalidateSportsProfile(); // cache limpo entre testes
});

describe('useSportsProfile — listener no escopo do módulo (lente stale)', () => {
  it('registra os listeners no LOAD do módulo (não no mount do hook)', () => {
    const registered = addEventListener.mock.calls.map((c: unknown[]) => c[0]);
    expect(registered).toContain('sports-profile-changed');
    expect(registered).toContain('selPatientChanged');
  });

  it('evento com dashboard DESMONTADO → refetch atualiza o cache e notifica quem montou depois', async () => {
    // 1ª busca: perfil A (lente corrida) — "dashboard montado" pinta A e vai pro Perfil.
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ profile: PROFILE_A, enabled: 1 }) });
    await mod.handleSportsProfileChanged();

    // Dashboard MONTADO de novo (assinante = setState do hook) — usuário foi ao Perfil
    // trocar a lente no wizard, que faz PUT + dispatch SEM hook vivo no dashboard.
    const seen: unknown[] = [];
    const unsubscribe = mod.subscribeForTests?.((s) => seen.push(s));
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ profile: PROFILE_B, enabled: 1 }) });
    await mod.handleSportsProfileChanged(); // ← o listener do módulo chama isto

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(seen.length).toBeGreaterThan(0);
    const last = seen[seen.length - 1] as { profile: typeof PROFILE_B | null };
    expect(last.profile?.modality).toBe('Musculação'); // lente nova SEM reload
    unsubscribe?.();
  });

  it('selPatientChanged limpa o cache (perfil é por usuário)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ profile: PROFILE_A, enabled: 1 }) });
    await mod.handleSportsProfileChanged();
    mod.handleSelPatientChanged();
    // próximo fetch refaz do zero (cache morto → nova chamada de rede)
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ profile: null, enabled: 1 }) });
    await mod.handleSportsProfileChanged();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetch falha → mantém o último estado válido (não regrede a null sozinho)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ profile: PROFILE_A, enabled: 1 }) });
    await mod.handleSportsProfileChanged();
    const seen: unknown[] = [];
    const unsubscribe = mod.subscribeForTests?.((s) => seen.push(s));
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await mod.handleSportsProfileChanged();
    const last = seen[seen.length - 1] as { profile: typeof PROFILE_A | null };
    expect(last.profile?.modality).toBe('Corrida'); // estado anterior preservado
    unsubscribe?.();
  });
});
