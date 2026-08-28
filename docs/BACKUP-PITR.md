# 🛡️ Backup & PITR — Meus Exames (EC2 janocaminho)

> Estado desde 28/08/2026. Camadas: dump lógico (3h) + WAL archiving (PITR, ~5min) + base backup físico (diário) + PDFs (2×/dia). Tudo no S3 `jnc-db-backups-prod-222984221398`.

## Camadas

| Camada | Frequência | Onde | RPO | Restaurar |
|---|---|---|---|---|
| Dump lógico (`pg-backup-rotate.sh`) | 3h (cron `17 */3`) | S3 `postgres/meus_exames/` | 3h | `gunzip -c x.sql.gz \| docker exec -i janocaminho-postgres psql -U postgres -d meus_exames` |
| **WAL archive (PITR)** | contínuo; sync S3 5min (`wal-sync-s3.sh`) | S3 `wal/janocaminho-postgres/` | **~5-10min** | ver PITR abaixo |
| **Base backup físico** (`wal-base-backup.sh`) | diário 02:33 | S3 `wal/base-backups/` | — | insumo do PITR |
| PDFs/fotos/`.md` (`backup-data.sh`) | 2×/dia (03:27/15:27) | S3 `data/meus-exames/` | 12h | descompactar tar em `data/` |

Config do Postgres: `archive_mode=on` + `archive_command → /var/lib/postgresql/data/wal-archive/` (DENTRO do volume — sobrevive a recreate; setado via `ALTER SYSTEM`, sem editar compose do EdEspeto). `pg_hba.conf` ganhou `local replication postgres trust` (necessário pro pg_basebackup).

## Restore PITR (ponto no tempo) — emergência

```bash
ssh -i /tmp/jano.pem ec2-user@janocaminho.com.br
# 1. Baixa base + WAL do S3
aws s3 cp s3://jnc-db-backups-prod-222984221398/wal/base-backups/base-MAIS_RECENTE.tar.gz /tmp/
aws s3 sync s3://jnc-db-backups-prod-222984221398/wal/janocaminho-postgres/ /tmp/wal-archive/
tar -xzf /tmp/base-*.tar.gz -C /tmp/          # -> /tmp/wal-base (data dir físico)

# 2. Prepara recovery
cd /tmp/wal-base
rm -rf pg_wal/* && mkdir -p pg_wal/archive_status
touch recovery.signal
cat >> postgresql.auto.conf <<'CFG'
restore_command = 'cp /tmp/wal-archive/%f %p'
recovery_target_time = '2026-08-28 21:00:00 UTC'   # o momento que você quer voltar
recovery_target_action = 'promote'
CFG

# 3. Sobe um postgres TEMPORÁRIO na porta 5433 com essa base (NÃO mata o prod p/ testar)
docker run -d --name pg-restore -p 5433:5432 -v /tmp/wal-base:/var/lib/postgresql/data postgres:16
docker exec pg-restore psql -U postgres -c "SELECT pg_is_in_recovery();"   # f durante, t depois
# Confira os dados (porta 5433) e então: dump do que precisa OU substitua o data dir do prod.
```

> Teste esse fluxo NUMA SEMANA CALMA. Backup não testado ≠ backup.

## Regras

- **Nunca** `aws s3 sync --delete` no prefix do WAL — expiração é lifecycle do bucket.
- Disco EC2 anda a ~90%: se `wal-archive` ou `/tmp` encherem, postgres segura WAL em `pg_wal` e pode derrubar o cluster. Os scripts podam >48h após sync — se mexer, mantenha essa garantia.
- Dump das 3h é a restauração RÁPIDA do dia-a-dia; PITR é para "volto até 10 min antes do desastre".
