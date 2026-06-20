# Meus Exames — Guia Operacional (EC2 / logs / DB / testes / deploy)

> Para o Edmilson + agente IA. Comandos prontos pra copiar/colar.

## 1. Entrar no EC2 (SSH)
```bash
# Do PC (git-bash/PowerShell). A chave está em: projeto-pessoal/EdEspetoHub/medtrack-temp.pem
ssh -i "C:/Users/esantos/projeto-pessoal/EdEspetoHub/medtrack-temp.pem" ec2-user@janocaminho.com.br
```
- Usuário: **ec2-user** (id_ed25519 NÃO serve — só o pem acima).
- **fail2ban ativo:** se der `Connection reset`, **espera uns segundos e tenta de novo** (não brute-force).
- ⚠️ O EC2 roda **2 sistemas**: `meus-exames-app` (NOSSO) e `janocaminho-*` (EdEspeto — **NÃO MEXER**).
- Repo no EC2: `/home/ec2-user/meus-exames/janocaminho-meus-exames/`

Atalho (entra + vai pro repo):
```bash
ssh -i "C:/Users/esantos/projeto-pessoal/EdEspetoHub/medtrack-temp.pem" ec2-user@janocaminho.com.br "cd ~/meus-exames/janocaminho-meus-exames && bash"
```

## 2. Ver logs do app
```bash
# Últimas 50 linhas
sudo docker logs meus-exames-app --tail 50

# Seguir em tempo real (Ctrl+C sai)
sudo docker logs meus-exames-app -f

# Filtrar (ex.: só erros / push / nudges)
sudo docker logs meus-exames-app --tail 200 2>&1 | grep -iE 'error|firebase|push|nudges'

# Ver se Firebase Admin inicializou (só aparece no 1º envio de push)
sudo docker logs meus-exames-app 2>&1 | grep -i 'firebase\|push'
```

## 3. Consultar o banco (PostgreSQL)
O banco é o container `janocaminho-postgres`, db `meus_exames`, user `meus_exames`.
```bash
# Contar tokens de push registrados
sudo docker exec janocaminho-postgres psql -U meus_exames -d meus_exames -c 'SELECT COUNT(*) AS tokens, COUNT(DISTINCT "userId") AS usuarios FROM device_tokens;'

# Notificações criadas (scheduler)
sudo docker exec janocaminho-postgres psql -U meus_exames -d meus_exames -c 'SELECT type, COUNT(*) FROM notifications GROUP BY type;'

# Usuários + créditos + premium
sudo docker exec janocaminho-postgres psql -U meus_exames -d meus_exames -c 'SELECT email, credits, "planExpiresAt" FROM users ORDER BY "createdAt" DESC LIMIT 20;'

# Exames por status
sudo docker exec janocaminho-postgres psql -U meus_exames -d meus_exames -c 'SELECT status, COUNT(*) FROM exams GROUP BY status;'
```
Para um shell psql interativo:
```bash
sudo docker exec -it janocaminho-postgres psql -U meus_exames -d meus_exames
```

## 4. Rodar testes (LOCAL, no PC)
```bash
# ⚠️ SÓ assim. NUNCA "npx vitest" da raiz (já limpou o DB dev uma vez).
npm test --workspace packages/server
```
- DB de teste: `meus_exames_test` (porta 5433), via `prisma db push`.
- Se mexeu no schema (schema.prisma): rode `DATABASE_URL=...meus_exames_test... npx prisma db push` (em packages/server) ANTES dos testes.
- ~75 testes (vitest+supertest).

## 5. Deploy (produção)
```bash
# Do PC: git push dispara o build no GitHub Actions → imagem GHCR
git push origin main
```
Depois no EC2 (puxa a imagem nova + reinicia):
```bash
ssh -i "C:/Users/esantos/projeto-pessoal/EdEspetoHub/medtrack-temp.pem" ec2-user@janocaminho.com.br \
  "cd ~/meus-exames/janocaminho-meus-exames && SUBPATH=minhasaude sh scripts/deploy.sh"
```
- O `deploy.sh` faz: `git pull` + `docker compose up -d --build` + health check.
- Após o deploy, verifique: `sudo docker logs meus-exames-app --tail 10` (deve mostrar `[server] rodando` + jobs `[nudges]`/`[reminders]`).

## 6. Reiniciar o container (sem deploy)
```bash
sudo docker restart meus-exames-app
```

## 7. Gerar APK / AAB (LOCAL)
```bash
cd packages/mobile
npm run sync                # builda web → www + cap sync
cd android
./gradlew assembleRelease bundleRelease   # APK + AAB
# Saída: app/build/outputs/{apk,bundle}/release/app-release.{apk,aab}
```
- Assinatura: `app/keystore.properties` + `meus-exames-upload.keystore` (gitignored). Perdeu a keystore = não atualiza o app nunca.
- **versionCode** deve subir a cada upload na Play (1,2,3... nunca reusar). Editar `app/build.gradle`.

## 8. Testar push (Firebase Console)
1. Firebase Console → projeto `janocaminho-minhasaude` → **Messaging → Campaigns → Create → Notification**.
2. Título + texto → **Send test message**.
3. Cole o **token do device** (app: Perfil → 🔔 Token de notificação → Copiar).
4. **Test** → chega no celular.
> Push do SERVER (scheduler) só ativa com a chave Admin em `/app/keys/` (já montada via volume). Firebase inicializa no 1º envio (lazy).

## 9. Health check
```bash
curl -s https://janocaminho.com.br/minhasaude/api/health   # {"ok":true,...}
curl -s https://janocaminho.com.br/minhasaude/api/app/version  # {latest, minRequired}
```

## 10. Forçar atualização do app (force-update)
Subir `APP_MIN_VERSION` no `.env.prod` do EC2 (ex.: `APP_MIN_VERSION=1.5.0`) + reiniciar. Quem tiver versão menor vê a tela de atualizar.

## 11. Backup (referência — scripts em scripts/)
- `pg-backup.sh` (dump Postgres) + `backup-data.sh` (arquivos) → S3 bucket `jnc-db-backups-prod`, cron diário.
- Restore: `restore-postgres-backup.sh`.
