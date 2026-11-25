// @vitest-environment node
/**
 * buildPendencias — a montagem das linhas do card "Pra você fazer" é função pura:
 * entra a lista de lembretes/perguntas/radar + o relógio, sai a fila já priorizada.
 * O que se trava aqui são as regras de produto (o que entra, o que fica fora, a ordem)
 * e o limite de conteúdo da linha do Radar (diário, nunca conselho).
 */
import { describe, expect, it, vi } from 'vitest';

// O arquivo do card também exporta o componente; a casca visual e o acesso a ambiente
// (Capacitor, localStorage) não interessam à função pura.
vi.mock('../AppCard', () => ({ AppCard: () => null }));
vi.mock('../../config', () => ({ API_URL: 'http://test/api', token: () => 't' }));
vi.mock('../../patient-context', () => ({ useSelectedPatient: () => ['p1', () => undefined] }));

import { buildPendencias, MAX_ROWS, RADAR_STALE_DAYS, STALE_MS, TELE_GRACE_MS, type RadarInput } from './PendenciasCard';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Meio-dia local: folga dos dois lados para as contas por dia de calendário.
const NOW = new Date(2026, 10, 25, 12, 0, 0).getTime();
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

let seq = 0;
const reminder = (title: string, offsetMs: number, extra: Record<string, unknown> = {}) => ({ id: `r${++seq}`, title, dueDate: iso(offsetMs), done: false, ...extra });
const tele = (title: string, offsetMs: number, extra: Record<string, unknown> = {}) => reminder(title, offsetMs, { type: 'teleconsulta', ...extra });
const build = (p: { reminders?: unknown[]; questions?: unknown[]; radar?: RadarInput | null; now?: number }) =>
  buildPendencias({ reminders: (p.reminders ?? []) as any[], questions: (p.questions ?? []) as any[], radar: p.radar ?? null, now: p.now ?? NOW });
/** Protocolo semanal de um composto cuja última aplicação foi há `daysAgo` dias. */
const weekly = (compoundId: string, daysAgo: number): RadarInput => ({
  protocol: [{ compoundId, freqDays: 7 }],
  doses: [{ compoundId, takenAt: iso(-daysAgo * DAY) }],
});

describe('buildPendencias — constantes do contrato', () => {
  it('janelas e teto não mudaram', () => {
    expect(MAX_ROWS).toBe(4);
    expect(STALE_MS).toBe(7 * DAY);
    expect(TELE_GRACE_MS).toBe(2 * HOUR);
    expect(RADAR_STALE_DAYS).toBe(7);
  });
});

describe('buildPendencias — lembretes', () => {
  it('sem nada pendente devolve lista vazia (o card some)', () => {
    expect(build({})).toEqual([]);
    expect(buildPendencias({ reminders: null, questions: undefined, now: NOW })).toEqual([]);
  });

  it('vencido há 2 dias aparece com o título; vencido há 40 dias fica fora', () => {
    const rows = build({ reminders: [reminder('Retorno cardiologista', -2 * DAY), reminder('Vacina antiga', -40 * DAY)] });
    expect(rows.map((r) => r.label)).toEqual(['Retorno cardiologista']);
    expect(rows[0].chip).toBe('vencido há 2 dias');
    expect(rows[0].tone).toBe('warning');
  });

  it('vencido há mais de 7 dias fica fora mesmo sozinho', () => {
    expect(build({ reminders: [reminder('Antigo', -STALE_MS - HOUR)] })).toEqual([]);
  });

  it('vários vencidos recentes viram UMA linha agregada, sem ação de marcar', () => {
    const rows = build({ reminders: [reminder('A', -1 * DAY), reminder('B', -2 * DAY), reminder('C', -3 * DAY), reminder('Velho', -30 * DAY)] });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('3 lembretes atrasados');
    expect(rows[0].chip).toBe('ver agenda');
    expect(rows[0].kind).toBe('overdue-group');
    expect(rows[0].reminderId).toBeUndefined();
  });

  it('o que ainda vai acontecer (hoje/amanhã) aparece, em ordem de data; além de 7 dias não', () => {
    const rows = build({ reminders: [reminder('Amanhã cedo', DAY), reminder('Hoje à tarde', 3 * HOUR), reminder('Mês que vem', 30 * DAY)] });
    expect(rows.map((r) => [r.label, r.chip])).toEqual([['Hoje à tarde', 'hoje'], ['Amanhã cedo', 'amanhã']]);
  });

  it('lembrete individual (vencido ou próximo) carrega o id para "Marcar como feito"', () => {
    const od = reminder('Vencido', -DAY);
    const soon = reminder('Próximo', DAY);
    const rows = build({ reminders: [od, soon] });
    expect(rows.find((r) => r.label === 'Vencido')?.reminderId).toBe(od.id);
    expect(rows.find((r) => r.label === 'Próximo')?.reminderId).toBe(soon.id);
  });

  it('feito, encerrado e recorrente (rotina) não são pendência', () => {
    const rows = build({ reminders: [
      reminder('Já feito', -DAY, { done: true }),
      reminder('Remédio diário', 2 * HOUR, { recurrence: 'diario' }),
      tele('Consulta encerrada', HOUR, { endedAt: iso(-HOUR) }),
    ] });
    expect(rows).toEqual([]);
  });

  it('resolver um lembrete recompõe a lista: o próximo sobe', () => {
    const list = Array.from({ length: 6 }, (_, i) => reminder(`L${i + 1}`, (i + 1) * HOUR));
    expect(build({ reminders: list }).map((r) => r.label)).toEqual(['L1', 'L2', 'L3', 'L4']);
    expect(build({ reminders: list.slice(1) }).map((r) => r.label)).toEqual(['L2', 'L3', 'L4', 'L5']);
  });
});

