-- ============================================================================
-- db-hardening.sql — REPROVISIONAMENTO do Postgres do Meus Exames
-- ----------------------------------------------------------------------------
-- RODAR 1x em qualquer Postgres NOVO (prod, staging, onde for). É o que vive
-- DENTRO do banco e NÃO sobrevive a um volume/instalação do zero:
--   • timeouts de proteção (por DATABASE — seguro em instância compartilhada)
--   • extensão pg_stat_statements (ranking de queries caras)
--
-- Origem: auditoria Postgres 01/09/26 (skill supabase-postgres-best-practices).
-- O docker-compose.yml (repo) já sobe com flags equivalentes no command quando
-- o postgres vem do nosso compose; este SQL cobre o database-level — inclusive
-- o caso real de PROD: DB meus_exames DENTRO do janocaminho-postgres (compartilhado).
--
-- Como rodar em PROD:
--   cat scripts/db-hardening.sql | ssh -i <chave> ec2-user@janocaminho.com.br \
--     'docker exec -i janocaminho-postgres psql -U postgres -d meus_exames'
--   (superuser `postgres` — CREATE EXTENSION exige; os ALTER DATABASE idem)
--
-- PRÉ-REQUISITO p/ pg_stat_statements (1x por INSTÂNCIA, exige restart):
--   echo "ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';" | \
--     ssh ... 'docker exec -i janocaminho-postgres psql -U postgres -d postgres'
--   docker restart janocaminho-postgres   (~5-15s de blip; valida os apps depois)
--
-- Top queries (o ganho):
--   SELECT left(query, 90) AS query, calls, round(total_exec_time::numeric,0) AS total_ms,
--          round(mean_exec_time::numeric,1) AS media_ms, rows, shared_blks_hit + shared_blks_read AS leituras
--   FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 15;
-- ============================================================================

-- 1) Timeouts de proteção (escopo: SOMENTE o database meus_exames)
ALTER DATABASE meus_exames SET idle_in_transaction_session_timeout = '60s';
ALTER DATABASE meus_exames SET statement_timeout = '30s';
ALTER DATABASE meus_exames SET lock_timeout = '10s';

-- 2) Observabilidade de queries
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
