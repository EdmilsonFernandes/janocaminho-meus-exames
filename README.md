# Meus Exames 🩺

Sistema pessoal de gestão de exames com IA: você envia o PDF do exame, a IA lê por **visão** e extrai os valores
estruturados, você acompanha a **evolução** dos valores ao longo do tempo e conversa com um **assistente de saúde**
(análise educativa, **não** substitui o médico). Roda como **app web (react-admin)** e também gera **APK/AAB Android**
via Capacitor.

## Stack

- **Frontend:** react-admin v5 + Material-UI + Recharts (Vite) — `packages/web`
- **Backend:** Node 20 + Express + Prisma + PostgreSQL — `packages/server`
- **IA:** Anthropic Claude (`claude-opus-4-8`, visão + raciocínio) — extração e análise
- **Mobile:** Capacitor (embrulha o app web → APK/AAB) — `packages/mobile`
- **Banco:** PostgreSQL 16 em Docker

## Arquitetura

```
                 ┌─────────────────────────────┐
   react-admin ─▶│  Backend Node/Express (:4001)│──▶ PostgreSQL (Docker :5433)
   (web/mobile)  │  • auth (JWT)                │──▶ Claude (extração por visão + análise)
                 │  • upload de PDF             │
                 │  • extração/normalização     │
                 │  • resumo + chat (SSE)       │
                 └─────────────────────────────┘
```

A chave da IA **só vive no backend** — o celular/app web nunca a vê.

> Portas: o backend usa **4001** e o Postgres **5433** (host), porque o projeto `janocaminho` já ocupa 4000/5432 nesta máquina.

## Pré-requisitos

- Node 20+, Docker (para o Postgres)
- Uma chave `ANTHROPIC_API_KEY` (https://console.anthropic.com/) — **obrigatória** para extração/análise
- Para gerar APK/AAB: JDK 17+ e Android Studio/SDK (apenas na hora de empacotar o app)

## Setup (1ª vez)

```bash
# 1. instalar dependências (todas as workspaces)
npm install

# 2. configurar ambiente
cp packages/server/.env.example packages/server/.env       # edite: ANTHROPIC_API_KEY, JWT_SECRET, APP_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # cole em APP_ENCRYPTION_KEY
cp packages/web/.env.example packages/web/.env             # VITE_API_URL

# 3. subir o banco + migrar + popular usuário/paciente
npm run db:up
npm run db:migrate
npm run db:seed
```

Login padrão (do `.env`): `edmilson@exemplo.com` / `troque123` — **troque a senha** em produção.

## Rodar (desenvolvimento)

```bash
npm run dev      # sobe backend (:4001) e web (:5173) juntos
```

Abra http://localhost:5173. O app já conversa com a API em :4001.

## Fluxo de uso

1. **Perfil** → preencha o perfil clínico (condições, medicações). A IA usa isso para contextualizar (sem diagnosticar).
2. **Exames → Enviar** → selecione o PDF/imagem. A extração roda em segundo plano (status *Extraindo* → *Pronto*).
3. Abra o exame → veja os valores por painel, cada um com a **página de origem** (clique para conferir no PDF).
4. **Gerar resumo** → análise comparativa (anterior×atual), pontos de atenção, perguntas para o médico.
5. **Tendências** → escolha um analito e veja a evolução com a faixa de referência destacada.
6. **Assistente** → converse sobre seus exames (respostas em streaming).

## APK / AAB (Android)

```bash
cd packages/mobile
npm run add:android     # cria o projeto Android (1ª vez; precisa do Android SDK)
npm run sync            # recompila o web e sincroniza no projeto Android
npm run apk             # dica:  cd android && gradlew.bat assembleDebug   → app-debug.apk
npm run aab             # dica:  cd android && gradlew.bat bundleRelease  → app-release.aab (Play Store)
```

O app no celular é **cliente** — precisa do backend acessível por HTTPS. Para testar sem publicar, exponha o :4001
por um túnel (ngrok/cloudflared) e ajuste `VITE_API_URL` em `packages/web/.env` antes do `sync`.

> Em produção, hospede o backend (VPS BR / Tailscale+HTTPS) e **nunca** embarque a `ANTHROPIC_API_KEY` no app.

## Scripts úteis

| Comando | O que faz |
|---|---|
| `npm run dev` | backend + web (dev) |
| `npm run db:up` / `db:down` | sobe/desce o Postgres |
| `npm run db:migrate` | aplica migrações Prisma |
| `npm run db:seed` | cria usuário + paciente |
| `npm run db:studio` | Prisma Studio (inspeciona o banco) |
| `npm run test:extract --workspace packages/server -- samples/laudo_1.pdf` | testa a extração isoladamente (precisa da chave) |

## Segurança / LGPD / ANVISA

- Dados de saúde são **sensíveis** (LGPD). PII (CPF/RG) é criptografada em coluna (`pgcrypto`); PDFs ficam fora do banco.
- A IA é posicionada como **educação + preparo para consulta**, **não diagnóstico** (evita enquadramento como software
  médico pela ANVISA). Há prompt + pós-filtro reforçando isso.
- App single-user por design (menor exposição); o schema já suporta dependentes depois.

## Documentação detalhada

- `packages/docs/prompt-extraction.md` — prompt de extração por visão
- `packages/docs/prompt-health.md` — prompt de saúde (não-diagnóstico) + formato do resumo
- `packages/docs/extraction-schema.md` — contrato JSON da extração
