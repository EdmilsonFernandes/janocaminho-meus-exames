# Auditoria AWS — custo, backup e espaço (17/11/2026)

> Feita quando a conta batia **R$400+/mês sem receita**. Resultado: **~R$200/mês cortados**,
> backup validado (o maior risco era imaginário) e disco de 88% → 55%.
> **Para re-avaliar daqui alguns meses: ver o Runbook no fim deste doc.**

## Dados da conta

| | |
|---|---|
| Account | `222984221398` · região **us-east-2** |
| Custo real (Cost Explorer) | set US$59,48 · out US$78,08 · nov/26 fechou ~US$72 |
| Acesso programático | IAM user **`aws-devops`** — chave em `D:\PESSOAL\PESSOAL\chamanoespeto-aws\aws-devops_accessKeys.csv` (BillingReadOnly + EC2ReadOnly + S3ReadOnly + inline `limpeza-custo`). **Chave root antiga está DESATIVADA.** |
| EC2 role | `ChamaSSMRole` (no janocaminho): S3 write p/ backups + SSM. Sem CE/EC2-describe. |

## Infra atual (pós-auditoria)

| Recurso | Estado |
|---|---|
| `t3.small` (janocaminho.com.br) | 24/7 — roda **ambos os apps** (EdEspeto + Dr. Exame) + Postgres + nginx. EBS 50GB |
| `t3.medium` (UaiID, `i-060cde42804872e9b`) | **Scheduler**: desliga 23h, liga 7h seg-sex (fim de semana off) |
| Bucket backup | **`jnc-db-backups-prod-222984221398`** (⚠️ nome TEM sufixo da conta — o nome sem sufixo dá `NoSuchBucket` e engana) |
| Órfãos | volume EBS 30GB + 2 snapshots de set/26 **deletados** em 17/11 |

## ✅ Backup — VALIDADO (17/11/2026)

Camadas no bucket `jnc-db-backups-prod-222984221398`:

| Camada | Prefixo | Frequência | RPO |
|---|---|---|---|
| Banco lógico (dumps) | `postgres/meus_exames/` | 3h/3h (cron no EC2) | 3h |
| **Banco PITR físico** | `wal/base-backups/` (base diária) + `wal/janocaminho-postgres/` (WAL) | base 2h33 · WAL **a cada 5 min** | **5 min** |
| PDFs + fotos + agent | `data/meus-exames/` | 2x/dia (03:27 e 15:27 UTC) | 12h |

Scripts no EC2 (`~/meus-exames/janocaminho-meus-exames/scripts/`): `pg-backup-rotate.sh`,
`backup-data.sh`, `wal-sync-s3.sh`, `wal-base-backup.sh`. Logs: `/tmp/meus-backup.log`,
`/tmp/wal-sync.log`. Referência de crescimento: dump passou de 710KB (ago) → 62MB (nov).

**Verificação rápida** (roda quando quiser):
```bash
aws s3 ls s3://jnc-db-backups-prod-222984221398/postgres/meus_exames/ | tail -2
aws s3 ls s3://jnc-db-backups-prod-222984221398/data/meus-exames/ | tail -2
aws s3 ls s3://jnc-db-backups-prod-222984221398/wal/janocaminho-postgres/ | tail -2   # tem que ter arquivo de HOJE
```
Regra de ouro: **as 3 listas precisam mostrar objeto de hoje**. Se uma não mostrar, ler o
log do cron correspondente antes de entrar em pânico.

### Lifecycle aplicado no bucket (17/11/2026)
`wal/*` 14 dias · `wal/base-backups/` 14 dias · `postgres/` 60 dias · `data/` 30 dias.
Antes disso o bucket tinha **183GB crescendo ~2GB/dia sem rotação** (WAL desde maio).
O lifecycle purgou ~120GB nos dias seguintes. Janela de PITR efetiva = 14 dias.

## 💰 Cortes de custo aplicados (17/11/2026)

