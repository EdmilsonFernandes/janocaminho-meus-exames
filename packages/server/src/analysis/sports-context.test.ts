import { describe, it, expect } from 'vitest';
import { SPORTS_ADDENDUM } from './system';
import { sportsKnowledgeContext, matchSportsKnowledge } from './sports-knowledge';
import { sportsContextBlocks } from './sports-context';

// E3.2 (Saúde Esportiva) — addendum de system/context prompt + knowledge por analito.
// Testes PUROS (sem DB/LLM). O gate duplo (flag + SportsProfile) é exercitado via
// sportsContextBlocks(enabled=false) — o caminho com flag ON + perfil requer DB (E2E à parte).

describe('SPORTS_ADDENDUM — bloco declarativo', () => {
  it('retorna null sem perfil e sem substâncias (prompt fica byte-idêntico)', () => {
    expect(SPORTS_ADDENDUM(null, null, [])).toBeNull();
    // patient é reservado (assinatura estável) — não influencia o output.
    expect(SPORTS_ADDENDUM({ fullName: 'X' }, {}, [])).toBeNull();
    expect(SPORTS_ADDENDUM(null, { modality: '', trainingFreq: '', goals: '', collectionContext: null }, ['  '])).toBeNull();
  });

  it('monta CONTEXTO/SUBSTÂNCIAS/COLETA a partir do declarado (não verificado)', () => {
    const out = SPORTS_ADDENDUM(null,
      { modality: 'musculação', trainingFreq: '5x/semana', goals: 'hipertrofia', collectionContext: { treinoUltimas24h: 'sim', jejum: '12h' } },
      ['[Hormônio] Testosterona (enantato)', '[Suplemento] Creatina']);
    expect(out).toMatch(/CONTEXTO ESPORTIVO DECLARADO PELO PACIENTE \(não verificado\)/);
    expect(out).toMatch(/modalidade: musculação/);
    expect(out).toMatch(/treino: 5x\/semana/);
    expect(out).toMatch(/objetivo: hipertrofia/);
    expect(out).toMatch(/SUBSTÂNCIAS DECLARADAS \(nomes apenas, jamais dose\/ciclo\)/);
    expect(out).toMatch(/\[Hormônio\] Testosterona \(enantato\); \[Suplemento\] Creatina/);
    expect(out).toMatch(/CONTEXTO DE COLETA DECLARADO \(não verificado\)/);
    expect(out).toMatch(/treinoUltimas24h: sim/);
  });

  it('carrega as 5 regras reforçadas (contextualiza-nunca-normaliza, dose/ciclo/TPC, faixa AAS, prescrito, perguntas)', () => {
    const out = SPORTS_ADDENDUM(null, { modality: 'corrida' }, []);
    expect(out).toMatch(/NUNCA torna um resultado normal ou seguro/);
    expect(out).toMatch(/NUNCA sugerir dose, ciclo, duração, TPC/);
    expect(out).toMatch(/NUNCA citar faixa segura de esteroides anabolizantes/);
    expect(out).toMatch(/USO PRESCRITO e monitorado/);
    expect(out).toMatch(/SEMPRE termine com perguntas prontas/);
  });

  it('contexto de coleta em formato string e array também formatam (e truncam)', () => {
    expect(SPORTS_ADDENDUM(null, { collectionContext: 'coleta 14h, jejum' }, [])).toMatch(/coleta 14h, jejum/);
    expect(SPORTS_ADDENDUM(null, { collectionContext: ['treino <24h', 'jejum 12h'] }, [])).toMatch(/treino <24h; jejum 12h/);
    const long = SPORTS_ADDENDUM(null, { collectionContext: 'x'.repeat(400) }, []);
    expect((long?.match(/x{217}\.\.\./) ?? [])[0]).toBeTruthy(); // trunca em ~220 chars
  });
});

describe('sportsKnowledgeContext — loader knowledge/sports por analito', () => {
  it('gate DESLIGADO não injeta nada (nem lê o diretório)', () => {
    const r = sportsKnowledgeContext(['SHBG', 'TESTOSTERONA_TOTAL'], false);
    expect(r.block).toBeNull();
    expect(r.topics).toEqual([]);
  });

  it('casa cards pelos canonicals dos exames (T→TRT, Hct→hematócrito, SHBG, LH/FSH...)', () => {
    const topics = sportsKnowledgeContext(['TESTOSTERONA_TOTAL', 'HEMATOCRITO', 'SHBG', 'LH', 'HDL', 'TGO', 'CISTATINA_C', 'ESTRADIOL'], true).topics;
    expect(topics).toEqual(expect.arrayContaining([
      'testosterone-trt', 'hematocrito-trt', 'shbg', 'lh-fsh', 'hdl-androgenos', 'alt-ast-ck-exercicio', 'cistatina-c', 'estradiol-androgenos',
    ]));
  });

  it('NÃO casa wholesale: analitos sem card esportivo não puxam nada', () => {
    expect(matchSportsKnowledge(['GLICEMIA', 'TSH', 'VITAMINA_D'])).toHaveLength(0);
  });

  it('bloco traz as regras duras (prescrito, sem faixa AAS, sem dose/ciclo) e cita [FONTE ANO]', () => {
    const block = sportsKnowledgeContext(['TESTOSTERONA_TOTAL'], true).block!;
    expect(block).toMatch(/CONHECIMENTO DE CONTEXTO ESPORTIVO/);
    expect(block).toMatch(/USO PRESCRITO/);
    expect(block).toMatch(/NÃO existe faixa segura de esteroides anabolizantes/);
    expect(block).toMatch(/NUNCA sugira dose, ciclo, TPC/);
    expect(block).toMatch(/\[SBEM 2026\]/);
    expect(block).toMatch(/450–600 ng\/dL/);
  });
});

describe('sportsContextBlocks — não-regressão do prompt (E3.2 AC)', () => {
  it('flag OFF → tudo vazio ANTES de qualquer query: concatenação = prompt atual', async () => {
    const sports = await sportsContextBlocks('pid-qualquer', ['SHBG'], false);
    expect(sports).toEqual({ addendum: '', knowledge: '', topics: [] });
    // Mesma expressão do chat.routes/health-summary: '' concatena → byte-idêntico.
    const base = 'CONTEXTO DO PACIENTE...';
    const guidelines = null;
    let full = guidelines ? `${base}\n${guidelines}` : base;
    if (sports.knowledge) full += sports.knowledge;
    const withSports = base + sports.addendum + sports.knowledge;
    expect(full).toBe(base);
    expect(withSports).toBe(base);
  });
});
