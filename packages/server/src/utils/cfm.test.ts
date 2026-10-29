import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { lookupCfm, cfmState, BR_UFS } from './cfm';

// lookupCfm exige CONSULTA_CRM_KEY; sem ela retorna null sem chamar fetch.
// (lida no momento da chamada → basta definir antes de chamar.)
process.env.CONSULTA_CRM_KEY = 'test-key';

describe('lookupCfm (consultaCRM)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('parseia JSON do consultaCRM → CfmDoctor normalizado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'true', total: 1, item: [{ nome: 'ENRICO DO AMARAL FONSECA', profissao: 'CIRURGIA DO APARELHO DIGESTIVO', numero: '116739', uf: 'SP', situacao: 'Ativo' }], api_consultas: '1', api_limite: '100' }),
    }));
    const r = await lookupCfm('116739', 'SP');
    expect(r).not.toBeNull();
    expect(r!.name).toBe('ENRICO DO AMARAL FONSECA');
    expect(r!.specialty).toBe('CIRURGIA DO APARELHO DIGESTIVO');
    expect(r!.crm).toBe('116739-SP');
    expect(r!.uf).toBe('SP');
    expect(r!.situation).toBe('Ativo');
    expect(r!.source).toBe('cfm');
  });

  it('aceita CRM com sufixo ("116739-SP") e extrai só dígitos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'true', item: [{ nome: 'Dra. Maria', profissao: 'Neurologia', numero: '116739', uf: 'SP' }] }) }));
    const r = await lookupCfm('116739-SP', 'sp');
    expect(r!.crm).toBe('116739-SP');
  });

  it('status != "true" (não encontrado) → null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'false', total: 0, mensagem: 'não encontrado', item: [] }) }));
    expect(await lookupCfm('999999', 'SP')).toBeNull();
  });

  it('timeout/abort → null (degrada sem lançar)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise((_res, rej) => setTimeout(() => rej(new Error('aborted')), 5))));
    expect(await lookupCfm('116739', 'SP')).toBeNull();
  });

  it('resposta não-ok (500/cota) → null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    expect(await lookupCfm('116739', 'SP')).toBeNull();
  });

  it('sem chave (CONSULTA_CRM_KEY vazia) → null SEM chamar fetch', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const saved = process.env.CONSULTA_CRM_KEY;
    delete process.env.CONSULTA_CRM_KEY;
    expect(await lookupCfm('116739', 'SP')).toBeNull();
    expect(f).not.toHaveBeenCalled();
    process.env.CONSULTA_CRM_KEY = saved;
  });

  it('validação: CRM vazio ou UF inválida → null SEM fetch', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await lookupCfm('', 'SP')).toBeNull();
    expect(await lookupCfm('116739', '')).toBeNull();
    expect(await lookupCfm('116739', 'SPX')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe('cfmState (situação do CFM em 3 estados)', () => {
  it('Ativo → active', () => { expect(cfmState('Ativo')).toBe('active'); expect(cfmState('ATIVO')).toBe('active'); });
  it('"Inativo" NÃO é ativo (regressão do /ativo/i do cadastro)', () => expect(cfmState('Inativo')).toBe('inactive'));
  it('cancelado/cassado/suspenso/falecido → inactive', () => {
    for (const s of ['Cancelado', 'Cassado', 'Suspenso', 'Falecido']) expect(cfmState(s)).toBe('inactive');
  });
  it('vazio ou desconhecido → unknown', () => {
    expect(cfmState('')).toBe('unknown');
    expect(cfmState(null)).toBe('unknown');
    expect(cfmState('Regular')).toBe('unknown');
  });
  it('ambíguo (ativo + termo de inatividade) → unknown, nunca active', () => { expect(cfmState('Ativo - Aposentado')).toBe('unknown'); });
  it('só a palavra "Ativo"/"Ativa" sozinha é active (caixa e espaços nas pontas não importam)', () => {
    for (const s of ['Ativa', 'ATIVA', 'ativo', ' Ativo ']) expect(cfmState(s), s).toBe('active');
  });
  it('"Ativo" qualificado ("Ativo - …", "Ativo (…)") → unknown, nunca active', () => {
    for (const s of ['Ativo - Cassação', 'Ativo - Licenciado', 'Ativo (Provisório)']) expect(cfmState(s), s).toBe('unknown');
  });
  it('substantivos de inatividade (Cassação, Cancelamento, Falecimento…) → inactive', () => {
    for (const s of ['Cassação', 'Cancelamento', 'Falecimento', 'Interdição cautelar', 'Transferência', 'Suspensão', 'Baixa', 'Aposentadoria']) {
      expect(cfmState(s), s).toBe('inactive');
    }
  });
});

describe('BR_UFS', () => {
  it('as 27 UFs exatas (lista ordenada); ZZ fora', () => {
    expect([...BR_UFS].sort()).toEqual([
      'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB',
      'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
    ]);
    expect(BR_UFS.size).toBe(27);
    expect(BR_UFS.has('SP')).toBe(true);
    expect(BR_UFS.has('ZZ')).toBe(false);
  });
});
