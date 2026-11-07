# ReUI × Landing — Mapa completo & Encaixe (2026-11-07)

> Fontes: inventário ReUI via MCP (licença **Ultimate ativa**, 678 blocos, 1264 exemplos,
> 667 Motion Icons, 27 componentes free) + mapa de código + estratégia de conversão dual.
> A COPY-v2.md continua valendo (1 CTA/página · números só com fonte · teal `#20b2aa`).
> **Regra técnica inegociável**: blocos ReUI são shadcn/Tailwind → **portamos o padrão
> visual para MUI**, nunca instalamos (decisão 29/10; referência viva: `/showcase-reui`).

## 1. Estado atual (mapa de código)

| Rota | Página | Papel |
|---|---|---|
| `/` | `Landing.tsx` (~1300 lin) | Landing paciente (20+ seções) |
| `/para-medicos` | `ParaMedicos.tsx` | Landing médico (10 seções) — **o funil do dinheiro novo** |
| `/encontrar` | `EncontrarEspecialistas.tsx` | Diretório (base CNES: 89k locais, 1,46M profissionais) |
| `/doctor` · `/doctor/vincular` | DoctorPortal · DoctorInviteLanding | Portal (auth) · convite |
| `/features` · `/medicos` · `/teleconsulta/:id` | — | Showcase · Meus médicos · sessão |

**Home `/`** (Landing.tsx): navbar mega `:223` → hero A/B + `?sports=1` `:226` → "Cole seu
exame" funcional `:478` → trust strip `:501` → product preview `:542` → telestrip `:546` →
problema `:565` → como funciona `:607` → métricas animadas `:632` → prova social `:662` →
comparação `:703` → risco+plano `:709` → teleconsulta no app `:789` → bento ecossistema
`:797` → remédios+preço (vitrine real) `:803` → **strip médico `:928`** → LGPD `:950` →
planos `:959` → FAQ+JSON-LD `:1090` → trust badges `:1107` → CTA final `:1113` → rodapé
`:1161` → CTA fixo mobile `:1227` → popup `:1254`.

**`/para-medicos`** (ParaMedicos.tsx): navbar mínima `:278` → hero `:306` → 3 diferenciais
(brief · transcrição+resumo IA · PIX na consulta) `:352` → calculadora `:383` → "Seus
pacientes continuam seus" `:394` → convite 1 link `:420` → como funciona `:436` →
confiança (CFM 2.314/2022, LGPD, Asaas) `:451` → planos (Grátis taxa 20% / Pro R$29,90)
`:477` → CTA final `:543`.

## 2. Diagnóstico — 5 críticos

1. **Contradição** `ParaMedicos.tsx:407`: "não listamos médicos, não direcionamos
   pacientes" × `/encontrar` JÁ é diretório. O argumento mais forte da página é negado nela.
2. **Home sem entrada médico**: pill "Para médicos" foi cortada da navbar; a strip `:928-946`
   aponta `/doctor` (login), não `/para-medicos`.
3. **Resolução faltando**: página cita CFM 2.314/2022 (telemedicina) mas não a
   **CFM 2.454/2026** (uso de IA — o carimbo automático do app). É o argumento mais novo.
4. **Diretório invisível na copy**: "pacientes te acham (base CNES)" não aparece em lugar
   nenhum — canal de aquisição de supply a custo zero.
5. **Ambiguidade de preço**: taxa 20% × Pro R$29,90 sem regra de decisão ("qual eu pego?").

⚠️ **Nuance (decisão do dono 06/11, `App.tsx:81-85`)**: posicionamento **NÃO é marketplace**.
O argumento diretório é *descoberta/visibilidade*, nunca "vitrine onde paciente compra consulta".

## 3. Mapa ReUI → encaixe por seção

### 3.1 Home paciente

| Seção atual | Bloco ReUI (nome exato) | Encaixe | Pri |
|---|---|---|---|
| FAQ `:1090` | **`faq-1`** | Tabs **Paciente / Médico / Privacidade & LGPD** filtram o Accordion — mata a objeção certa pro público certo. Mantém JSON-LD (mesmo array) | **P0** |
| Comparação `:703` | **`compare-2`** | Matriz 3 col × 9 features, coluna central destacada (esmeralda→**teal**), Tooltip por linha. "Com Dr. Exame × sem" | P1 |
| Prova social `:662` | **`review-4`** | Grid 3×2 de pull-quotes estáticos (estrelas, avatar, data). Sem autoplay = rápido; separar quotes paciente/médico | P1 |
| CTA final `:1113` | **`cta-4`** | Closer com grid 3 pilares de prova (LGPD/cripto · IA não diagnostica · dados no Brasil) + botão duplo | P1 |
| Métricas `:632` | **`stats-7`** | 1 Frame dividido em 3 células (valor + Badge trend + período). Substitui contadores soltos | P2 |
| Selo-row (novo, pós-hero) | padrão `hero-12` | Linha estática de selos (Play 5,0 · LGPD · ANVISA · CFM) — **não** marquee (padrão dev-tool, não clínico) | P2 |
| Navbar `:223` | **`navbar-12`** | Mega-menu 2 colunas: Paciente (Ler exames, Teleconsulta, Planos) × **Médico** (Agenda, Brief IA, PIX, KYC) + seta que desliza no hover | P2 |
| Hero `:226` | `hero-11` | Split + console que troca a cada 5s conforme a célula de feature. **Só após o A/B de 14d concluir** (COPY-v2) | P3 |

### 3.2 `/para-medicos` — o dinheiro novo

