import type { Response } from 'express';
import { getLlm, getModel } from '../llm';
import { HEALTH_SYSTEM, diagnosticGuard } from './system';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Faz streaming de uma resposta de chat via SSE (Server-Sent Events).
 * O system + o contexto do exame usam prompt caching (cache_control) p/ baratear turnos.
 * Devolve o texto completo (após pós-filtro não-diagnóstico).
 */
export async function streamChat(opts: {
  res: Response;
  contextText: string;
  history: ChatTurn[];
  message: string;
}): Promise<{ text: string; model: string }> {
  const { res, contextText, history, message } = opts;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const messages: any[] = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  let full = '';
  const s = await getLlm().stream({
    model: getModel(),
    maxTokens: 900,
    system: [
      HEALTH_SYSTEM,
      contextText,
      'ESTILO DO CHAT: responda APENAS o que foi perguntado, direto ao ponto. Resposta CURTA (30-80 palavras), português simples. SEM introduções, SEM repetir a pergunta ou contexto já dado, SEM tutoriais ou desvios. Só mencione um exame/valor se a pergunta for sobre ele (não liste por iniciativa própria). Destaque com **negrito** e listas (-) quando ajudar; NUNCA asteriscos crus. Se a pergunta assustar, acalme com FATOS do exame dele e oriente o médico.',
    ],
    messages,
  });

  s.onText((delta) => {
    full += delta;
    res.write(`data: ${JSON.stringify({ type: 'delta', delta })}\n\n`);
  });

  const { usage, model } = await s.final();
  const guarded = diagnosticGuard(full);
  if (guarded.flagged) {
    // envia o disclaimer extra como um delta final
    res.write(`data: ${JSON.stringify({ type: 'disclaimer', delta: '\n\n*⚠️ Análise educativa — não substitui avaliação médica.*' })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ type: 'done', usage, model })}\n\n`);
  res.end();
  return { text: guarded.text, model: model ?? getModel() ?? 'glm-4.6' };
}
