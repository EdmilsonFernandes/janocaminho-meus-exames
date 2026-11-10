import { getLlm, getModel } from '../llm';
import { withQuickRetry } from '../utils/retry';

/**
 * explainNonExamDoc — camada conversacional para documentos que NÃO são exame
 * (dono 10/11: "a IA ler, entender o que é e responder como conversando").
 *
 * Onde ela vive: DEPOIS do KB determinístico (classes conhecidas continuam
 * instantâneas e grátis) e do guard de 0-itens — ou seja, só roda quando o
 * documento escapou de tudo: é a fallback personalizada. A IA lê o texto real
 * e devolve 2 frases acolhedoras citando UM detalhe específico do documento.
 *
 * Freios (anti-alucinação): prompt restrito ao que está no papel, sem conselho
 * médico, ≤2 frases; validação de tamanho; falha → null (caller usa o texto
 * fixo). Custo: 1 chamada pequena (≤400 tokens de saída) só em rejeições.
 */
const SYSTEM = `Você é o Dr. Exame, o assistente de um app brasileiro que lê exames laboratoriais. Um usuário enviou um documento que NÃO é um resultado de exame.
Escreva em português do Brasil, tom acolhedor e simples, no MÁXIMO 2 frases curtas:
1) o que o documento parece ser, citando UM detalhe específico que esteja escrito nele (nome do exame, local, código, data, profissional);
2) o que a pessoa pode fazer (ex.: esperar o resultado e enviar depois, guardar o documento, levar na consulta).
REGRAS INEGOCIÁVEIS: use SOMENTE informações escritas no documento — nunca invente nada; NUNCA dê conselho médico, diagnóstico ou interpretação clínica; sem emojis; sem listas; devolva apenas o texto corrido.`;

export async function explainNonExamDoc(text: string): Promise<string | null> {
  const t = (text || '').trim().slice(0, 4000); // custo bornado: o essencial do doc
  if (t.length < 20) return null; // sem texto pra conversar — caller usa o fixo
  try {
    const s = await withQuickRetry(() => getLlm().stream({
      model: getModel(),
      maxTokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Documento enviado (OCR):\n\n${t}\n\nResponda como pedido.` }],
    }));
    const resp = await s.final();
    const out = (resp.text || '').trim().replace(/^["“'`]+|["”'`]+$/g, '').replace(/\s+/g, ' ');
    if (out.length < 10 || out.length > 400) return null;
    // Defesa extra: se a IA tentou virar médica apesar do prompt, descarta.
    if (/diagn[oó]stic[oa] (é|e:|:)|recomend[oa] (que )?(procure|tome|suspender|medicamento)/i.test(out)) return null;
    return out;
  } catch {
    return null; // IA fora → texto fixo do guard (nunca bloqueia a rejeição)
  }
}
