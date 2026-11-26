// Leitura dupla de foto difícil (26/11/26): só entra no exame o que as DUAS leituras confirmam.
// As transcrições abaixo reproduzem o caso real (hemograma de lado, baixa resolução) com dados fictícios.
import { describe, it, expect, vi, afterEach } from 'vitest';
process.env.VISION_RETRY_WAIT_MS = '1'; // sem espera entre rodadas no teste
import { parseVisionText, reconcileReads, visionReadPhoto, VISION_MIN_AGREED } from '../src/extraction/visionRead';
import * as aiConfig from '../src/llm/ai-config';

const READ_A = `TIPO: exame

Clínica Exemplo
Data: 20/11/2026
Nome do Utente: Fulano de Ta[?]

NOME | RESULTADO | UNIDADE | REFERÊNCIA
WBC | 5.7 | 10^9/L | 4.0 - 10.0
HGB | 13.6 | g/dL | 12.0 - 16.0
MCHC | 319 | g/L | 320 - 360
PLT | 334 | 10^9/L | 150 - 500
PDW | 16.2 | [?] | 15.0 - 17.0
PCT | 2.82 | mL/L | 1.08 - 2.82
MPV | [?] | fL | 6.5 - 12.0
RBC | 4.73 | 10^12/L | 4.00 - 5.50`;

const READ_B = `TIPO: exame
Clínica Exemplo
Data: 20/11/2026
Nome do Utente: Fulano de Tal
Módulos | Result. | Unid. | Ref. Intervalos
WBC | 5,7 | 10^9/L | 4.0 - 10.0
HGB | 13.6 | g/dL | 12.0 - 16.0
MCHC | 319 | g/L | 320 - 360
PLT | 334 | 10^9/L | 150 - 350
PDW | 16.2 | [?] | 15.0 - 17.0
PCT | 0.32 | mL/L | 1.08 - 2.82
MPV | 8.4 | fL | 6.5 - 12.0
P-LCC | 60 | 10^9/L | 30 - 90`;

describe('parseVisionText', () => {
  it('separa tipo, cabeçalho e linhas de resultado; ignora a linha de título da tabela', () => {
    const a = parseVisionText(READ_A);
    expect(a.isExam).toBe(true);
    expect(a.header).toEqual(['Clínica Exemplo', 'Data: 20/11/2026', 'Nome do Utente: Fulano de Ta[?]']);
    expect(a.rows).toHaveLength(8);
    expect(a.rows[0]).toEqual({ name: 'WBC', result: '5.7', unit: '10^9/L', ref: '4.0 - 10.0' });
    expect(parseVisionText(READ_B).rows.map((r) => r.name)).not.toContain('Módulos');
  });
  it('sem a linha TIPO: exame não é tratado como exame', () => {
    expect(parseVisionText('TIPO: nao_exame').isExam).toBe(false);
    expect(parseVisionText('WBC | 5.7 | x | y').isExam).toBe(false);
    expect(parseVisionText('').rows).toEqual([]);
  });
});

describe('reconcileReads — só fica o que as duas leituras confirmam', () => {
  const rec = reconcileReads(parseVisionText(READ_A), parseVisionText(READ_B));

  it('resultado igual fica (vírgula e ponto são o mesmo número)', () => {
    expect(rec.agreed).toBe(5);
    expect(rec.text).toContain('WBC | 5.7 | 10^9/L | 4.0 - 10.0');
    expect(rec.text).toContain('HGB | 13.6 | g/dL | 12.0 - 16.0');
    expect(rec.text).toContain('MCHC | 319 | g/L | 320 - 360');
  });
  it('resultado diferente, com [?] ou visto por uma leitura só sai do texto e vira dúvida', () => {
    expect(rec.unsure).toEqual(['PCT', 'MPV', 'RBC', 'P-LCC']);
    for (const n of ['PCT', 'MPV', 'RBC', 'P-LCC', '2.82', '0.32', '4.73']) expect(rec.text).not.toContain(n);
  });
  it('faixa de referência diferente: o resultado fica, a faixa sai', () => {
    expect(rec.refDropped).toEqual(['PLT']);
    expect(rec.text).toContain('PLT | 334 | 10^9/L | ');
    expect(rec.text).not.toMatch(/150 - (350|500)/);
  });
  it('unidade com [?] sai, resultado fica', () => {
    expect(rec.text).toContain('PDW | 16.2 |  | 15.0 - 17.0');
  });
  it('cabeçalho: só linhas iguais nas duas e sem [?]', () => {
    expect(rec.text).toContain('Clínica Exemplo');
    expect(rec.text).toContain('Data: 20/11/2026');
    expect(rec.text).not.toContain('Fulano');
  });
});

