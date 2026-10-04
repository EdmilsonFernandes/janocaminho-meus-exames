# Project Orchestrator — coordena os 5 projetos

> Gerencia trabalho cross-projeto. Sabe qual agente chamar, qual servidor acessar, qual CI monitorar.

## Projetos

| Projeto | Path | EC2 | Deploy | CI |
|---|---|---|---|---|
| **Dr. Exame** | `C:/Users/esantos/Desktop/Exame Edmilson` | `janocaminho.com.br` (chave: jano.pem) | git push → CI auto | janocaminho-meus-exames |
| **EdEspeto** | `C:/Users/esantos/projeto-pessoal/EdEspetoHub` | `janocaminho.com.br` (mesma EC2) | git push → CI auto | EdEspetoHub |
| **brunoprado** | `C:/Users/esantos/projeto-pessoal/projeto-brunoprado` | `34.230.245.197` (chave: premiox-key.pem) | git push → CI auto → SSH deploy | premiax |
| **gemhunter** | `C:/Users/esantos/projeto-pessoal/gemhunter-ai` | `3.22.227.73` (chave: uai-id.pem) | rsync manual | gemhunter-ai |
| **kyc** | `C:/Users/esantos/projeto-pessoal/kyc-janocaminho` | `3.22.227.73` (mesma EC2) | tar+scp manual | uai-id |

## Regras de operação

### Ao fazer push em qualquer projeto:
1. **SEMPRE** monitorar CI até `completed:success`
2. Se CI falhar: ler log, corrigir, push novamente, monitorar de novo
3. **NUNCA** declarar "pronto" sem CI verde + deploy confirmado + health check

### Ao deployar em múltiplos projetos:
1. Push um por vez, monitorar CI de cada
2. Deploy sequencial (nunca paralelo — evita confusão)
3. Health check de cada projeto após deploy

### Ao fazer mudança cross-projeto (ex: provider de pagamento):
1. Implementar no projeto principal primeiro
2. Validar + testar + deploy
3. Só depois replicar nos outros
4. Cada projeto tem sua stack/idioma — adaptar, não copy-paste

## Chaves SSH

| EC2 | Chave | Local |
|---|---|---|
| janocaminho.com.br | jano.pem | `C:/Users/esantos/projeto-pessoal/EdEspetoHub/medtrack-temp.pem` |
| 34.230.245.197 | premiox-key.pem | `C:/Users/esantos/projeto-pessoal/projeto-brunoprado/premiox-key.pem` ou `D:/PESSOAL/chave-premiox/premiox-key.pem` |
| 3.22.227.73 | uai-id.pem | `C:/Users/esantos/projeto-pessoal/EdEspetoHub/uai-id.pem` |

⚠️ **Fail2ban**: todas as EC2 têm rate limit SSH. Após ~5 conexões seguidas, espera 60-120s. Uma conexão por tarefa quando possível.

## Gateways de pagamento (estado atual 04/10)

| Provider | PIX | Cartão | Mínimo | Status |
|---|---|---|---|---|
| **Asaas** | ✅ (QR ~3s delay) | ✅ | R$5 | ✅ ativo |
| **OpenPix** | ✅ (QR instant) | ❌ | R$0,01 | ✅ ativo |
| **Mercado Pago** | ✅ | ✅ | R$0,01 | ⚠️ suspenso |

**Fallback chain PIX**: Asaas (≥R$5) → OpenPix → MP (invisível)
**Fallback chain cartão**: Asaas → MP (invisível)
