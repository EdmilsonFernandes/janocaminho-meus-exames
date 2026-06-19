# Meus Exames 🩺

Sistema pessoal de gestão de exames com IA. Você envia o **PDF/foto do exame**, a IA extrai os valores
estruturados, você acompanha a **evolução**, **conversa** com um assistente de saúde e é **direcionado ao
especialista certo** quando algo vem alterado. Análise **educativa** — **não** substitui o médico.

Roda como **app web (react-admin)** e gera **APK/AAB Android** via Capacitor.

## ✨ Funcionalidades

- **Extração por IA** — envia PDF/imagem → `pdftotext` (Poppler) extrai o texto → **GLM** (relay Z.ai) estrutura os valores com faixa de referência e página de origem. *(Não usamos visão — o relay lê texto; evita alucinação.)*
- **Resumo + Relatório consolidado** — análise comparativa (anterior × atual), pontos de atenção, perguntas pro médico. Relatório multi-exame de 1 página, compartilhável por **link com PIN** (3 dias).
- **Chat inteligente (economiza tokens)** — perguntas **fáticas** ("qual meu último TSH?", "quantos exames tenho?") são respondidas **do banco, na hora e de graça** (sem chamar a IA). Só perguntas interpretativas vão à IA. Log: `[chat] router_hit` vs `router_miss → IA`.
- **Evolução + Previsão** — gráfico de tendência com regressão linear; **previsão de quando um marcador sai da faixa** (recurso **Premium** — borrado p/ plano grátis).
- **Valores alterados + Telemedicina por marcador** — lista os fora-da-faixa e, em cada um, um botão **"Agendar com {especialista}"** leva ao **Doctoralia** na especialidade certa (TSH→endócrino, hemograma→hemato, lipídios→cardio, creatinina→nefro, TGO/TGP→gastro, ácido úrico→reumato).
- **Score de Saúde + Família** — score 0–100 por dependente + comparativo familiar e alertas cruzados.
- **Créditos + Pagamentos** — upload grátis; IA consome créditos (resumo 10 / consolidado 30 / chat 3). Trial de 100. **Premium R$19,90/mês** (1500 créditos) ou **pacotes avulsos via PIX/cartão/débito** (Mercado Pago).
- **Acessível** — **VLibras** (Libras) integrado.
- **LGPD** — PII criptografada em coluna, PDFs fora do banco, exclusão total da conta a qualquer momento.

## Stack

- **Frontend:** react-admin v5 + Material-UI v7 + Recharts (Vite 8, HashRouter base `/minhasaude/`) — `packages/web`
- **Backend:** Node 20 + Express 5 + Prisma 6 + PostgreSQL 16 — `packages/server`
- **IA:** GLM (`glm-4.6`) via relay Z.ai (`ANTHROPIC_BASE_URL`); extração por **texto** (Poppler `pdftotext -layout`)
- **Mobile:** Capacitor 7 (APK/AAB) — `packages/mobile`
- **Testes:** Vitest + supertest (API) — `packages/server/test`
- **Deploy:** build no GitHub (GHCR) → EC2 só faz pull (zero build na máquina)

## Arquitetura

```
                 ┌──────────────────────────────┐
   react-admin ─▶│  Backend Express (:4001)       │──▶ PostgreSQL (Docker :5433)
   (web/mobile)  │  • auth JWT + OTP              │──▶ GLM via relay (extração/análise)
                 │  • upload PDF → pdftotext→IA   │──▶ Mercado Pago (pagamentos)
                 │  • resumo/consolidado/chat     │──▶ SMTP Zoho (e-mail)
                 │  • pré-roteador de chat (free) │──▶ S3 (PDFs em prod)
                 └──────────────────────────────┘
```

A chave da IA **só vive no backend**. Portas: backend **4001**, Postgres **5433** (o `janocaminho` ocupa 4000/5432).

## Pré-requisitos

- Node 20+, Docker (Postgres)
- `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` (relay Z.ai/GLM) + `ANTHROPIC_MODEL=glm-4.6` — obrigatório p/ extração/análise
- Para APK/AAB: JDK 17+ e Android SDK (só na hora de empacotar)

## Setup (1ª vez)

```bash
npm install
cp packages/server/.env.example packages/server/.env   # ANTHROPIC_*, JWT_SECRET, APP_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # → APP_ENCRYPTION_KEY
cp packages/web/.env.example packages/web/.env         # VITE_API_URL

npm run db:up
npm run db:migrate
npm run db:seed        # cria edmilson@exemplo.com / troque123
```