describe('reconcileReads — valor solto sem nome de exame não segue', () => {
  it('"2.8 mg/L" no cabeçalho vira dúvida; data e texto normal continuam', () => {
    const read = `TIPO: exame
Data: 20/11/2026
Não observou-se plasmódio
2.8 mg/L
< 0,5
WBC | 5.7 | x | 1 - 2`;
    const rec = reconcileReads(parseVisionText(read), parseVisionText(read));
    expect(rec.text).toContain('Data: 20/11/2026');
    expect(rec.text).toContain('Não observou-se plasmódio');
    expect(rec.text).not.toContain('2.8 mg/L');
    expect(rec.unsure).toEqual(['um resultado sem nome legível (2.8 mg/L)', 'um resultado sem nome legível (< 0,5)']);
  });
});

describe('visionReadPhoto — quando NÃO vira exame', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const withGemini = (model = 'gemini-3.5-flash') => vi.spyOn(aiConfig, 'resolveProviderConfig').mockReturnValue({ provider: 'gemini', apiKey: 'k-teste', baseURL: '', model } as any);
  const reply = (text: string) => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 1 } }) });
  const img = Buffer.from('x');

  it('sem chave Gemini → indisponível, sem chamada de rede', async () => {
    vi.spyOn(aiConfig, 'resolveProviderConfig').mockReturnValue({ provider: 'gemini', apiKey: '', baseURL: '', model: 'gemini-3.5-flash' } as any);
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    expect((await visionReadPhoto(img, 'image/jpeg')).kind).toBe('unavailable');
    expect(f).not.toHaveBeenCalled();
  });
  it('só um modelo responde → indisponível (uma leitura sozinha nunca vira exame)', async () => {
    withGemini();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).includes('gemini-3.5-flash:') ? reply(READ_A) : { ok: false, status: 429, json: async () => ({}) })));
    expect(await visionReadPhoto(img, 'image/jpeg')).toMatchObject({ kind: 'unavailable', why: 'só uma leitura disponível' });
  });
  it('as duas dizem que não é exame → not_exam; se discordam → indisponível', async () => {
    withGemini();
    vi.stubGlobal('fetch', vi.fn(async () => reply('TIPO: nao_exame')));
    expect((await visionReadPhoto(img, 'image/jpeg')).kind).toBe('not_exam');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => reply(String(url).includes('lite') ? 'TIPO: nao_exame' : READ_A)));
    expect((await visionReadPhoto(img, 'image/jpeg')).kind).toBe('unavailable');
  });
  it('modelo principal sobrecarregado (503) → um leitor de reserva faz a segunda leitura', async () => {
    withGemini();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('gemini-3.5-flash:')) return { ok: false, status: 503, json: async () => ({}) };
      return reply(String(url).includes('lite') ? READ_B : READ_A);
    }));
    const out = await visionReadPhoto(img, 'image/jpeg');
    expect(out).toMatchObject({ kind: 'exam', agreed: 5 });
    expect((out as any).models).toEqual(['gemini-3.5-flash-lite', 'gemini-2.5-flash']);
  });
  it('503 que passa: a segunda passada consegue a leitura que faltava', async () => {
    withGemini();
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('gemini-2.5')) return { ok: false, status: 404, json: async () => ({}) };
      if (u.includes('gemini-3.5-flash:') && n++ < 1) return { ok: false, status: 503, json: async () => ({}) };
      return reply(u.includes('lite') ? READ_B : READ_A);
    }));
    expect((await visionReadPhoto(img, 'image/jpeg')).kind).toBe('exam');
  });
  it(`menos de ${VISION_MIN_AGREED} resultados iguais → indisponível`, async () => {
    withGemini();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => reply(String(url).includes('lite') ? 'TIPO: exame\nWBC | 9.9 | x | y\nHGB | 13.6 | g/dL | 1 - 2' : 'TIPO: exame\nWBC | 5.7 | x | y\nHGB | 13.6 | g/dL | 1 - 2')));
    expect((await visionReadPhoto(img, 'image/jpeg')).kind).toBe('unavailable');
  });
  it('duas leituras de exame → devolve só o confirmado e a lista de dúvidas; a chave vai no cabeçalho, não na URL', async () => {
    withGemini();
    const f = vi.fn(async (url: string) => reply(String(url).includes('lite') ? READ_B : READ_A));
    vi.stubGlobal('fetch', f);
    const out = await visionReadPhoto(img, 'image/jpeg');
    expect(out).toMatchObject({ kind: 'exam', agreed: 5, unsure: ['PCT', 'MPV', 'RBC', 'P-LCC'], models: ['gemini-3.5-flash', 'gemini-3.5-flash-lite'] });
    expect(f).toHaveBeenCalledTimes(2);
    for (const [url, init] of f.mock.calls as any[]) {
      expect(String(url)).not.toContain('k-teste');
      expect(init.headers['x-goog-api-key']).toBe('k-teste');
    }
  });
});
