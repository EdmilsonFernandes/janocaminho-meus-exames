import { describe, it, expect } from 'vitest';
import {
  translateMeddra, faersSearchTerm, faersCacheKey, buildFaersUrl, parseFaersEvents,
  FAERS_TTL_MS, FAERS_NOT_FOUND_TTL_MS,
} from './faers';

// Unit PURO — nenhuma rede, nenhum banco (spec feature D).

describe('translateMeddra (PT-BR)', () => {
  it('traduz termos mapeados', () => {
    expect(translateMeddra('Nausea')).toBe('Náusea');
    expect(translateMeddra('Dyspnoea')).toBe('Falta de ar');
    expect(translateMeddra('Oedema peripheral')).toBe('Inchaço nas pernas');
    expect(translateMeddra('Blood glucose increased')).toBe('Glicose alta');
  });

  it('termo sem tradução devolve o ORIGINAL (nunca inventa)', () => {
    expect(translateMeddra('Erythema multiforme')).toBe('Erythema multiforme');
  });

  it('os ~35 termos da spec estão cobertos', () => {
    const terms = ['Nausea', 'Headache', 'Dizziness', 'Fatigue', 'Vomiting', 'Diarrhoea', 'Rash',
      'Pruritus', 'Abdominal pain upper', 'Dyspnoea', 'Somnolence', 'Insomnia', 'Weight decreased',
      'Asthenia', 'Pyrexia', 'Arthralgia', 'Myalgia', 'Back pain', 'Pain', 'Chest pain',
      'Palpitations', 'Hypertension', 'Hypotension', 'Syncope', 'Alopecia', 'Cough', 'Constipation',
      'Dyspepsia', 'Oedema peripheral', 'Paraesthesia', 'Tremor', 'Anxiety', 'Depression',
      'Decreased appetite', 'Blood glucose increased'];
    for (const t of terms) {
      const pt = translateMeddra(t);
      expect(pt, t).toBeTruthy();
      // 'Tremor' é idêntico em PT e EN — tradução válida, só não "diferente"
      if (t !== 'Tremor') expect(pt, t).not.toBe(t);
    }
  });
});

describe('faersSearchTerm (normalização BR→INN)', () => {
  it('princípio ativo BR vira INN inglês (FAERS é em EN)', () => {
    expect(faersSearchTerm('LOSARTANA POTASSICA', null)).toBe('LOSARTAN POTASSIUM');
    expect(faersSearchTerm('METFORMINA', null)).toBe('METFORMIN');
    expect(faersSearchTerm('VARFARINA SODICA', null)).toBe('WARFARIN SODIUM');
  });

  it('descarta dose e forma da embalagem', () => {
    expect(faersSearchTerm('LOSARTANA POTASSICA 50 MG CP', null)).toBe('LOSARTAN POTASSIUM');
    expect(faersSearchTerm('SERTRALINA 50MG', null)).toBe('SERTRALINE');
  });

  it('sem activeIngredient usa o nome (marca fica como está)', () => {
    expect(faersSearchTerm(null, 'Mounjaro')).toBe('MOUNJARO');
    expect(faersSearchTerm(null, 'Levotiroxina 75 mcg')).toBe('LEVOTHIROXINE');
  });

  it('normaliza acento/caixa (normalizeKey)', () => {
    expect(faersSearchTerm('Losartana Potássica', null)).toBe('LOSARTAN POTASSIUM');
  });

  it('nome só com dose/unidade → null (rota responde 404 amigável)', () => {
    expect(faersSearchTerm('75 MG', null)).toBeNull();
    expect(faersSearchTerm(null, null)).toBeNull();
  });

  it('princípio ativo TEM prioridade sobre o nome comercial', () => {
    expect(faersSearchTerm('LOSARTANA POTASSICA', 'Lortaan')).toBe('LOSARTAN POTASSIUM');
  });
});

describe('faersCacheKey', () => {
  it('chave normalizada e estável (prefixo v3 = invalidação do cache de números globais)', () => {
    expect(faersCacheKey('Losartan Potassium')).toBe('v3-LOSARTAN POTASSIUM');
    expect(faersCacheKey('losartan  potassium')).toBe('v3-LOSARTAN POTASSIUM');
  });
});

