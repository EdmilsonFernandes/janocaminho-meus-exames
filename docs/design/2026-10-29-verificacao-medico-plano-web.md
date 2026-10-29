# Verificação de identidade do médico — Plano 2 (portal, admin, selo)

> Spec: `2026-10-28-verificacao-medico-spec.md` §6 · Handoff: `2026-10-29-kyc-handoff.md` · Plano 1 (servidor, T1–T13b): pronto e commitado.
> Pedido do dono (28/10): *cadastrou → "vamos validar seu KYC, queremos te conhecer melhor" → termina a verificação → cai numa página de status melhorada → e-mail "em análise"; reprovado → e-mail explicando o porquê.* Os e-mails já existem (Plano 1). Este plano entrega **as telas**.

## Decisões (rulings — custo se errado ao lado)
- **R1 — Tela cheia, não card.** Médico não aprovado vê SÓ a jornada de verificação; aprovado vê o dashboard. (O servidor já devolve 403 `VERIFICATION_REQUIRED` nas demais rotas; sem o gate o portal encheria de erros.) *Custo: nenhum — o `legacy` mantém o dashboard + banner.*
- **R2 — Abrir o UaiID.** Web: **mesma aba** (`window.location.assign(verifyUrl)`) — popup aberto depois de um `await` perde o gesto do usuário e é bloqueado; a volta é o `return_url` do servidor (`https://drexame.janocaminho.com.br/#/doctor?kyc=1`). APK: **Custom Tab** via `@capacitor/browser` (padrão já usado em `components/doctors/DoctorExamList.tsx:66`); a volta é o App Link (`utils/deepLinks.ts` → `appUrlOpen` → `location.hash`). *O spec dizia "popup/QR no desktop"; custo: desktop sem câmera usa o botão "copiar link" para abrir no celular.*
- **R3 — Painel do dono dentro de `pages/admin/DoctorsTab.tsx`** (seção no topo), rótulo **"Identidade"**. O filtro existente "✓ Verificados" ali significa **e-mail verificado** (`emailVerified`) — NÃO reaproveitar nem renomear.
- **R4 — Recusa manual:** o motivo digitado pelo dono **vai por e-mail ao médico** (Plano 1). O campo do admin avisa isso antes de enviar.
- **R5 — Selo "✓ Identidade verificada"** na fila de médicos do paciente só para `approved` (legado não ganha selo).
- **R6 — AUD-003 parte 2 (OTP antes do JWT no convite) fica FORA deste lote:** mexe no fluxo de convite em produção (risco de regressão) e, sem KYC aprovado, o convidado não atende (gate). Parte 1 (CRM/UF/CFM no convite) já está no Plano 1. *Custo: e-mail do convite continua sem OTP até o próximo lote.*
- **R7 — AAB:** só depois da decisão de merge do dono (`versionCode` +1 em `app/build.gradle`; mudança patient/doctor-facing exige rebuild `www`).

## Contratos do servidor
**Médico** (Bearer `localStorage.doctorToken`; acessíveis a médico NÃO verificado):
- `GET /api/doctor/verification` → `{ status, attempt: { status, reasonCode, message, expiresAt, captureIssue? } | null, legacyGraceUntilMs?: number | null }` (os 2 campos opcionais entram na S1; **o front trata ausência como `false`/`null`**).
  `status`: `pending | in_progress | uaiid_review | needs_admin | approved | rejected | legacy`. `attempt.status` aberto = `created|consent_pending|collecting|processing|challenge|manual_review`.
- `POST /api/doctor/verification` → `201 { verifyUrl, expiresAt, status }`. Erros (todos com `code`): `409 ALREADY_APPROVED` · `409 IN_REVIEW {status}` · `400 CPF_REQUIRED` · `429 KYC_ATTEMPT_LIMIT {retryAfterHours|null}` · `503 KYC_UNAVAILABLE` · `403 DOCTOR_BLOCKED {blocked:true, error, reason?}` · `401 AUTH_REQUIRED|INVALID_TOKEN|DOCTOR_NOT_FOUND`.
- Qualquer outra rota do médico para não aprovado: `403 {code:'VERIFICATION_REQUIRED', status}`.

