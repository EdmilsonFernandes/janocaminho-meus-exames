# SPEC — Verificação de identidade do médico (KYC UaiID) v1.2
> Desenho fechado com o dono em 28/10/26. v1.1 = revisão contra o código real durante a escrita do plano (8 pontos de auth, fonte do nome do documento, URL real da API). v1.2 = começo sempre humano (`autoApprove 0`), e-mails premium ao médico (§5b) e E2E do servidor. Base: auditoria `docs/auditoria/2026-10-28` (AUD-003, P0) + código do Dr. Exame e do UaiID (`projeto-pessoal/kyc-janocaminho`), file:line verificados em 28/10/26. Plano do servidor: `2026-10-28-verificacao-medico-plano-servidor.md`.

## Problema
CRM (nome + número) é público e o consultaCRM só prova que o CRM **existe**; o OTP só prova posse de um e-mail. Nada prova que quem cadastra é o **titular** do CRM — e esse cadastro já atende na fila, herda compartilhamentos de pacientes e recebe repasse.
**Objetivo:** só médico com identidade comprovada atende, vê dado de paciente ou recebe repasse. Quem tentar se passar pelo médico fica registrado.

**Como se prova pessoa ↔ CRM (duas provas, as duas obrigatórias):**
1. **UaiID prova quem é a pessoa:** documento autêntico (RG/CNH/RNE) + selfie + prova de vida + CPF na Receita.
2. **Dr. Exame prova que essa pessoa é o titular do CRM:** nome do documento **igual (estrito)** ao nome que o CFM mostra para aquele CRM/UF. Usuário que não é médico, ou que usa CRM alheio, para aqui.

**Risco residual:** homônimo exato de um médico ativo (mesmo nome completo) que saiba o CRM dele. v1: a tentativa deixa rosto + documento + CPF reais registrados (falsidade ideológica / exercício ilegal — dissuasão forte). v2 fecha 100%: carteira do CRM como documento no UaiID (foto + número do CRM no próprio documento).

## Base real — Dr. Exame (verificada em código)
- Cadastro `POST /doctor/register` (`doctor.routes.ts:297-351`): consultaCRM (`lookupCfm`, `utils/cfm.ts:32`, 100/mês) bloqueia "inativo" com `/ativo/i` (`:315`) — **bug: casa "Inativo"**; passa se a API falhar; não compara nome; claim de `pending-invite` herda shares (`:325-332`, risco admitido em `:344-347`).
- Ativação `POST /doctor/verify-email` (`:384-399`) → JWT direto; não há aprovação.
- **8 pontos aceitam token de médico**, cada um com auth LOCAL por decisão de arquitetura (padrão D8 — `examRequest.routes.ts:10-12`, `consult-summary.routes.ts:17-18`):
  1. `requireDoctor` (`doctor.routes.ts:89`)
  2. PDF do exame com token inline (`doctor.routes.ts:686-692`)
  3. `requireDoctor` (`collection.routes.ts:27`)
  4. `requireQueueDoctor` (`teleconsultaQueue.routes.ts:46`)
  5. `requireDoctorIdentity` (`examRequest.routes.ts:32`)
  6. `requireAnyIdentity`, ramo médico (`examRequest.routes.ts:52`)
  7. `requireDoctorIdentity` (`consult-summary.routes.ts:42`)
  8. `requireJoinIdentity`, ramo médico (`teleconsulta.routes.ts:56`)

  **Os pontos 2, 5, 6, 7 e 8 nem checam `blocked`** — bug atual: médico bloqueado baixa PDF e entra em teleconsulta. A spec da fila previa "CRM verificado" no `online:true` — não implementado.
