# Replanejamento do Primeiro Acesso, Perfil e Estados Vazios — 2026-08-22

> Princípio norteador: **ausência de informação ≠ informação positiva.**
> `sem dados ≠ em dia` · `sem exame ≠ calculando` · `insuficiente ≠ em breve`

## O que mudou (resumo executivo)

### 1. Onboarding progressivo (CompleteProfileModal → stepper "Vamos preparar o Dr. Exame")
- 3 passos: **sexo + nascimento → altura + peso → CPF (só se ausente, ex.: conta Google)**.
- Cada passo explica o *porquê* (referências dos exames, IMC, validação de identidade dos PDFs).
- Salvamento progressivo (abandono no meio não perde dados); skippável por sessão (`sessionStorage`, não mais `localStorage` por dispositivo).
- Trigger pela **completude do server** (`GET /patients/:id → profileCompleteness`), não mais binário client-side.
- Peso do onboarding vira a 1ª **medição** WEIGHT (ensina a feature na hora certa).

### 2. Completude de perfil + peso atual (server, fonte única)
- `GET /patients/:id` agora devolve `profileCompleteness { pct, missing }` (essenciais: `gender, dateOfBirth, heightCm, weight, cpf`), `weightKg` e `weightMeasuredAt`.
- Etnia ficou **opcional de verdade** (nenhum cálculo usa — eGFR é race-free CKD-EPI 2021; copy do Perfil agora é honesta sobre isso).

### 3. Estados vazios honestos (availability)
- `health-summary` devolve `availability { healthScore, biologicalAge, cardiometabolic }` com `status` (`ready|no_data|missing_profile|insufficient_data`) + `missing[]`.
- Dashboard: hero sem exames = **"Começa com seu primeiro exame" + CTA** (nunca "Calculando…" eterno); "Nada crítico" só com score real; tile cardiometabólico **"Sem dados"** neutro sem input (nunca "Em dia"); Idade Biológica diferencia **falta de perfil** (CTA perfil) de **falta de exame** (CTA exame) e lista marcadores que faltam.
- Alterados: 0 exames → onboarding com CTA; "✅ Tudo dentro da faixa" só para quem TEM exames.
- `POST /risk/assess` com 0 marcadores: **não persiste mais** `riskLevel:'low'` (devolve `insufficientData`).
- Novo **NextStepsCard** no dashboard (2 passos, 1 CTA primário, some quando pronto) + `dx-profile-updated` event p/ reação imediata.
- Conquistas: upload REJEITADO/FAILED não conta mais como progresso.

### 4. CPF divergente = REJEIÇÃO (não mais flag invisível)
- Novo estado `ExamStatus.REJECTED` (+ migration aditiva + **backfill** de EXTRACTED mismatched).
- Pipeline: `cpfMatch:false` → REJECTED **antes** de gravar itens/notificar (sem push "pronto" enganoso, sem cobrança); splits herdam a rejeição.
- Fora de todos os agregados por construção (`status≠EXTRACTED`) — resolve vazamentos p/ portal médico, conquistas, insights.
- UI: seção "Não adicionados (CPF divergente)" na lista + card no detalhe com CPFs mascarados + **"Acredito que houve um erro" → `/suporte?exam=ID`** com chamado pré-preenchido (categoria nova) e contexto técnico anexado pelo server (ID, status, CPFs **mascarados**, sha256 — nunca CPF integral).
- `failureKind` (`ia_error|not_a_document|low_quality`) estrutura o FAILED p/ CTA diferenciado.

### 5. Arquitetura da informação (nada desapareceu)
| Funcionalidade | Antes | Agora |
|---|---|---|
| Dados pessoais/clínicos, preferências, indicação | Perfil | Perfil (mantém; peso vira **leitura** + atalho) |
| Registrar peso | Perfil (input duplicado) + Medições | **Só Medições** (1 clique, Enter salva, toast, scroll até o form) |
| Trocar senha | Perfil | **Segurança** (com MFA + biometria) |
| Export/Import/Excluir/ZIP | Perfil | **Privacidade → Gerenciar seus dados** |
| "usa Homens" (sexo) | "Prefiro não informar (usa Homens)" | "Não informado" + helper explicando a referência; idade bio informa quando assume sexo masculino |

### 6. Fixes colhidos pelo QA (Playwright 375px + 1280px)
- Peso do onboarding não salvava (POST sem `measuredAt` obrigatório).
- Medição com data-only exibia **dia anterior** no fuso BR (agora meio-dia UTC, imune a ±11h).
- Criar/excluir medição agora **invalida o cache** do health-summary (cardio/IMC reagem na hora, não 5min depois).

## Cenários de teste (A–L) → `packages/server/test/onboarding-availability.test.ts`
A/B (zero exames + perfil incompleto), C/K (perfil completo + peso, sem exames → cardio ready com IMC REAL), E (exame → score ready), F (antigo sem altura), G (REJECTED fora dos agregados + visível + ticket mascarado), L (insuficiente p/ idade bio com lista do que falta). I (duplicado) e J (erro) cobertos pelas suítes existentes (exam-dedup, pipeline). Suíte completa: 452+ testes verdes.

## Pendências deliberadas (backlog)
- Portal do médico: empty "Nenhum valor alterado" p/ paciente sem exames (mesma honestidade, lado doctor).
- OCR sem CPF legível segue `name_fallback` (não rejeita) — proposital (falso-positivo é real).
- `insufficient_data` do cardiometabólico parcial (score otimista com poucos inputs) — precisaria de ponderação por cobertura; anotado.
- AAB pendente: working tree contém WIP não-commitado (Remédios/interações) que entraria no bundle — aguardar commit/decisão do dono.
