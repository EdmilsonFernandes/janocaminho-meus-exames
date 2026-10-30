# HANDOFF FINAL — Verificação de identidade do médico (UaiID) · 29/10/2026

> Para o dono e para a próxima IA. Branch `worktree-kyc-medico` (worktree `.claude/worktrees/kyc-medico`), base `9d8ecca7`
> (= origin/main quando começou). **Tudo é local: nada foi enviado ao remoto (verificado em `git ls-remote`: a branch não existe lá).**
> A branch já contém o merge com a `main` (`aa9efed2`, main em `979934da`, 29/10 ~21h) com os conflitos resolvidos e validados;
> se a `main` andar de novo antes do push, mesclar outra vez e refazer `tsc` + testes.
> Spec: `2026-10-28-verificacao-medico-spec.md` (v1.2) · Plano servidor: `2026-10-28-verificacao-medico-plano-servidor.md`
> · Plano web/admin: `2026-10-29-verificacao-medico-plano-web.md`.

## 1. Resumo

Antes, qualquer pessoa se cadastrava como médico com nome + CRM públicos. Agora o médico só atende depois de provar quem é.
São **dois comprovantes, e os dois são necessários**:

1. **O UaiID (KYC do próprio dono) prova a PESSOA** — documento + selfie com prova de vida + situação do CPF na Receita.
2. **O Dr. Exame prova que essa pessoa é a dona do CRM** — compara, de forma ESTRITA, o nome impresso no documento (vem no
   webhook assinado, `data.full_name`) com o nome do CFM para aquele CRM.

**Todo médico novo passa pela aprovação do dono** (`doctorKyc.autoApprove = 0`). Quem já atendia continua atendendo (`legacy`) —
ninguém fica trancado no deploy.

## 2. Como funciona

**Jornada do médico.** Cadastra (ou entra pelo convite) → conta `pending`, sem atender → o portal mostra a tela "Verificar
identidade" (pede o CPF se faltar, caso do convite) → `POST /api/doctor/verification` abre a sessão no UaiID → o médico faz
documento + selfie em `https://uaiid.com.br/verify/<token>` → volta ao portal em `…/#/doctor?kyc=1` → o portal consulta o status
(o `status` da URL nunca é confiado; a URL é limpa). Quando o resultado chega e o caso segue para análise humana, ele recebe o
e-mail "Recebemos seu cadastro — está em análise"; ao ser decidido, "aprovada" ou "não foi aprovada" (com o motivo). Recusado
pode tentar de novo (teto de 5 tentativas/dia por médico + limites do UaiID).

**O que o médico preenche e o que vai ao UaiID.** No cadastro normal: nome, **CPF** (validado pelo dígito verificador), CRM + UF,
especialidade, e-mail e senha; o servidor consulta o CRM no CFM e manda um código por e-mail para ativar a conta. Pelo convite do
paciente (WhatsApp) a conta nasce sem CPF e ele é pedido na tela de verificação. Ao clicar em verificar, o servidor envia ao UaiID
**só**: CPF, nome (o do CFM; se o CFM falhar, o digitado), `external_reference` = id interno do médico, URL de retorno e uma chave
de idempotência — **não** vão e-mail, CRM, senha nem telefone. Na tela do UaiID (`https://uaiid.com.br/verify/<token>`): consentimento
→ escolha do documento (CNH, RG ou RNM/RNE) e foto da frente → selfie com prova de vida na câmera frontal → processamento → volta ao
portal (`#/doctor?kyc=1`). Guardamos só id/status/score/motivo e os nomes (documento e CFM) — nunca imagem, biometria nem número do
documento.

**Resultado chega por 3 caminhos** (qualquer um basta, todos passam pela MESMA função `syncVerification`): webhook assinado
`POST /api/webhooks/uaiid` (HMAC `X-Uai-Signature`, ±300 s) · job de reconciliação (`jobs/kycReconcile.ts`, a cada 10 min) ·
`GET /api/doctor/verification` quando o portal pergunta.

**Estados** (`doctor.verificationStatus`): `pending` · `in_progress` · `uaiid_review` (revisão manual no painel do UaiID) ·
`needs_admin` (espera o dono) · `approved` · `rejected` · `legacy`. `approved` nunca regride por sync (a única exceção é fraude
confirmada); `legacy` só sobe.