- Fila: presença `teleconsultaQueue.routes.ts:84` e candidatos do job `jobs/teleconsultaQueue.ts:154-160` filtram só `blocked`.
- Convite `POST /api/public/doctor-invite/:token/register` (`app.ts:533-616`): sem CRM/UF válidos nem CFM, JWT 7d + share ativo (AUD-003).
- Repasse: `runPayoutPass` (`finance/payout.ts:62`; loop por médico `:112-118`); exceções idempotentes `enqueueException(kind, chave, payload)` (`jobs/reconciliation.ts:51`).
- Admin: `GET /doctors`, `POST /doctors/:id/block|unblock` (`admin.routes.ts:1085-1137`); categorias numéricas de settings editáveis por `PATCH /api/admin/config/costs` (`NUMERIC_CATEGORIES`, `:265-282`); getters com fallback (`utils/settings.ts:225`).
- `express.json` global em `app.ts:111`; webhooks openpix/asaas montados depois (`:373-376`). Jobs no boot `index.ts:45-59`; padrão `jobs/reconciliation.ts:260-277`. Expurgo de audit só apaga `ACCESS` (`jobs/auditRetention.ts:13`).
- Deep link: App Link `https://drexame.janocaminho.com.br` (`mobile/android/app/src/main/AndroidManifest.xml:85-90`), hash em `web/src/utils/deepLinks.ts:11-30`; Custom Tab `Browser.open` (`web/src/utils/telemedicina.ts:16-31`). Portal = `#/doctor` (`App.tsx:1455`).
- Rotas de onboarding (`doctor.routes.ts`): `GET /me` (:475 e :484), `PUT /me` (:491), `PUT /me/password` (:535), `POST /me/photo` (:550), `PUT /profile` (:457), `GET /me/plan` (:126), MFA (:453, :479-481).
- Testes: `createDoctor` (`test/helpers.ts:198`) registra + ativa e-mail direto; `resetDb` trunca todas as tabelas (`:17-36`); 7 testes criam médico direto no Prisma.
- Última migration `20261029a_doctor_city` → nova = `20261029b_doctor_kyc`.

## Base real — UaiID (`kyc-janocaminho/platform`)
- **API em `https://api.uaiid.com.br`** (nginx `deploy/nginx.conf:33-35`; `NEXT_PUBLIC_API_URL`, `deploy/docker-compose.prod.yml:44`). A doc pública diz `uaiid.com.br/v1` — dá 404 (testado 28/10/26). `GET /v1/verifications` com a chave de dev → 200.
- `POST /v1/verifications` `{cpf, full_name, external_reference, mode, flow, return_url}` (`api/app/schemas.py:22-107`); sessão aberta p/ o mesmo CPF é reaproveitada e a intenção mais recente vence (`api/app/api/verifications.py:35,268`). O `full_name` declarado é cruzado com o documento.
- `return_url` aceita `https://` ou deep link; o botão final redireciona com `?status&verification_id&external_reference` (`web/app/verify/[token]/page.tsx:661-745`).
- Nome no UaiID: fuzzy `≥ 0.75`, divergência só manda p/ revisão (`api/app/scoring.py:43,129`) — "Souza" × "Santos" = 0.80 passa → **comparação estrita do nosso lado**.
- `GET /v1/verifications/{id}` = `VerificationOut` (`schemas.py:149-157`): `id, status, reason_code, cpf_masked, external_reference, result, created_at, completed_at`; `result` (`services/pipeline.py:845-853`) traz `score`, `face_similarity`, `receita_federal`, `declared_vs_document.name_ratio` — **não traz o nome do documento**.
- Nome do documento **só no webhook do caminho feliz** (`data.full_name`, `pipeline.py:907-918`); decisões antecipadas (`_finalize_decision`, `pipeline.py:109-128`) mandam só `verification_id`/`reason_code`/`score`.
- Assinatura `X-Uai-Signature: t=<unix>,v1=<hex>` = HMAC-SHA256 de `{t}.{corpo cru}` (`api/app/security.py:104`). Retry 30s/2min/10min/30min, máx 5 (`api/app/webhooks.py:134`) — log real tem entregas esgotadas → reconciliação obrigatória.
- **Não usar** `/details` (`verifications.py:604-756`, presign de imagem) nem a listagem (traz `selfie_url`).

