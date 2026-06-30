# Meus Exames — Documento completo para a IA gerar slides de apresentação

> Contexto para a IA que vai montar os slides: este é um documento fiel do que o
> app **realmente faz** (paciente + médico). Use pra criar uma apresentação para
> **usuários (pacientes)** e **médicos**, destacando as funcionalidades principais,
> a área médica, notificações/push e segurança (MFA + biometria). Os prints estão
> em `packages/web/store-screenshots/` (8 telas do paciente) + outras em `docs/`.

## 1. O que é (resumo de 1 linha)
**Meus Exames** é um assistente de saúde com IA: o paciente sobe exames (sangue,
imagem, laudo) e a IA lê, explica em português simples, cruza valores entre
coletas e gera relatórios — tudo organizado num painel pessoal que pode ser
compartilhado com o médico. App mobile (Android, Play Store) + web (PWA).

## 2. Público
- **Paciente (titular + dependentes/família):** centraliza exames de todos,
  entende o que cada valor significa, acompanha evolução, recebe lembretes.
- **Médico (área médica isolada):** portal próprio onde acessa, **com
  consentimento do paciente**, os exames/evolução/alterações do paciente — sem
  instalar nada, via link seguro (CRM + escopos).

## 3. Funcionalidades principais (paciente) — com print
1. **Painel/Dashboard** (`store-screenshots/02-painel-dashboard.png`): saudação,
   **SCORE de saúde (0–100)**, resumo de valores fora da faixa, atalhos.
2. **Lista de exames** (`03-lista-exames.png`): organizada por data ou categoria,
   com badge de status (processando/pronto).
3. **Detalhe do exame com IA** (`04-detalhe-exame-ia.png`): cada analito com
   valor, faixa de referência e flag (normal/alto/baixo) + explicação da IA.
4. **Dr. Exame (IA conversacional)** (`05-dr-exame-ia.png`): chat que responde
   dúvidas sobre os exames em linguagem simples (educativo, não substitui o médico).
5. **Evolução/Tendências** (`06-evolucao-graficos.png`): gráficos de como cada
   analito evoluiu entre coletas (melhorou/piorou/estável pela distância à faixa).
6. **Valores alterados** (`07-valores-alterados.png`): só o que está fora da faixa,
   ordenado por prioridade de atenção, com botão de telemedicina/agendar especialista.
7. **Relatório completo** (`08-relatorio-completo.png`): a IA junta os últimos
   exames num documento único (comparativo, pontos de atenção, metas, nutrição)
   — pronto pra levar ao médico ou pedir 2ª opinião.
8. **Envio/upload de exame:** foto (ML Kit scanner de documento) ou PDF → a IA
   extrai os dados (pdftotext → GLM-4.6, **sem visão** pra não alucinar).
9. **Compartilhamento com médico:** o paciente escolhe os escopos (exames,
   evolução, alertas, resumos) e gera um link seguro pro médico acessar.
10. **Lembretes:** "refazer hemograma em 6 meses" — com push de aviso.
11. **Medições, Vacinas, Despesas médicas, Linha do tempo, Família, Conquistas**
    (gamificação), Cartão de emergência.

## 4. Área médica (portal do médico) — DESTAQUE pra slides de médico
- **Shell isolado** (`/#/doctor`): sem o chrome do app do paciente. Login por
  **CRM + UF + senha** (ou OTP por e-mail).
- O médico vê os dados **do paciente que compartilhou** com ele: exames,
  evolução (gráficos), valores alterados, resumos da IA — conforme os escopos
  autorizados. **Nota clínica** (médico pode registrar observações).
- Acesso por **link/convite** (o paciente compartilha; o médico resgata pelo CRM).
- *Print sugerido:* tela do portal do médico mostrando os exames/evolução do
  paciente (`audit-10-doctor-portal-login-*.png` existe; capturar a tela de
  dados do paciente no portal).

## 5. Notificações / Push — DESTAQUE
- **Push nativo (FCM):** lembretes de exame, **nudges de saúde** ("seu
  hemoglobina está fora da faixa, vale revisar com o médico"), respostas da IA.
- **Notificações in-app:** central de notificações (`/notificacoes`) com badge
  de não-lidas; tocar leva direto pro item (exame, chamado).
- **Nudge por e-mail (fallback):** quem não tem push (ex.: iPhone web) recebe
  o aviso por e-mail (SMTP Zoho), com link de descadastro.
- *Print sugerido:* tela de Notificações + um exemplo de popup de alerta
  (`pw-alerts-mobile.png` existe).

## 6. Segurança — DESTAQUE (MFA + biometria + LGPD)
- **Biometria (BiometricGate):** o app trava por ocioso e só destrava com
  biometria (digital/rosto) do aparelho — protege dados sensíveis de saúde.
- **MFA (2 fatores):** médico tem OTP por e-mail no login; paciente pode ativar
  verificação em 2 etapas.
- **LGPD:** dados criptografados, consentimento explícito pra compartilhar com
  médico (escopos granulares), descadastramento em 1 clique, exclusão de conta.
- **Tokens JWT**, isolamento paciente×médico, auditoria de ações sensíveis.
- *Print sugerido:* tela de Segurança (`/seguranca`) mostrando MFA/biometria/LGPD.

## 7. Suporte (chamados estilo Zendesk) — diferencial novo
- Paciente abre chamado com **número, assunto pré-definido e anexos (prints)**,
  acompanha **status** (em andamento / aguardando você / resolvido) e **conversa**
  numa thread com o suporte. Resposta do admin gera notificação + e-mail.
- *Print sugerido:* `/suporte` (lista + conversa).

## 8. Monetização
- **Plano mensal R$19,90** (sem anual) + **créditos avulsos via PIX**.
- Créditos por ação de IA (resumo, relatório consolidado, chat). Admin ajusta
  os custos e regras de envio no backoffice (config persistida no banco).
- Free: cota limitada de envios + créditos de cadastro.

## 9. Tecnologia (slide opcional "por trás")
- IA **GLM-4.6** (relay), extração por **texto** (pdftotext + tesseract, sem
  visão), scanner **ML Kit**, frontend **React + react-admin + MUI**, backend
  **Node + Express + Prisma/Postgres**, mobile **Capacitor** (Android).
- Infra: Docker, deploy automático (git push → EC2), backup S3.

## 10. Estrutura sugerida dos slides
1. Capa — "Meus Exames: sua saúde com IA no bolso".
2. Problema — exames difíceis de entender, dispersos, esquecidos.
3. Solução — 1 painel, IA explica, cruza valores, lembra.
4. Como funciona — upload → IA extrai → painel + evolução (prints 01→04).
5. Dr. Exame (IA) + Relatório (prints 05, 08).
6. **Área médica** — médico acessa dados do paciente com consentimento (print portal).
7. **Notificações/Push** — nudges de saúde + lembretes (print notificações).
8. **Segurança** — biometria + MFA + LGPD (print /seguranca).
9. Suporte — chamados com número e status.
10. Planos — R$19,90/mês + créditos via PIX.
11. (Médico) Portal do médico: acesso por CRM, escopos, nota clínica.
12. Fechamento — contato / call to action.

## Prints disponíveis (paciente, 9:16, em packages/web/store-screenshots/)
01-landing, 02-painel-dashboard, 03-lista-exames, 04-detalhe-exame-ia,
05-dr-exame-ia, 06-evolucao-graficos, 07-valores-alterados, 08-relatorio-completo.
**Faltam capturar:** área médica (portal do médico), tela de Notificações,
tela de Segurança (MFA/biometria), /suporte (chamados).
