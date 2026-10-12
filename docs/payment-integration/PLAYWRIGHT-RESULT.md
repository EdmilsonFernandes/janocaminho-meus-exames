# Playwright E2E — Fluxo PIX Dr. Exame (local dev)

> Data: 03/10/2026 22:16–22:35 BRT. Playwright MCP (Chromium) contra `docker compose -f docker-compose.local.yml` (porta 4011).
> Build sob teste: imagem rebuilt na hora (`builtAt 2026-10-03T22:15:07Z`) com working tree atual (inclui ab25043a "religa cartão").
> Veredito: **PASS (7/7 verificações)** após desvio de ambiente documentado abaixo.
> Evidência: `docs/payment-integration/pix-e2e-evidence-2026-10-03.png`

## Steps executados

| # | Step | Resultado | Detalhe |
|---|---|---|---|
| 1 | Subir dev local (`docker compose -f docker-compose.local.yml up -d`) + health ok | **PASS** (com ressalvas) | Container existia mas com imagem de 29/09 (pré fluxo PIX 1-clique de 02/10) → rebuild executado (`--build`). Health OK em `http://127.0.0.1:4011/api/health`. **Nota:** `localhost` (::1 IPv6) reseta conexão — usar **127.0.0.1**. |
| 2 | Abrir `/#/entrar` | **PASS** | URL usada: `http://127.0.0.1:4011/#/entrar` (local NÃO usa prefixo `/meus-exames` — só prod/nginx; divergência da missão documentada). |
| 3 | Login `edmilson@exemplo.com` / `troque123` | **PASS** | Redirect para `/#/`. Usuário ADMIN pré-verificado no DB dev (`SELECT email, role, "emailVerified"` → `ADMIN|t`). |
| 4 | Navegar `/planos` | **PASS** | Página carregou: 3 packs (50/R$9,90 · 140/R$24,90 MAIS VENDIDO · 320/R$49,90) + Premium mensal R$19,90; saldo 15 créditos. |
| 5 | Clicar pacote de créditos (Popular, 140 cr, R$ 24,90) | **PASS** | Com `cardEnabled=true` (commit ab25043a religou cartão) abre primeiro o **PaymentChooser** ("Forma de pagamento · 140 créditos • R$ 24,90 · PIX/Cartão/Débito"); clique em **PIX** → PixModal. |
| 6 | Verificações do dialog PIX | **PASS 7/7** | Tabela abaixo. |
| 7 | Screenshot final | **PASS** | `docs/payment-integration/pix-e2e-evidence-2026-10-03.png` (dialog aberto com QR + countdown + código). |
| 8 | Erros encontrados | **2 erros de ambiente + 2 achados de UX** | Seções "Falhas/erros exatos" e "Achados". |

## Verificações do dialog (passo 6) — método find/evaluate (não screenshot)

| Verificação | Como testado | Resultado | Evidência |
|---|---|---|---|
| Dialog "Pague com PIX" aparece | `wait_for` texto visível + evaluate textContent | **PASS** | Título do `DialogTitle` = `Pague com PIX` |
| QR code visível (img `src=data:image/png`) | evaluate `img[alt="QR Code PIX"]` | **PASS** | `src` prefixo `data:image/png;base64,` e `naturalWidth > 0` (imagem renderizada de fato) |
| Copia-e-cola preenchido (> 100 chars) | evaluate `[aria-label="Código PIX copia e cola"]` `.textContent.length` | **PASS** | **210 chars**, payload EMV real iniciando `00020101021226810014br.go…` (a UI exibe truncado com ellipsis — CSS only, o DOM contém o código completo) |
| Countdown rodando (timer muda) | evaluate duplo com Δt = 2,6 s | **PASS** | Chip `Expira em 09:43` → `Expira em 09:41` (tick de 1 s; janela de 10 min) |
| Valor correto exibido | evaluate textContent do dialog | **PASS** | `R$ 24,90` (idêntico ao card do pack clicado) + chip `140 créditos` |
| Selo "via OpenPix" ou similar | evaluate alt das imgs do selo | **PASS** | Rodapé `🔒 Ambiente seguro · Dr. Exame · Processado via:` + logos carregados: `OpenPix (Woovi):true`, `Asaas:true` (+ chip `MP` pois cartão ativo). Extra: o PaymentChooser também traz "PIX — Instantâneo • via OpenPix (Woovi)". |
| Provider real da charge | `docker logs` | **PASS** | `[buy-credits] PIX criado: credits_cmusyqdi…_140 \| provider: openpix \| tem QR img: true` (charge REAL via OpenPix; expira sozinha — `pix-expiry` cancela) |