## 1. Estados — `Doctor.verificationStatus`
| status | quando | acesso |
|---|---|---|
| `pending` | cadastro novo (default) | só onboarding |
| `in_progress` | sessão UaiID criada | só onboarding |
| `uaiid_review` | UaiID `manual_review` — dono decide no **painel do UaiID** | só onboarding |
| `needs_admin` | UaiID aprovou a identidade e falta o OK do dono: o vínculo com o CRM não fechou sozinho **ou** está tudo verde com `autoApprove = 0` (começo) — dono decide no **admin do Dr. Exame** | só onboarding |
| `approved` | tudo verde (auto) ou dono aprovou | total |
| `rejected` | UaiID recusou, CRM inativo ou dono recusou | só onboarding (pode tentar de novo) |
| `legacy` | médicos que já existiam no deploy | total até `doctorKyc.legacyGraceUntilMs` (0 = sem prazo) |

- **Não regride:** `approved` não muda por evento; `legacy` só sobe (p/ `approved`) — tentativa que falha não tira acesso de legado.
- `fraud_confirmed` → `Doctor.blocked=true` (`blockedReason='kyc_fraud'`), que vale em todos os 8 pontos.
- Tentativa antiga terminando atrasada não mexe no médico (só a mais recente decide).

## 2. Modelo de dados (aditivo)
```prisma
model Doctor {
  // ...campos atuais
  verificationStatus String    @default("pending") // pending|in_progress|uaiid_review|needs_admin|approved|rejected|legacy
  verifiedAt         DateTime?
  verifiedBy         String?   // 'auto' | id do admin
  verifications      DoctorVerification[]
}

model DoctorVerification {
  id           String    @id @default(cuid())
  doctorId     String?   // SetNull: a evidência sobrevive à exclusão da conta
  doctor       Doctor?   @relation(fields: [doctorId], references: [id], onDelete: SetNull)
  crm          String    // snapshot "numero-UF" do CRM tentado
  provider     String    @default("uaiid")
  providerId   String    @unique // verification_id do UaiID
  status       String    // created|consent_pending|collecting|processing|challenge|manual_review|approved|rejected|expired|cancelled
  reasonCode   String?
  score        Int?
  documentName String?   // nome do documento (webhook assinado)
  nameRatio    Float?    // result.declared_vs_document.name_ratio (declarado = nome do CFM)
  cfmName      String?   // snapshot do CFM na criação = nome declarado ao UaiID
  cfmSituation String?
  nameMatch    Boolean?
  cpfSituacao  String?
  decision     String?   // decisão Dr. Exame (= doctorStatus proposto)
  decidedBy    String?   // 'auto' | id do admin (decisão humana não é sobrescrita)
  expiresAt    DateTime?
  lastSyncedAt DateTime?
  syncSource   String?   // webhook|poll|on_demand
  createdAt    DateTime  @default(now())
  completedAt  DateTime?
  @@index([doctorId, createdAt])
  @@index([status, lastSyncedAt])
  @@index([crm, createdAt])
  @@map("doctor_verifications")
}
```
- Migration `20261029b_doctor_kyc` idempotente: coluna nasce `DEFAULT 'legacy'` (existentes) → `SET DEFAULT 'pending'` (novos). **Placeholders (`passwordHash='pending-invite'`) e contas com `emailVerified=false` → `pending`** — senão quem reivindica herdaria acesso total. Tabela/índices `IF NOT EXISTS`, FK via `DO $$`.
- **Sem imagem, biometria, número de documento nem CPF** na tabela. Audits `DOCTOR_KYC_*` / `DOCTOR_VERIFICATION_DECIDED` / `DOCTOR_CRM_CONFLICT` ficam fora do expurgo de 90d.
- Settings (categoria numérica → editáveis pelo `PATCH /api/admin/config/costs` existente): `doctorKyc.legacyGraceUntilMs` (epoch ms, 0 = sem prazo) e `doctorKyc.autoApprove` (**0 = todo médico passa pelo dono — default**; 1 = aprova sozinho quando tudo verde).

