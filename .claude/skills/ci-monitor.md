# CI Monitor — GitHub Actions watchdog

> Monitora o pipeline de CI/CD após cada push. SÓ declara "pronto" quando: CI success + deploy no ar + health check verde.

## Uso

Após qualquer `git push`:

```bash
# 1. Checar CI
curl -sf "https://api.github.com/repos/OWNER/REPO/actions/runs?per_page=3" | \
  node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{
    JSON.parse(s).workflow_runs.forEach(r=>console.log(r.head_sha.slice(0,8), r.name, r.status, r.conclusion||"—"))
  })'

# 2. Se failed: ler logs
curl -sf "https://api.github.com/repos/OWNER/REPO/actions/runs/RUN_ID/jobs" | \
  node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{
    JSON.parse(s).jobs.forEach(j=>{
      console.log("JOB:", j.name, j.conclusion);
      (j.steps||[]).filter(st=>st.conclusion==="failure").forEach(st=>console.log("  FALHOU:", st.name))
    })
  })'

# 3. Se success: verificar health da prod
curl -sf https://PROD_URL/api/health | grep -o '"versionLabel":"[^"]*"'
# Confirmar que o SHA do health == SHA do push

# 4. Se health não mostra o SHA: deploy ainda rodando, aguardar 2-5 min
```

## Regras

1. **NUNCA** declarar "deploy feito" sem confirmar o SHA no health check
2. **SEMPRE** ler o log de erro se CI falhar (não adivinhar)
3. Se o mesmo erro aparecer 2x: parar e revisar a abordagem, não forçar retry
4. Deploys simultâneos em múltiplos repos: monitorar UM POR VEZ (não paralelo)
5. Timeout: se CI não terminar em 15 min, verificar se o runner está preso

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| `tsc` falha no CI mas passou local | Cache stale local (`tsconfig.tsbuildinfo`) | `rm tsconfig.tsbuildinfo` antes de validar |
| Docker build OOM | EC2 t2.micro sem RAM pra build | NUNCA `--build` em prod; usar CI/CD |
| `No space left on device` | Disco EC2 cheio | `docker system prune -af` + limpar `.next`/cache |
| ENOSPC no webpack | Cache do Next.js gigante | `rm -rf apps/web/.next` |
