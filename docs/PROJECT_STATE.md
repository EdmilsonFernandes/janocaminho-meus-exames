# Meus Exames — Estado do Projeto (doc p/ agente IA / Serena / graphify)

> Última atualização: 20/06/2026. App de gestão de exames de saúde com IA (Dr. Exame / GLM).
> Solo dev: Edmilson Fernandes. Domínio: janocaminho.com.br/minhasaude/

## 1. Stack / Arquitetura
- **Web:** React-admin v5 + MUI v7 + Vite 8 + Recharts (HashRouter base `/minhasaude/`).
- **Server:** Express 5 + Prisma 6 + PostgreSQL 16 (`packages/server`).
- **IA:** GLM (glm-4.6) via relay Z.ai (extração por **texto** — pdftotext/OCR, NÃO visão).
- **Mobile:** Capacitor 7 (APK/AAB), pacote `com.janocaminho.drexame`.
- **Pagamentos:** Mercado Pago (assinatura R$19,90/mês + créditos via PIX).
- **Push:** Firebase Cloud Messaging (FCM).

Monorepo npm workspaces: `packages/{web,server,mobile,shared}` + `data/` + `docs/`.

## 2. Deploy (PROD)
- **Imagem:** `ghcr.io/edmilsonfernandes/meus-exames-app:latest` (buildada no GitHub Actions no push p/ main; o EC2 SÓ BAIXA, não builda).
- **EC2:** `git push main` → GitHub builda a imagem → EC2 roda `scripts/deploy.sh` (`docker compose up --build`, `pull_policy: always`). Host: `janocaminho.com.br`.
- **SSH EC2:** `ssh -i projeto-pessoal/EdEspetoHub/medtrack-temp.pem ec2-user@janocaminho.com.br` (ec2-user; id_ed25519 não serve; fail2ban ativo — retry se resetar).
- **Repo no EC2:** `/home/ec2-user/meus-exames/janocaminho-meus-exames/`.
- **Container:** `meus-exames-app` (porta interna 4001 → nginx 4010). Compartilha EC2 com o **EdEspeto** (`janocaminho-*`) — **NÃO MEXER no EdEspeto**.
- **`.env.prod`** (no repo do EC2): `DATABASE_URL`, `SUBPATH=minhasaude`, `FIREBASE_SERVICE_ACCOUNT_PATH=./keys/firebase-adminsdk.json`, chaves MP, `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` do relay Z.ai, etc. Não usar `ANTHROPIC_API_KEY` real.
- **Volumes do compose:** `data/{exams,photos,agent}` + **`./keys:/app/keys:ro`** (Firebase Admin key).

## 3. Push / Notificações (Firebase) ⭐
**Topico assumido:** `dr_exame_nudges` (criar no Console Firebase).

### Cliente (APK recebe)
- `packages/mobile/android/app/google-services.json` (gitignored; package_name `com.janocaminho.drexame`).
- `scripts/build-web.js` força `VITE_PUSH_ENABLED=true` no build mobile → `push.ts initPush()` registra token.
- Fluxo: app abre → `initPush` → pede permissão → `PushNotifications.register` → token FCM → `localStorage.fcmToken` + POST `/api/devices/token`.
- **Token visível p/ teste:** Perfil → "🔔 Token de notificação" (copiar p/ Firebase Console → Testar no dispositivo).
- Usuários do APK **antigo** (< v1.4.x, push OFF) precisam **atualizar** p/ registrar o token.

### Server (envia)
- **Chave Admin:** `keys/firebase-adminsdk.json` no repo do EC2 (gitignored; **montada como volume** `./keys:/app/keys:ro` no compose — o EC2 não builda, então NÃO vai por COPY). Config auto-detecta (`config.ts resolveFirebaseKey()` lê `FIREBASE_SERVICE_ACCOUNT_PATH` ou procura `*firebase-adminsdk*.json`).
- `utils/push.ts`: `getMessaging()` (lazy — só inicializa no 1º envio), `sendPush/sendPushToUser`, `subscribeToTopic(PUSH_TOPIC)`. `device.routes POST /token` salva o token + inscreve no tópico.
- ⚠️ Sem a chave no `/app/keys/`, o scheduler roda mas **não envia** (só cria na central).

