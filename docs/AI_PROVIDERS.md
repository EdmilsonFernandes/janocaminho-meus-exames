# Provedores de IA (camada de abstração `llm/`)

> **Anti-dependência:** o app não fica refém de um só provedor de IA. Trocar de Anthropic/Z.ai para OpenAI ou Gemini é **só `.env`** — sem mexer no código das features.

## Como funciona

Toda chamada de IA passa por `getLlm()` (`packages/server/src/llm/index.ts`), que devolve o adapter ativo conforme `AI_PROVIDER`:

```
AI_PROVIDER=anthropic  →  AnthropicAdapter  (Z.ai / GLM — PADRÃO)
AI_PROVIDER=openai     →  OpenAIAdapter     (fetch /chat/completions)
AI_PROVIDER=gemini     →  GeminiAdapter     (fetch generateContent)
```

Interface comum (`llm/types.ts`): `stream({system, messages, maxTokens})` → `{onText, final}` (chat/SSE) e `complete()` (non-stream). Cada adapter traduz pro formato do seu provedor.

**Onde a IA é usada** (todos via `getLlm()`):
- `analysis/chat.ts` — chat do Dr. Exame (stream SSE).
- `extraction/claude.ts` — extração de exames (pdftotext→IA→JSON).
- `analysis/health-summary.ts` — relatório consolidado + health-summary (JSON).
- `analysis/risk-action-plan.ts` — plano de ação (markdown).
- `jobs/healthNudges.ts` — dica diária (non-stream).
- `routes/item.routes.ts` — "explicar analito" (JSON).

> A **coerência anti-alucinação** (`coerceComparativo`, `coerceStaleness` em `health-summary.ts`) roda **depois** da IA — vale pra **qualquer provider**. Os valores numéricos do relatório sempre casam com o banco.

---

## Configuração (setup do zero)

Copie `packages/server/.env.example` → `packages/server/.env` e escolha UM provedor:

### Padrão: Anthropic via relay Z.ai (GLM-4.6) — recomendado, mais barato
```bash
AI_PROVIDER=anthropic
ANTHROPIC_AUTH_TOKEN=<seu token Z.ai>
ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
ANTHROPIC_MODEL=glm-4.6
EXTRACTION_MODEL=glm-4.6
```
> **NUNCA** use `ANTHROPIC_API_KEY` real da console.anthropic.com em prod (caro). O relay Z.ai fala o protocolo Anthropic mas roda GLM. Restrições do relay: **sem** structured output / thinking / effort.

### Alternativa: OpenAI (ou Azure, OpenRouter, Together — qualquer `/chat/completions`)
```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1   # mude p/ Azure/OpenRouter se usar
OPENAI_MODEL=gpt-4o-mini
```

### Alternativa: Google Gemini
```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.0-flash
```

Sem `AI_PROVIDER`, default = `anthropic` (não quebra).

---

## Trocar em produção (quando a chave/assinatura cair)

1. Edite `.env.prod` na EC2 (`~/meus-exames/janocaminho-meus-exames/.env.prod`):
   ```bash
   AI_PROVIDER=openai
   OPENAI_API_KEY=sk-...
   ```
2. Recrie o container (env_file é lido no create):
   ```bash
   cd ~/meus-exames/janocaminho-meus-exames
   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --force-recreate
   ```
3. Confira o log: `docker logs meus-exames-app --tail 5 | grep llm` → `provider ativo: openai`.

Pronto — chat, extração, relatório etc. passam a usar o novo provedor. Zero mudança de código.

> Em emergência (sem restart), dá pra isolar um teste: `docker exec -w /app/packages/server -e AI_PROVIDER=openai -e OPENAI_API_KEY=... meus-exames-app node -e "..."`.

---

## Validar um provider (teste rápido)

```bash
cd packages/server
AI_PROVIDER=openai OPENAI_API_KEY=sk-... node -e "
  const {getLlm} = require('./dist/src/llm');
  getLlm().complete({system:'Responda só: PONG', messages:[{role:'user',content:'ping'}], maxTokens:10})
    .then(r => console.log('OK:', r.text)).catch(e => console.log('ERR:', e.message));
"
```
(Em prod, compile antes: `npm run build --workspace packages/server` — path do dist é `dist/src/llm/index.js`.)

---

## Adicionar um novo provedor (futuro)

1. Crie `packages/server/src/llm/<provider>.ts` implementando `LlmProvider` (`stream`/`complete`).
2. Adicione no switch de `getLlm()` (`llm/index.ts`) e em `MODEL`.
3. Adicione as vars em `config.ts` + `.env.example`.
Sem tocar nos 7 pontos de uso.

## Troubleshooting
| Sintoma | Causa | Fix |
|---|---|---|
| `..._API_KEY não configurada` | `AI_PROVIDER=X` mas a chave de X falta | setar a chave do provider escolhido |
| Provider errado ativo | `AI_PROVIDER` não respeitado | o `config` é lido no boot — reinicie o container |
| Relay Z.ai rejeita modelo | usou `claude-opus-4-8` no Z.ai | use `glm-4.6` (ANTHROPIC_MODEL) |
| Extração alucina valores | (independente de provider) | já corrigido por `coerceComparativo`/`coerceStaleness` — valores vêm do DB |