describe('buildPendencias — teleconsulta e perguntas', () => {
  it('teleconsulta que passou há mais de 2h não aparece; dentro da janela, sim', () => {
    expect(build({ reminders: [tele('Passou', -TELE_GRACE_MS - 60_000)] })).toEqual([]);
    const rows = build({ reminders: [tele('Começou há pouco', -20 * 60_000)] });
    expect(rows).toHaveLength(1);
    expect(rows[0].chip).toBe('agora');
    expect(rows[0].to).toBe('/consultas');
  });

  it('teleconsulta nunca ganha ação de marcar como feito (nem pergunta ao médico)', () => {
    const rows = build({ reminders: [tele('Consulta', DAY)], questions: [{ status: 'pending' }] });
    expect(rows.map((r) => r.kind)).toEqual(['tele', 'question']);
    expect(rows.every((r) => r.reminderId === undefined)).toBe(true);
  });

  it('perguntas pendentes viram uma linha agregada; respondidas não contam', () => {
    expect(build({ questions: [{ status: 'answered' }] })).toEqual([]);
    expect(build({ questions: [{ status: 'pending' }] })[0].label).toBe('Pergunta aguardando o médico');
    expect(build({ questions: [{ status: 'pending' }, { status: 'open' }, { status: 'answered' }] })[0].label).toBe('2 perguntas aguardando o médico');
  });
});

describe('buildPendencias — aplicação prevista do Radar Hormonal', () => {
  it('sem aplicação registrada não há linha (quem só usou o simulador não recebe aviso)', () => {
    expect(build({ radar: { protocol: [{ compoundId: 'test_cyp', freqDays: 7 }], doses: [] } })).toEqual([]);
    // registro de OUTRO composto também não conta
    expect(build({ radar: { protocol: [{ compoundId: 'test_cyp', freqDays: 7 }], doses: [{ compoundId: 'test_enan', takenAt: iso(-7 * DAY) }] } })).toEqual([]);
  });

  it('prevista para hoje: "Aplicação prevista: {nome curto}" com chip "hoje", leva ao Radar', () => {
    const rows = build({ radar: weekly('test_cyp', 7) });
    expect(rows).toEqual([{ key: 'radar', kind: 'radar', label: 'Aplicação prevista: Cipionato', chip: 'hoje', tone: 'secondary', to: '/radar-hormonal' }]);
  });

  it('prevista para mais tarde HOJE também conta como hoje', () => {
    const rows = build({ radar: { protocol: [{ compoundId: 'test_cyp', freqDays: 7 }], doses: [{ compoundId: 'test_cyp', takenAt: iso(-7 * DAY + 5 * HOUR) }] } });
    expect(rows[0]?.chip).toBe('hoje');
  });

  it('já passou: chip "passou N dias" (singular em 1)', () => {
    expect(build({ radar: weekly('test_cyp', 8) })[0].chip).toBe('passou 1 dia');
    expect(build({ radar: weekly('test_cyp', 10) })[0].chip).toBe('passou 3 dias');
    expect(build({ radar: weekly('test_cyp', 14) })[0].chip).toBe('passou 7 dias');
  });

  it('fora da janela: prevista só amanhã ou passou há mais de 7 dias → sem linha', () => {
    expect(build({ radar: weekly('test_cyp', 6) })).toEqual([]);
    expect(build({ radar: weekly('test_cyp', 15) })).toEqual([]);
    expect(build({ radar: weekly('test_cyp', 60) })).toEqual([]);
  });

  it('conta a partir da ÚLTIMA aplicação: quem registrou hoje não recebe aviso', () => {
    const radar: RadarInput = { protocol: [{ compoundId: 'test_cyp', freqDays: 7 }], doses: [{ compoundId: 'test_cyp', takenAt: iso(-9 * DAY) }, { compoundId: 'test_cyp', takenAt: iso(-HOUR) }] };
    expect(build({ radar })).toEqual([]);
  });

  it('mais de um composto na janela vira UMA linha agregada', () => {
    const radar: RadarInput = {
      protocol: [{ compoundId: 'test_cyp', freqDays: 7 }, { compoundId: 'nand_dec', freqDays: 7 }, { compoundId: 'test_enan', freqDays: 7 }],
      doses: [{ compoundId: 'test_cyp', takenAt: iso(-7 * DAY) }, { compoundId: 'nand_dec', takenAt: iso(-9 * DAY) }, { compoundId: 'test_enan', takenAt: iso(-2 * DAY) }],
    };
    const rows = build({ radar });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('2 aplicações previstas');
    expect(rows[0].to).toBe('/radar-hormonal');
  });

  it('composto repetido no protocolo conta uma vez só', () => {
    const radar: RadarInput = { protocol: [{ compoundId: 'test_cyp', freqDays: 7 }, { compoundId: 'test_cyp', freqDays: 7 }], doses: [{ compoundId: 'test_cyp', takenAt: iso(-7 * DAY) }] };
    expect(build({ radar })[0].label).toBe('Aplicação prevista: Cipionato');
  });

  it('dado torto nunca quebra: radar nulo, datas inválidas, intervalo inválido', () => {
    expect(build({ radar: null })).toEqual([]);
    expect(build({ radar: { protocol: [{ compoundId: 'test_cyp', freqDays: 7 }], doses: [{ compoundId: 'test_cyp', takenAt: 'não é data' }] } })).toEqual([]);
    expect(build({ radar: { protocol: [{ compoundId: 'test_cyp', freqDays: Number.NaN }], doses: [{ compoundId: 'test_cyp', takenAt: iso(-7 * DAY) }] } })).toEqual([]);
    expect(build({ radar: { protocol: null, doses: null } as unknown as RadarInput })).toEqual([]);
  });
});

