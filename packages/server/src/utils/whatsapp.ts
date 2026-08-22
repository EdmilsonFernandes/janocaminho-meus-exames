/**
 * WhatsApp Cloud API (Meta) — canal de "exame pronto".
 *
 * Pesquisa ago/2026 (research-dr-exame-2026/): nenhum intérprete de exames do mundo
 * notifica por WhatsApp; Hermes Pardini entrega RESULTADO por zap desde 2014 e o
 * Dr. Consulta fatura R$1,2M/mês com IA no canal. BR = WhatsApp-shaped.
 *
 * SETUP (uma vez, ~15min):
 *   1. Meta Business Manager → WhatsApp Manager → cadastrar o NÚMERO DA EMPRESA
 *      (12) 3933-4979 — conta WhatsApp Business — e gerar o token permanente do sistema.
 *   2. Criar template (categoria UTILITY) nome `exame_pronto`, idioma pt_BR, corpo:
 *      "{{1}}, seu exame \"{{2}}\" foi lido — {{3}} valores analisados. Abra o Dr. Exame para ver o que mudou."
 *      → aguardar aprovação (costuma sair em minutos-horas).
 *   3. Produção (.env.prod): WHATSAPP_TOKEN=<token permanente do sistema>,
 *      WHATSAPP_PHONE_ID=<phone number id do (12) 3933-4979>.
 *   4. Sem as env vars o sender vira NO-OP silencioso (nada quebra; log único no boot).
 *
 * LGPD/consentimento: o telefone vem do PERFIL do usuário (dado que ele cadastrou);
 * a mensagem não contém dado clínico — só o nome do exame e a contagem de valores.
 */
const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const TEMPLATE = process.env.WHATSAPP_TEMPLATE || 'exame_pronto';
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

let warnedOnce = false;

/** Normaliza p/ o formato da API: só dígitos, com DDI.
 *  Heurística BR: 10 dígitos (fixo) ou 11 com 9 na 3ª posição (celular), DDD 11–99 → 55.
 *  Qualquer outra coisa (já com 55, internacional etc.) passa direto. */
export function normalizeWhatsappPhone(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  const ddd = Number(digits.slice(0, 2));
  const looksBr = (digits.length === 10 && ddd >= 11 && ddd <= 99)
    || (digits.length === 11 && ddd >= 11 && ddd <= 99 && digits[2] === '9');
  if (looksBr) return `55${digits}`;
  return digits;
}

/** Envia o template "exame pronto". true = enviado; false = não configurado/falha (NUNCA lança). */
export async function sendWhatsAppExamReady(rawPhone: string, vars: { name: string; exam: string; count: number }): Promise<boolean> {
  try {
    if (!TOKEN || !PHONE_ID) {
      if (!warnedOnce) { console.log('[whatsapp] WHATSAPP_TOKEN/WHATSAPP_PHONE_ID ausentes — canal desativado (ver utils/whatsapp.ts)'); warnedOnce = true; }
      return false;
    }
    const to = normalizeWhatsappPhone(rawPhone);
    if (!to) return false;
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: TEMPLATE,
          language: { code: 'pt_BR' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: vars.name },
              { type: 'text', text: vars.exam },
              { type: 'text', text: String(vars.count) },
            ],
          }],
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[whatsapp] envio falhou:', res.status, body.slice(0, 200));
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('[whatsapp] erro:', e?.message);
    return false;
  }
}