## 3. Rotas (erros sempre com `code`)
**Médico** (auth local + política com `allowUnverified`; router novo em `/api/doctor`)
- `POST /api/doctor/verification` → `201 {verifyUrl, expiresAt, status}`
  - `full_name` = nome do CFM (snapshot da tentativa anterior; senão `lookupCfm`; sem CFM → nome do cadastro e `cfmName=null`) · `cpf` do cadastro (decifrado só no servidor) · `external_reference=doctor.id` · `mode:'full'` · `flow:'own'` · `return_url` (§6) · `Idempotency-Key: drexame-<doctorId>-<nº tentativa>-<minuto>`.
  - `409 ALREADY_APPROVED` · `409 IN_REVIEW` (`uaiid_review`/`needs_admin`) · `400 CPF_REQUIRED` · `429 KYC_ATTEMPT_LIMIT {retryAfterHours}` · `503 KYC_UNAVAILABLE` (sem chave / UaiID fora / 402 crédito).
- `GET /api/doctor/verification` → `{status, attempt: {status, reasonCode, message, expiresAt} | null}`; tentativa aberta com `lastSyncedAt` > 60s → reconcilia na hora.

**Webhook** (público) — `POST /api/webhooks/uaiid`, **antes** de `app.ts:111` com `express.raw({type:'application/json', limit:'256kb'})`. HMAC (`timingSafeEqual`, ±300s) → `401 BAD_SIGNATURE`; válido → `200` imediato e `syncVerification` em seguida. O resultado vem do GET; do corpo só se aproveita `data.full_name` (assinado). Idempotente.

**Admin** (`requireAdmin`, ao lado de `admin.routes.ts:1085`)
- `GET /api/admin/doctors/verification-queue` → `review`: tentativas com `decision ∈ {needs_admin, uaiid_review}` e `decidedBy` nulo (cobre legado) — nome do documento × nome do CFM, `nameRatio`, motivo, `priorAttempts` no mesmo CRM (inclusive contas excluídas), `decideIn: 'drexame'|'uaiid'` · `legacy`: lista p/ aprovação em lote.
- `POST /api/admin/doctors/:id/verification/approve` `{note?}` · `POST /api/admin/doctors/:id/verification/reject` `{reason}` (obrigatório) · `POST /api/admin/doctors/verification/approve-legacy` `{ids}` → audit `DOCTOR_VERIFICATION_DECIDED`.

## 4. Decisão — `decideDoctorVerification` (função pura)
1. Não final (`created|consent_pending|collecting|processing|challenge`) → `in_progress`; com `expiresAt` vencido → tentativa `expired`, médico `pending`. Status desconhecido → espera (`in_progress`).
2. `manual_review` → `uaiid_review`. `rejected` → `rejected` (`fraud_confirmed` → também bloqueia). `expired|cancelled` → `pending`.
3. `approved` (identidade OK) → vínculo com o CRM:
   - sem snapshot do CFM → `needs_admin` (`cfm_unavailable`) — não reconsulta (poupa a cota de 100/mês)
   - `cfmState` inativo (INATIV|CANCELAD|CASSAD|SUSPENS|FALECID|INTERDIT|APOSENTAD|TRANSFERID|BAIXAD) → `rejected` (`crm_inactive`)
   - nome: (a) `documentName` do webhook → `strictName` igual; (b) sem nome → `name_ratio ≥ 0.999` (vale porque o declarado foi o nome do CFM); (c) nenhum → `needs_admin` (`document_name_unavailable`)
   - nome diferente → `needs_admin` (`name_mismatch`)
   - situação CFM desconhecida (nem ativo nem inativo) → `needs_admin` (`cfm_situation_unknown`)
   - tudo verde com `autoApprove = 0` → `needs_admin` (`manual_policy`) — o dono aprova com 1 clique
   - tudo verde com `autoApprove = 1` → `approved`, `verifiedBy='auto'`
