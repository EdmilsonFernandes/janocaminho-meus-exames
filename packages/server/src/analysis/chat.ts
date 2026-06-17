import type { Response } from 'express';
import { getAnthropic, MODEL } from '../claude/client';
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
  const client = getAnthropic();

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
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 900,
    system: [
      { type: 'text', text: HEALTH_SYSTEM, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: contextText, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'ESTILO DO CHAT: seja CONCISO e DIRETO. Resposta curta (em geral 80-150 palavras), português simples. Vá direto ao ponto, NÃO repita a pergunta. Use markdown enxuto (negrado + listas curtas). Se o usuário perguntar algo assustador ("posso morrer?"), acalme com FATOS concretos do exame dele e oriente o médico — sem textão nem rodeios.' },
    ],
    messages,
  } as any);

  stream.on('text', (delta) => {
    full += delta;
    res.write(`data: ${JSON.stringify({ type: 'delta', delta })}\n\n`);
  });

  const final = await stream.finalMessage();
  const guarded = diagnosticGuard(full);
  if (guarded.flagged) {
    // envia o disclaimer extra como um delta final
    res.write(`data: ${JSON.stringify({ type: 'disclaimer', delta: '\n\n*⚠️ Análise educativa — não substitui avaliação médica.*' })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ type: 'done', usage: final.usage, model: final.model })}\n\n`);
  res.end();
  return { text: guarded.text, model: final.model };
}
