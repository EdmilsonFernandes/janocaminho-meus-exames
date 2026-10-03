# Payment Integration Spec — 4 Systems, Full Cycle Validation

## Systems (4)
1. Dr. Exame (this repo) — janocaminho.com.br/minhasaude
2. EdEspeto/Já no Caminho — janocaminho.com.br
3. PremioX/brunoprado — premiox.com.br
4. KYC/uai-id — uaiid.com.br
(gemhunter is 5th but lower priority)

## Provider Priority (PIX)
1. Asaas (PIX + credit card, min R$5, QR delay ~3s)
2. OpenPix (PIX only, no min, instant QR)
3. Mercado Pago (PIX + card, currently suspended)

## Requirements
- Full mapping of ALL payment points (not just examples)
- Standardized internal return format across all systems
- Fallback with idempotency, no duplicate charges on timeout
- Full cycle: create → QR → poll → webhook → confirm → release → expire
- Tests: unit (mock fallback), integration (real API), Playwright (every flow)
- Evidence report with sanitized proofs

## Current State (03/10)
- OpenPix: implemented and tested in all 4, REAL charge validated
- Asaas: agents implementing now (provider + fallback + webhook)
- MP: intact as fallback, currently suspended
- Logos: copied to all projects, being integrated into UI

## Deliverables
- [ ] Payment matrix (system × flow × endpoint × service × provider)
- [ ] Asaas provider in all 4 systems
- [ ] Fallback orchestrator with idempotency
- [ ] Unit tests (mock: asaas ok / asaas fail→openpix / both fail→mp / all fail / validation error / timeout)
- [ ] Integration tests (real: asaas charge R$5 + openpix charge R$1 + MP if available)
- [ ] Playwright E2E per flow (login→buy→QR visible→countdown→screenshot)
- [ ] Evidence report (sanitized)

## 7. UI/UX Premium Payment (todos os fluxos, 4 sistemas)

### Padrão visual
- Resumo da compra + valor em destaque
- QR Code em destaque (contraste, margens, ≥200px)
- Copia-e-cola com botão copiar + confirmação visual
- Prazo + instruções curtas
- Estados: loading → aguardando → confirmado → expirado → erro
- Proteção contra clique duplo
- Status atualiza sem reload
- Continuidade pós-confirmação → ação correta
- Logo do gateway REAL da cobrança (não o default)
- Sem selos falsos de segurança

### Mobile
- Copiar código em destaque (pagamento no mesmo aparelho)
- Zero overflow horizontal
- Textos longos sem quebrar
- Botões ≥44px acessíveis
- Modais com scroll interno + fechamento acessível
- Safe areas (Capacitor APK)
- 320/360/390/768/1440 + landscape mobile

### Testes Playwright por resolução
- Cada fluxo em 320/360/390/768/1440
- Estados completos: loading, QR, confirmado, expirado, erro
- Screenshot por resolução + inspeção visual
- Sem declarar "premium" sem evidência
