# HANDOFF — KYC médico (UaiID), 29/10/26 ~11h

> Para a próxima IA retomando o branch `worktree-kyc-medico` (worktree `.claude/worktrees/kyc-medico`).
> Plano: `docs/design/2026-10-28-verificacao-medico-plano-servidor.md` (T1-T14) · Spec: `2026-10-28-verificacao-medico-spec.md`.

## Estado: Plano 1 (servidor) — T1 a T13b COMPLETOS (26 commits, local, sem upstream)

Retomei a sessão que morreu sem crédito no meio de T3+T7 e fechei tudo. Testes novos todos verdes:
`doctor-access-gate` (26), `kyc-sync` (39), `admin-doctor-verification` (11), `kyc-notify`, `finance-payout`, `doctor-verification.routes` (9), `uaiid-webhook` (6), `kyc-reconcile` (4), `doctor-register-kyc` (7), **`kyc-e2e` (4/4 de primeira)**.

### Decisões MINHAS além do plano (a outra IA precisa saber)
1. **`src/kyc/sync.ts` — corrida resolvida com advisory lock**: `pg_advisory_xact_lock(hashtext('kyc-sync:'+providerId))` na `$transaction`; leitura→decisão→gravação DENTRO do lock (GET fora). O 2º corredor vê a decisão já gravada → e-mail único. **Hold**: decisão `needs_admin/document_name_unavailable` com `source !== 'webhook'` NÃO aplica (só bookkeeping) — o GET não traz `full_name`; sem isso o dono receberia "aguardando" na corrida em vez de "pronto para aprovar". Fail-closed: médico segue `in_progress` até o webhook trazer o nome (o `name_ratio` do GET também decide).
2. **`admin.routes.ts` approve/reject idempotentes**: `unchanged:true` no 2º pedido; approve SÓ de `needs_admin` (demais → `409 INVALID_STATE`); reject de qualquer estado (revoga approved); lock `kyc-decide:` por médico. Motivo do dono tem precedência no e-mail; e-mail/audit só de quem aplicou.
3. **`app.ts` — `doctorVerificationRoutes` montada ANTES do `teleconsultaQueueDoctorRoutes`**: o `doctorRouter.use(requireQueueDoctor)` da fila é deny-by-default e engolia `POST /verification` com 403 (chicken-and-egg — médico pending não conseguia se verificar).
4. **DB de teste**: precisei `DATABASE_URL=...meus_exames_test... npx prisma db push --skip-generate` a partir do worktree (colunas KYC). Já aplicado.

## Falta fazer (na ordem)
1. **T14 Step 2 (parcial)**: suíte completa `npm test --workspace packages/server` — EU PAREI no meio (a IA seguinte foi assumir; sem resultado). Typecheck `cd packages/server && npx tsc --noEmit` (o meu passou após o WIP, antes de T8-T12 — re-rodar).
2. T14 Step 5: `graphify update .` da raiz do worktree + commitar `graphify-out` (hook de post-commit só existe na árvore principal).
3. T14 Step 4: fumaça real contra o UaiID (chave `uai_live_` do dono está no `.env` da árvore PRINCIPAL; worktree NÃO tem `.env` — copiar). Consome verificação de teste do dono (5 disponíveis).
4. **Plano 2 (web/admin/APK)** — spec §9-11: card "Verificar identidade" no portal, aba admin "Médicos em análise" (rota `/api/admin/doctors/verification-queue` já existe), selo no card da fila, retorno `?kyc=1` no portal, AUD-003 parte 2 (OTP antes do JWT no convite), Playwright, AAB.
5. **Deploy: SÓ JUNTO com o Plano 2** (sem o card do portal, médico novo fica preso em pending). No painel do UaiID (dono): webhook `https://janocaminho.com.br/minhasaude/api/webhooks/uaiid`, tópicos `verification.*`, SEM header custom; `whsec_` no `.env.prod`; limite de tentativas 3; chave nova pós-teste.

## Avisos
- Árvore PRINCIPAL tem WIP de OUTRA IA (Reminders, Medicos, sports, consultas…) — não tocar; trabalhar só no worktree.
- Push/merge do branch = decisão do dono (Plano 2 junto).
- `paymentChooser`/billing intocado por este branch.