**Gate deny-by-default** (`utils/doctorAccess.ts`): `approved` sempre atende; `legacy` atende enquanto o prazo vale
(`doctorKyc.legacyGraceUntilMs`, **`0` = sem prazo**); os demais não atendem; `blocked` nunca. Fora do HTTP (e-mails ao
médico) o predicado único é `doctorMayPractice`.

**Dono** (Admin → Médicos → "Identidade"): fila "Aguardando você" com nomes lado a lado, motivo, semelhança, score, tentativas
anteriores e — novo — aviso quando o nome do PERFIL (o que o paciente vê) não bate com o do CFM; aprovar (com observação só
para auditoria) / recusar (o motivo digitado vai por e-mail ao médico); aprovar legados em lote (só quem não tem verificação em
andamento nem recusada); prazo dos legados e `autoApprove` via `PATCH /api/admin/config/costs` (validado e auditado).

**E-mails** (premium, light/dark): "Recebemos seu cadastro" (em análise) · "Sua conta foi aprovada" · "Sua verificação não foi
aprovada" (com o motivo do dono quando há) · avisos ao dono (pronto para aprovar, aguardando, CRM disputado, fraude, limite
diário). Só saem em TRANSIÇÃO real (decisão lida depois do lock ≠ decisão nova).

**Paciente.** Selo "Identidade verificada" no card da fila de teleconsulta só para quem passou por verificação de verdade
(aprovação em lote NÃO dá selo). Diretório de especialistas: quem não pode atuar não é apresentado como perfil publicado.

**Privacidade.** Nenhuma tabela nova guarda imagem, biometria ou número de documento. CPF cifrado (pgcrypto) + hash. Logs sem
PII; `doctor/verification` fora do cache offline do app; PostHog recebe a URL de volta sem ids.

## 3. Estado

| Parte | Estado |
|---|---|
| Servidor (T1–T13b), migration `20261029b_doctor_kyc`, gate, sync, webhook, job, e-mails, admin | **Pronto** |
| Portal do médico (tela de verificação, estados, 429, CPF inline, retorno `?kyc=1`) | **Pronto** |
| Painel admin "Identidade" + selo na fila do paciente | **Pronto** |
| Revisão final do servidor + re-revisão + correções (2 rodadas) | **Feitas** (ledger em `.superpowers/sdd/…/progress.md`) |
| Fumaça REAL contra o UaiID | **Feita** — achou e corrigiu 1 bug de contrato (`verify_url` vem RELATIVO) |
| AAB/APK | **AAB gerado** (29/10, 21h14): `versionCode 553` / `versionName 2.7.303`, assinado com a chave de upload (CN=Edmilson Fernandes, O=Meus Exames), 14,9 MB, SHA-256 `335D97CEF4313273270E77DF499A2D91425B5A3CE874E91DC6BDA9B25D1F191F`. **Falta subir no Play Console** (decisão do dono, depois do deploy do servidor). O `versionCode 553` está CONSUMIDO: o próximo AAB precisa de 554 ou mais. Só o selo do paciente depende dele; portal do médico e admin são web. |
| Teste em aparelho real do retorno pelo Custom Tab (`browserFinished`) | **Não feito** |
| `graphify update` | **Não feito** — o grafo não é versionado neste worktree; rodar na árvore principal depois do merge |

## 4. Deploy — checklist em ordem

0. **Vazamento em PRODUÇÃO hoje (independe do KYC):** na `main` atual, `POST /api/doctor-shares` devolve a LINHA INTEIRA do
   médico (hash de senha, CPF cifrado, PIX, tokens Google) a qualquer paciente logado. O conserto está neste branch
   (`2b2fc9d9`: seleção explícita de campos em `doctor-share.routes.ts`). **Vale um hotfix próprio na main, sem esperar o
   restante** — dá para preparar quando o dono disser.
1. **Rotacionar as chaves do UaiID que passaram pelo chat** (a antiga e a nova). Nunca colar chave em chat/commit/`VITE_*`.
2. **UaiID:** tenant ativo (a chave antiga respondia `402 tenant_suspended`), sem limite de gasto nem trial esgotado, limite de
   tentativas 3.