describe('buildPendencias — teto e prioridade', () => {
  it('no máximo 4 linhas, na ordem: tele imediata > radar > tele futura > vencido > pergunta > próximos', () => {
    const rows = build({
      reminders: [
        reminder('Próximo', 3 * HOUR),
        reminder('Vencido', -DAY),
        tele('Tele amanhã', DAY),
        tele('Tele agora', 10 * 60_000),
      ],
      questions: [{ status: 'pending' }],
      radar: weekly('test_cyp', 7),
    });
    expect(rows).toHaveLength(MAX_ROWS);
    expect(rows.map((r) => r.label)).toEqual(['Tele agora', 'Aplicação prevista: Cipionato', 'Tele amanhã', 'Vencido']);
  });

  it('sem teleconsulta: radar vem antes dos lembretes, pergunta antes dos próximos', () => {
    const rows = build({
      reminders: [reminder('Próximo 1', 2 * HOUR), reminder('Próximo 2', DAY), reminder('Vencido', -DAY)],
      questions: [{ status: 'pending' }],
      radar: weekly('test_cyp', 8),
    });
    expect(rows.map((r) => r.kind)).toEqual(['radar', 'overdue', 'question', 'soon']);
  });

  it('vencido ocupa só uma vaga: o que vem pela frente continua aparecendo', () => {
    const rows = build({ reminders: [reminder('V1', -DAY), reminder('V2', -2 * DAY), reminder('V3', -3 * DAY), reminder('Hoje', 2 * HOUR), reminder('Amanhã', DAY)] });
    expect(rows.map((r) => r.label)).toEqual(['3 lembretes atrasados', 'Hoje', 'Amanhã']);
  });

  it('chaves únicas (React) em qualquer combinação', () => {
    const rows = build({ reminders: [tele('T', DAY), reminder('V', -DAY), reminder('P', DAY)], questions: [{ status: 'pending' }], radar: weekly('test_cyp', 7) });
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});

describe('buildPendencias — limite de conteúdo (diário, não conselheiro)', () => {
  it('nenhuma linha do Radar manda aplicar, tomar, nem cita dose', () => {
    const scenarios: RadarInput[] = [
      weekly('test_cyp', 7),
      weekly('sustanon', 9),
      weekly('test_und', 14),
      { protocol: [{ compoundId: 'test_cyp', freqDays: 7 }, { compoundId: 'nand_dec', freqDays: 3.5 }], doses: [{ compoundId: 'test_cyp', takenAt: iso(-8 * DAY) }, { compoundId: 'nand_dec', takenAt: iso(-4 * DAY) }] },
    ];
    for (const radar of scenarios) {
      const rows = build({ radar });
      expect(rows).toHaveLength(1);
      const text = `${rows[0].label} ${rows[0].chip}`.toLowerCase();
      expect(text).toContain('prevista');
      expect(text).not.toMatch(/apliqu|tome|tomar|est[aá] na hora|\bmg\b|\bml\b|dose/);
    }
  });
});