| # | Seção proposta | Bloco ReUI | Headline / prova | Pri |
|---|---|---|---|---|
| 1 | Hero | mantém/hybrid `hero-8` | "Sua consulta com **PIX embutido** — e pacientes que te acham" · chip CRM verificado. `hero-8` = email captura in-place (waitlist KYC) | P1 |
| 2 | Prova precoce | padrão selo-row | PIX via Asaas (Bacen) · **CFM 2.454/2026** · LGPD | P0 |
| 3 | Diferenciais | mantém `:352` | Brief · SOAP+carimbo IA · PIX R$120→R$96 | — |
| 4 | Calculadora `:383` | mantém | "Quanto você deixa na mesa?" | — |
| 5 | **Diretório (NOVA)** | sem bloco — card de busca `/encontrar` | "Pacientes te encontram. Base oficial CNES." + "complete seu perfil, apareça primeiro" | **P0** |
| 6 | Como funciona `:436` | `how-it-works-1` | "Do CRM ao PIX" + passo 0 honesto: "validamos seu CRM (KYC) — só médico real atende" | P1 |
| 7 | **Demo agenda (NOVA)** | **`schedule-4`** | Calendário mês + picker de slot + painel lateral (avatar, tipo sessão, duração) — agenda "funcionando" converte > screenshot. Dep: `react-day-picker` | P1 |
| 8 | Preview brief IA (NOVA) | **`ai-chat-3`** | Welcome screen do chat/brief (estático-demo, sem backend) | P2 |
| 9 | Planos `:477` | **`pricing-4`** | 3 tiers + **tabela de taxa explícita nos 2 cards** + linha "repasse automático" (sem prometer prazo) | **P0** |
| 10 | FAQ médico (NOVA) | `faq-1` (categoria) | KYC · taxa real · prazo PIX · quem é o paciente | **P0** |
| 11 | Comparativo | `compare-2` | Dr. Exame × Doctoralia Plus (R$529/mês ≈ 17× — **revalidar preço antes de publicar**) | P2 |
| 12 | CTA final `:543` | `cta-3`/`cta-5` | mantém "Pronto para a próxima consulta?" + email waitlist | P2 |

### 3.3 Componentes/padrões free a portar (não instalar)

- **`scrollspy`** — destaque de seção na navbar (MUI não tem nativo; vale ouro na landing).
- **`icon-tile`** — tile quadrado consistente p/ features (Avatar MUI `variant="square"`).
- **`badge`** pill (variantes `-light`) · `frame` (console de mock no hero) · `rating`.
- **Motion (regras da casa, transplantáveis ao tema MUI)**: hover = `transition-colors`;
  reveal `200ms cubic-bezier(0.22,1,0.36,1)` (máx 300ms); animar só `transform/opacity`;
  **1 animação de entrada por view**; cycle/swap auto **pausa em hover/focus**;
  `prefers-reduced-motion` → fade calmo; seta de botão desliza no hover (`navbar-12`).

### 3.4 Lacunas do catálogo (não existe no ReUI)

`footer` (fazer à mão — colunas de links), `testimonial` dedicado (usar `review-4` de
ecommerce), **zero bloco médico/saúde** (tudo é adaptação nossa — nossa vantagem visual).

## 4. Plano em fases

**Fase 0 — Fix de copy/contradição (horas, sem design)**
1. `:407` → "Você aparece no diretório *Encontrar especialista* — pacientes te acham (base oficial CNES)". (Descoberta, não marketplace.)
2. Navbar home: devolver pill "Para médicos →"; strip `:928` ganha "defina o valor, **receba por PIX**" e aponta `/para-medicos`.
3. Confiança `:451`: adicionar **CFM 2.454/2026** + "prontuário já nasce com carimbo de uso de IA — regularizado sem pensar nisso".
4. Planos `:477`: taxa explícita nos 2 cards + regra de decisão ("comece grátis; assine quando o PIX compensar") + "repasse automático".
5. FAQ médico novo (KYC/custo/prazo) + sub do hero citando diretório.
6. Footer home: links Para médicos + Encontrar especialistas.

**Fase 1 — Home, blocos de maior conversão**: `faq-1` (tabs) → `compare-2` → `review-4` → `cta-4` (+`stats-7` se couber no bundle).

**Fase 2 — `/para-medicos`**: `pricing-4` com taxa explícita → seção Diretório → `faq-1` médico → `schedule-4` → `hero-8` waitlist → `ai-chat-3`.

**Fase 3 — Polish**: `navbar-12` mega-menu · selo-row pós-hero · `scrollspy` · `hero-11` (só após A/B de 14d decidir a headline).

## 5. Riscos & guard-rails

- **Não mexer no hero A/B** vigente até a medição terminar (COPY-v2 §A/B).
- **Bundle landing ≤ +10%** (QA obrigatório). `schedule-4` puxa `react-day-picker`;
  `ai-chat-3`/`review-4`/`faq-1` são markup estático (baratos).
- **Mobile-first 360-412px**: matriz `compare-2` empilha; toque 44px; tabela vira card.
- **Zero número sem fonte** (COPY-v2): revalidar Doctoralia R$529 antes de publicar.
- **Supply fino de teleconsulta** (2 médicos premium c/ foto): home paciente NÃO vende
  "consultas online" em largo; oferta pesa no `/para-medicos` e no portal.
- **Não marketplace** (dono, 06/11) — copy de diretório sempre "descoberta/visibilidade".
- Não prometer prazo de PIX (split Asaas ≠ instantâneo): dizer "repasse automático".
- Proibido: renda garantida · "substitui consulta presencial" · métrica inventada · depoimento fabricado.
