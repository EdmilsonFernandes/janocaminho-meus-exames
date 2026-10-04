# DevOps Multi-Project — SSH, EC2, containers, health

> Acesso e operação nos servidores dos 5 projetos. SEMPRE ler antes de escrever.

## Dr. Exame + EdEspeto (EC2 janocaminho.com.br)

```bash
# SSH
ssh -i /tmp/jano.pem ec2-user@janocaminho.com.br
# Chave original: C:/Users/esantos/projeto-pessoal/EdEspetoHub/medtrack-temp.pem

# Containers
docker ps --format "{{.Names}} {{.Status}}"
docker logs meus-exames-app --tail 50 -f
docker logs janocaminho-backend --tail 20

# Restart Dr. Exame
cd ~/meus-exames/janocaminho-meus-exames && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --force-recreate

# Restart EdEspeto
cd ~/EdEspetoHub && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Health
curl http://localhost:4010/api/health  # Dr. Exame
curl http://127.0.0.1:4000/api/v1/health  # EdEspeto backend

# DB (Postgres compartilhado)
docker exec janocaminho-postgres psql "$(grep DATABASE_URL ~/meus-exames/janocaminho-meus-exames/.env.prod | cut -d= -f2- | sed 's/?.*//')" -c "..."
```

⚠️ NUNCA tocar containers `janocaminho-*` sem entender o impacto (rodam EdEspeto).
⚠️ NUNCA `docker compose --build` nesta EC2 (t2.small 2GB — OOM = outage).

## brunoprado/PremioX (EC2 34.230.245.197)

```bash
# SSH
ssh -i /tmp/premiox-key.pem ec2-user@34.230.245.197
# Chave: D:/PESSOAL/chave-premiox/premiox-key.pem

# Processos (pm2, não Docker)
pm2 list
pm2 restart all

# Health
curl http://localhost:3001/api/v1/health

# Deploy (CI automático via GitHub Actions → SSH → ec2-deploy.sh)
# Manual: cd ~/premioX && bash scripts/ec2-deploy.sh --api --web

# ⚠️ Disco 30GB (99% cheio) — limpar antes de deploy:
rm -rf ~/premioX/apps/web/.next
sudo docker system prune -af
```

## gemhunter + kyc (EC2 3.22.227.73)

```bash
# SSH
ssh -i /tmp/uai-id.pem ec2-user@3.22.227.73
# Chave: C:/Users/esantos/projeto-pessoal/EdEspetoHub/uai-id.pem

# Containers (Docker)
docker ps --format "{{.Names}} {{.Status}}" | grep -E "uai|gemhunter"

# Restart
docker restart uai-api-1 gemhunter-api-1

# Deploy manual (não tem CI):
# gemhunter: tar + scp os arquivos alterados → docker cp para dentro do container → restart
# kyc: tar + scp → sudo tar xzf - -C /opt/uai/ → docker compose up -d api

# ⚠️ Uma conexão por tarefa (fail2ban agressivo)
# ⚠️ Docker buildx antigo — usar docker cp + restart, não docker compose build
```

## Regras gerais

1. **LER antes de ESCREVER** — sempre `docker logs` antes de restartar
2. **Health check após CADA restart** — nunca assumir que voltou
3. **Fail2ban**: máx 5 conexões SSH seguidas, depois espera 120s
4. **Backup antes de deletar**: `docker exec postgres pg_dump > backup.sql`
5. **NUNCA** `--build` em produção (usar CI/CD ou docker cp)
