# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(SPA react-admin servida também como app Android via shell Capacitor — o wrapper é distribuição, não linguagem de design nativa.)

## Users

- **Paciente (usuário primário):** brasileiro leigo em saúde, frequentemente 40+, que recebe PDFs de laboratório e não entende os valores. Job: guardar todos os exames num lugar só, entender o que significam comparados à sua história, acompanhar evolução e chegar na consulta com perguntas prontas. Titular gerencia dependentes (esquema família).
- **Médico (secundário, viewer):** acessa por CRM, vê um espelho read-only do app do paciente (Exames/Alterados/Relatório) para preparar a consulta. É também canal de aquisição (convites, perguntas pré-consulta).
- **Admin (interno):** opera painel react-admin (usuários, custos de crédito, configurações, auditoria LGPD, suporte).

## Product Purpose

**Meus Exames** (app) com assistente **Dr. Exame** (robô mascote, IA GLM-4.6): upload de PDF de lab → extração (pdftotext → texto → GLM, nunca visão) → análise comparativa e contextual não-diagnóstica → evolução longitudinal → perguntas para o médico. Sucesso = paciente entende o exame no dia que recebe e mantém o histórico vivo (engajamento: 1º exame extraído é o momento de ativação; nudges por push/e-mail por segmento).

## Positioning

Intérprete clínico conversacional **com memória**: não lê só o PDF do dia — compara contra o histórico longitudinal do paciente, gera perguntas de consulta e espelha tudo para o médico. Concorrentes diretos (CalcLab, BloodGPT) dominam a leitura pontual; direção de diferenciação: perfil biométrico derivado (eGFR, HOMA-IR, idade biológica). Médico como cliente + canal.

## Operating Context

- PDFs de laboratórios brasileiros: unidades bagunçadas, encoding corrompido (³→`*`), múltiplos exames num arquivo (split), datas distintas (merge por data).
- A consulta médica é o ritual central: perguntas amarradas por análise, plano/SOAP do médico.
- Distribuição: Play Store (Closed Testing), push FCM no Android; iPhone usa web (nudge por e-mail como fallback).
- Produção: janocaminho.com.br/minhasaude (EC2, docker, deploy automático via git push).
- LGPD/ANVISA: dado de saúde é sensível.

## Capabilities and Constraints

- **A IA NÃO diagnostica** — educa, compara com faixa de referência, contextualiza pelo perfil clínico; prompt explícito + pós-filtro `diagnosticGuard`.
- **Fonte de verdade = banco, não a IA**: valores coercidos do DB (`coerceComparativo`); score/Dashboard vêm de health-summary canônico.
- PII (CPF/RG) cifrada com pgcrypto; PDFs fora do banco (filesystem).
- Stack travada: Node 20, Prisma 6, Capacitor 7, react-admin 5.14, MUI 7, Vite 8. IA via relay Z.ai (GLM-4.6) — sem structured output/thinking/effort.
- Monetização: assinatura R$ 19,90/mês + créditos avulsos via PIX (custos parametrizados no banco, admin edita live).
- APK: `navigate(0)/reload()` crasha (usar `useRefresh`); `VITE_BASE './'`; versionCode +1 sempre; ForceUpdate compara contra `min`, nunca `latest`.
- i18n pt/en (`src/i18n/`); contas demo para Play review.

## Brand Commitments

- Verde/teal **#20b2aa** é a assinatura visual — nunca alterar (dark #178f89, light #5fc9c3). Cobre #d4a574 para acentos premium.
- Robô mascote Dr. Exame: ícone oficial `web/public/app-icon.png`; componente `DrExame.tsx`. Nunca remover; não usar `brand.png` nem `favicon.svg`.
- Estrelinha ✨ = símbolo da IA, visível sobre o badge teal (branco, nunca cor do fundo).
- Tipografia Poppins (títulos) + Inter (corpo). Clean e premium: cards grandes, muito respiro, uma ação primária por tela.

## Evidence on Hand

- App em produção funcional (`/api/health` com versionLabel de commit); Play Store em Closed Testing (gargalo conhecido: 12 testers/14d).
- Screenshots de auditoria visual no repo (audit-*.png/jpeg, incl. login mobile); material de marketing em `marketing/`.
- **Ausências que trabalho futuro não pode fabricar:** sem depoimentos/casos de cliente reais, sem números públicos de usuários, sem validação clínica formal do score.

## Product Principles

1. **Educa, nunca diagnostica** — e sempre deixa claro o que perguntar ao médico.
2. **O histórico do paciente manda** — a IA contextualiza, o banco é a verdade.
3. **Mobile-first de verdade** — o celular é o palco principal; desktop é bônus que não pode quebrar.
4. **Clean e premium** — pouco texto, muito espaço em branco, sem competição visual.
5. **Confiança acima de espetáculo** — coerência entre telas em todos os estados (vazio, processando, erro), valores estáveis, nada de mágica clínica.

## Accessibility & Inclusion

Público leigo 40+: contraste nos dois temas (light/dark), textos diretos sem jargão (jargão clínico sempre explicado), alvos de toque generosos, i18n pt-BR nativo (en disponível).