**Admin** (token admin, `H()` de `DoctorsTab.tsx:16`):
- `GET /api/admin/doctors/verification-queue` → `{ review: Array<{ id, providerId, crm, status, reasonCode, decision, documentName, cfmName, nameRatio, score, createdAt, doctor: { id, name, crm, crmUf, email, verificationStatus }, priorAttempts: number, decideIn: 'drexame' | 'uaiid' }>, legacy: Array<{ id, name, crm, crmUf, email, createdAt }> }`.
- `POST /api/admin/doctors/:id/verification/approve {note?}` → `200 {ok, status:'approved', unchanged?}` · `409 INVALID_STATE {status}` (só aprova quem está `needs_admin`).
- `POST /api/admin/doctors/:id/verification/reject {reason}` → `200` · `400 REASON_REQUIRED`.
- `POST /api/admin/doctors/verification/approve-legacy {ids}` → `{ok, approved}` (só mexe em `legacy`).
- `PATCH /api/admin/config/costs {category:'doctorKyc', legacyGraceUntilMs?, autoApprove?}` → `400 KYC_CONFIG_INVALID`; leitura em `GET /api/admin/config` (`doctorKyc`).
- `GET /api/admin/doctors` ganha `verificationStatus` por médico (S1).

**Paciente:** `GET /api/teleconsulta-queue/status` → `doctors[]` ganha `verified: boolean` (S1).

## Matriz de estados do portal (W1)
| Entrada | Tela |
|---|---|
| `approved` | dashboard (sem nada novo). Se virou `approved` **durante** a sessão → tela "Conta aprovada" uma vez |
| `legacy` | dashboard + banner "Verifique sua identidade" (com prazo se `legacyGraceUntilMs`) |
| `pending` · `rejected` sem tentativa · `in_progress` sem tentativa aberta | **Intro** |
| `in_progress` com tentativa aberta | **Continuar** |
| `?kyc=1` na URL (volta do UaiID) ou app voltou ao primeiro plano com tentativa aberta | **Conferindo** (poll 4 s, até 90 s) |
| `needs_admin` · `uaiid_review` | **Em análise** (auto-refresh 30 s) |
| `rejected` | **Recusado** (+ tentar de novo) |
| 403 `DOCTOR_BLOCKED` | **Conta suspensa** |
| 401 | logout (já existente: `onLogout`) |