describe('buildFaersUrl', () => {
  it('monta a query SÓ com medicinalproduct (o `+drugcharacterization` literal dissolvia o filtro — contagens globais)', () => {
    const url = buildFaersUrl('LOSARTAN POTASSIUM');
    expect(url).toContain('https://api.fda.gov/drug/event.json?search=');
    expect(url).toContain('count=patient.reaction.reactionmeddrapt.exact');
    expect(url).toContain('limit=10');
    // o filtro que quebrava NÃO pode estar mais na URL
    expect(url).not.toContain('drugcharacterization');
    expect(url).not.toContain('%2B');
  });

  it('nome com espaço vai como + (forma canônica do openFDA)', () => {
    expect(buildFaersUrl('LOSARTAN POTASSIUM')).toContain('LOSARTAN+POTASSIUM');
  });
});

describe('parseFaersEvents', () => {
  it('parseia results e traduz termPt', () => {
    const json = {
      meta: { results: { limit: 10 } },
      results: [
        { term: 'Nausea', count: 1234 },
        { term: 'Dizziness', count: 900 },
        { term: 'Erythema multiforme', count: 3 },
      ],
    };
    const out = parseFaersEvents(json);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ term: 'Nausea', termPt: 'Náusea', count: 1234 });
    expect(out[2].termPt).toBe('Erythema multiforme'); // sem tradução → original
  });

  it('limita em 10 eventos', () => {
    const results = Array.from({ length: 25 }, (_, i) => ({ term: `T${i}`, count: i }));
    expect(parseFaersEvents({ results })).toHaveLength(10);
  });

  it('descarta entradas malformadas (term/count errados)', () => {
    const out = parseFaersEvents({ results: [{ term: 'Nausea', count: 'x' }, { count: 5 }, null, { term: 'Pain', count: 1 }] });
    expect(out).toEqual([{ term: 'Pain', termPt: 'Dor', count: 1 }]);
  });

  it('resposta sem results / JSON inválido → []', () => {
    expect(parseFaersEvents({})).toEqual([]);
    expect(parseFaersEvents(null)).toEqual([]);
    expect(parseFaersEvents({ results: null })).toEqual([]);
  });
});

describe('TTLs da spec', () => {
  it('sucesso 7 dias; não-encontrado 1h', () => {
    expect(FAERS_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(FAERS_NOT_FOUND_TTL_MS).toBe(60 * 60 * 1000);
  });
});

describe('buildFaersUrl — modos de campo (cascata p/ nome comercial)', () => {
  it('padrão casa medicinalproduct', () => {
    expect(buildFaersUrl('TIRZEPATIDE')).toContain('patient.drug.medicinalproduct');
  });
  it('mode brand casa openfda.brand_name (Mounjaro/Ozempic)', () => {
    expect(buildFaersUrl('MOUNJARO', 'brand')).toContain('patient.drug.openfda.brand_name');
  });
  it('mode generic casa openfda.generic_name', () => {
    expect(buildFaersUrl('TIRZEPATIDE', 'generic')).toContain('patient.drug.openfda.generic_name');
  });
});

describe('translateMeddra — ampliação PT (GLP-1/admin que vazavam EN)', () => {
  it('termos de tirzepatida/semaglutida traduzem', () => {
    expect(translateMeddra('ERUCTATION')).toBe('Arroto (eructação)');
    expect(translateMeddra('GASTROOESOPHAGEAL REFLUX DISEASE')).toBe('Refluxo gastroesofágico');
    expect(translateMeddra('PANCREATITIS')).toBe('Pancreatite');
    expect(translateMeddra('DECREASED APPETITE')).toBe('Perda de apetite');
  });
  it('administrativos e graves traduzem (nada de EN no painel)', () => {
    expect(translateMeddra('PRODUCT USE ISSUE')).toBe('Problema no uso do produto');
    expect(translateMeddra('OVERDOSE')).toBe('Superdose');
    expect(translateMeddra('HYPERSSENSITIVITY' in {} ? '' : 'HYPERSENSITIVITY')).toBe('Hipersensibilidade (alergia)');
    expect(translateMeddra('SUDDEN DEATH')).toBe('Morte súbita');
  });
});
