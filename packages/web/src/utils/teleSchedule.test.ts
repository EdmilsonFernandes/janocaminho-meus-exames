import { describe, it, expect } from 'vitest';

// Fuso de Brasília ANTES de qualquer Date: o bug só aparece com local ≠ UTC (o CI roda
// em UTC — sem isto o teste de regressão passaria até com o código antigo).
process.env.TZ = 'America/Sao_Paulo';

import {
  buildTeleShortcuts, localYmd, parseReaisToCents, maskReaisInput, centsToPriceField, formatBRL,
  priceFieldToCents, chargeIssue, callOptions, resolveCallMode, teleBlockingReason, teleSummary,
} from './teleSchedule';

describe('localYmd + atalhos — fuso LOCAL (bug 27/10/26: toISOString é UTC)', () => {
  it('21:30 em Brasília continua "hoje" (UTC já é o dia seguinte)', () => {
    const now = new Date(2026, 9, 27, 21, 30); // 27/10 21:30 local
    expect(now.toISOString().slice(0, 10)).toBe('2026-10-28'); // prova que o fuso pegou
    expect(localYmd(now)).toBe('2026-10-27');
    const hoje = buildTeleShortcuts(now).find((s) => s.key === 'hoje');
    expect(hoje).toEqual({ key: 'hoje', label: 'Hoje 22h', date: '2026-10-27', time: '22:00' });
  });

  it('a partir das 22h não oferece "Hoje"; amanhã/+3/+7 em datas locais', () => {
    const now = new Date(2026, 9, 27, 22, 10);
    const s = buildTeleShortcuts(now);
    expect(s.map((x) => x.key)).toEqual(['amanha-10', 'amanha-14', 'em-3-dias', 'proxima-semana']);
    expect(s[0]).toMatchObject({ date: '2026-10-28', time: '10:00' });
    expect(s[2]).toMatchObject({ date: '2026-10-30', time: '10:00' });
    expect(s[3]).toMatchObject({ date: '2026-11-03', time: '14:00' }); // virada de mês
  });

  it('de madrugada "Hoje" vira 10h (não "Hoje 1h"); a partir das 6h volta à próxima hora cheia', () => {
    const s = buildTeleShortcuts(new Date(2026, 9, 28, 0, 30));
    expect(s[0]).toEqual({ key: 'hoje', label: 'Hoje 10h', date: '2026-10-28', time: '10:00' });
    expect(s[1]).toMatchObject({ key: 'amanha-10', date: '2026-10-29' });
    expect(buildTeleShortcuts(new Date(2026, 9, 28, 5, 59))[0].label).toBe('Hoje 10h');
    expect(buildTeleShortcuts(new Date(2026, 9, 28, 6, 0))[0].label).toBe('Hoje 7h');
  });
});

describe('valor em reais (bug 27/10/26: máscara de centavos fazia "20" virar "0,20")', () => {
  it('inteiro digitado é REAIS', () => {
    expect(parseReaisToCents('20')).toBe(2000);
    expect(parseReaisToCents('150')).toBe(15000);
  });
  it('vírgula é decimal; ponto só com até 2 casas no fim', () => {
    expect(parseReaisToCents('15,9')).toBe(1590);
    expect(parseReaisToCents('15,90')).toBe(1590);
    expect(parseReaisToCents('0,20')).toBe(20);
    expect(parseReaisToCents('150.5')).toBe(15050);
    expect(parseReaisToCents('1.500')).toBe(150000);
    expect(parseReaisToCents('1.500,00')).toBe(150000);
    expect(parseReaisToCents('15,905')).toBe(1590); // 3ª casa ignorada
  });
  it('vazio/sem dígito → null; máscara limita caracteres', () => {
    expect(parseReaisToCents('')).toBeNull();
    expect(parseReaisToCents('R$ ')).toBeNull();
    expect(maskReaisInput('R$ 1a5,0x0')).toBe('15,00');
  });
  it('formato do campo (o envio só remove não-dígitos) e exibição', () => {
    expect(centsToPriceField(2000)).toBe('20,00');
    expect(priceFieldToCents(centsToPriceField(15050))).toBe(15050);
    expect(formatBRL(150000)).toBe('R$ 1.500,00');
    expect(formatBRL(2000)).toBe('R$ 20,00');
  });
  it('mínimo/máximo da cobrança', () => {
    expect(chargeIssue('', 2000)).toBe('empty');
    expect(chargeIssue('15,90', 2000)).toBe('min');
    expect(chargeIssue('20,00', 2000)).toBeNull();
    expect(chargeIssue('20000,01', 2000)).toBe('max');
  });
});

describe('modo da chamada — mesma precedência do envio (app > Meet > link)', () => {
  it('opções por capacidade do servidor', () => {
    expect(callOptions({ livekit: true, connected: true })).toEqual(['app', 'link']);
    expect(callOptions({ connected: true })).toEqual(['meet', 'link']);
    expect(callOptions({ configured: true })).toEqual(['link']);
    expect(callOptions(null)).toEqual(['link']);
  });
  it('toggle automático desligado = link manual', () => {
    expect(resolveCallMode({ livekit: true }, true)).toBe('app');
    expect(resolveCallMode({ livekit: true }, false)).toBe('link');
    expect(resolveCallMode({ connected: true }, true)).toBe('meet');
    expect(resolveCallMode(null, true)).toBe('link');
  });
});

describe('teleBlockingReason + teleSummary', () => {
  const now = new Date(2026, 9, 27, 19, 0);
  const base = { hasPatient: true, date: '2026-10-28', time: '14:00', now, mode: 'app' as const, link: '', charge: false, price: '', minCents: 2000 };

  it('pronto para agendar → null', () => {
    expect(teleBlockingReason(base)).toBeNull();
  });
  it('diz o motivo em vez de botão "morto"', () => {
    expect(teleBlockingReason({ ...base, hasPatient: false })).toBe('Selecione o paciente');
    expect(teleBlockingReason({ ...base, date: '' })).toBe('Escolha a data da consulta');
    expect(teleBlockingReason({ ...base, date: '2026-10-27', time: '18:00' })).toMatch(/já passou/);
    expect(teleBlockingReason({ ...base, mode: 'link', link: 'meet.google.com/x' })).toMatch(/link da chamada/);
    expect(teleBlockingReason({ ...base, mode: 'link', link: 'https://meet.google.com/x' })).toBeNull();
    expect(teleBlockingReason({ ...base, charge: true, price: '' })).toMatch(/Informe o valor/);
    expect(teleBlockingReason({ ...base, charge: true, price: '15,90' })).toBe('Valor mínimo R$ 20,00');
    expect(teleBlockingReason({ ...base, charge: true, price: '150,00' })).toBeNull();
  });
  it('resumo legível do que vai ser agendado', () => {
    expect(teleSummary({ date: '2026-10-29', time: '14:00', mode: 'app', charge: true, price: '150,00' }))
      .toBe('Qui, 29/10 às 14:00 · No app · R$ 150,00');
    expect(teleSummary({ date: '2026-10-29', time: '09:30', mode: 'link', charge: false, price: '150,00' }))
      .toBe('Qui, 29/10 às 09:30 · Link externo · Sem cobrança');
  });
});