4. `strictName`: tira pontuação, maiúsculas, sem acento (`normalizeKey`), sem partículas (DE, DA, DO, DAS, DOS, E), espaços colapsados → igualdade exata.

## 5. Reconciliação ("bate de tempo em tempo")
- `syncVerification(providerId, source, {documentName?})`: GET UaiID → atualiza a tentativa → §4 → atualiza o médico (regras §1) → audit `DOCTOR_KYC_RESULT` → e-mail ao dono ao entrar em `needs_admin` ou em fraude. UaiID fora → não marca `lastSyncedAt` (o job tenta de novo).
- Job `jobs/kycReconcile.ts` (10 min + 1ª passada 1 min após o boot): abertas, `createdAt` < 7d e `lastSyncedAt` > 10 min → sync (máx 50/tick); não finais com > 7d → `expired` (`manual_review` não expira — aguarda o painel).
- `GET /api/doctor/verification` reconcilia na hora (> 60s). Dev: o UaiID não alcança localhost → on_demand + job (ou túnel, §8).

## 5b. E-mails (layout premium do Portal do Médico)
- Layout próprio (`src/kyc/emails.ts`) com os tokens do `.claude/DESIGN_SYSTEM.md`: cabeçalho teal com o mascote, filete cobre, selo de status, trilha de progresso, um CTA, modo escuro, 600px fluido (390px ok). Texto do usuário escapado; nada de dado de saúde. Prévia visual com Playwright (390/600, claro/escuro) antes de fechar.
- **Médico** (só em transição; nunca reenvia por evento repetido):
  - **Recebido** — "Recebemos seu cadastro — está em análise": ao entrar em `needs_admin` ou `uaiid_review`.
  - **Aprovado** — "Sua conta foi aprovada — você já pode atender": automático ou pelo dono; traz os primeiros passos (perfil, MFA, "Atender agora").
  - **Recusado** — "…não foi aprovada — veja como resolver": explica o porquê (dono, 28/10) — recusa automática usa o motivo amigável (`kycMessage`); recusa do dono manda **o motivo que o dono escreveu** (o campo no admin avisa que vai para o médico). Sempre com "como resolver" e o caminho para tentar de novo.
- **Dono:** caso novo na fila (assunto separa "pronto para aprovar (tudo verde)" de "aguardando sua análise"), revisão no painel do UaiID, fraude confirmada, CRM disputado.

## 6. Front (Plano 2)
**Jornada do médico (dono, 28/10 — "garantir a jornada"):**
1. Cadastro (CRM, CPF, e-mail) → código do e-mail confirmado.
2. Cai direto no passo **"Vamos validar sua identidade"** — copy premium e acolhedora ("queremos te conhecer melhor"): por que pedimos (segurança dos pacientes, exigência do CFM), o que precisa (RG/CNH/RNE + selfie, ~2 min), privacidade (LGPD: a biometria fica no UaiID, o Dr. Exame não guarda imagem) → botão **"Validar minha identidade"** abre a tela do UaiID.
3. Volta do UaiID → tela **"Recebemos! Seu cadastro está em análise"** (o que acontece agora, prazo sem prometer hora, contato) + e-mail "em análise".
4. Aprovado → e-mail "você já pode atender" + portal liberado. Recusado → e-mail com o porquê + "Tentar de novo" no portal.

