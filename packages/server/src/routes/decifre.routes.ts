import { Router } from 'express';
import { createHash } from 'crypto';
import rateLimit from 'express-rate-limit';
import { getLlm, getModel } from '../llm';
import { extractJsonObject } from '../utils/json';
import { prisma } from '../prisma';
import { sendEmail } from '../utils/mailer';
import { upload } from '../middleware/upload';
import { pdfToText } from '../extraction/pdfToText';

/**
 * "Decifre seu exame" — ferramenta PÚBLICA da landing (topo de funil): o visitante cola o
 * texto do exame e recebe os valores ORGANIZADOS na hora, sem cadastro.
 *
 * Linha de custo/segurança (deliberada):
 *  - A IA só EXTRAI valores (JSON estrito, sem opinião/diagnóstico) — a INTERPRETAÇÃO
 *    completa continua sendo do usuário logado (1º resumo grátis no app). O gosto é grátis,
 *    a comida é do produto.
 *  - Flags ✓/⚠ são DETERMINÍSTICAS (valor × faixa impressa no próprio laudo).
 *  - Rate-limit 3/dia por IP + texto ≤ 4.000 chars + CACHE por sha256 (repetidos = 0 custo).
 *  - NADA persistido (LGPD): cache em MEMÓRIA keyed por hash, TTL 24h, sem o texto original.
 */

const router = Router();

const decifreLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, max: 3,
  standardHeaders: true, legacyHeaders: false,
  // Dev/teste: sem limite (o padrão dos outros limiters do app). Em PROD conta tudo.
  skip: () => process.env.NODE_ENV !== 'production',
  message: { error: 'Limite diário de decifrações atingido. Crie sua conta grátis para analisar sem limite.' },
});

const MAX_CHARS = 4_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { items: any[]; totalDetected: number; expiresAt: number }>();
// Prune leve a cada uso (Map pequeno; sem cron).
function pruneCache() {
  if (cache.size < 200) return;
  const now = Date.now();
  for (const [k, v] of cache) if (v.expiresAt < now) cache.delete(k);
}

const SYSTEM = [
  'Você é um extrator de valores de exames laboratoriais brasileiros. Responda IMEDIATAMENTE com o JSON — sem raciocinar, sem analisar, sem explicar.',
  'Recebe o TEXTO de um exame e devolve APENAS um JSON, sem nenhum texto fora dele:',
  '{"items":[{"name":"Hemoglobina","value":13.5,"unit":"g/dL","refLow":12,"refHigh":16}]}',
  'Regras: name = nome do analito como está no laudo; value = número (vírgula vira ponto); unit = unidade ou null;',
  'refLow/refHigh = faixa de referência impressa NO LAUDO (número) ou null se não vier;',
  'máximo 15 itens, priorize os principais (hemograma, lipídicos, glicose, tireoide, rins, fígado);',
  'NUNCA inclua opinião, diagnóstico, recomendação ou texto explicativo. Só os valores.',
].join('\n');

/** Sanitiza a saída da IA: só números/nomes válidos; flag determinística pela faixa do laudo.
 *  Exportada pra teste unitário (IA devolvendo lixo → 0 itens → rota responde 422). */
