# Roadmap de features — inspirado nas skills de saúde (29/09)

> Fontes avaliadas: googlarz/health-skill (lógica clínica pessoal), reason-healthcare/health-skills (compliance/human-factors), FreedomIntelligence/OpenClaw (869 skills médicas), Aperivue/medsci-skills (pesquisa/qualidade de citação), + BioAge/PhenoAge/FaceAge.
>
> **Princípio do dono: "útil e não confuso".** Regra de ouro: **nenhuma feature nova ganha aba, menu ou botão novo** — ela mora DENTRO de algo que já existe (card, chat, relatório). Se precisar de navegação nova, primeiro prova valor 2 semanas dentro de um card existente.

## Camada 1 — Leitura personalizada do SEU exame (googlarz/health-skill)

### F1. Alvos personalizados por medicação/condição ⭐ prioridade máxima
- **O quê**: a mesma análise, com o alvo CERTO pra você. TSH mais estrito pra quem usa levotiroxina; LDL < 100 (e < 70 se muito alto risco) com diabetes; PA < 130/80 com hipertensão; HbA1c < 7 no diabético.
- **Onde mora**: nos itens que já existem — badge "🎯 alvo personalizado: usa levotiroxina" no toque (nunca muda o número do laboratório, mostra o SEU alvo ao lado).
- **Base**: googlarz `explain-lab` (MIT). Núcleo server: `personalized-targets.ts` com mapa {med/condição → alvo + motivo + citação (SBC/SBD/ADA/SBN)}.
- **Por quê é a nº1**: hoje o app julga seu TSH pela faixa genérica do papel — a leitura mais útil do app está errada por omitir contexto que o app JÁ TEM (suas medicações).

### F2. Efeito colateral relatado × remédio × tempo
- **O quê**: você conta no chat "estou com náusea desde terça" → a IA conecta ao remédio começado segunda ("perfeito timing com a sibutramina, náusea é o efeito mais relatado na FDA — veja o card") e registra a linha do tempo.
- **Onde mora**: no chat (resposta da IA) + no card FAERS do remédio ("o que VOCÊ relatou"). Zero tela nova.
- **Base**: googlarz side-effect timeline. Não vira diário de sintomas (poluição) — só quando VOCÊ fala.

## Camada 2 — Segurança do paciente (OpenClaw crisis-detection + IEC 62366)

### F3. Acolhimento no PHQ-9 item 9 (ideação suicida) ⭐ segurança
- **O quê**: o item 9 do quiz já é flagado server-side (`hasSuicidalIdeation`) — elevar: resposta imediata acolhedora com **CVV 188** (texto validado por protocolo público), sem espera da próxima tela.
- **Onde mora**: na própria tela de resultado do quiz que já existe.
- **Por quê**: app de saúde mental SEM isso é omissão. É a feature com maior peso moral do backlog.

### F4. Interpretação calibrada (nunca falsa urgência/falsa calma)
- **O quê**: padronizar copy de alertas por severidade real (benchmark interno: "vale conversar com seu médico" — nunca "URGENTE" sem base, nunca minimizar crítico).
- **Onde mora**: revisão das copies existentes com a skill `health-human-factors` (item 3 do checklist).

## Caminha 3 — Qualidade interna (zero UI)

### F5. verify-refs nas diretrizes
- **O quê**: rodar verificação de citações (Aperivue `verify-refs`) nos 6 `.md` de diretrizes antes da sua revisão médica — garante que nenhuma citação da IA na verdade foi inventada.
### F6. KDM como 2º estimador de idade bio
- **O quê**: Klemera-Doubal (do BioAge/Kwon) ao lado do PhenoAge quando os insumos existirem — concordância entre 2 métodos = credibilidade ("2 métodos independentes dizem X").

## O que NÃO fazer (anti-polução — decidido 29/09)
- ❌ Ensaios clínicos no portal médico (removido — EN sem contexto, zero valor na consulta)
- ❌ Diário de sintomas/checklist "tomou remédio?" (pressão ansiosa; se um dia, só reativo via chat)
- ❌ Mais abas/menus: dashboard/evolução/exames já cobrem a jornada
- ❌ FaceAge (idade pela foto): biometria facial = dado sensível LGPD + infra de modelo — só com decisão explícita do dono e consentimento dedicado
- ❌ Instalar bibliotecas de skills inteiras (869 do OpenClaw) — cherry-pick de padrão, nunca volume

## Ordem de execução
F1 (alvos personalizados) → F3 (CVV) → F5 (verify-refs pré-revisão) → F2 (timeline efeito) → F4 (copy) → F6 (KDM)

## F7. Legibilidade real (dono 29/09: "letrinhas bem difíceis de ler no Samsung Ultra") ⭐ junto com F1
- **Causa técnica provável**: texto todo em `px` fixo (typography base 14 + dezenas de 10.5/11/11.5 espalhados) — `px` NÃO respeita o "Tamanho da fonte" do Android (fontScale/textZoom). Usuário com fonte grande no sistema vê o app pequeno igual.
- **Plano**:
  1. **Floor 12px absoluto** — varredura dos 10.5/11/11.5 (estende a regra da auditoria D2 que já valia).
  2. **Respeitar textZoom do Android** no WebView do Capacitor (o sistema amplia, o app acompanha SEM quebrar: testar 320/390/430px + fontScale 1.3 no Playwright).
  3. **Escala tipográfica única** (12/13/15/17/20/24) com line-height confortável (1.5 corpo) — "colírio pros olhos" = menos tamanhos diferentes, não mais opções.
  4. Labels de input ≥16px em touch (já regra do polimento mobile).
- **Onde mora**: theme.ts + varredura; nenhuma tela nova.
- Aprovado pelo dono: F1→F7 (29/09). Execução em lotes: F7+F1 primeiro (mesma frente visual/clínica).
