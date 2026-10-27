// Unit — TEMA 'hormonal' das dicas (dono 26/10: "as notificações têm que entender o
// que ele toma"). Regras provadas aqui:
//  a) uso declarado → tema hormonal PRIORIZADO (à frente de melhora/atenção);
//  b) rotação: hormonal nas 2 últimas → cede pro próximo tema com dado;
//  c) fallback cita marcador REAL com linguagem revisada (hematócrito/HDL/CK/creatinina);
//  d) GUARDRAIL: prompt e fallback JAMAIS mandam dose/ajuste/pausa — sempre "médico".
//  e) sem declaração → tema hormonal nunca candidata (paciente comum intocável).
import { describe, it, expect } from 'vitest';
import { pickTipTheme, buildTipPrompt, curatedFallback, type TipContext, type TipMarker } from '../src/jobs/tipEngine';

const mk = (name: string, value: number, prev?: number, refHigh?: number): TipMarker => ({
  name, value, prev: prev ?? null, unit: 'g/dL', deltaPct: null, flag: 'H', refHigh: refHigh ?? null,
});

const base = (over: Partial<TipContext> = {}): TipContext => ({
  firstName: 'Léo', score: 70, daysSinceExam: 20, stale: false,
  improving: [], worsening: [], cardioLevel: '', cardioFactors: 0,
  activeMinutesWeek: null, activeMinutesPrevWeek: null, stepsAvgDay: null, restingHr: null,
  medications: [], segment: 'rotina', ...over,
});

describe('pickTipTheme — hormonal', () => {
  it('uso declarado vence mesmo com melhora/atenção no contexto', () => {
    const c = base({
      hormonal: { substances: ['Testosterona (Durateston)'] },
      improving: [mk('HDL', 42, 35)],
      worsening: [mk('Hematócrito', 54)],
    });
    expect(pickTipTheme(c, [])).toBe('hormonal');
  });

  it('rotação: hormonal nas 2 últimas → cede (não martela terça e sexta)', () => {
    const c = base({ hormonal: { substances: ['Nandrolona'] }, worsening: [mk('LDL', 160, 130)] });
    expect(pickTipTheme(c, ['hormonal', 'hormonal'])).not.toBe('hormonal');
  });

  it('SEM declaração o tema nunca candidata (paciente comum intocável)', () => {
    const c = base({ worsening: [mk('LDL', 160, 130)] });
    expect(pickTipTheme(c, [])).not.toBe('hormonal');
  });
});

describe('buildTipPrompt — tema hormonal', () => {
  it('prompt traz substância AUTORRELATADA + tarefa com guardrail (nunca conduta)', () => {
    const { system, user } = buildTipPrompt(base({ hormonal: { substances: ['Drostanolona (Masteron)'] } }), 'hormonal', []);
    expect(user).toContain('USO DECLARADO');
    expect(user).toContain('Drostanolona');
    expect(user).toContain('NUNCA');
    expect(user).toContain('médico');
    expect(system).toBeTruthy();
  });
});

describe('curatedFallback — hormonal (frases revisadas E6)', () => {
  it('hematócrito presente → cita valor+ref e leva pro médico (sem dose/pausa)', () => {
    const c = base({
      hormonal: { substances: ['Testosterona'] },
      worsening: [mk('Hematócrito', 54, 48, 50)],
    });
    const fb = curatedFallback(c, 'hormonal');
    expect(fb).toContain('hematócrito');
    expect(fb).toContain('54');
    expect(fb).toContain('médico');
    expect(/dose|parar de tomar|pause|reduza/i.test(fb)).toBe(false);
  });

  it('HDL×andrógeno e CK×treino: mensagem educativa com o dado real', () => {
    const hdl = curatedFallback(base({ hormonal: { substances: ['Estanozolol'] }, worsening: [mk('HDL', 18, 32)] }), 'hormonal');
    expect(hdl).toContain('HDL');
    expect(hdl).toContain('médico');
    const ck = curatedFallback(base({ hormonal: { substances: ['Trembolona'] }, worsening: [mk('CK', 980, 300)] }), 'hormonal');
    expect(ck).toContain('24h'); // recomendação de coleta (padrão internacional) — não é conduta
  });

  it('sem marcador casado → lembrete dos exames que o médico mais olha (sem nomear dose)', () => {
    const fb = curatedFallback(base({ hormonal: { substances: ['Oxandrolona'] } }), 'hormonal');
    expect(fb).toContain('hematócrito');
    expect(fb).toContain('médico');
    expect(/dose|ciclo/i.test(fb)).toBe(false);
  });
});