> ⚠️ As **migrations do projeto estão desatualizadas** vs o `schema.prisma` (faltam colunas `credits`, tabela `vaccines`). Se o `db:migrate` reclamar, sincronize com `prisma db push`: `DATABASE_URL=… npx prisma db push --skip-generate` (no `packages/server`).

## Rodar (desenvolvimento)

```bash
npm run dev      # backend (:4001) + web (:5173)
```

Abra http://localhost:5173. Login dev: `edmilson@exemplo.com` / `troque123`.

## Testar (automatizado)

```bash
npm test --workspace packages/server     # 64 testes de integração de API (vitest+supertest)
```

> ⚠️ **Sempre rode assim** (do repo root). **Nunca** `npx vitest` solto da raiz: sem CWD=`packages/server`, o vitest não carrega o config/setup → roda sem DB de teste nem mocks → pode atingir o **DB de dev**. O `resetDb()` tem trava que recusa truncar se o `DATABASE_URL` não for o de teste.

## Use-case (testar em produção)

1. **Login** → `https://janocaminho.com.br/minhasaude/` (sua conta).
2. **Enviar exame** → PDF/foto → status *Extraindo* → *Pronto*. Abra e veja valores por painel com página de origem.
3. **Resumo IA** → "Gerar resumo" (−10 créditos). **Consolidado** junta os últimos exames (−30).
4. **Chat** → pergunte:
   - `"qual foi meu último TSH?"` → **resposta na hora, grátis** (roteador; log `router_hit`).
   - `"o que significa TSH alto?"` → vai pra **IA** (−3 créditos; log `router_miss`).
5. **Valores alterados** → cada item alterado mostra **"Agendar com {especialista}"** → abre o **Doctoralia** na especialidade certa.
6. **Tendências** → escolha um analito → gráfico + previsão. Conta **grátis**: previsão **borrada** ("Ver planos"). **Premium**: vê normal.
7. **Planos** → assinar mensal (R$19,90) ou comprar créditos (PIX/cartão).

## APK / AAB (Android)

```bash
cd packages/mobile
npm run add:android     # 1ª vez (precisa Android SDK)
npm run sync            # recompila o web e sincroniza
npm run apk             # → app-debug.apk
npm run aab             # → app-release.aab (Play Store)
```

O app no celular é **cliente** — precisa do backend em HTTPS. Nunca embarque a chave da IA no app.

## Deploy (GHCR → EC2)

`git push origin main` → `publish-ghcr.yml` builda a imagem no GitHub → `deploy.yml` SSHa no EC2 e faz `pull` + `recreate` (sem build na máquina). Health: `https://janocaminho.com.br/minhasaude/api/health`.

Variáveis de build do front (GitHub → Settings → Variables): `VITE_BASE=/minhasaude/`, `VITE_API_URL=/minhasaude/api`, `VITE_TELEMEDICINE_URL=` (link do botão; vazio = oculto). Segredos do servidor no `.env.prod` (EC2): relay IA, SMTP Zoho, `JWT_SECRET`, `APP_ENCRYPTION_KEY`, `MP_ACCESS_TOKEN`, `DATABASE_URL`, S3.

## Scripts úteis

| Comando | O que faz |
|---|---|
| `npm run dev` | backend + web (dev) |
| `npm test --workspace packages/server` | testes de API (vitest) |
| `npm run db:up` / `db:down` | sobe/desce o Postgres |
| `npm run db:migrate` | aplica migrações Prisma |
| `npm run db:seed` | cria usuário + paciente |
| `npm run db:studio` | Prisma Studio |
| `npm run test:extract --workspace packages/server -- samples/laudo_1.pdf` | testa extração isolada |

## Segurança / LGPD / ANVISA

- Dados de saúde são **sensíveis** (LGPD). PII (CPF) criptografada em coluna; PDFs fora do banco (disco/S3).
- IA posicionada como **educação + preparo p/ consulta**, **não diagnóstico** (prompt + pós-filtro; evita enquadramento ANVISA como software médico).
- Exclusão total da conta + dados a qualquer momento (LGPD/Play Store).
- Backups: pg dump + arquivos → S3, cron diário (`scripts/pg-backup.sh`).

## Documentação

- `DEPLOY.md` — deploy GHCR/EC2 + variáveis
- `packages/docs/` — prompts de extração/saúde, schema da extração
- `C:\Users\esantos\.claude\projects\...\memory\` — memórias do projeto (stack, deploy, monetização, testes)
