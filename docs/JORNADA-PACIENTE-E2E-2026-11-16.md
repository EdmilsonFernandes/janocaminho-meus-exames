# Jornada do Paciente — E2E + UX (16/11/2026)

> Suíte: `packages/web/e2e/jornada-*.spec.ts` (3 specs, 7 testes) + `jornada-helpers.ts`.
> **Resultado da rodada final: 6 passed, 1 skipped** (relay de IA fora — skip honesto).
> Ambiente: dev (server tsx 4001 SEM watch + vite 5173), conta demo + usuários sintéticos
> criados por execução (register→OTP local→verify→login). Zero dado real de paciente.

## Como rodar

```powershell
cd packages/web
$env:E2E_BASE_URL='http://localhost:5173'; $env:E2E_API_URL='http://127.0.0.1:4001/api'
npx playwright test e2e/jornada-primeiro-exame.spec.ts e2e/jornada-chat-ia.spec.ts e2e/jornada-creditos-pix.spec.ts --project=mobile-375
```
- ⚠️ IPv4 explícito na API (`127.0.0.1`) — `localhost` resolve `::1` e morre (gotcha do setup).
- Ambiente 100% estável alternativo: `e2e/up-local-docker.ps1` (imagem de produção no 4011).
- O `global-setup` agora aceita `E2E_API_URL` (permite vite-dev 5173 + API 4001 sem rebuild).

## O que cada fluxo valida (contratos)

### 1º exame (`jornada-primeiro-exame.spec.ts`) — extração REAL
- Conta nova nasce com **0 créditos** (anti-farm); banner "🎁 +60 💎" leva ao envio.
- Jornada de envio real: **LGPD (checkbox+aceitar) → anexar PDF → "Conferência rápida" →
  submit** — PDF sintético gerado no teste (válido, laudo fictício pt-BR).
- Lista mostra o exame: seção "⏳ Em processamento" com copy honesta ("costuma levar de 1 a
  3 minutos · pode sair desta tela") + "Cancelar e excluir".
- **Regra dos créditos validada**: 2º envio durante a 1ª análise → 409
  `first_exam_processing` → mensagem de espera, **paywall JAMAIS** (fallo duro se aparecer).
- Terminal duplo: sucesso (Ver análise + Hemoglobina extraída + **bônus de boas-vindas
  concedido via API**) OU falha do relay ("Não foi possível ler" + **Re-extrair** + 1º grátis
  preservado). Sucesso observado 2× em debug (3 marcadores extraídos de PDF sintético).
- **Idempotência sha256**: reenvio do mesmo arquivo → POST retorna o exame existente (200),
  **saldo intocado**.

### Chat IA (`jornada-chat-ia.spec.ts`) — resposta REAL quando o relay está de pé
- Bottom-nav "Dr. Exame" abre o chat; sugestões clínicas visíveis e clicáveis.
- Tocar em sugestão envia; estado vazio sai de cena; resposta real = corpo cresce >150 chars.
- **Skip condicional documentado**: relay sem resposta em 2min (429 Z.ai) → teste pula com
  motivo, não dá falso verde. Reposta real validada quando o relay cooperar.

### Créditos PIX (`jornada-creditos-pix.spec.ts`) — SIMULADO por interceptação
- ⚠️ O `MP_ACCESS_TOKEN` do dev é de **PRODUÇÃO** (APP_USR) — criar cobrança do dev = cobrança
  real. O teste intercepta `POST /api/billing/buy-credits` (fulfill fake) e bloqueia a rota
  real por padrão. Para QR de cobrança VÁLIDA: token TEST- (sandbox MP) ou conta de teste
  autorizada em prod.
- Valida: packs com preço real da API → "Comprar N leituras" → "Como quer pagar?" → "Pagar
  com Pix" → **QR + copia-e-cola + botão copiar**.
- 503 do provedor → **mensagem amigável** (fix abaixo) + nunca o body cru da API.

## Bug real corrigido

**`PixModal.tsx` exibia o erro cru da API ao paciente** (E2E provou: o body do 503 ia
literal pra tela). Fix: mensagem humana ("Não conseguimos gerar o código…") + diagnóstico
no console. Validado pelo teste de 503.

## Achados de UX (evidência nos traces/snapshots)

| Achado | Estado |
|---|---|
| "Está certo, enviar" da conferência NÃO envia — só fecha o diálogo (o submit é outro botão depois) | Rótulo promete o que não faz — **pende decisão de produto** (renomear p/ "Está certo, continuar" ou fazer enviar) |
| Copy do processamento é honesta (tempo típico + "pode sair") | ✓ bom, sem ação |
| Falha de extração: aviso + Re-extrair + 1º grátis preservado + estorno | ✓ contrato validado |
| Notify "1 de 1 exame enviados e extraindo" é efêmero (~4s) | OK — o card persiste na lista |

## Limitações
1. **Admin e portal médico**: só o gate renderiza com conta paciente (auditoria anterior).
2. **QR de cobrança válida**: exige sandbox MP (token TEST-) ou prod com conta autorizada.
3. **Resposta do chat**: dependente do relay Z.ai (oscilou hoje — 429).
4. Relay fora → extração falha em segundos: a suíte valida o contrato de falha; o caminho
   feliz completo foi validado em debug (e revalida sozinho quando o relay volta).

## Dados/registros criados (dev)
Usuários `e2e.jornada/debug/debug2/debug4.*@exemplo.com` + exames sintéticos "exame-e2e.pdf"
(laudo fictício). Créditos de IA consumidos: 2 (chat demo). Nenhum dado real.