3. **Merge** (decisão do dono, **só junto com o Plano 2 — já está no mesmo branch**). Conflitos esperados com a `main` em
   `FalarAgora.tsx` e `DoctorPortal.tsx`. **Não reordenar** `app.ts`: `doctorVerificationRoutes` precisa ficar ANTES do
   `teleconsultaQueueDoctorRoutes` (o `requireQueueDoctor` da fila é deny-by-default e engoliria o `POST /verification`).
4. **Antes do push, higiene (somente leitura):** `SELECT id, crm FROM doctors WHERE crm !~ '^[0-9]{3,7}-[A-Z]{2}$';` — CRMs
   fora do padrão não colidem com o cadastro canônico novo (pior caso: cadastro paralelo, como já era).
5. **`.env.prod`:** `UAIID_API_KEY` (chave live) · `UAIID_WEBHOOK_SECRET` (`whsec_…`, passo 7) · opcionais `UAIID_RETURN_URL`,
   `UAIID_VERIFY_BASE_URL`, `ADMIN_EMAIL`, `KYC_DAILY_SESSION_CAP` (teto global diário de sessões do UaiID, padrão 100).
   Detalhes e padrões em `packages/server/.env.prod.example`.
   **Combinado com o dono (29/10):** no deploy, quem o executa aplica as duas variáveis no `.env.prod` do EC2 (runbook em
   `.ai/SKILL.md` → "Adicionar env var em produção"), **antes** do push para o primeiro boot já subir com elas. Os valores NÃO
   estão no repositório nem em memória: pedi-los ao dono no dia. O `whsec_` entra inteiro, com o prefixo. Cuidado: o runbook usa
   `grep -q "^VAR=" || printf …`, que **não troca** uma linha que já exista (ex.: `UAIID_WEBHOOK_SECRET=` vazia vinda do
   template) — nesse caso substituir a linha (`sed -i`) em vez de acrescentar. Conferir depois com o `curl` do passo 7.
6. **Deploy automático** (push → CI → GHCR → EC2). A migration roda no boot (`prisma migrate deploy`) — aditiva e idempotente.
   **Se der P3009, NÃO marcar como aplicada** (toda rota de médico passaria a dar 500 por `verificationStatus` ausente):
   re-rodar a migration (idempotente) e reiniciar o container.
7. **Depois de no ar, cadastrar o webhook** (painel do UaiID → Webhooks → novo endpoint). Valores (conferidos no formulário e no
   código dos dois lados):

   | Campo do painel | Valor |
   |---|---|
   | URL | `https://janocaminho.com.br/minhasaude/api/webhooks/uaiid` |
   | Rótulo (opcional) | `Dr. Exame — verificação de médicos` |
   | Eventos | `verification.*` (já vem preenchido; separar por vírgula se houver mais de um) |
   | Headers (JSON, opcional) | **vazio** — não precisamos de nenhum |
   | Segredo HMAC | gerado ao salvar e mostrado **uma única vez** ("guarde AGORA") → copiar |

   No EC2, `.env.prod`: `UAIID_WEBHOOK_SECRET=<o segredo copiado>` e recriar o container
   (`docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --force-recreate`). Até lá o job de 10 min e o
   polling do portal cobrem o buraco (só não chega o nome do documento, então o caso espera até 10 min e segue ao dono).
   Como o receptor se comporta: `POST` `application/json` até 256 KB; valida `X-Uai-Signature: t=<unix>,v1=<hex>` =
   HMAC-SHA256(`t.corpo cru`) com janela de ±5 min; responde `200 {"ok":true}`, `401 BAD_SIGNATURE` (segredo ausente/errado),
   `400 BAD_JSON` ou `500 PERSIST_FAILED` (o UaiID reentrega: 30 s, 2 min, 10 min, 30 min, até 5 tentativas; depois a reentrega é
   manual no painel). Corpo: `{"id","event":"verification.approved|rejected|manual_review","data":{verification_id, score,
   reason_code, external_reference (= id do médico), cpf_masked, full_name (nome lido no documento), birth_date, cpf_situacao},
   "verification_id"}`. Não assinar `billing.*` (não usamos). Conferir a rota logo após o deploy:
   `curl -i -X POST https://janocaminho.com.br/minhasaude/api/webhooks/uaiid -H 'content-type: application/json' -d '{}'` →
   deve responder `401 {"code":"BAD_SIGNATURE"}` (antes do deploy responde 404).
