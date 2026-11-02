# Patrocinadores & Opiniões dos usuários (02/11/26)

Duas funcionalidades integradas ao admin, ao app do paciente e ao portal do médico.

## 1. Campanhas de patrocinador (popup pós-login)

**Onde configurar:** Painel Admin → *Comercial & Negócio* → **Patrocinadores & Campanhas** (`/#/admin?tab=sponsors`).

1. **Regras globais**: liga/desliga o popup (kill-switch) e define o intervalo mínimo em horas entre popups de *qualquer* campanha para o mesmo usuário (padrão 24h). Vale sem deploy (AppSetting `sponsorAds`).
2. **Patrocinador**: nome, site (https), notas, ativo. Depois de salvar, "Subir logo" (JPG/PNG; recorte quadrado automático). Patrocinador inativo não publica.
3. **Campanha** ("Nova campanha" → rascunho):
   - título (≤60), descrição (≤220), texto do botão (≤24);
   - destino: sem botão · tela do app (`/planos`, `/exams`…) · site externo (**só https**, validado);
   - público: pacientes · médicos · todos (**nunca** por exame/diagnóstico/medicação);
   - início/término (vazio = imediato/até encerrar), prioridade (maior ganha), intervalo por usuário (h) e máximo de exibições por usuário (0 = sem limite; 1 = uma vez só);
   - imagem opcional ("Imagem" na lista, após salvar). Sem imagem, o popup usa o logo.
4. **Prévia** (ícone de olho): o mesmo cartão do app, em moldura mobile ou desktop. **Não conta impressão.**
5. **Estados**: Rascunho → *Publicar* → Ativa (ou Agendada se o início é futuro) ⇄ *Pausar/Retomar* → *Encerrar* (definitivo; crie outra para rodar de novo). Rascunho pode ser excluído; o resto fica no histórico.
6. **Métricas** por campanha: impressões efetivas, usuários alcançados, cliques, dispensas e **CTR = impressões com clique ÷ impressões** (1 clique por impressão; eventos idempotentes — reload/retry não duplica). Detalhe diário e por plataforma em `GET /api/admin/campaigns/:id/metrics`.

**Quando o popup aparece (app):** só no dashboard (`/`), depois do boot assentar e sem outro modal aberto; entra na bateria "máx. 1 modal de boot por sessão" (onboarding, novidades, MOTD e notificação recente ganham dele) e nunca na mesma sessão da pesquisa de opinião. Se o serviço falhar, o app segue normal. Fechar = dispensa (reaparece só após o intervalo da campanha, até o máximo por usuário).

## 2. Opiniões dos usuários (pesquisa curta)

**Onde consultar:** Painel Admin → *Visão Geral & Growth* → **Opiniões dos Usuários** (`/#/admin?tab=feedback`).

- **Denominadores sempre visíveis**: respostas no filtro, participantes (pessoas distintas), base elegível (pacientes + médicos) e participação. Com < 10 respostas o painel avisa para ler como sinais individuais.
- **Blocos**: "Conseguiu fazer o que precisava?" (n ao lado), dificuldades mais citadas (pondera "em parte/não"), o que faria diferença, tipo de problema (usabilidade · falha técnica · entender o valor · créditos/preço · pedido de funcionalidade · outro) e evolução semanal.
- **Filtros**: período, perfil (paciente/médico), status, resultado, categoria, dificuldade, busca livre (comentário/tag/nota) e melhoria associada.
- **Detalhe/triagem**: contexto técnico mínimo (gatilho, tela, plataforma, versão, já enviou exame), status (nova → em análise → planejada → resolvida), categoria, tags, **melhoria associada** (agrupa relatos sem perder o original — aba "Melhorias") e notas internas. Tudo auditado.
- **Convite contextual** (configurável no mesmo painel, AppSetting `feedback`): liga/desliga, idade mínima da conta (padrão 2 dias), intervalo após dispensa (30 dias), máximo de dispensas (3). O **acesso permanente** ("Dar minha opinião" em Perfil → Preferências, e no menu do portal do médico) nunca depende disso.

**A pesquisa** (versionada em `packages/server/src/feedback/surveys.ts`): Q1 "Você conseguiu fazer o que precisava?" → Q2 adapta o enunciado (ajudou / dificuldade / o que ajudaria a começar, até 3 opções) → Q3 "O que mais faria diferença?" → comentário opcional (orienta a não incluir dados médicos). Médico tem opções próprias (pacientes, exames compartilhados, atendimento, teleconsulta, documentação…). A resposta fica vinculada à conta — e o app diz isso. Retry após falha não duplica (`clientKey`). Mudou o sentido de uma pergunta → subir `version` (respostas antigas mantêm o significado).

## 3. Validação

- API: `packages/server/test/sponsor-campaigns.test.ts`, `feedback.test.ts` (regras puras + supertest, 22 testes).
- E2E Playwright: `packages/web/e2e/sponsors-feedback.spec.ts` (config própria `sponsors-feedback.config.ts`; mobile 375 + desktop 1440): estados da campanha, popup/foco/Esc/CTA/métricas, reload sem repetir, prévia sem impressão, pesquisa completa (paciente e médico), convite + dispensa, exclusividade popup × convite, triagem no admin, 403/401.