| # | Ação | Economia |
|---|---|---|
| 1 | UaiID scheduler (23h↔7h + fim de semana off) | ~US$26/mês |
| 2 | Volume EBS órfão 30GB deletado (`vol-09b78...`) | ~US$3/mês |
| 3 | 2 snapshots de set/2026 deletados | ~US$3-5/mês |
| 4 | Lifecycle S3 (estanca crescimento de +US$1,4/mês por mês) | progressivo |
| **Total** | | **~US$35-40/mês ≈ R$200/mês** |

### Manual do agendador UaiID
- Onde: `crontab` do janocaminho + perfil `[uai-sched]` em `~/.aws/credentials` (chmod 600).
- Linhas: `0 2 * * *` = desliga 23h BRT · `0 10 * * 1-5` = liga 07h BRT seg-sex (**UTC = BRT+3**).
- **Demo fora do horário**: Console AWS → EC2 → t3.medium → Instance state → **Start** (liga em ~1 min; à 23h desliga sozinho).
- **Desligar o scheduler** (cliente 24h de novo): `crontab -e` no servidor → comentar as 2 linhas do UaiID.
- Log: `/tmp/uai-sched.log`.
- Não confundir instâncias: **a t3.small (janocaminho) NUNCA para** — nela rodam os apps que faturam.

## 🧹 Faxina de disco (EC2 janocaminho)

Feito em 17/11 (88% → 55%): `docker image prune -a -f --filter until=24h` (−3,5GB),
`docker builder prune -af` (−3,2GB), rotação manual de backups locais antigos em
`~/backups` (−11GB — tudo já estava no S3). Repetir quando passar de ~80%:

```bash
df -h /                          # quanto sobrou
docker system df                 # o que o docker está comendo
docker image prune -a -f --filter "until=24h"   # seguro: containers rodando mantêm suas imagens
docker builder prune -af
sudo du -sh /home/ec2-user/* | sort -rh | head   # quem mais come o disco
```
⚠️ O `~/backups` tende a acumular base backups físicos (~215MB/dia) — os scripts rodam
rotação local mas vale conferir `du -sh ~/backups` na ronda.

## 📋 Pendências conhecidas

1. **Ensaio de restore PITR nunca foi feito** (baixar base + WAL e subir num Postgres
   local). É o teste que prova que o backup é restaurável. Prioridade alta, uma vez só.
2. Pico de outubro (+US$10 em compute): suspeita de t3.unlimited burst na t3.small —
   checar `CPUCreditSurplus` no CE se repetir.
3. Savings Plan 1 ano na t3.small (~US$5/mês) quando o cenário estabilizar.
4. Docs do projeto ainda citam "t2.micro" — a instância é **t3.small**.

## 🔁 RUNBOOK — re-auditoria (repetir a cada ~3 meses)

1. **Custo**: usar a chave `aws-devops` e somar os Groups (a API não retorna Total agrupado):
   ```bash
   export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_DEFAULT_REGION=us-east-2
   aws --region us-east-1 ce get-cost-and-usage \
     --time-period Start=AAAA-MM-01,End=AAAA-MM-18 --granularity MONTHLY \
     --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE --output json
   ```
   → comparar com a linha de base deste doc. Alarme se EC2 compute passar de ~US$50/mês
   (significa UaiID 24h de novo ou instância nova esquecida).
2. **Inventário órfãos**: `aws ec2 describe-volumes` (procurar `available`),
   `aws ec2 describe-snapshots --owner-ids self` (antigos), `aws ec2 describe-addresses`.
3. **Backup**: as 3 listas do S3 (seção acima) com objeto de hoje + `tail /tmp/meus-backup.log` e `/tmp/wal-sync.log`.
4. **Disco**: `df -h /` no EC2; >80% → faxina da seção anterior.
5. **Scheduler UaiID**: `crontab -l | tail -2` + `tail /tmp/uai-sched.log` + estado da
   instância (stopped de noite = funcionando).
6. **Bucket**: `aws s3 ls s3://jnc-db-backups-prod-222984221398 --recursive --summarize | tail -2`
   — com lifecycle, deve estabilizar em ~30-40GB. Se voltar a crescer, lifecycle foi removido.

---
*Documento gerado na auditoria de 17/11/2026 (sessão Claude Code). Fontes: Cost Explorer
API, inventário EC2/EBS/S3, logs do EC2. Atualizar este doc a cada re-avaliação.*