## Copy (pt-BR, tom acolhedor e direto; sem promessa de prazo)
- **Intro** — chip "Passo 2 de 3 · Verificação de identidade" · H1 **"Vamos validar sua identidade"** · lead "Queremos te conhecer melhor. Antes de atender pacientes, confirmamos quem você é — é isso que mantém o Dr. Exame seguro para todo mundo, inclusive para você." · "O que você vai precisar": **Um documento com foto** (RG, CNH ou RNE, original e sem reflexo) · **Uma selfie** (câmera do celular ou do computador, em local bem iluminado) · **Cerca de 2 minutos** (pode parar e continuar depois) · card **"Seus dados, protegidos"**: "A verificação é feita pelo UaiID, nosso parceiro especializado. As imagens ficam apenas com ele: o Dr. Exame guarda só o resultado. Tratamos tudo conforme a LGPD." · CTA **"Validar minha identidade"** · secundário "Prefere no celular? Copiar link" · rodapé "Sair" · "Falar com o suporte" (`mailto:contato@janocaminho.com.br`).
- **Continuar** — H1 "Falta pouco para terminar" · lead "Você começou a verificação mas não chegou ao fim. Continue de onde parou." · CTA "Continuar verificação".
- **Conferindo** — H1 "Conferindo seus dados…" · lead "Recebemos suas imagens. Leva só alguns instantes — pode deixar esta tela aberta." · linhas que alternam (aria-live polite): "Comparando seu rosto com o documento" → "Conferindo seu CRM no CFM" → "Quase lá". Após 90 s: "Está demorando mais que o normal. Pode fechar esta tela — avisamos por e-mail assim que houver novidade." + botão "Atualizar".
- **Em análise** — chip "EM ANÁLISE" (cobre) · H1 **"Recebemos! Seu cadastro está em análise"** · lead "Sua identidade foi enviada. Agora nossa equipe confere seus dados e o seu CRM no CFM." · trilha vertical: *Cadastro no portal* ✓ "Conta criada e e-mail confirmado" · *Verificação de identidade* ✓ "Documento e selfie enviados" · *Análise da equipe* ● "Conferindo seus dados e o CRM {crm}" · *Atendimento liberado* ○ "Você passa a receber pacientes pelo Dr. Exame" · "Você recebe um e-mail assim que terminarmos. Não precisa fazer mais nada." · botões "Atualizar status" · "Sair".
- **Recusado** — chip "NÃO APROVADO" · H1 "Não conseguimos aprovar sua verificação" · caixa do motivo = `attempt.message` (fallback "Não foi possível confirmar sua identidade.") · se `reasonCode==='admin_rejected'`: "Enviamos os detalhes para o seu e-mail." · **se `attempt.captureIssue`**: card "Como resolver" com 3 dicas ("Use um documento original (RG, CNH ou RNE), sem reflexo." · "Faça a selfie em local bem iluminado, sem óculos ou boné." · "Confira se o nome do documento é o mesmo do seu registro no CFM."); **senão** card neutro "E agora?" ("Leia o motivo acima. Se foi engano, escreva para contato@janocaminho.com.br — respondemos rápido. Quando estiver tudo certo, tente de novo.") · CTA "Tentar de novo" · 429: alerta "Você atingiu o limite de tentativas. Tente de novo em cerca de {N} h." (CTA desabilitado).
- **Suspensa** — H1 "Conta suspensa" · "Seu acesso está temporariamente suspenso pela administração." + `reason` se vier + contato.
- **Aprovada (transição)** — H1 "Conta aprovada 🎉" · "Sua identidade foi verificada. Você já pode atender." · CTA "Ir para o portal".
- **Banner legado** — "Verifique sua identidade{ até DD/MM/AAAA}" · "Para continuar atendendo, confirme quem você é — leva 2 minutos." · botão "Verificar agora" (dispensável na sessão).
- **Erros** — `KYC_UNAVAILABLE`: "A verificação está indisponível no momento. Tente em alguns minutos." · `CPF_REQUIRED`: "Precisamos do seu CPF para verificar. Fale com o suporte para atualizar seu cadastro." · rede: "Sem conexão. Tente novamente."

## Tarefas

### Task S1 — Servidor: 4 campos de leitura (controlador; só depois da suíte completa terminar)
**Files:** `packages/server/src/routes/doctor-verification.routes.ts` (GET) · `packages/server/src/routes/teleconsultaQueue.routes.ts` (`/status`) · `packages/server/src/routes/admin.routes.ts` (`GET /doctors`) · testes em `test/doctor-verification.routes.test.ts`, `test/teleconsulta-queue.test.ts`, `test/admin-doctor-verification.test.ts`.
- GET `/verification`: `attempt.captureIssue = kycCaptureIssue(reasonCode)`; `legacyGraceUntilMs = status==='legacy' && cfg.legacyGraceUntilMs>0 ? cfg.legacyGraceUntilMs : null`.
- `/status` `doctors[]`: `verified: verificationStatus === 'approved'` (select explícito).
- Admin `GET /doctors`: `verificationStatus: true` no select.
TDD; um commit.

