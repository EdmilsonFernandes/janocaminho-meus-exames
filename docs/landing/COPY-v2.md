# Landing COPY v2 — rework de conversão (2026-10)

> Fonte única da copy da landing. Regra dura: **todo número clínico citado vem de
> `packages/server/knowledge/`** (diretrizes verificadas). Zero métrica inventada.
> Identidade inegociável: teal `#20b2aa`, Poppins/Inter, radius 16, respiro premium.

## Objetivo de conversão (UM por página)

**Criar conta** (`/registrar`) —CTA "Começar agora — é grátis".
Nenhum CTA concorrente no hero: o botão da Play Store saiu do hero (ficou no bloco
final, onde a intenção já existe) e o secundário é âncora de mesma página
("Ver como funciona ↓"). O texto do CTA se repete no bloco final e na barra fixa
mobile (message match).

## Estrutura (10 seções, framework por consciência)

Público geral = leigo consciente da dor ("não entendo meu exame") → **PAS**.
Público esportivo = consciente do desejo (monitorar com contexto) → **BAB** na variante.

| # | Seção | Onde | Copy-chave |
|---|---|---|---|
| 1 | Hero (A/B) | topo | A: "Entenda seus exames como nunca antes." (controle) · B: "Seu exame de sangue, explicado em 30 segundos." Sub = mecanismo: envia → IA lê → explica em português → leitura de risco + plano pro médico |
| 2 | Prova precoce | dentro do hero | SÓ verificável: 5,0 na Google Play · IA com fontes SBC/SBD/ADA · LGPD |
| 3 | Problema ("O laudo chegou. E agora?") | pós trust-strip | 3 dores na linguagem do visitante: siglas sem resposta; consulta demora/dúvida não; histórico espalhado |
| 4 | Solução/benefícios | seção risco+plano (existente) | "Descubra seu risco — e o que fazer" |
| 5 | Como funciona (3 passos, verbo) | pós problema | Envie → Receba a explicação → Leve perguntas ao médico |
| 6 | Features→benefícios | Health Connect, família, remédios (existentes) | — |
| 7 | Depoimentos reais | Play 5,0 | existentes (reviews reais; nada fabricado) |
| 8 | Planos | `#planos` (3 tiers + regra de decisão) | adicionado link/âncora; preços vivos da API |
| 9 | FAQ 5-8 objeções + schema | `FaqSection` | + JSON-LD FAQPage (mesmo array que renderiza) |
| 10 | CTA final (risk reversal) | fim | "Começar agora — é grátis" + "Primeiro exame com análise grátis · sem cartão" |

Mecanismo vivido: "Cole seu exame" (DecifreReal) segue logo após o hero — o visitante
experimenta o produto antes de qualquer cadastro.

## Variante esportiva `?sports=1`

Destino do tráfego QR dos cartazes **Métrica Vital** (message match com o cartaz:
"VOCÊ ACOMPANHA SEUS TREINOS. / E SEUS EXAMES?").

- Hero escuro (mesmo gradiente profundo do cartaz), kicker monoespaçado em cobre,
  H1 "E seus *exames?*", sub BAB: "Hormônios, hematócrito, colesterol, fígado e rim
  interpretados **no contexto de quem treina** — régua do laboratório, seu histórico
  e a meta do SEU médico no meio."
- Visual: régua Métrica Vital animada (banda do lab + pin + meta tracejada) + mascote.
- Prova com diretrizes citadas: **SBEM 2026, Endocrine Society, EFLM** (existentes em
  `knowledge/sports/`); "nunca recomenda dose ou ciclo".
- `SportsSection variant="full"` ANTES de tudo (quem veio do QR não rola atrás da oferta).
- FAQ esportivo (objeções reais de academia): "É pra quem usa hormônio?", "Substitui o
  médico do esporte?", "Não treino competição — serve?", "Declarar o que uso é seguro?".
- Política de anúncio: a palavra "anabolizante/esteroide" NÃO aparece; falamos em
  "reposição hormonal com acompanhamento médico" e "contexto declarado".

## Números clínicos citados (todos com fonte no knowledge/)

| Afirmação | Fonte |
|---|---|
| Hematócrito 48–54% = zona de atenção; >54% = protocolo médico | SBEM 2026 + Endocrine Society 2018 (`HEMATOCRITO_TRt.md`) |
| CK pode seguir elevada 5–7 dias pós-esforço; coleta sem treino intenso 24h antes | EFLM 2018 (`ALT_AST_CK_EXERCICIO.md`) |
| Cistatina-C preferida sobre creatinina em massa muscular alta/creatina/andrógenos | HAARLEM, JCEM 2026 (`CISTATINA_C.md`) |
| Ferritina <30 ng/mL = reservas baixas | SBH 2024 (`guidelines/ferro-ferritina.md`) |

Corrigido nesta leva (estava SEM fonte): "teto seguro ≤52%" (era inventado — trocado
por 48–54%/>54% SBEM), "meta pós-treino 2.000 U/L" (EFLM não estabelece janela —
trocado por "variação esperada pós-treino"), "meta ≥50 ng/mL p/ atleta" (trocado por
SBH <30 + "meta do seu médico"), "rins 100% sadios" (→ "função renal preservada"),
"SBMEE" (→ SBEM). Faixa "meta" da régua roxa → **cobre**, rotulada "Meta do seu
médico (exemplo)".

## Hero assinatura (régua Métrica Vital)

`components/landing/HeroRuler.tsx` — SVG inline (0 bytes de rede): faixa do
laboratório, pin do valor (animação de entrada + pulse, respeita
`prefers-reduced-motion`) e meta tracejada do médico em cobre. Compacta sob o mockup
do hero padrão; completa no hero esportivo. Conta a história do produto em 1 visual.

## A/B — plano de medição (14 dias, 95%)

- **Split**: `localStorage('ab:hero-v2')`, 50/50 na 1ª visita, persistido
  (`hooks/useHeroAb.ts`). Não roda na variante esportiva.
- **Headlines**: A (controle, curiosity) × B (outcome + prazo: "explicado em 30 segundos").
- **Instrumentação**: hoje PostHog é no-op → `console.info('[ab] hero=A|B')` é o marcador
  estável. Quando o `capture()` for ligado, trocar o console pelo evento
  `hero_view {variant}` e adicionar `cta_click {variant}` no botão do hero e
  `signup_submit {variant}` no /registrar (ler o mesmo localStorage no submit).
- **Métricas**: primária = clique no CTA do hero por variante; secundária = cadastro
  concluído por variante.
- **Decisão**: 14 dias de coleta, teste de duas proporções (duas caudas, α=5%).
  Regra: sem significância = mantém A (controle). Com significância e B ≥ +10%
  relativo na primária = B vira headline padrão.
- **Sanidade**: conferir semanalmente split ~50/50 (console ou evento) e taxa de
  rejeição por variante (se B piorar rejeição, investigar antes de decidir).

## CWV / bundle

- `capa-ia.png` 722 KB → **`capa-ia.webp` 64 KB** (−91%) com `fetchPriority="high"`.
- Imagens abaixo da dobra (QR Play, badge) `loading="lazy"`.
- HeroRuler = SVG inline; sem fonte nova, sem lib nova, sem imagem nova.
- Meta: bundle do chunk da landing ≤ +10% (verificado no QA).
