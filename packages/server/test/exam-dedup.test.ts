import { describe, it, expect } from 'vitest';
import { computeMarkerState, classifyTemporal, FRESH_MONTHS, RECENT_MONTHS, OLD_MONTHS } from '../src/analysis/health-state';
import type { ItemRow } from '../src/analysis/health-state';

const mk = (name: string, canonical: string, value: number, date: Date, abnormal = false): ItemRow => ({
  name, nameCanonical: canonical, valueNumeric: value, valueText: String(value), unit: 'mg/dL',
  refLow: 1, refHigh: 10, refText: null, flag: abnormal ? 'HIGH' : 'NORMAL', isAbnormal: abnormal, performedAt: date,
});

describe('dedup de exames + análise temporal', () => {
  it('mesmo marcador no MESMO DIA (exame duplicado) → colapsa em 1 ponto', () => {
    const day = new Date('2026-07-01');
    const rows = [
      mk('TSH', 'TSH', 3.5, day),
      mk('TSH', 'TSH', 3.5, day), // duplicata mesmo dia
    ];
    const markers = computeMarkerState(rows);
    expect(markers).toHaveLength(1);
    expect(markers[0].points).toBe(1); // não infla
    expect(markers[0].trend).toBe('primeiro'); // só 1 ponto real
  });

  it('mesmo marcador em DIAS DIFERENTES → mantém como evolução (2 pontos)', () => {
    const rows = [
      mk('TSH', 'TSH', 3.5, new Date('2026-07-01')),
      mk('TSH', 'TSH', 4.0, new Date('2026-06-01')),
    ];
    const markers = computeMarkerState(rows);
    expect(markers[0].points).toBe(2);
    expect(markers[0].prior).not.toBeNull();
  });

  it('exame 2018 alterado + exame 2026 normal → temporal class ATUAL no 2026, não no 2018', () => {
    const old = new Date('2018-03-01');
    const recent = new Date('2026-07-01');
    const rows = [
      mk('TGP', 'TGP', 35, recent, false), // 2026 normal
      mk('TGP', 'TGP', 82, old, true),     // 2018 alterado
    ];
    const markers = computeMarkerState(rows);
    expect(markers[0].latest.valueNumeric).toBe(35); // 2026 é o "latest"
    expect(markers[0].latest.stale).toBe(false); // 2026 não é stale
    expect(markers[0].temporalClass).toBe('atual');
    expect(markers[0].isAbnormal).toBe(false); // 2026 = normal
    expect(markers[0].trend).toBe('melhorou'); // era 82 (alterado) → 35 (normal)
  });

  it('exame 2018 alterado SEM resultado posterior → DESATUALIZADO + confidence baixa', () => {
    const old = new Date('2018-03-01');
    const rows = [mk('TGP', 'TGP', 82, old, true)];
    const markers = computeMarkerState(rows);
    expect(markers[0].temporalClass).toBe('desatualizado');
    expect(markers[0].outdated).toBe(true);
    expect(markers[0].confidence).toBe('baixa');
  });

  it('exame normal antigo e alterado recentemente → prioridade do RECENTE', () => {
    const rows = [
      mk('GLICOSE', 'GLICOSE', 120, new Date('2026-07-01'), true), // recente alterado
      mk('GLICOSE', 'GLICOSE', 85, new Date('2020-01-01'), false), // antigo normal
    ];
    const markers = computeMarkerState(rows);
    expect(markers[0].latest.valueNumeric).toBe(120); // 2026 é latest
    expect(markers[0].isAbnormal).toBe(true);
    expect(markers[0].temporalClass).toBe('atual');
    expect(markers[0].trend).toBe('piorou'); // normal → alterado
  });

  it('TSH 05/03 + 06/03 mesmo valor (reenvio cross-day) → colapsa no estado do marcador', () => {
    // Caso real do Edmilson: painel tireoidiano 05/03 + bundle "HEMOGRAMA COMPLETO" 06/03,
    // ambos TSH=25.7. Antes do dedup cross-day ficavam 2 pontos no mesmo valor.
    const rows = [
      mk('TSH', 'TSH', 25.7, new Date('2026-03-06'), true),
      mk('TSH', 'TSH', 25.7, new Date('2026-03-05'), true),
      mk('TSH', 'TSH', 2.6, new Date('2025-05-05'), false),
    ];
    const markers = computeMarkerState(rows);
    expect(markers[0].points).toBe(2); // 05/03/26 + 05/25 (o 06/03 colapsou no 05/03)
    expect(markers[0].latest.valueNumeric).toBe(25.7);
    expect(markers[0].latest.performedAt).toEqual(new Date('2026-03-05')); // mantém data de coleta
  });

  it('classifyTemporal: buckets corretos', () => {
    expect(classifyTemporal(3, false)).toBe('atual');
    expect(classifyTemporal(8, false)).toBe('recente');
    expect(classifyTemporal(20, false)).toBe('historico');
    expect(classifyTemporal(50, false)).toBe('antigo');
    expect(classifyTemporal(50, true)).toBe('desatualizado'); // antigo + era anormal
    // Revisão 2026-07: data de coleta ausente NÃO é 'recente' (estado atual) — antes um exame
    // antigo sem data virava "fresco". Agora é 'historico' (conservador: não representa o agora).
    expect(classifyTemporal(null, false)).toBe('historico');
  });
});
