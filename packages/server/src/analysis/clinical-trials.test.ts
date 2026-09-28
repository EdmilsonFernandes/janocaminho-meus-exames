import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  deriveTrialConditions, parseStudiesResponse, coerceCachedStudies, fetchTrials, trialsUrl,
} from './clinical-trials';

// FEATURE E — testes PUROS (sem DB/LLM/rede real): derivador de condições (perfil +
// remédios + marcadores), parser da resposta da API v2 e fetch mockado (timeout/HTTP).

afterEach(() => vi.unstubAllGlobals());

// ── deriveTrialConditions ───────────────────────────────────────────────────────
describe('deriveTrialConditions', () => {
  it('casa condições do perfil clínico (texto livre, acento stripado)', () => {
    const r = deriveTrialConditions({ clinicalProfile: 'Hipertensão e diabetes tipo 2. Sem tireoide; usa levotiroxina (Levoid).' });
    const keys = r.map((c) => c.conditionPt);
    expect(keys).toContain('Hipertensão arterial');
    expect(keys).toContain('Diabetes');
    expect(keys).toContain('Hipotireoidismo'); // "sem tireoide" explícito
    expect(r).toHaveLength(3); // cap de 3
  });

  it('deriva de remédio de uso contínuo via princípio ativo OU nome', () => {
    const r = deriveTrialConditions({ medications: [{ name: 'Losartana potássica' }] });
    expect(r.map((c) => c.condition)).toEqual(['hypertension']);
    const r2 = deriveTrialConditions({ medications: [{ name: 'Xarope', activeIngredient: 'METFORMINA CLORIDRATO', active: true }] });
    expect(r2.map((c) => c.condition)).toEqual(['diabetes']);
  });

  it('ignora remédio inativo', () => {
    const r = deriveTrialConditions({ medications: [{ name: 'Metformina', active: false }] });
    expect(r).toHaveLength(0);
  });

  it('marcador alterado em ≥2 exames distintos vira condição', () => {
    const r = deriveTrialConditions({
      abnormalItems: [
        { nameCanonical: 'HEMOGLOBINA', flag: 'LOW', examId: 'e1' },
        { nameCanonical: 'HEMOGLOBINA', flag: 'LOW', examId: 'e2' },
      ],
    });
    expect(r.map((c) => c.condition)).toEqual(['anemia']);
  });

  it('marcador alterado 1× só NÃO vira condição (não inventa)', () => {
    const r = deriveTrialConditions({ abnormalItems: [{ nameCanonical: 'TSH', flag: 'HIGH', examId: 'e1' }] });
    expect(r).toHaveLength(0);
  });

  it('glicemia alta em 2 exames + HbA1c alta em 1 = diabetes (regra única, exames somam)', () => {
    const r = deriveTrialConditions({
      abnormalItems: [
        { nameCanonical: 'GLICEMIA', flag: 'HIGH', examId: 'e1' },
        { nameCanonical: 'HEMOGLOBINA_GLICADA', flag: 'HIGH', examId: 'e2' },
      ],
    });
    expect(r.map((c) => c.condition)).toEqual(['diabetes']);
  });

  it('TSH alto 2× → hipotireoidismo; TSH baixo 2× → hipertireoidismo', () => {
    const hi = deriveTrialConditions({ abnormalItems: [
      { nameCanonical: 'TSH', flag: 'HIGH', examId: 'e1' }, { nameCanonical: 'TSH', flag: 'HIGH', examId: 'e2' }] });
    expect(hi.map((c) => c.condition)).toEqual(['hypothyroidism']);
    const lo = deriveTrialConditions({ abnormalItems: [
      { nameCanonical: 'TSH', flag: 'LOW', examId: 'e1' }, { nameCanonical: 'TSH', flag: 'LOW', examId: 'e2' }] });
    expect(lo.map((c) => c.condition)).toEqual(['hyperthyroidism']);
  });

  it('sem sinal nenhum → [] (card não renderiza)', () => {
    expect(deriveTrialConditions({})).toEqual([]);
    expect(deriveTrialConditions({ clinicalProfile: 'Nenhuma condição conhecida.', medications: [{ name: 'Dipirona' }] })).toEqual([]);
  });

  it('não casa substring por engano (word-boundary): "hashimoto" contém "has" mas NÃO é hipertensão', () => {
    const r = deriveTrialConditions({ clinicalProfile: 'Tireoidite de Hashimoto.' });
    expect(r.map((c) => c.conditionPt)).toEqual(['Hipotireoidismo']);
  });

  it('prioridade: perfil > remédios > marcadores; dedup e cap 3', () => {
    const r = deriveTrialConditions({
      clinicalProfile: 'Asma e depressão.',
      medications: [{ name: 'Metformina' }], // diabetes via remédio (3º) — entra ANTES da anemia (marcador)
      abnormalItems: [
        { nameCanonical: 'HEMOGLOBINA', flag: 'LOW', examId: 'a' },
        { nameCanonical: 'HEMOGLOBINA', flag: 'LOW', examId: 'b' },
        { nameCanonical: 'TSH', flag: 'HIGH', examId: 'a' },
        { nameCanonical: 'TSH', flag: 'HIGH', examId: 'b' },
      ],
    });
    expect(r.map((c) => c.conditionPt)).toEqual(['Asma', 'Depressão', 'Diabetes']);
  });
});