8. **Admin → Médicos → Identidade:** definir o prazo dos legados (ou deixar `0` = sem prazo) e conferir a fila. **Não ligar
   `autoApprove` antes de exigir o nome assinado (M5, abaixo).**
9. **Validar o fluxo REAL em produção** (o UaiID não tem sandbox remoto — ver §4.1):
   1. Médico de teste: cadastrar → abrir a verificação → fazer documento + selfie na tela do UaiID (consome 1 verificação do
      trial/cota) → conferir: volta ao portal (`?kyc=1`) → e-mail "Recebemos seu cadastro — está em análise" → caso em
      "Aguardando você" na aba Identidade → aprovar ou recusar → e-mail ao médico.
   2. No painel do UaiID, Webhooks → Entregas: a entrega deve estar com `200`. A **reentrega manual** repete o webhook sem gastar
      outra verificação (testa assinatura e idempotência).
   3. Atenção ao nome ESTRITO: com o seu documento e um CRM que não é seu o caso cai em "Nomes diferentes" (valida a fila, mas não o
      caminho feliz "pronto para aprovar"); o caminho feliz exige um médico real com o próprio documento. O CRM usado no teste
      fica reservado pela conta de teste: **apague a conta de teste depois** (SQL) para não travar o médico verdadeiro.
   4. `docker logs meus-exames-app --tail 100`: sem `KYC_UNAVAILABLE` nem erro de assinatura de webhook.
10. **App:** se quiser o selo no app, AAB com `versionCode` +1 e rebuild do `www`.

### 4.1 O que o UaiID oferece para teste (verificado no repositório dele, `docs/integration/sandbox.md`)

- **Chaves `uai_test_…`**: mesma API, sem cobrança de produção (trial/cota). Nosso servidor aceita qualquer prefixo (só envia
  `Bearer <chave>`), então dá para ensaiar com uma chave de teste antes da `uai_live_…`.
- **E2E do próprio UaiID** (`platform/api/scripts/e2e_verification.py` e `e2e_scenarios.py`): rodam contra o ambiente DEV dele, com
  fotos reais; não servem para validar a nossa integração em produção.
- **NÃO existe sandbox remoto determinístico** (resultado fixo por cenário). Está só desenhado no mesmo documento
  (`uai_test_` + `X-Test-Scenario` → `approved`, `rejected_face`, `manual_review`, `webhook_retry`, `timeout`…; ~2–3 dias no repo do
  UaiID). Com ele daria para ter um E2E automatizado do Dr. Exame contra o UaiID sem pessoas nem documentos reais.
- **Webhook**: o painel dele lista as entregas por endpoint e tem **reentrega manual**; não tem botão de "evento de teste".
- O que JÁ está provado do nosso lado: E2E com o UaiID simulado (`test/kyc-e2e.test.ts`, 4 cenários + a suíte), fumaça REAL na API
  (`scripts/kyc-smoke-uaiid.ts`: sessão criada, `verify_url` relativo descoberto e corrigido) e o formato do HMAC conferido no código
  dele. O que só se prova no EC2: a passagem real na tela do UaiID, o webhook assinado com o `whsec_` real e o SMTP de produção.

## 5. Riscos conhecidos e adiados (com custo se errado)

