import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { lookupCfm } from './cfm';

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