// ── parseStudiesResponse (fixture = forma real da API v2 observada 28/09/26) ────
describe('parseStudiesResponse', () => {
  const fixture = {
    studies: [
      {
        protocolSection: {
          identificationModule: { nctId: 'NCT07321886', briefTitle: 'Study of X in Type 2 Diabetes' },
          contactsLocationsModule: { locations: [
            { city: 'Tuscaloosa', state: 'Alabama', country: 'United States' },
            { city: 'São Paulo', state: 'São Paulo', country: 'Brazil' },
            { city: 'Rio de Janeiro', state: 'Rio de Janeiro', country: 'Brazil' },
          ] },
        },
      },
      {
        protocolSection: {
          identificationModule: { nctId: 'NCT01234567', briefTitle: 'Another Trial' },
          contactsLocationsModule: { locations: [{ city: 'Berlin', country: 'Germany' }] },
        },
      },
      { protocolSection: { identificationModule: { nctId: '', briefTitle: 'sem id' } } },
    ],
  };

  it('extrai nctId/title e o PRIMEIRO site brasileiro (city/state pareados por local)', () => {
    const r = parseStudiesResponse(fixture);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({
      nctId: 'NCT07321886',
      title: 'Study of X in Type 2 Diabetes',
      city: 'São Paulo',
      state: 'São Paulo',
      url: 'https://clinicaltrials.gov/study/NCT07321886',
    });
    expect(r[1].city).toBeUndefined(); // só site fora do BR → sem local
  });

  it('sem array studies → [] (resposta inesperada não explode)', () => {
    expect(parseStudiesResponse({})).toEqual([]);
    expect(parseStudiesResponse(null)).toEqual([]);
    expect(parseStudiesResponse({ studies: 'nope' })).toEqual([]);
  });
});

// ── coerceCachedStudies (cache Json → TrialStudy[]) ─────────────────────────────
describe('coerceCachedStudies', () => {
  it('aceita array válido e reconstrói url faltante', () => {
    const r = coerceCachedStudies([{ nctId: 'NCT1', title: 'T', city: 'Curitiba', state: 'PR' }]);
    expect(r?.[0]).toMatchObject({ nctId: 'NCT1', city: 'Curitiba', state: 'PR', url: 'https://clinicaltrials.gov/study/NCT1' });
  });
  it('rejeita forma inválida → null (refetch)', () => {
    expect(coerceCachedStudies({ nope: true })).toBeNull();
    expect(coerceCachedStudies('x')).toBeNull();
  });
});

// ── trialsUrl / fetchTrials (mock fetch) ────────────────────────────────────────
describe('trialsUrl / fetchTrials', () => {
  it('URL usa país EN "Brazil" (BRASIL devolve vazio na API v2) + filtros da spec', () => {
    const url = trialsUrl('diabetes');
    expect(url).toContain('query.cond=diabetes');
    expect(url).toContain('filter.overallStatus=RECRUITING');
    expect(url).toContain(encodeURIComponent('AREA[LocationCountry]Brazil'));
    expect(url).toContain('pageSize=5');
  });

  it('fetch ok → parse da resposta; passa Accept json', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ studies: [
      { protocolSection: { identificationModule: { nctId: 'NCT9', briefTitle: 'B' } } },
    ] }) });
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchTrials('anemia');
    expect(r[0].nctId).toBe('NCT9');
    expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('application/json');
  });

  it('HTTP de erro lança (rota decide degradar)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchTrials('asthma')).rejects.toThrow('HTTP 503');
  });

  it('timeout aborta (AbortController)', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: string, init: { signal: AbortSignal }) => new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => rej(new Error('aborted')));
    })));
    await expect(fetchTrials('obesity', 20)).rejects.toThrow('aborted');
  });
});
