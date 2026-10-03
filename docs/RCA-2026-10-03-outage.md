# Root Cause Analysis — Outage 03/10/2026 (~30 min)

## O que aconteceu
Dr. Exame + EdEspeto + janocaminho.com.br ficaram **completamente fora do ar** por ~30 minutos.

## Causa raiz (cadeia)
1. **GATILHO**: Docker build de 4 containers simultaneamente (frontend + backend + apis + face-worker) na EC2 **t2.micro** (1GB RAM)
2. **CAUSA**: O `docker compose up -d --build` do EdEspeto consumiu TODA a RAM disponível. A t2.micro tem 1GB — o build de 4 imagens Node.js em paralelo precisa de ~2-3GB.
3. **CONSEQUÊNCIA**: O kernel Linux entrou em OOM (Out of Memory) → o SSH daemon morreu → a instância congelou (sem ping, sem HTTP, sem SSH).
4. **AGRAVANTE**: O SSH já estava bloqueado por fail2ban (muitas conexões da migração OpenPix) → não foi possível entrar para matar o build → teve que rebootar a instância inteira pela AWS Console.

## Timeline
- ~17:00 — `docker compose up --build` iniciado no EdEspeto
- ~17:05 — Build consumiu toda a RAM → instância congelou
- ~17:10 — Usuário notifica que tudo está fora
- ~17:15 — Tentativas de SSH falham (fail2ban + instância congelada)
- ~17:25 — Usuário reboota instância pelo AWS Console
- ~17:30 — Instância volta, containers restartam com `restart: always`
- ~17:35 — EdEspeto em estado zumbi → `docker compose down + up` limpo
- ~17:40 — Tudo verificado e funcionando

## O que os GRANDES fazem (contingência)

### 1. Nunca buildar em produção (princípio #1)
- **Problema**: Fizemos `docker compose --build` NA PRODUÇÃO
- **Fix**: CI/CD builda a imagem → push pro registry (GHCR) → EC2 só faz `pull` + `up`
- **Já existe**: O Dr. Exame JÁ faz assim (publish-ghcr.yml). O EdEspeto que não.
- **Ação**: Migrar EdEspeto pra CI/CD com GHCR (igual Dr. Exame)

### 2. Health check automático com alerta
- **Problema**: Soube do downtime pelo usuário, não por alerta
- **Fix**: CloudWatch alarm + SNS notification quando `https://janocaminho.com.br/minhasaude/api/health` não responde por 2 min
- **Ação**: Configurar CloudWatch synthetics canary (grátis no free tier)

### 3. Resource limits no Docker
- **Problema**: Um container/build consumiu toda a RAM da instância
- **Fix**: `deploy.resources.limits.memory` no docker-compose ou swap file
- **Ação**: Adicionar `mem_limit: 512m` por serviço + criar swap de 2GB

### 4. Fail2ban whitelist
- **Problema**: Fail2ban bloqueou o IP da ferramenta de gestão durante emergência
- **Fix**: `ignoreip` no fail2ban com IP confiável
- **Ação**: Adicionar IP de casa do dono ao `fail2ban.local`

### 5. Auto-recovery
- **Problema**: Instância congelou e precisou reboot manual
- **Fix**: EC2 Auto Recovery (CloudWatch alarm → restart instance automaticamente)
- **Ação**: `aws ec2 create-alarm --alarm-name auto-recover --metric-name StatusCheckFailed`

### 6. Manutenção com aviso
- **Problema**: Usuários viram o app fora sem aviso
- **Fix**: Push de manutenção ANTES de deploy + página de manutenção no nginx
- **Ação**: Push "vamos fazer manutenção em X min" antes de qualquer deploy pesado

## Prioridade de implementação
1. **IMEDIATO**: Nunca mais `--build` na EC2 (usar CI/CD)
2. **SEMANA**: CloudWatch alarm + auto-recovery
3. **SEMANA**: Swap file + mem limits
4. **MÊS**: Migrar EdEspeto pra CI/CD com GHCR

---
*"Downtime é um bug de processo, não de tecnologia."*