| Item | O que é | Custo / por que ficou |
|---|---|---|
| **M5** | `autoApprove=1` aprovaria sem exigir o nome assinado do documento | No-op com `autoApprove=0` (padrão). **Obrigatório corrigir antes de ligar.** |
| **I4 / m12** | O nome do documento é gravado de QUALQUER evento `verification.*` (o último vale); premissa de que `full_name` é o nome do OCR foi verificada no código do UaiID, não em produção | Se um evento não aprovado ecoar o nome do CFM, a comparação vira CFM×CFM. Aceitar o nome só de `verification.approved` e confirmar na 1ª fumaça de produção. |
| **I9** (pré-existente) | Janela de 200 repasses pode "passar fome" por médicos sem chave PIX | Já existia; só atrasa repasses elegíveis. |
| **M9 / AUD-003 parte 2** (pré-existente) | `invite/accept` sem OTP/e-mail verificado antes do JWT | Mitigado pelo gate (conta de convite não atende sem verificação). |
| **M11 / m10** | Sem rota para liberar um CRM (runbook SQL); CRMs de 1–2 dígitos e zeros à esquerda não canonizam | Raro; o dono resolve por SQL. |
| **M14** | Fila admin com `take:200`, sem paginação | Irrelevante até haver centenas de casos. |
| **M4 / M6** | Sync pode sobrescrever o motivo do dono; nome declarado não é guardado | Cosmético / auditoria. |
| **m2** | Aprovado em lote nunca ganha o selo (`ALREADY_APPROVED`) | Cosmético; o selo é para verificação real. |
| **m6, m8, m11** | Conflito em `/register`/convite sem alerta no convite; foto do paciente sem prazo de acesso; falhas silenciosas de fallback | Baixo; ver `final-review-fixes.md`. |
| Teto diário global × sessão aberta | No teto (`KYC_DAILY_SESSION_CAP`), o médico que só RETOMARIA uma sessão já aberta também recebe `503 KYC_UNAVAILABLE` | Temporário e o dono é avisado (1 e-mail a cada 6 h); subir o teto no `.env.prod` resolve. |
| Foto do MÉDICO (`/api/doctor/photo/:id`) | Segue `public, immutable` | É a foto de perfil do médico mostrada a pacientes (não é dado facial de paciente); baixo. |
| Corrida de CPF (m1) | Quem perde a corrida segue com o CPF já gravado, sem erro | Era o desenho pedido; o CPF gravado é o que vale. |
| `429 INVITE_LIMIT` no `ShareDialog` | Ao passar de 20 convites em 24 h o diálogo do paciente mostra "Falha ao gerar convite mágico" em vez da mensagem do servidor | Cosmético, uso fora do normal; consertar junto do próximo AAB (tela do paciente). |
| Desbloquear `kyc_fraud` sem confirmação | Com fraude o status vai para `rejected`, então desbloquear sozinho não devolve a prática | Baixo. |

## 6. Para quem continua — armadilhas

- **Rotas:** não reordenar `doctorVerificationRoutes` antes/depois da fila (ver §4.3).
- **Testes:** SEMPRE `npm test --workspace packages/server -- <arquivos>` (nunca `npx vitest` da raiz); banco de teste dedicado na
  porta 5433 (`TEST_DATABASE_URL`, ver `test/setup.ts`); com a máquina carregada use `--hookTimeout=90000 --testTimeout=90000`.
  Web: `node ../../node_modules/vitest/vitest.mjs run <arquivo>` dentro de `packages/web`; typecheck web SEMPRE
  (`vite build` não type-checka).
- **Contrato do UaiID** (a verdade é o código do dono em `projeto-pessoal/kyc-janocaminho`): `verify_url` é RELATIVO
  (`/verify/<token>`); domínio `uaiid.com.br`; `402` (`tenant_suspended`/limite/trial) e `429`
  (`attempt_limit_cooldown`/`attempt_limit_exceeded`) viram mensagens próprias no portal; `Idempotency-Key` reaproveita 24 h;
  sessão aberta é reaproveitada por CPF.
- **Lock único por médico:** `pg_advisory_xact_lock(hashtext('kyc-doctor:<id>'))` é usado por `syncVerification`, approve, reject
  e o lote de legados. Qualquer escrita nova de decisão deve usar a MESMA chave (antes eram chaves diferentes e corriam).
- **Fraude** (`fraud_confirmed`) vale para qualquer tentativa e qualquer status: bloqueia e força `rejected`.
- **Foto do paciente** (`GET /api/patients/:id/photo`): o JWT sozinho nunca basta. Token de USUÁRIO só abre para o dono do paciente
  (`Patient.ownerId`) ou ADMIN; token de MÉDICO passa pelo gate KYC + vínculo. O front escolhe a sessão por rota
  (`photoTokenKeys` em `web/src/config.ts`): em `#/doctor…` o token do médico vem primeiro — quem é paciente E médico no mesmo
  navegador tem os dois. Ao criar uma nova tela do lado médico FORA de `/doctor`, ela precisa seguir a mesma regra.