### Scheduler (Fase 3 — nudges automáticos)
- `jobs/healthNudges.ts` → `startHealthNudgeJob()` no boot (`index.ts`). Roda a cada 1h, **só envia na janela 8-11h**, **cooldown 3 dias** por usuário.
- Sinais: 🔴 valor alterado em exame recente (30d) → alerta; 📅 último exame >6 meses → lembrete de refazer.
- Cria `Notification` (central) + `sendPushToUser`.
- `jobs/reminderEmails.ts` (pré-existente): lembretes do usuário → e-mail + push.

### Central de notificações (Fase 2)
- Prisma `Notification` (type, title, body, data p/ deep link, read).
- Rotas: `GET /notifications` (lista + unread) + `PATCH /notifications/read-all`.
- Front: página `/notificacoes` + sino 🔔 no AppBar (`NotificationBell`, badge unread, poll 60s).

## 4. Monetização (upload + IA)
- **Upload de exame** (`exam.routes POST /`): cobra créditos por dependente (cota mensal):
  - **Free:** `freeCost` créditos/envio (sempre).
  - **Premium (R$19,90/mês):** `premiumFreeQuota` envios grátis/mês/dependente, depois `premiumCost` cada.
  - Contador mensal por dependente (`Patient.uploadMonth` + `monthlyUploadCount`, **não devolve ao deletar exame**).
  - Defaults: freeCost=1, premiumFreeQuota=6, premiumCost=5.
- **`UPLOAD_RULES`** (`utils/credits.ts`) + **`computeUploadCost()`** (função pura + teste `version.test.ts`/`credits.test.ts`).
- **Configurável no admin:** painel admin (`/admin` → Config) edita `CREDIT_COSTS` (chat/summary/consolidated) + `UPLOAD_RULES` em runtime (objeto mutável; volta ao padrão se reiniciar o container).
- **IA custos:** resumo/ex consolidated/chat (CREDIT_COSTS). `Plans.tsx` no Android voltou a cobrar via PIX (isNative=false — Play rejeita, assumido pelo Edmilson).

## 5. Force-update
- `GET /api/app/version` → `{ latest, minRequired }` (config `appLatestVersion`/`appMinVersion`).
- Front (`utils/version.ts` `checkAppUpdate()` no boot): se `APP_VERSION` (web) < minRequired → tela `ForceUpdate` bloqueante (abre Play Store).
- Pra forçar update: subir `APP_MIN_VERSION` no `.env` do server. `compareVersions()` testado.

## 6. Testes
- `npm test --workspace packages/server` (vitest+supertest, ~75 testes). **NUNCA** `npx vitest` da raiz (já limpou DB dev). DB de teste via `prisma db push` (migrations desatualizadas). `test/setup.ts` seta `DATABASE_URL` de teste + mocka IA/S3/SMTP/extraction.

## 7. Funcionalidades (resumo)
Exames (upload PDF/foto → extração IA → valores com referência + edição inline); resumo/relatório consolidado (IA); chat Dr. Exame (SSE, conciso); evolução (painel: chips filtro + busca + acordeão); cartão de emergência; vacinas; despesas; medições; lembretes; dependentes; push/nudges; force-update; login (e-mail/senha + token), TTS, impressão/compartilhamento, VLibras, PT/EN.

## 8. Gotchas operacionais
- **`@mui/icons-material`:** declarado (^7) e funciona nos builds (ExamList, Dashboard, etc.), apesar de um `ls` antigo ter dito "não encontrado". Use normal.
- **`navigate(0)`/`location.reload()` crasham o APK** (recarrega o WebView) → use `useRefresh()` (react-admin).
- **Push no APK:** precisa `google-services.json` + `VITE_PUSH_ENABLED=true` (sem isso, `PushNotifications.register` crasha o app nativo).
- **Migrations vs schema:** schema.prisma é a fonte; test DB usa `prisma db push`. Pra prod, criar migration SQL em `prisma/migrations/`.
- **GitHub SSH:** push pode resetar na porta 22 (DNS hijack) → retry.
- **Keystore + google-services.json + serviceAccountKey.json:** todos gitignored (segredos).
- **AAB versionCode:** cada upload na Play precisa versionCode MAIOR (1,2,3,...). Nunca reusar.

## 9. Contato / domínios
- App: https://janocaminho.com.br/minhasaude/
- Política de privacidade (Play): https://janocaminho.com.br/minhasaude/#/termos
- Contato: contato@janocaminho.com.br
