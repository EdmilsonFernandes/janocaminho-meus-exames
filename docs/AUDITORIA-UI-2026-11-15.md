# Auditoria UI ponta-a-ponta — 15/11/2026

> Método: crawl Playwright (72 telas: 36 rotas × mobile 390px + desktop 1440px nas telas-chave)
> + auditoria DOM programática em 28 rotas (alvos de toque, floor de fonte, nome acessível,
> HTML válido, scroll-x). Screenshots em `packages/scratch/audit-shots/` (NÃO commitar — podem
> conter dado de tela; relatório JSON em `packages/scratch/audit-*.json`).
> Scripts reutilizáveis: `packages/web/e2e/audit-crawl.mjs` e `audit-dom.mjs`.
> Conta: demo paciente `edmilson@exemplo.com` (dev). **Limitação**: admin e portal médico
> renderizaram apenas o gate (conta sem papel admin/médico) — auditoria profunda desses dois
> ambientes fica pendente de credenciais.

## Sumário executivo

- **Zero scroll-x horizontal** nas 72 telas (regra mobile-first absoluta respeitada).
- Os 3 problemas suspeitos pelo dono (saldo cortado, perfil 80% sem explicação, mensagem de
  créditos durante 1º processamento) foram corrigidos no commit 8cbf6b97 (14/11) — não
  reproduzidos nesta auditoria.
- ReUI está consolidado nos 3 ambientes (60+ arquivos importam `components/reui/`), com blocos
  premium já portados (`blocks/chart-25`, `blocks/stats-4`).

## Implementado nesta rodada (P0/P1)

| # | Achado | Impacto | Fix | Arquivo |
|---|---|---|---|---|
| 1 | Labels da bottom-nav a **10px** (floor do DS = 12px) em TODAS as telas mobile | Legibilidade p/ pacientes de todas as idades — nav principal do app | `fontSize: 12` (validado: pill 6 abas, 366px, zero overflow) | `MobileBottomNav.tsx` |
| 2 | Gate médico: "← Voltar ao app" 23px, "Cadastrar" 21px (regra 44px) | Alvo de toque subdimensionado na entrada do portal | minHeight 40 + área vertical inline-block | `DoctorPortal.tsx` |
| 3 | Eye-toggle de senha **sem nome acessível** (30×30) | Leitor de tela anuncia "botão" sem contexto | `aria-label` Mostrar/Ocultar senha | `DoctorPortal.tsx` |
| 4 | `<div>` (Chip) dentro de `<p>` (Typography) em Médicos | HTML inválido (console em ambos os viewports) | `component="div"` | `Medicos.tsx:777` |
| 5 | Botão "Ouvir resumo" 34px | Alvo abaixo do piso no cartão principal do dashboard | 40×40 | `DashboardV2.tsx` |

## Kit de motion (react-bits portado, mesma rodada)

- `hooks/useCountUp.ts` — extraído do DashboardV2; agora anima do **último valor** (mudanças
  de alvo não "piscam" voltando a zero — drag de slider suave), respeita reduced-motion.
- `components/motion/SplitWords.tsx` — revelação de título palavra-por-palavra (padrão
  SplitText), CSS puro, sem clip (acentos/descendentes intactos), reduced-motion via media query.
- `components/motion/CountUp.tsx` — wrapper com formatação pt-BR.
- Aplicado: hero da Landing (variantes A/B + sports) e Radar público (título + 3 números).
- **Regra de produto mantida**: nada de animação em tela clínica (exame/chat/alerta).

## Falsos positivos desmontados (não é bug)

- "Botões sem nome" no chat (sheet fechada) e nos Alterados (links Doctoralia dentro de
  Collapse ainda fechado): elementos `visibility:hidden` retornam `innerText` vazio. O script
  `audit-dom.mjs` agora filtra `visibility` — rodadas futuras não repetem o alarme.
- 403 pontual no crawl inicial: não reproduzido (fluxo de login/GSI no dev).

## Pendências priorizadas (próximas rodadas)

| Pri | Item | Por quê |
|---|---|---|
| P1 | **h1 ausente em ~26 telas** (títulos são Typography visual, sem `component="h1"`) | Hierarquia/SEO/a11y — mexerico mecânico grande (1 edit/tela), fazer em lote dedicado |
| P1 | Ícones do AppBar a 40px (regra 44) | Menu, créditos, sino, conta — shell inteiro; mexer com cuidado no layout denso |
| P1 | **Auditar admin + portal médico de verdade** | Precisa credenciais (ou promote da conta demo no DB dev) |
| P2 | Chips de filtro do dashboard a 24-26px de altura | Secundários, mas abaixo do piso — polimento |
| P2 | ReUI-MAP fases 1-3 (faq-1, compare-2, review-4, cta-4…) | Plano de 07/11 segue válido; conferir o que a semana já entregou |
| P2 | OAuth do MCP ReUI pendente (licença Ultimate) | Inventário atual vem do mapa de 07/11 |
| P3 | `Missing translation "Dr. Exame"` (react-admin i18n) | Ruído de console |
| P3 | GSI origin não permitida no dev | Config Google, ambiente local |

## Como re-auditar

```bash
cd packages/web
node e2e/audit-crawl.mjs   # screenshots 390+1440 → packages/scratch/audit-shots/
node e2e/audit-dom.mjs     # métricas DOM → packages/scratch/audit-dom.json
```
