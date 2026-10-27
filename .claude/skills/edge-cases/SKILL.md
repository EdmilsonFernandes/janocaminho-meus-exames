---
name: edge-cases
description: Mapear edge cases de user flows — internet ruim, permissões negadas, dados incompletos, interrupções, retornos. Disparo: "edge cases", "o que acontece se", "cenários de falha".
---

# Edge Cases — Dr. Exame

## Metodologia

Para cada flow/tela, mapear estes cenários:

### Cenários de conexão
- Internet cai no MEIO de uma ação (upload de exame, teleconsulta, chat)
- Internet lenta (3G) — timeouts, loading infinito
- Offline total — cache disponível? Mensagem clara?
- Reconexão — dados sincronizam? Duplicam?

### Cenários de interrupção
- Usuário fecha a tab/app no meio de um upload
- Teleconsulta: médico fecha sem encerrar
- Teleconsulta: paciente sai durante chamada
- Chat: mensagem em streaming quando usuário navega pra outra tela
- Form: preenchido pela metade, usuário sai e volta

### Cenários de dados
- Exame com PDF corrompido ou ilegível
- Exame com zero resultados extraídos
- Exame duplicado (mesmo dia, mesmo lab)
- Paciente sem nenhum exame (first-time)
- Paciente com 50+ exames (performance)
- Data de nascimento inválida/futura
- Nome com caracteres especiais/emoji
- CRM inválido ou de outro estado

### Cenários de permissão
- Câmera negada no browser
- Microfone negado no Android
- Push notification não permitido
- Localização negada (se aplicável)

### Cenários de dispositivo
- iPhone SE (tela pequena 375px)
- Tablet (tela grande — layout estica?)
- Android antigo (WebView desatualizado)
- Teclado aberto cobrindo input (chat, forms)
- Rotacionar tela no meio da teleconsulta

### Cenários de usuário
- Usuário digita errado (email, CPF, data)
- Duplo clique rápido em botão (submit duplicado?)
- Long press em elemento não preparado
- Tentar voltar no meio de um fluxo crítico
- Idioma do dispositivo em inglês (i18n quebrado?)

## Output

Para cada edge case identificado:
```
| Cenário | O que acontece | Impacto UX | Fix sugerido | Severidade |
```

## Prioridade
1. Dados perdidos (upload falha silenciosamente)
2. Usuário travado (não consegue prosseguir)
3. Comportamento confuso (mostra coisa errada)
4. Degradação visual (quebra layout)
