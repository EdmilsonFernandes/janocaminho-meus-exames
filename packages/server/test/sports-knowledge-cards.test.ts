import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { matchSportsKnowledge } from '../src/analysis/sports-knowledge';

// P1 blueprint AAS (docs/design/2026-10-26-musculacao-saude-AAS.md §5) — 4 cards NOVOS em
// knowledge/sports/. Registro = front-matter (topic/markers) lido pelo loader do
// sports-knowledge.ts; gate DRAFT (revisão médica E6) herdado do banner de cada .md.
// Teste unit seco: sem DB, sem LLM — só filesystem + matcher.

const DIR = path.join(__dirname, '..', 'knowledge', 'sports');
const NEW_CARDS = ['PSA.md', 'GLICEMIA_HBA1C.md', 'GGT_FA_BILIRRUBINA.md', 'PRESSAO_ARTERIAL.md'] as const;
const DISCLAIMER = 'Exames acompanham; não tornam o uso seguro.';
/** Fonte citada: padrão do blueprint (\(AUA|PMID|HAARLEM|FDA|doi) OU fonte por extenso. */
const SOURCE_RE = /\(AUA|PMID|HAARLEM|FDA|doi|Rasmussen|Mulhall|Smit|Di Girolamo|NSW Health|ACC Expert/i;
/** Linguagem vedada §6 — nenhuma superfície pode conter (lint manual deste arquivo). */
const BANNED_RE = /ciclo seguro|dose segura|comece TPC|reduza a dose|pause o ciclo/i;

const read = (f: string) => fs.readFileSync(path.join(DIR, f), 'utf8');

describe('P1 AAS — cards knowledge sports (DRAFT até gate E6)', () => {
  it('os 4 cards novos existem no diretório da knowledge base', () => {
    for (const f of NEW_CARDS) expect(fs.existsSync(path.join(DIR, f)), f).toBe(true);
  });

  it('registram no matcher: PSA/glicemia/HbA1c/GGT-FA-bili por canonical; PA (sem analito de lab) por texto', () => {
    const topicsOf = (...args: Parameters<typeof matchSportsKnowledge>) =>
      matchSportsKnowledge(...args).map((c) => c.topic);
    expect(topicsOf(['PSA'])).toContain('psa-androgenos');
    expect(topicsOf(['GLICEMIA'])).toContain('glicemia-hba1c');
    expect(topicsOf(['HEMOGLOBINA_GLICADA'])).toContain('glicemia-hba1c');
    expect(topicsOf(['GAMA_GT'])).toContain('ggt-fa-bilirrubina');
    expect(topicsOf(['BILIRRUBINA TOTAL'])).toContain('ggt-fa-bilirrubina');
    expect(topicsOf(['FOSFATASE ALCALINA'])).toContain('ggt-fa-bilirrubina');
    // Pressão arterial não tem analito de laboratório — só casa pelo texto da pergunta.
    expect(topicsOf([], 'como acompanho minha pressão arterial em casa?')).toContain('pressao-arterial-aas');
  });

  it('todos herdam o banner DRAFT (pendente revisão por médico responsável)', () => {
    for (const f of NEW_CARDS) expect(read(f), f).toMatch(/DRAFT — pendente revisão por médico/i);
  });

  it('cada card novo cita fonte (padrão \(AUA|PMID|HAARLEM|FDA|doi ou por extenso)', () => {
    for (const f of NEW_CARDS) expect(read(f), f).toMatch(SOURCE_RE);
  });

  it('cada card novo fecha com o disclaimer fixo do blueprint §6', () => {
    for (const f of NEW_CARDS) expect(read(f), f).toContain(DISCLAIMER);
  });

  it('nenhum card novo contém linguagem vedada (ciclo seguro, dose segura, TPC, dose/pausa)', () => {
    for (const f of NEW_CARDS) expect(BANNED_RE.test(read(f)), f).toBe(false);
  });
});
