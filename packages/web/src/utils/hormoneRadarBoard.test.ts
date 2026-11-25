// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { calendarDayDiff, doseBoard, doseBoardRows, doseReminderTitle, lastDoseLabel, nextDoseLabel, pickDoseReminder, reminderDueAt } from './hormoneRadar';

// Datas em hora LOCAL (construtor de componentes), para o teste não depender do fuso da máquina.
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();
const NOW = at(13, 9);

describe('placar de hoje (datas em palavras)', () => {
  it('conta por dia de calendário, não por blocos de 24 h', () => {
    expect(calendarDayDiff(at(13, 23), NOW)).toBe(0);
    expect(calendarDayDiff(at(12, 23, 30), NOW)).toBe(-1);
    expect(calendarDayDiff(at(14, 0, 5), NOW)).toBe(1);
    expect(calendarDayDiff(at(20), NOW)).toBe(7);
  });

  it('última aplicação: quem aplicou ontem à noite não aplicou "hoje"', () => {
    expect(lastDoseLabel(null, NOW)).toBe('—');
    expect(lastDoseLabel(at(13, 7), NOW)).toBe('hoje');
    expect(lastDoseLabel(at(12, 23, 30), NOW)).toBe('ontem');
    expect(lastDoseLabel(at(10), NOW)).toBe('há 3 dias');
  });

  it('próxima prevista: descreve a data, sem mandar aplicar', () => {
    expect(nextDoseLabel(null, NOW)).toBe('—');
    expect(nextDoseLabel(at(13, 20), NOW)).toBe('hoje');
    expect(nextDoseLabel(at(14), NOW)).toBe('amanhã');
    expect(nextDoseLabel(at(17), NOW)).toBe('em 4 dias');
    expect(nextDoseLabel(at(12), NOW)).toBe('passou 1 dia');
    expect(nextDoseLabel(at(11), NOW)).toBe('passou 2 dias');
    for (const ms of [at(11), at(13), at(17)]) expect(nextDoseLabel(ms, NOW)).not.toMatch(/aplique|na hora|atrasad/i);
  });

  it('sem registro não inventa data', () => {
    expect(doseBoard([], NOW)).toEqual({ last: null, lastIndex: -1, next: null, nextIndex: -1, lateDays: 0 });
    expect(doseBoard([{ freqDays: 7, takenAtMs: [] }], NOW)).toEqual({ last: null, lastIndex: -1, next: null, nextIndex: -1, lateDays: 0 });
  });

  it('com dois compostos: aplicação mais recente e próxima prevista mais próxima', () => {
    const board = doseBoard([
      { freqDays: 7, takenAtMs: [at(3), at(10)] }, // próxima: dia 17
      { freqDays: 3.5, takenAtMs: [at(12)] }, // próxima: dia 16 (00h)
    ], NOW);
    expect(board.last).toBe(at(12));
    expect(board.lastIndex).toBe(1);
    expect(board.next).toBe(at(12) + 3.5 * 86_400_000);
    expect(board.nextIndex).toBe(1);
    expect(board.lateDays).toBe(0);
  });

  it('próxima prevista que já passou vira dias de atraso (calendário)', () => {
    const board = doseBoard([{ freqDays: 7, takenAtMs: [at(4)] }], NOW); // prevista: dia 11
    expect(board.next).toBe(at(11));
    expect(board.lateDays).toBe(2);
    expect(nextDoseLabel(board.next, NOW)).toBe('passou 2 dias');
  });
});

describe('lembrete que acompanha o registro', () => {
  it('data do lembrete = 08:00 local do dia previsto', () => {
    const due = new Date(reminderDueAt(at(17, 21, 40)));
    expect([due.getFullYear(), due.getMonth(), due.getDate(), due.getHours(), due.getMinutes()]).toEqual([2026, 10, 17, 8, 0]);
  });

  it('acha só lembrete ABERTO, de medicamento, com o título do composto e do mesmo paciente', () => {
    const title = doseReminderTitle('Cipionato');
    expect(title).toBe('Aplicação: Cipionato');
    const list = [
      { id: 'feito', title, type: 'medicamento', done: true, dueDate: '2026-11-01T11:00:00.000Z', patientId: 'p1' },
      { id: 'outro-tipo', title, type: 'exame', done: false, dueDate: '2026-11-02T11:00:00.000Z', patientId: 'p1' },
      { id: 'outro-paciente', title, type: 'medicamento', done: false, dueDate: '2026-11-03T11:00:00.000Z', patientId: 'p2' },
      { id: 'outro-titulo', title: 'Aplicação: Enantato', type: 'medicamento', done: false, dueDate: '2026-11-04T11:00:00.000Z', patientId: 'p1' },
      { id: 'tarde', title, type: 'medicamento', done: false, dueDate: '2026-11-20T11:00:00.000Z', patientId: 'p1' },
      { id: 'cedo', title, type: 'medicamento', done: false, dueDate: '2026-11-06T11:00:00.000Z', patientId: 'p1' },
    ];
    expect(pickDoseReminder(list, title, 'p1')?.id).toBe('cedo');
    expect(pickDoseReminder(list, title, 'p3')).toBeNull();
    expect(pickDoseReminder(list, title, null)).toBeNull();
    expect(pickDoseReminder([], title, 'p1')).toBeNull();
  });
});

describe('doseBoardRows — uma linha por composto (Durateston + Masteron)', () => {
  const now = new Date(2026, 10, 25, 12, 0, 0).getTime();
  const d = (daysAgo: number) => now - daysAgo * 86_400_000;

  it('cada composto tem a SUA última aplicação e a SUA próxima prevista, na ordem do protocolo', () => {
    const rows = doseBoardRows([
      { name: 'Durateston', freqDays: 7, takenAtMs: [d(10), d(3)] },
      { name: 'Masteron', freqDays: 3.5, takenAtMs: [d(1)] },
    ], now);
    expect(rows.map((r) => r.name)).toEqual(['Durateston', 'Masteron']);
    expect(rows[0].last).toBe(d(3));
    expect(rows[0].next).toBe(d(3) + 7 * 86_400_000);
    expect(rows[0].lateDays).toBe(0);
    expect(rows[1].last).toBe(d(1));
    expect(rows[1].next).toBe(d(1) + 3.5 * 86_400_000);
  });

  it('composto sem registro aparece vazio; composto com a data passada mostra os dias de atraso', () => {
    const rows = doseBoardRows([
      { name: 'Durateston', freqDays: 7, takenAtMs: [d(10)] },
      { name: 'Masteron', freqDays: 7, takenAtMs: [] },
    ], now);
    expect(rows[0].lateDays).toBe(3);
    expect(rows[1]).toEqual({ name: 'Masteron', last: null, next: null, lateDays: 0 });
  });
});