export function toPublicItems(raw: any): { name: string; value: number; unit: string | null; refLow: number | null; refHigh: number | null; flag: 'NORMAL' | 'HIGH' | 'LOW' | 'UNKNOWN' }[] {
  const list: any[] = Array.isArray(raw?.items) ? raw.items : [];
  const out: any[] = [];
  for (const it of list) {
    const name = String(it?.name ?? '').trim().slice(0, 60);
    const value = Number(String(it?.value ?? '').replace(',', '.'));
    if (!name || !Number.isFinite(value)) continue;
    const num = (v: any) => { if (v == null || v === '') return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
    const refLow = num(it?.refLow);
    const refHigh = num(it?.refHigh);
    let flag: 'NORMAL' | 'HIGH' | 'LOW' | 'UNKNOWN' = 'UNKNOWN';
    if (refLow != null && value < refLow) flag = 'LOW';
    else if (refHigh != null && value > refHigh) flag = 'HIGH';
    else if (refLow != null || refHigh != null) flag = 'NORMAL';
    out.push({
      name, value,
      unit: it?.unit ? String(it.unit).slice(0, 12) : null,
      refLow, refHigh, flag,
    });
    if (out.length >= 8) break; // resposta pública: até 8 itens (o resto é do app)
  }
  return out;
}

// multipart: PDF (o fluxo real do app) OU JSON {texto} — o limiter conta os dois.
router.post('/', decifreLimiter, upload.single('file'), async (req, res, next) => {
  try {
    let texto = String(req.body?.texto ?? '').trim();
    if (req.file) {
      if (req.file.mimetype !== 'application/pdf') { res.status(400).json({ error: 'Envie um PDF (foto fica pro app, com conta).' }); return; }
      if (req.file.size > 8 * 1024 * 1024) { res.status(400).json({ error: 'PDF muito grande (máx. 8 MB).' }); return; }
      texto = (await pdfToText(req.file.buffer)).trim(); // poppler, igual ao pipeline
    }
    if (texto.length < 20) { res.status(400).json({ error: 'Não conseguimos ler texto aí — cole o resultado ou envie o PDF do laboratório.' }); return; }
    // Caps por origem: PDF de lab real passa fácil de 4k (cabeçalho, rodapé, múltiplas páginas)
    // → trunca em 30k e decifra o que importa. Texto colado: rejeita (usuário colou demais).
    if (req.file) {
      // 15k (não 30k): menos input = menos thinking do modelo = resposta mais rápida.
      // 15k cobre ~3 páginas de laudo (os valores principais estão nas primeiras).
      // CRÍTICO pro Android: o Chrome mobile mata conexões longas antes do desktop.
      texto = texto.slice(0, 15_000);
    } else if (texto.length > MAX_CHARS) {
      res.status(400).json({ error: `Texto muito longo (máx. ${MAX_CHARS} caracteres). Cole um exame por vez — ou envie o PDF.` });
      return;
    }

    // Cache: mesmo texto (erros de digitação à parte) não paga IA de novo.
    const hash = createHash('sha256').update(texto).digest('hex');
    const hit = cache.get(hash);
    if (hit && hit.expiresAt > Date.now()) {
      void trackDecifre(req, hit.items, true);
      res.json({ items: hit.items, totalDetected: hit.totalDetected, cached: true, disclaimer: DISCLAIMER });
      return;
    }
    pruneCache();

    const result = await getLlm().complete({
      system: SYSTEM,
      messages: [{ role: 'user', content: `Extraia os valores deste exame:\n\n${texto}` }],
      // 16000 = o número PROVADO do pipeline de extração (prod, glm-4.6): com menos, o
      // thinking consome tudo e o text vem vazio (validado: 30k input + 1200/3000/4000
      // tokens → thinking-only; 16000 → end_turn com JSON perfeito).
      maxTokens: 16000,
      model: getModel(), // mesmo modelo ativo das outras chamadas (admin/.env) — nunca o default do adapter
    });
    // Resposta fora do formato (ex.: modelo que só devolveu thinking) NUNCA é 500 — vira 422
    // amigável (validado na mão contra o relay: glm-4.6 abre com bloco de thinking).
    let items: ReturnType<typeof toPublicItems> = [];
    try {
      items = toPublicItems(extractJsonObject(result.text));
    } catch {
      items = [];
    }
    if (items.length === 0) {
      res.status(422).json({ error: 'Não encontramos valores de exame nesse texto. Cole o resultado com os números (ex.: Hemoglobina 13,5 g/dL).' });
      return;
    }
    const totalDetected = items.length; // já limitado a 8
    cache.set(hash, { items, totalDetected, expiresAt: Date.now() + CACHE_TTL_MS });
    void trackDecifre(req, items, false);
    res.json({ items, totalDetected, cached: false, disclaimer: DISCLAIMER });
  } catch (e: any) {
    if (String(e?.message || '').includes('LLM') || String(e?.message || '').includes('provider')) {
      res.status(503).json({ error: 'Serviço temporariamente indisponível. Tente em instantes.' });
      return;
    }
    next(e);
  }
});

const DISCLAIMER = 'Leitura automática de valores contra a faixa impressa no próprio laudo — informativa, não é diagnóstico. A interpretação completa (IA + tendência + histórico) fica no app.';

/** Telemetria do funil (LGPD-safe): evento por decifração — contagens + hash do IP (nunca o
 *  texto do exame, nunca o IP cru). E-mail pro dono "sentir o calor" — com teto anti-spam. */
const HEAT_EMAIL_CAP = 50; // por dia — acima disso o inbox do dono morreria
let heatEmailsToday = 0;
let heatEmailsDay = new Date().toDateString();

async function trackDecifre(req: any, items: any[], cached: boolean) {
  const abnormal = items.filter((i) => i.flag === 'HIGH' || i.flag === 'LOW').length;
  const ipHash = createHash('sha256').update(String(req.ip ?? '')).digest('hex').slice(0, 16);
  await prisma.decifreEvent.create({ data: { ipHash, itemsCount: items.length, abnormalCount: abnormal } }).catch(() => {});
  // E-mail de calor (cap diário; reseta no dia seguinte)
  const today = new Date().toDateString();
  if (today !== heatEmailsDay) { heatEmailsDay = today; heatEmailsToday = 0; }
  if (heatEmailsToday < HEAT_EMAIL_CAP) {
    heatEmailsToday++;
    void sendEmail({
      to: 'contato@janocaminho.com.br',
      subject: `🔥 Alguém decifrou um exame na landing — ${items.length} valores, ${abnormal} pedindo atenção`,
      html: `<p><b>Decifração anônima${cached ? ' (cache)' : ''}</b></p><p>${items.length} valores extraídos · ${abnormal} fora da faixa</p><p><small>IP hash ${ipHash.slice(0, 8)}… — texto do exame NÃO foi salvo (LGPD).</small></p>`,
      text: `Decifração anônima: ${items.length} valores, ${abnormal} fora da faixa. IP hash ${ipHash.slice(0, 8)}.`,
    }).catch(() => {});
  }
}

export default router;
