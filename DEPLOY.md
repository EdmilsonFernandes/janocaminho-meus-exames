# Deploy "puxadinho" do Meus Exames (sem custo novo)

Mesmo **EC2** e mesmo **domínio** (janocaminho.com.br) do EdEspeto. Sem domínio novo, sem EC2 novo, sem Postgres novo.
O app roda em **`https://janocaminho.com.br/minhasaude`** e **não mexe em nada** que já existe — só:
1. cria um **banco novo** no Postgres que já roda;
2. sobe **1 container** novo (`meus-exames-app`);
3. adiciona **1 rota** nova no nginx existente.

## Scripts de deploy (estilo EdEspeto — prontos pra automatizar)
- `scripts/setup-db.sh` — cria o banco `meus_exames` no Postgres existente (1x). Uso: `DB_PASSWORD=x sh scripts/setup-db.sh`
- `scripts/deploy.sh` — `git pull` + build + up + healthcheck. Sub-caminho configurável por `SUBPATH`. Uso: `SUBPATH=meus-exames sh scripts/deploy.sh`
- `scripts/pg-backup.sh` — dump do banco (opcional p/ S3 com `BACKUP_S3_BUCKET=...`).

## Nome do sub-caminho (sugestões impactantes)
O app roda num sub-caminho de `janocaminho.com.br`. Escolha um nome marcante em `SUBPATH` (`.env.prod`):

| Opção | Vibe |
|---|---|
| `meus-exames` | descritivo, direto (default atual) |
| **`minhasaude`** | **"minha saúde" — amplo e premium (recomendado)** |
| **`dr-exame`** | **o mascote — memorável (recomendado)** |
| `saude` | curto, limpo |
| `vitalis` | latim, exclusivo |
| `checkup` | orientado a ação |
| `bemestar` | bem-estar |

> Mudou o nome? Rode `SUBPATH=novo sh scripts/deploy.sh` (rebuilda o front no novo base) **e** atualize a `location` do nginx (`/novo/`).

## Pré-requisitos
- Acesso SSH ao EC2: `ssh -i <medtrack-system.pem> ec2-user@ec2-3-137-119-152.us-east-2.compute.amazonaws.com`
- Repo no GitHub com este código.
- Segredos pro `.env.prod` (relay da IA, senha SMTP do Zoho, `JWT_SECRET`, `APP_ENCRYPTION_KEY`).

## Passo a passo no EC2

### 1) Criar o banco novo no Postgres existente (1 vez)
```bash
docker exec -i janocaminho-postgres psql -U postgres <<'SQL'
CREATE ROLE meus_exames LOGIN PASSWORD 'COLOQUE_UMA_SENHA_FORTE';
CREATE DATABASE meus_exames OWNER meus_exames;
SQL
```
> Isso **não afeta** o banco do EdEspeto (`espetinho`). É um banco isolado.

### 2) Clonar e configurar
```bash
cd ~
git clone https://github.com/<voce>/meus-exames.git
cd meus-exames
cp .env.prod.example .env.prod
nano .env.prod
```
Preencha:
- `DATABASE_URL=postgresql://meus_exames:COLOQUE_UMA_SENHA_FORTE@host.docker.internal:5432/meus_exames?schema=public` (mesma senha do passo 1)
- `ANTHROPIC_AUTH_TOKEN` (seu relay), `SMTP_PASS` (Zoho), `JWT_SECRET`, `APP_ENCRYPTION_KEY` (`openssl rand -hex 32`)
- `SEED_*` (1º usuário/admin)

### 3) Subir o container (migra + sobe)
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml exec meus-exames-app node packages/server/dist/prisma/seed.js   # cria o admin
docker logs meus-exames-app --tail 30
```

### 4) Adicionar a rota no nginx existente (sem tocar no EdEspeto)
Edite o server block de `janocaminho.com.br` (HTTPS) e acrescente UMA location:
```nginx
location /minhasaude/ {
    client_max_body_size 40M;                  # upload de PDFs
    proxy_pass http://127.0.0.1:4010/;         # stripa /minhasaude e manda pro app
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
⚠️ **Valide ANTES de recarregar** (protege o EdEspeto e os outros sites): `sudo nginx -t` → só se der `syntax is ok / test is successful`, recarregue com `sudo nginx -s reload`. Reload é **graceful** — não derruba conexões nem reinicia o nginx ou os outros sites.

Pronto — acesse **`https://janocaminho.com.br/minhasaude/`**. (Login: o `SEED_*` que você definiu.)

## APK apontando pra essa URL
No `packages/web/.env` (ou direto no build), defina:
```
VITE_BASE=/
VITE_API_URL=https://janocaminho.com.br/minhasaude/api
VITE_TELEMEDICINE_URL=https://sua-plataforma-de-telemedicina.com/agendar  # link do botão "Agendar Telemedicina" nos resultados alterados (vazio = botão oculto)
```
Depois: `cd packages/mobile && npm run sync && cd android && ./gradlew.bat assembleDebug`.

## Atualizar (a cada git push)
```bash
cd ~/meus-exames
git pull && sh scripts/deploy.sh        # build + up + healthcheck (sub-caminho via SUBPATH em .env.prod)
```
(migrations rodam automáticas no startup do container)

### Backup periódico
```bash
sh scripts/pg-backup.sh                                   # dump local em ./backups
BACKUP_S3_BUCKET=meu-bucket sh scripts/pg-backup.sh       # + envio p/ S3
```
Dica de cron (diário 3h): `0 3 * * * cd ~/meus-exames && sh scripts/pg-backup.sh`

## Isolamento / segurança (NÃO reinicia serviços existentes)
- `scripts/setup-db.sh` só roda `CREATE DATABASE/ROLE` via `psql` no postgres existente — **não reinicia o Postgres**.
- `scripts/deploy.sh` só gerencia o container **`meus-exames-app`** (porta `127.0.0.1:4010`, própria) — **não toca no EdEspeto, nem no Postgres, nem em outros containers**.
- Nginx: só **adiciona 1 `location`** nova e faz `reload` (graceful) — não reinicia o nginx nem os outros sites (sempre `nginx -t` antes).
- Banco novo `meus_exames`, isolado do `espetinho` (EdEspeto não enxerga nem é afetado).
- Chave da IA e SMTP **só no servidor**. O APK só fala com `https://janocaminho.com.br/minhasaude/api`.
- PDFs ficam em `./data/exams` (volume no EC2).
