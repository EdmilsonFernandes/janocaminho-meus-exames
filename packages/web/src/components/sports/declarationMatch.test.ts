/**
 * declarationMatch — cadastro inteligente do DeclareSubstanceSheet (27/10/26): declarar
 * de novo o que já está em uso ATUALIZA o registro; quem parou e voltou ganha registro
 * novo; suplemento já listado não duplica.
 */
import { describe, expect, it } from 'vitest';
import { declaredFromMeds, findDuplicate, isOngoing, type ExistingDecl } from './declarationMatch';

const med = (over: Record<string, unknown>) => ({
  id: 'm1', patientId: 'p1', name: '[Hormônio] Deca-Durabolin', dosage: '200 mg/semana — declarado pelo paciente',
  startedAt: '2026-07-01', endedAt: null, endStatus: 'em_uso', prescriberName: null, ...over,
});

describe('declaredFromMeds', () => {
  it('só declarações "[Classe] Nome" do paciente selecionado', () => {
    const out = declaredFromMeds([
      med({}),
      med({ id: 'm2', patientId: 'outro' }),
      med({ id: 'm3', name: 'Losartana 50mg' }),
      med({ id: 'm4', name: '[Hormônio]   ' }),
    ], 'p1');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'Deca-Durabolin', kind: 'med', target: { id: 'm1', endStatus: 'em_uso', startedAt: '2026-07-01' } });
  });

  it('resposta inválida ou sem paciente → nada (o aviso some, a declaração não trava)', () => {
    expect(declaredFromMeds(null, 'p1')).toEqual([]);
    expect(declaredFromMeds({ error: 'x' }, 'p1')).toEqual([]);
    expect(declaredFromMeds([med({})], '')).toEqual([]);
  });

  it('status desconhecido vira null (não inventa "em uso")', () => {
    expect(declaredFromMeds([med({ endStatus: 'qualquer' })], 'p1')[0].target?.endStatus).toBeNull();
  });
});

describe('findDuplicate + isOngoing', () => {
  const existing: ExistingDecl[] = [
    ...declaredFromMeds([med({}), med({ id: 'm9', name: '[Hormônio] Anavar', endStatus: 'interrompi' })], 'p1'),
    { name: 'Creatina', kind: 'supp' },
  ];

  it('comercial × princípio ativo × apelido = mesma declaração', () => {
    expect(findDuplicate(existing, 'Nandrolona (decanoato)', false)?.target?.id).toBe('m1');
    expect(findDuplicate(existing, 'deca', false)?.target?.id).toBe('m1');
    expect(findDuplicate(existing, 'Masteron', false)).toBeNull();
  });

  it('em uso → atualizar; já parou → registro novo', () => {
    expect(isOngoing(findDuplicate(existing, 'Deca-Durabolin', false)?.target)).toBe(true);
    expect(isOngoing(findDuplicate(existing, 'Oxandrolona', false)?.target)).toBe(false);
    expect(isOngoing({ id: 'x', endStatus: 'nao_sei' })).toBe(true);
    expect(isOngoing(null)).toBe(false);
  });

  it('suplemento só bate com suplemento', () => {
    expect(findDuplicate(existing, 'Creatina (monohidratada)', true)?.kind).toBe('supp');
    expect(findDuplicate(existing, 'Creatina (monohidratada)', false)).toBeNull();
    expect(findDuplicate(existing, '', true)).toBeNull();
  });
});