- **Portal** (`DoctorPortal.tsx`, `#/doctor`) — card por estado (`pending` → aviso LGPD + "Verificar identidade"; `in_progress` → "Continuar"; `uaiid_review`/`needs_admin` → "Em análise"; `rejected` → mensagem por `reasonCode` + "Tentar de novo"; `approved` → selo; `legacy` → banner com prazo). `403 VERIFICATION_REQUIRED` em qualquer tela → card.
- **Abertura:** nativo → `Browser.open` (generalizar `openTelemedicinaRoom` → `openExternal`); desktop → QR com o `verifyUrl` + "usar este computador" (popup).
- **Retorno:** `return_url = https://drexame.janocaminho.com.br/#/doctor?kyc=1` — app via App Link/`initDeepLinks`; popup → `postMessage` + `close()`; celular via QR sem sessão → tela neutra "Recebido". O `status` da query nunca decide nada. Se a Custom Tab não devolver p/ o app → `drexame://kyc`.
- **Refresh:** `browserFinished` + `App resume` + polling 5s enquanto `in_progress` (máx 10 min).
- **Admin:** aba "Médicos em análise"; selo "✓ Verificado" do paciente = só `approved`.
- **AUD-003 parte 2:** convite passa a exigir OTP antes de emitir JWT (muda a resposta → precisa do front junto).

## 7. Gate (deny-by-default)
- Política única `utils/doctorAccess.ts` — `doctorAccessDenial(doc, {allowUnverified})`, `practiceStatuses(now)`, `doctorCanPractice(status, now)` — chamada pelos **8 pontos** (o parse do JWT continua local — D8). Bloqueado → `403 DOCTOR_BLOCKED`; não pode atender → `403 VERIFICATION_REQUIRED {status}`.
- `allowUnverified` só no onboarding (Base real) + `/verification`.
- Filtros com a mesma regra: presença da fila (`teleconsultaQueue.routes.ts:84`), candidatos do job (`jobs/teleconsultaQueue.ts:154`), `runPayoutPass` (`finance/payout.ts:112` → exceção `payout_doctor_unverified`).
- Claim de placeholder força `pending` (`doctor.routes.ts:325-332`, `app.ts:565-578`).
- **AUD-003 parte 1 (Plano 1):** convite valida CRM/UF (`422 CRM_INVALID`, ex.: `000000-ZZ`), CFM inativo (`422 CRM_INACTIVE`); conta nasce `pending` → o token não abre dado (gate).
- Conflito de CRM no cadastro (mesmo CRM, outro e-mail): audit `DOCTOR_CRM_CONFLICT` sempre; dono do CRM não aprovado → `409 CRM_IN_USE_UNVERIFIED` + e-mail ao dono (libera manualmente; as tentativas ficam — §2).

## 8. Config
- Env só no servidor (`.env` / `.env.prod`, **nunca** `VITE_*`): `UAIID_API_KEY`, `UAIID_WEBHOOK_SECRET` (`whsec_`), `UAIID_BASE_URL` (default **`https://api.uaiid.com.br`**), `UAIID_TIMEOUT_MS` (8000), `UAIID_RETURN_URL` (default `https://drexame.janocaminho.com.br/#/doctor?kyc=1`). Sem chave → `503 KYC_UNAVAILABLE` (médico fica `pending`).
- Painel UaiID → Webhooks: URL `https://janocaminho.com.br/minhasaude/api/webhooks/uaiid`, nome "Dr. Exame — Produção", tópicos `verification.*`, **sem header custom** (o `x-api-key` do Wibx existe por causa do API Gateway; aqui é nginx → Express e o HMAC autentica). Cadastrar após o deploy do Plano 1; o `whsec_` (mostrado 1×) vai no `.env.prod`.
- Dev: endpoint "Dr. Exame — Dev" via túnel (`cloudflared tunnel --url http://localhost:4001` → `<url>/api/webhooks/uaiid`) com `whsec_` próprio no `.env`.
- Painel UaiID → Empresa → Limite de tentativas: 3.

