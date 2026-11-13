import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, authHeader, createUser, resetDb } from './helpers';
import { prisma } from '../src/prisma';
import { COMPOUND_CATALOG, COMPOUND_SECTION_KEYS, compoundTextProblems, type CompoundSections } from '../src/analysis/compound-explain';

const GOOD: CompoundSections = {
  oQueE: 'É uma forma de testosterona, o principal hormônio masculino, aplicada por injeção. Ela age por bastante tempo depois de cada aplicação.',
  noCorpo: 'Aumenta a força e a massa muscular, mas o corpo percebe o hormônio de fora e reduz a própria produção. Parte dela vira estradiol.',
  porQueUsam: 'Médicos prescrevem para homens com falta de testosterona comprovada. É medicamento controlado, e os médicos são proibidos de prescrever para estética ou desempenho; ainda assim, há quem use sem receita.',
  nosExames: 'O médico costuma acompanhar os glóbulos vermelhos, o colesterol e os hormônios. Exame normal não descarta dano: alguns efeitos não aparecem no sangue.',
  riscos: 'Pode afetar a fertilidade e reduzir os testículos. Pode pesar no coração e na pressão. O sangue pode ficar mais espesso. Em mulheres, alguns efeitos podem não voltar.',
  levarAoMedico: 'Quais exames devo acompanhar? | Isso afeta minha fertilidade? | O que muda se eu quiser interromper? Contar tudo o que você usa ajuda e é protegido por sigilo.',
};

const llm = vi.hoisted(() => ({ replies: [] as string[], calls: 0 }));
vi.mock('../src/llm', () => ({
  getLlm: () => ({ stream: async () => ({ final: async () => ({ text: llm.replies[Math.min(llm.calls++, llm.replies.length - 1)] ?? '' }) }) }),
  getModel: () => 'test-model',
}));

describe('travas do texto do composto', () => {
  it('texto bom passa', () => expect(compoundTextProblems(GOOD)).toEqual([]));

  it.each([
    ['dose', { noCorpo: `${GOOD.noCorpo} A dose comum é 200 mg.` }, 'cita dose'],
    ['esquema', { noCorpo: `${GOOD.noCorpo} Costuma ser aplicada 2x por semana.` }, 'cita esquema de uso'],
    ['TPC', { riscos: `${GOOD.riscos} Depois é preciso fazer TPC.` }, 'fala de ciclo/TPC'],
    ['segurança', { oQueE: `${GOOD.oQueE} É leve e boa para iniciantes.` }, 'adjetivo de segurança'],
    ['conduta', { riscos: `${GOOD.riscos} Pare de usar imediatamente.` }, 'orienta conduta'],
    ['aquisição', { oQueE: `${GOOD.oQueE} Veja como comprar o produto original.` }, 'fala de aquisição'],
  ])('reprova texto com %s', (_n, patch, problem) => {
    expect(compoundTextProblems({ ...GOOD, ...patch })).toContain(problem);
  });

  it('reprova seção faltando', () => {
    expect(compoundTextProblems({ ...GOOD, riscos: '' })).toContain('seção curta ou ausente: riscos');
  });

  it('o catálogo cobre os 13 compostos do Radar e nenhum fato cita dose', () => {
    expect(Object.keys(COMPOUND_CATALOG)).toHaveLength(13);
    for (const fact of Object.values(COMPOUND_CATALOG)) expect(fact.facts).not.toMatch(/\d+\s?(mg|ml)\b/i);
  });
});

describe('API /items/compound-explain', () => {
  beforeEach(async () => { await resetDb(); llm.calls = 0; llm.replies = [JSON.stringify(GOOD)]; });

  it('1ª consulta gera e grava; a 2ª (de outro usuário) lê do banco sem chamar a IA', async () => {
    const a = await createUser();
    const b = await createUser();
    const first = await api().post('/api/items/compound-explain').set(authHeader(a.token)).send({ id: 'test_cyp' });
    expect(first.status).toBe(200);
    expect(first.body.name).toContain('Cipionato');
    expect(Object.keys(first.body.sections).sort()).toEqual([...COMPOUND_SECTION_KEYS].sort());
    expect(llm.calls).toBe(1);
    const second = await api().post('/api/items/compound-explain').set(authHeader(b.token)).send({ id: 'test_cyp' });
    expect(second.body.sections).toEqual(first.body.sections);
    expect(llm.calls).toBe(1);
    expect(await prisma.compoundKnowledge.count()).toBe(1);
  });

  it('texto reprovado NÃO é publicado nem gravado; tenta de novo e aceita o bom', async () => {
    const u = await createUser();
    llm.replies = [JSON.stringify({ ...GOOD, noCorpo: `${GOOD.noCorpo} Use 500 mg.` }), JSON.stringify(GOOD)];
    const ok = await api().post('/api/items/compound-explain').set(authHeader(u.token)).send({ id: 'oxand' });
    expect(ok.status).toBe(200);
    expect(llm.calls).toBe(2);
    expect(JSON.stringify(ok.body.sections)).not.toContain('500 mg');

    llm.calls = 0;
    llm.replies = [JSON.stringify({ ...GOOD, riscos: `${GOOD.riscos} É seguro.` })];
    const bad = await api().post('/api/items/compound-explain').set(authHeader(u.token)).send({ id: 'tren_ace' });
    expect(bad.status).toBe(502);
    expect(await prisma.compoundKnowledge.count({ where: { compoundKey: 'tren_ace' } })).toBe(0);
  });

  it('id fora do catálogo → 404 sem chamar a IA; sem login → 401', async () => {
    const u = await createUser();
    for (const id of ['cocaina', '__proto__', '']) {
      expect((await api().post('/api/items/compound-explain').set(authHeader(u.token)).send({ id })).status).toBe(404);
    }
    expect(llm.calls).toBe(0);
    expect((await api().post('/api/items/compound-explain').send({ id: 'test_cyp' })).status).toBe(401);
  });
});
