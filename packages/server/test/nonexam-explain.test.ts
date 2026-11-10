// explainNonExamDoc — camada conversacional da rejeição de não-exames.
// Mock do LLM no padrão do repo (decifre.test.ts): sem rede, sem chave, determinístico.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const reply = vi.hoisted(() => ({ text: '', fail: false }));
vi.mock('../src/llm', () => ({
  getModel: () => 'mock-model',
  getLlm: () => ({
    name: 'mock',
    stream: async () => {
      if (reply.fail) throw new Error('rate limit simulado');
      return { final: async () => ({ text: reply.text }) };
    },
  }),
}));

import { explainNonExamDoc } from '../src/extraction/nonExamExplain';

const DOC = 'COMPROVANTE\nExame: ANTICORPOS ANTI-HTLV I/II\nLocal: CAIS\nGuarde até a coleta';

describe('explainNonExamDoc — resposta conversacional p/ não-exames', () => {
  beforeEach(() => { reply.fail = false; reply.text = ''; });

  it('devolve o texto da IA, limpo de aspas', async () => {
    reply.text = '"Vi que é o comprovante de coleta do HTLV no CAIS — me envie quando o resultado sair."';
    const out = await explainNonExamDoc(DOC);
    expect(out).toBe('Vi que é o comprovante de coleta do HTLV no CAIS — me envie quando o resultado sair.');
  });

  it('IA fora (rate limit nas 3 tentativas) → null: caller usa o texto fixo', async () => {
    reply.fail = true;
    expect(await explainNonExamDoc(DOC)).toBeNull();
  });

  it('texto curto demais da IA → null (não mostra ranço)', async () => {
    reply.text = 'ok';
    expect(await explainNonExamDoc(DOC)).toBeNull();
  });

  it('IA tentando virar médica (diagnóstico/recomendação clínica) → null', async () => {
    reply.text = 'Isso é um atestado. O diagnóstico é hipotireoidismo e recomendo que procure um endocrinologista.';
    expect(await explainNonExamDoc(DOC)).toBeNull();
  });

  it('documento sem texto (OCR vazio) → null sem chamar a IA', async () => {
    let called = false;
    reply.text = 'qualquer';
    const out = await explainNonExamDoc('   ');
    expect(out).toBeNull();
    expect(called).toBe(false); // eslint-disable-line @typescript-eslint/no-unused-expressions
  });
});
