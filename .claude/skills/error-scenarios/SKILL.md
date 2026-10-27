---
name: error-scenarios
description: Mapear todos os pontos de erro de um fluxo + mensagem amigável + recuperação. Disparo: "erros", "o que pode dar errado", "mensagens de erro", "recovery".
---

# Error Scenarios — Dr. Exame

## Metodologia

Para cada flow, mapear TODOS os pontos onde algo pode dar errado:

### Tipos de erro

**Erro do usuário** (digitou errado, esqueceu campo):
- Mensagem: específica, não genérica
- Tom: orientador, não punitivo
- Fix: highlight no campo + sugestão

**Erro do sistema** (API falhou, 500):
- Mensagem: "Algo deu errado do nosso lado" (não culpa o usuário)
- Ação: botão "Tentar de novo" + link "Reportar problema"
- Dados: NÃO perder o que o usuário digitou

**Erro de rede** (sem internet, timeout):
- Mensagem: "Sem conexão — seus dados estão salvos"
- Ação: indicar que vai sincronizar quando voltar
- Visual: ícone de offline claro

**Erro de permissão** (câmera, mic negados):
- Mensagem: específica do dispositivo (APK vs Safari vs Chrome)
- Ação: link/instrução de como liberar
- Nunca: bloquear o resto do app

### Fórmula da mensagem de erro

```
[O que aconteceu em 1 frase]
[Por que (se relevante, sem technical jargon)]
[O que fazer agora — botão ou instrução]
```

Ex RUIM: "Erro ao processar" (genérico, sem ação)
Ex BOM: "Não conseguimos ler este PDF. Ele pode estar corrompido ou protegido por senha. Tente exportar novamente do laboratório ou envie uma foto."

## Flows prioritários do Dr. Exame

1. **Upload de exame** — PDF grande, corrompido, senha, formato errado
2. **Extração IA** — timeout, alucinação, exame ilegível
3. **Teleconsulta** — permissão negada, conexão cai, médico não entra
4. **Chat** — IA indisponível, rate limit, sem créditos
5. **Login** — senha errada, conta não verificada, Google falha
6. **Pagamento** — PIX expira, cartão recusado, webhook não chega

## Output

Para cada cenário:
```
| Cenário | Tipo | Mensagem atual | Mensagem sugerida | Ação de recuperação | Prevención |
```
