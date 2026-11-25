import { describe, it, expect } from 'vitest';
import { nextExamCopy, type RetestPlan } from './NextExamCard';

const plan = (over: Partial<RetestPlan>): RetestPlan => ({
  examId: 'e1', lastExamAt: '2026-08-25T12:00:00.000Z', dueAt: '2026-11-25T12:00:00.000Z',
  months: 3, reason: 'alterado', markers: ['Colesterol LDL'], daysUntil: 0, status: 'chegou', ...over,
});

describe('cartão "Próximo exame" da Home', () => {
  it('não aparece sem plano nem quando o prazo está longe', () => {
    expect(nextExamCopy(null)).toBeNull();
    expect(nextExamCopy(plan({ status: 'longe', daysUntil: 200 }))).toBeNull();
  });

  it('prazo chegando: diz o mês, quantos dias faltam e por quê', () => {
    const c = nextExamCopy(plan({ status: 'chegando', daysUntil: 12, dueAt: '2026-12-07T12:00:00.000Z' }))!;
    expect(c.title).toBe('Seu próximo exame');
    expect(c.when).toBe('Por volta de dezembro de 2026 · em 12 dias');
    expect(c.body).toContain('Colesterol LDL saiu da faixa');
    expect(c.body).toContain('A gente avisa');
    expect(c.tone).toBe('primary');
  });

  it('prazo chegou: muda o tom, cita vários exames no plural e aponta o médico', () => {
    const c = nextExamCopy(plan({ status: 'chegou', daysUntil: -9, markers: ['Glicose', 'TSH', 'Ferritina'] }))!;
    expect(c.title).toBe('Hora de rever seu exame');
    expect(c.when).toBe('O prazo chegou há 9 dias');
    expect(c.body).toContain('Glicose, TSH e Ferritina saíram da faixa');
    expect(c.body).toContain('seu médico');
    expect(c.tone).toBe('warning');
    expect(nextExamCopy(plan({ daysUntil: 0 }))!.when).toBe('O prazo chegou agora');
  });

  it('rotina (tudo dentro da faixa): texto de 1 ano, sem citar exame', () => {
    const c = nextExamCopy(plan({ reason: 'rotina', months: 12, markers: [], status: 'chegando', daysUntil: 1, dueAt: '2027-06-01T12:00:00.000Z' }))!;
    expect(c.when).toBe('Por volta de junho de 2027 · em 1 dia');
    expect(c.body).toContain('uma vez por ano');
    expect(c.body).not.toMatch(/saiu|saíram/);
  });

  it('nunca manda repetir nem fala em doença ou diagnóstico', () => {
    for (const p of [plan({}), plan({ status: 'chegando', daysUntil: 5 }), plan({ reason: 'rotina', markers: [], status: 'chegou', daysUntil: -3 })]) {
      const c = nextExamCopy(p)!;
      expect(`${c.title} ${c.when} ${c.body}`).not.toMatch(/você deve|precisa repetir|diagn|doença|tratamento/i);
    }
  });
});
