# Campanha de parceria — mala direta B2B (2026-08)

> 3 públicos × e-mail curto + 2 follow-ups. Fundo: `contato@janocaminho.com.br`
> (Zoho SMTP — ver limites em "Disparo" abaixo). Responder no mesmo endereço.

## Públicos e arquivos

| Público | E-mail | O que pedimos |
|---|---|---|
| Farmácias (as 9 VTEX + Drogasil/Raia) | `01-farmacia.md` | CPS/CPA + posição destacada no comparador |
| Portais/apps de saúde + labs/clínicas | `02-api-parceiros.md` | Testar a API (25 chamadas grátis) → cliente |
| Redes de afiliados (Lomadee/Rakuten/Awin) | `03-afiliados.md` | Aprovar publisher + links rastreáveis |

## Disparo (entrega sem queimar o domínio)

- **Lotes de 20-30/dia por público** (nunca os 3 públicos no mesmo dia — padroniza
  demais e vira spam). Zoho suspende conta que dispara em massa — se precisar de
  volume maior, importar no Zoho Campaigns ou subir Sendergram/ESP.
- **Assunto personalizado** com o nome da empresa (`{{empresa}}` nos templates).
- **Intervalo**: disparo → follow-up 1 em 3 dias úteis → follow-up 2 em +5 dias → para.
- **Opt-out**: quem pedir, nunca mais enviar (lista `supressao.txt` nesta pasta).
- **LGPD**: prospecção B2C é proibida sem consentimento; **B2B para e-mail
  institucional de parcerias/comercial** se sustenta em legítimo interesse —
  sempre com identificação clara e forma de sair (linha final dos e-mails).
- Enviar em **horário comercial (10h-16h)**, terça a quinta (melhor resposta).

## Métricas mínimas (planilha `tracking.csv`)
`data,empresa,público,email,abriu,respondeu,próximo passo` — meta honesta: **10-15% de resposta** em B2B bem segmentado; 1-2 parcerias fechadas na 1ª leva já paga a campanha.

## Antes de enviar
1. Substituir `{{...}}` em todos os templates (nome do contato, empresa).
2. Conferir que `drexame.janocaminho.com.br/api/docs` e a landing estão no ar.
3. Anexar 1 print no máximo (cards de preço do comparador) — pesado = spam.
