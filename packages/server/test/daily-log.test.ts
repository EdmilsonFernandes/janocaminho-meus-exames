// E2E do Diário de Saúde (estudo Guava 21/11 — gaps #1 e #2).
// Cobre: upsert por dia, merge de sintomas, catálogo (key inválida rejeitada),
// streak, isolamento entre pacientes e o gate do insights (precisa ≥4 dias).
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { createUser, api, authHeader } from './helpers';

describe('Diário de Saúde (daily-logs)', () => {
  beforeEach(async () => {
    const { resetDb } = await import('./helpers');
    await resetDb();
  });

  it('cria o registro do dia e faz UPSERT no mesmo dia (merge de sintomas)', async () => {
    const u = await createUser();
    const r1 = await api().post('/api/daily-logs').set(authHeader(u.token)).send({ mood: 3, symptoms: ['DOR_CABECA'] });
    expect(r1.status).toBe(201);
    expect(r1.body.mood).toBe(3);

    // mesmo dia → 200 (update), sintomas somam (união), mood atualiza
    const r2 = await api().post('/api/daily-logs').set(authHeader(u.token)).send({ mood: 4, symptoms: ['CANSAICO'] });
    expect(r2.status).toBe(200);
    expect(new Set(r2.body.symptoms)).toEqual(new Set(['DOR_CABECA', 'CANSAICO']));
    expect(r2.body.mood).toBe(4);

    // replaceSymptoms limpa
    const r3 = await api().post('/api/daily-logs').set(authHeader(u.token)).send({ symptoms: ['FEBRE'], replaceSymptoms: true });
    expect(r3.body.symptoms).toEqual(['FEBRE']);
    expect(r3.body.mood).toBe(4); // não apagou o mood
  });

  it('rejeita sintoma fora do catálogo e nota longa', async () => {
    const u = await createUser();
    const r = await api().post('/api/daily-logs').set(authHeader(u.token)).send({ symptoms: ['SINTOMA_INVENTADO'], mood: 5 });
    expect(r.status).toBe(201);
    expect(r.body.symptoms).toEqual([]); // inválido é filtrado, não gravado
    expect(r.body.mood).toBe(5);

    const long = await api().post('/api/daily-logs').set(authHeader(u.token)).send({ note: 'x'.repeat(600) });
    expect(long.body.note.length).toBeLessThanOrEqual(500);
  });

  it('streak conta dias consecutivos (ontem conta; gap zera)', async () => {
    const u = await createUser();
    const mk = (offsetDays: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
      .format(new Date(Date.now() - offsetDays * 86400000));
    for (const off of [2, 1, 0]) { // hoje, ontem, anteontem
      await api().post('/api/daily-logs').set(authHeader(u.token)).send({ date: mk(off), mood: 3 });
    }
    const s1 = await api().get('/api/daily-logs/streak').set(authHeader(u.token));
    expect(s1.body.streak).toBe(3);

    // um buraco em [1] quebra a corrente de hoje? não: hoje+ontem... aqui já coberto.
    // gap: sem ontem (só hoje e anteontem) → streak = 1
    const u2 = await createUser();
    await api().post('/api/daily-logs').set(authHeader(u2.token)).send({ date: mk(0), mood: 3 });
    await api().post('/api/daily-logs').set(authHeader(u2.token)).send({ date: mk(2), mood: 3 });
    const s2 = await api().get('/api/daily-logs/streak').set(authHeader(u2.token));
    expect(s2.body.streak).toBe(1);
  });

  it('paciente B NÃO lê nem escreve diário de A (isolamento via patientId)', async () => {
    const a = await createUser();
    const b = await createUser();
    await api().post('/api/daily-logs').set(authHeader(a.token)).send({ mood: 2, symptoms: ['NAUSEA'] });

    // B lista o DELE (vazio) — não vê o de A
    const list = await api().get('/api/daily-logs').set(authHeader(b.token));
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);

    // B tenta escrever FORJANDO patientId de A → grava no próprio B (não deixa)
    const forge = await api().post('/api/daily-logs').set(authHeader(b.token)).send({ patientId: a.patient.id, mood: 5 });
    expect(forge.status).toBe(201);
    const rowA = await prisma.dailyLog.findFirst({ where: { patientId: a.patient.id } });
    const rowB = await prisma.dailyLog.findFirst({ where: { patientId: b.patient.id } });
    expect(rowA?.mood ?? null).toBe(2);
    expect(rowB?.mood).toBe(5);
  });

  it('insights fica gated até 4 dias de diário', async () => {
    const u = await createUser();
    const r1 = await api().get('/api/daily-logs/insights').set(authHeader(u.token));
    expect(r1.status).toBe(200);
    expect(r1.body.ready).toBe(false);

    // 4 dias com sono curto × dor de cabeça (padrão clássico)
    const mk = (offsetDays: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
      .format(new Date(Date.now() - offsetDays * 86400000));
    for (const off of [3, 2, 1, 0]) {
      await api().post('/api/daily-logs').set(authHeader(u.token)).send({ date: mk(off), mood: 2, symptoms: ['DOR_CABECA'] });
      // sono do HC: 300min nos dias COM sintoma
      await prisma.measurement.create({
        data: {
          patientId: u.patient.id, type: 'SLEEP_MINUTES', value: 300, unit: 'min',
          measuredAt: new Date(`${mk(off)}T12:00:00Z`), note: 'Health Connect',
        },
      });
    }
    // dias SEM sintoma com sono bom (contra-prova)
    for (const off of [10, 9, 8, 7]) {
      await api().post('/api/daily-logs').set(authHeader(u.token)).send({ date: mk(off), mood: 4 });
      await prisma.measurement.create({
        data: {
          patientId: u.patient.id, type: 'SLEEP_MINUTES', value: 480, unit: 'min',
          measuredAt: new Date(`${mk(off)}T12:00:00Z`), note: 'Health Connect',
        },
      });
    }
    const r2 = await api().get('/api/daily-logs/insights').set(authHeader(u.token));
    expect(r2.status).toBe(200);
    expect(r2.body.ready).toBe(true);
    expect(r2.body.insights.length).toBeGreaterThanOrEqual(1);
    expect(r2.body.insights[0].kind).toBe('symptom_vs_sleep');
    // narração: veio da IA OU do fallback estruturado — nunca vazia
    expect((r2.body.narration ?? '').length).toBeGreaterThan(10);
  });
});