### Task W1 — Portal: jornada do médico (agente web 1)
**Files (todos novos, exceto o ponto de entrada):** `packages/web/src/components/doctors/portal/verification/{kycState.ts, useDoctorVerification.ts, DoctorVerificationGate.tsx, KycScreens.tsx, kyc.test.tsx}` · edição mínima em `packages/web/src/pages/DoctorPortal.tsx` (a linha `if (token) return <DoctorDashboard token={token} onLogout={logout} />;` ≈ `:250` passa a embrulhar o dashboard no gate) · `packages/web/e2e/qa-kyc-medico.mjs`.
- `kycState.ts`: tipos + **função pura** `resolveKycView(input)` (a matriz acima) + constantes de copy — testada por vitest (ambiente node).
- `useDoctorVerification(token)`: GET no mount; `refresh()`; poll 4 s só no estado "Conferindo" (teto 90 s); refaz o GET quando a aba/app volta ao primeiro plano (`visibilitychange`); `start()` → POST + abrir o UaiID (R2); mapeia os `code`s de erro acima; 401 → `onLogout`.
- Visual: design system do repo — `tokens.ts` (`RADIUS`, `COPPER`, `SEM`), mascote `components/DrExame.tsx`, cartão de login do próprio `DoctorPortal.tsx` como referência de casca (radius 16, sombra teal, gradiente `linear-gradient(135deg,#20b2aa,#178f89)` no CTA), Poppins nos títulos. **Mobile-first** (375 px), sem scroll horizontal, alvos ≥ 48 px, `aria-live` nas mudanças de estado, `prefers-reduced-motion` respeitado, **claro e escuro**. Nunca `navigate(0)`/`reload()` (crasha o APK) — atualizar = refazer o GET.
- Testes: vitest no padrão do repo (`renderToString`, `// @vitest-environment node`, mocks de `react-router-dom`/`../config`) para cada tela + `resolveKycView`. QA visual `e2e/qa-kyc-medico.mjs` (Playwright lib, convenção dos `qa-*.mjs`): `page.route('**/api/**')` com respostas simuladas para TODOS os estados da matriz; screenshots 375×800 e 1280×800 (claro e escuro) em `C:\Users\esantos\AppData\Local\Temp\kyc-web-shots\`; asserts de texto e `scrollWidth <= innerWidth`.

### Task W2 — Admin + selo do paciente (agente web 2)
**Files:** `packages/web/src/pages/admin/{DoctorVerificationPanel.tsx, doctorVerification.ts, doctorVerification.test.ts}` (novos) · edição de `packages/web/src/pages/admin/DoctorsTab.tsx` (montar o painel no topo + chip "Identidade: …" em cada médico via `verificationStatus`) · edição de `packages/web/src/components/FalarAgora.tsx` (selo) · `packages/web/e2e/qa-kyc-admin.mjs`.
- Painel "Verificação de identidade": contadores (Aguardando você · No painel do UaiID · Médicos antigos sem verificação); cartões da fila `review` com **nome no documento × nome no CFM lado a lado** (destaque quando diferem), CRM/UF, e-mail, `score`, `nameRatio`, ⚠ "N tentativas anteriores neste CRM" (`priorAttempts`); `decideIn==='drexame'` → **Aprovar** (confirmação + nota opcional) e **Recusar** (motivo obrigatório; texto de apoio "Este motivo será enviado por e-mail ao médico."; atalhos: "Documento ilegível" · "Nome do documento não confere com o CRM" · "CRM inativo no CFM" · "Suspeita de documento de terceiros"); `decideIn==='uaiid'` → "Decida no painel do UaiID — o resultado volta sozinho" (sem botões). Bloco **"Médicos antigos"** (`legacy`): seleção + "Aprovar selecionados" (confirmação; só mexe em legado). Campo **"Prazo para médicos antigos"** (data → `legacyGraceUntilMs` em ms, futura; 0 = sem prazo) via `PATCH /api/admin/config/costs` (`doctorKyc`), lendo o valor atual de `GET /api/admin/config`. **Não expor `autoApprove`** neste lote (política inicial: sempre revisão humana).
- Todos os erros do servidor (`INVALID_STATE`, `REASON_REQUIRED`, `KYC_CONFIG_INVALID`) viram mensagem em português no próprio painel; ações idempotentes (`unchanged`) não mostram erro.
- Selo: `QueueDoctor` ganha `verified?: boolean`; no cartão do médico (≈ `FalarAgora.tsx:176`, ao lado de especialidade/CRM) chip discreto "✓ Identidade verificada" (ícone de escudo, `aria-label`), só se `verified === true`.
- Testes + QA no mesmo padrão da W1 (`e2e/qa-kyc-admin.mjs`, token admin simulado, `**/api/**` interceptado).

### Task Q — Fechamento (controlador)
Typecheck web (`tsc --noEmit` incremental) · `vitest run` do web · revisão de cada tarefa (sonnet) + revisão final do branch · fumaça real no UaiID (chave do dono, 1 sessão) · `graphify update .` · AAB só após decisão de merge (R7).

## Fora de escopo (registrado)
AUD-003 parte 2 (R6) · `autoApprove` no painel · página pública de verificação de selo · QR code (substituído por "copiar link") · persistir o motivo manual do dono na tela do médico (o e-mail já o leva; a tela mostra "Enviamos os detalhes para o seu e-mail").