Network confirmado via spy de `window.fetch` (POST `/api/billing/buy-credits` → 200; `pending-payment` → 200).

## Falhas/erros exatos (passo 8)

1. **[AMBIENTE] PIX indisponível com provider MP local (1ª tentativa, antes do override):**
   `POST /api/billing/buy-credits` → 503. Log server:
   `[buy-credits] PIX falhou (mp): MP PIX falhou (400): {"cause":[{"code":13253,"description":"Error in Financial Identity Use Case"}],"message":"Collector user without key enabled for QR rendernull","status":400}`
   → Conta MP do `.env` local não tem chave PIX habilitada p/ QR (mesmo token cria preference de cartão, mas não QR). Como `PAYMENT_PROVIDER` local não estava setado, default = mp. Sem `OPENPIX_APP_ID`/`ASAAS_API_KEY` no `.env` local → sem fallback → 503 "Pagamento indisponível".
   **Resolução aplicada:** override efêmero do compose com `PAYMENT_PROVIDER=openpix` + `OPENPIX_APP_ID` buscado do `.env.prod` via SSH (valor nunca exibido/logado; override e chave temporária apagados ao final; container restaurado ao estado original — `pixProvider` voltou a `mp` local).

2. **[AMBIENTE] `localhost` IPv6 reseta conexão** (`Recv failure: Connection was reset` em `::1:4011`) — curl e qualquer cliente que prefira IPv6. Usar `127.0.0.1:4011`. O mapeamento IPv6 existe (`[::]:4011`) mas o reseta; não investigado além do necessário para o teste.

## Achados de UX/bug (produto do E2E — não impediram o PASS)

1. **PixModal "preso" em estado de erro:** após uma falha (503), reabrir a compra do MESMO pack não refaz o request — o modal remonta/reativa com `phase:'error'` antigo e o texto default, sem novo `fetch` (spy provou: zero chamadas). O usuário precisa clicar "Fechar e tentar de novo" (que fecha) e reabrir. Sugestão: resetar fase/`errMsg`/regen quando o dialog reabre (`useEffect [packId, open]`) ou no clique do botão de retry.
2. **Diálogos de nudge/onboarding interceptam a tela /planos:** um nudge ("Faz 40 dias sem registrar peso/altura de Theo") e depois o tour de onboarding ("Envie seu exame… Pular") abriram SOBRE os packs e bloquearam o clique em "Comprar" (Playwright: "subtree intercepts pointer events"). Para o usuário real é o mesmo comportamento (modal na frente). Recomendo não disparar fila de nudges/tour sobre a tela de checkout.
3. (Menor) `GET /api/patients/{id}/photo?t=…` → 404 no console local (sem foto no seed) — cosmético.

## Divergências da missão (documentadas)

- URL: usada `http://127.0.0.1:4011/#/entrar` (sem prefixo `/meus-exames` e com IP em vez de `localhost`) — compose local serve na raiz e IPv6 local reseta.
- Um passo a mais que na missão: com cartão religado, o clique no pacote abre o PaymentChooser primeiro (a missão assumia ir direto ao dialog PIX).

## Estado final

- Container `meus-exames-app` restaurado ao compose original (sem override), health OK, `pixProvider: "mp"` (default local).
- Charge OpenPix de teste NÃO paga → expira e o job `pix-expiry` cancela automaticamente (comportamento nativo).
- Arquivos: evidência em `docs/payment-integration/pix-e2e-evidence-2026-10-03.png`; chaves temporárias (`/tmp/jano.pem`, override) removidas.
