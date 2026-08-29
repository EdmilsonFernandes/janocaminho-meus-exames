# Postmortem: Disco cheio → crash-loop do Postgres (produção fora do ar)

**Data**: 29/08/2026 · **Autores**: Claude (resposta + análise) · Edmilson (decisões de infra)
**Status**: Final · **Severidade**: SEV1 · **Duração**: ~20 min (23:08–23:28 UTC)

## Resumo executivo

O disco raiz da EC2 (30GB, compartilhado por Meus Exames e EdEspeto) atingiu 100% de uso.
O PostgreSQL entrou em crash-loop ao falhar um checkpoint (`PANIC: could not create file
"pg_logical/replorigin_checkpoint.tmp": No space left on device`), derrubando **os dois
produtos** simultaneamente. A causa raiz foi o `archive_timeout=5min` ativado na véspera
para PITR: em banco de baixo tráfego, ele arquiva um segmento de WAL **cheio (16MB) a cada
5 minutos mesmo vazio** — ~4,6GB/dia por cópia — somado à retenção local de 48h e às
imagens Docker dos 4 deploys do dia.

**Impacto**:
- Meus Exames e EdEspeto fora do ar ~20 min (API + apps)
- Sem perda de dados (recovery do Postgres concluiu íntegro; WAL no S3 intacto)
- ~1h de trabalho de resposta

## Linha do tempo (UTC)

| Hora | Evento |
|---|---|
| 28/08 ~20:20 | WAL archiving ativado (`archive_mode=on`, timeout 5min, retenção local 48h) |
| 29/08 ao longo do dia | 4 deploys acumulam ~2-3GB em imagens; WAL cresce continuamente |
| ~23:00 | Disco cruza 100% silenciosamente (sem alerta de disco) |
| 23:08 | Postgres: PANIC no checkpoint → crash-loop (`all server processes terminated; reinitializing`) |
| 23:09 | Watcher do deploy reporta health fora; usuário vê 502/504 |
| 23:10 | Diagnóstico: `docker logs janocaminho-postgres` → PANIC + `df 100%` |
| 23:11-23:12 | Limpeza: WAL local (keep 6), `docker image prune` (+827MB), truncate logs >50MB → disco 65% |
| 23:12 | `docker restart janocaminho-postgres` → redo conclui, `ready to accept connections` |
| 23:13 | Health `db ok` — os dois produtos de volta |
| 23:15 | Mitigação: `archive_timeout` 5→15min (reload) + poda local 48h→6h |
| 23:27 | Disco EBS expandido 30→50GB (console, online) + growpart/xfs_growfs → 40% usado |

## Análise de causa raiz

### O que aconteceu
Checkpoint do Postgres não conseguiu gravar arquivo temporário → PANIC → postgres
reiniciava em loop (o recovery inicial consumia disco e falhava no mesmo ponto).

### 5 Whys

1. **Por que a produção caiu?** → Postgres em crash-loop por falta de disco.
2. **Por que o disco encheu?** → WAL local crescendo ~9GB/dia (2 cópias) + imagens de 4 deploys.
3. **Por que o WAL crescia tanto?** → `archive_timeout=5min` arquiva segmento de 16MB INTEIRO mesmo quando o banco escreve quase nada.
4. **Por que a retenção não segurou?** → A poda local (48h) era maior que o tempo de encher o disco livre (~11GB ÷ 9GB/dia ≈ 1,2 dia).
5. **Por que ninguém percebeu antes?** → Nenhum alerta de % de disco; a métrica existente (health check) só falha DEPOIS do crash.

### Causa raiz primária
Dimensionamento errado do pipeline de backup: **geração de WAL (16MB/5min) desacoplada da
retenção local (48h) e do disco livre (11GB)**. O PITR foi projetado pelo RPO (~10 min)
sem passar pelo orçamento de disco.

### Fatores contribuintes
- Sem monitoramento de % de disco (o alerta só existia como ausência de health)
- 4 deploys no mesmo dia consumiram a folga restante
- O erro foi introduzido por melhoria de segurança (backup) — não por regressão de produto

## O que funcionou / o que falhou

| ✅ Funcionou | ❌ Falhou |
|---|---|
| WAL no S3 intacto (RPO segurou — nada do PITR foi perdido) | Sem alerta de disco → detecção só no crash |
| Recovery automático do Postgres íntegro (zero perda de dado) | Dimensionamento: geração × retenção × disco |
| Runbook mental rápido: logs → df → limpeza → restart (20 min) | Teste de PITR nunca incluiu "quanto disco o archive consome/dia" |
| Mitigação definitiva em minutos (reload, sem restart) | |

## Itens de ação

| Pri | Ação | Status |
|---|---|---|
| P0 | `archive_timeout` 5→15min (RPO ~20min aceitável) | ✅ feito (reload) |
| P0 | Poda local de WAL 48h→6h (`wal-sync-s3.sh -mmin +360`; teto ~1GB; S3 mantém tudo) | ✅ feito (fa29c9a) |
| P0 | Disco 30→50GB (+R$9/mês; 100%→40%) | ✅ feito (console + growpart) |
| P1 | **% de disco no `/api/health`** (alertar ANTES do PANIC) | ⏳ pendente |
| P1 | Cron de limpeza defensiva (imagens + logs > 7d, 1x/semana) | ⏳ pendente |
| P2 | Testar restore PITR completo (validar o seguro que quase custou o carro) | ⏳ pendente (docs/BACKUP-PITR.md) |
| P2 | Revisar taxa de WAL mensalmente vs. disco livre | ⏳ pendente |

## Lições

1. **Toda melhoria de infra que escreve no disco precisa de orçamento de disco** — "quanto
   MB/dia isto gera?" é pergunta obrigatória junto de "quanto espaço temos?".
2. `archive_timeout` curto em DB quieto é vazamento disfarçado de segurança.
3. O health check que só falha no crash é detector de incêndio que apita quando a casa
   já caiu — monitorar a CAUSA (% disco), não o sintoma.