- **Segredos** só em `.env`/`.env.prod`; nunca `VITE_*`; nada de imagem/biometria/documento/CPF em tabela nova ou log.
- **Git:** commits só locais neste branch; nunca `git stash` puro (pilha compartilhada entre worktrees); a árvore principal tem
  WIP de outra IA (Reminders, Medicos, sports) — não tocar.
- **QA visual:** `packages/web/e2e/qa-kyc-medico.mjs` e `qa-kyc-admin.mjs` (Playwright com `**/api/**` mockado).

## 7. Validação feita

Árvore validada: o merge com a `main` (`aa9efed2`) + versão 553 + correção de um teste (`8243c686`), em 29/10 entre 20h e 21h15.

| Verificação | Resultado |
|---|---|
| Typecheck servidor (`tsc --noEmit`, incremental) no resultado do merge | limpo, sem erros |
| Typecheck web (`tsc --noEmit`, incremental) no resultado do merge | limpo, sem erros |
| Suíte COMPLETA do servidor no resultado do merge (3 fatias em 3 bancos de teste, `vitest --shard`) | 190 arquivos, 1.803 testes: 1.801 verdes na execução + 1 pulado (`ocr.test.ts`, faltam imagens de fixture, já era `it.skip`) + **1 falha** (`auditoria-p0 › AUD-003`, ver abaixo), corrigida em `8243c686` e reexecutada: arquivo 6/6 |
| Suíte COMPLETA do web no resultado do merge | 37 arquivos, 512 testes, zero falhas |
| Fumaça REAL contra o UaiID | feita antes (sessão criada; bug do `verify_url` relativo achado e corrigido) |
| Migration em banco antigo com médicos sintéticos | verificada (só conta real vira `legacy`; idempotente) |
| Revisões independentes (Opus) | revisão final do servidor + re-revisão das correções (ver `.superpowers/sdd/…/final-review-*.md`) |
| AAB | `BUILD SUCCESSFUL` (8m21s), `jarsigner` ok, manifesto com `versionCode 553` / `2.7.303` |

**O que o merge com a `main` exigiu** (4 conflitos, detalhes em `aa9efed2`): `app.ts` (convite do médico: mantido o nosso lookup por
CRM/e-mail e o CRM canônico, mais a senha mínima e o formato de e-mail da `main`), `teleconsulta.routes.ts` (mantido o nosso
`doctorAccessDenial`, que cobre o bloqueio do AUD-004 da `main` e a verificação), `teleconsultaQueue.routes.ts` (variável
`presenceAll` da `main` com o nosso filtro de quem pode atuar) e `subscription-compat.test.ts` (`hasCoupon: true`).
**Decisão registrada:** o teste do AUD-003 da `main` esperava `400` para CRM com UF inexistente; a nossa spec manda `422 CRM_INVALID`
(o mesmo do cadastro principal). O front trata o erro de forma genérica, então ficou o `422` e foi ajustada só essa expectativa.

## 8. Mapa de arquivos

- **Servidor:** `src/utils/uaiid.ts` (cliente) · `src/utils/doctorAccess.ts` (gate) · `src/kyc/{decide,sync,notify,emails}.ts` ·
  `src/routes/{doctor-verification,uaiid-webhook,admin,doctor,doctor-share,doctor-question,specialists,teleconsultaQueue}.routes.ts` ·
  `src/jobs/kycReconcile.ts` · `prisma/migrations/20261029b_doctor_kyc/` · `scripts/kyc-smoke-uaiid.ts` (fumaça real; a chave
  só entra por variável de ambiente).
- **Web:** `src/components/doctors/portal/verification/*` (portal) · `src/pages/admin/{DoctorVerificationPanel.tsx,doctorVerification.ts}`
  · `src/pages/DoctorPortal.tsx` · `src/pages/FalarAgora.tsx` (selo) · `src/utils/{fetch-cache,analytics}.ts`.
- **Processo:** ledger e relatórios em `.superpowers/sdd/2026-10-28-verificacao-medico-plano-servidor/` (git-ignored):
  `progress.md`, `final-review-server.md`, `final-review-fixes.md`, `final-fix-B-report.md`.