## 9. LGPD
- O Dr. Exame não recebe nem guarda imagem, biometria nem número de documento; guarda resultado + nome do documento + nome do CFM. Base: prevenção à fraude na identificação (art. 11, II, "g").
- Aviso antes do KYC: quem processa (UaiID), finalidade, retenção pela política do UaiID.
- Logs: sem CPF (não logar request/response do UaiID); webhook loga só ids.
- `doctor_verifications`: **sem expurgo automático** (Decisões §1) — evidência antifraude; o aviso de privacidade diz isso.

## 10. Testes
- Unit: assinatura (válida · segredo errado · t fora de 300s · corpo alterado · header malformado · Buffer); `cfmState` ("Inativo" ≠ ativo); `strictName`/`decideDoctorVerification` (tabela de §4, inclui "Souza × Santos"); política de acesso.
- Integração (supertest, UaiID/CFM mockados): os 8 pontos × {pending → 403 VERIFICATION_REQUIRED, bloqueado → 403 DOCTOR_BLOCKED, approved → passa}; legado no prazo/fora; onboarding liberado; rotas do médico; webhook; sync (não regride, tentativa antiga, UaiID fora); job; admin; cadastro/AUD-003; repasse.
- E2E servidor (Plano 1, `test/kyc-e2e.test.ts`): cadastro → verificação → webhook assinado → fila → aprovação → gate abre + e-mails; impostor recusado com evidência preservada; webhook perdido reconciliado; assinatura falsa ignorada. UaiID simulado no `fetch` (contrato real), sem mock de módulo.
- E2E navegador (Plano 2): Playwright valida o nosso lado (portal, abrir link, retorno, estados com webhook assinado simulado). Documento + selfie reais = dono no celular — a prova de vida do UaiID barra automação, por design.

## 11. Rollout e fatias
1. **Plano 1 — servidor** (este spec §2-5, §7, §8). Existentes = `legacy` sem prazo (nada quebra).
2. **Plano 2 — web/admin/APK** (§6) + AUD-003 parte 2 + selo do paciente.
3. **Push de produção dos dois juntos:** sem o card do Plano 2, médico NOVO fica travado em `pending` sem saber o que fazer.
4. Cadastrar o webhook; homologar; validar o retorno da Custom Tab no aparelho; dono revisa legados e define o prazo.

## Fora de escopo (próximas)
- Repasse só p/ PIX no CPF do médico.
- Re-checagem periódica do CRM (CFM WebServices — Res. 2.309/2022) com suspensão automática.
- Carteira do CRM como documento no UaiID (fecha o homônimo).
- MFA obrigatório p/ médico aprovado.
- No UaiID: expor o nome do documento no `GET` (`result`) como a doc promete; incluir `full_name` nos webhooks de `_finalize_decision`; corrigir a URL da API na doc pública.

## Decisões (dono, 28/10/26)
1. Tentativas — inclusive as recusadas de terceiros: **guardar**, sem expurgo automático.
2. Legados: ninguém trava no deploy; o dono define o prazo no admin quando quiser (`legacyGraceUntilMs`, 0 = sem prazo; sugestão 30 dias).
3. Webhook: URL da §8 (o dono cadastra no painel); segredo direto no `.env.prod`.
4. Chave de dev: no `packages/server/.env` (gitignored). Passou pelo chat → gerar outra no painel depois dos testes.
5. Começo: **todo médico passa pela fila do dono**, mesmo com tudo verde (`autoApprove = 0`); virar automático = 1 clique no admin, sem deploy.
6. E-mails premium ao médico: "recebemos, está em análise" e "aprovado" (+ recusado), no design system.
7. UaiID: a calibração é **por empresa** (`/v1/tenant/profile`, tela `dashboard/motor`). O webhook do Wibx no painel era só exemplo — a empresa é do Dr. Exame, então o perfil (ex.: Conservador) é escolha do dono ali mesmo. A fila humana do Dr. Exame (`autoApprove = 0`) vale independente do perfil.
