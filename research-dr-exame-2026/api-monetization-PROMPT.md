# Deep-research pronto: API como produto (Dr. Exame)

> Colar isto como argumento do `/deep-research` numa sessão NOVA com
> `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION=500`.

## Pergunta refinada

**Monetização de API para o Dr. Exame (app BR de interpretação de exames com IA): vale a pena expor APIs públicas (Swagger/OpenAPI) e qual o tamanho real dessa receita?**

Contexto próprio (não pesquisar de novo): temos motor de preços REAIS de remédios em 9 farmácias BR (Pague Menos VTEX + Lomadee ~7% comissão), interações D/X, faixas pediátricas (Harriet Lane), extração de exames (pdftotext→LLM), billing por créditos+PIX funcionando. Zero assinantes; distribuição é o gargalo. Hipótese interna: expor API de remédios+preço primeiro; interpretação de exames NÃO expor (é a muralha + ANVISA RDC 657).

## Anglos de pesquisa (5)

1. **Concorrência direta de API em BR/remédios**: existe API comercial de preço de medicamento no Brasil? (Consulta Remédios tem API pública? farmácias? barateo? panvel?) Quem usa, quanto cobram.
2. **Benchmarks globais de API de saúde**: DrugBank, RxNorm/SNOMED (grátis vs pago), GoodRx API, api.marketplaces (RapidAPI categoria health) — pricing real, tiers, volume típico de quem compra.
3. **Casos API-first em saúde**: empresas que viraram (ou tentaram virar) produto-B2B-API — receita típica, tempo até primeiro cliente, o que deu errado (ex.: APIs de saúde que morreram).
4. **Regulação BR pra API de saúde**: LGPD para dado de varejo farmacêutico (é pessoal? scrape de preço é permitido? ToS das fontes — Lomadee/VTEX permitem revenda do dado?), ANVISA para API informativa de medicamento.
5. **Modelo de precificação**: rate-limit tiers padrão de mercado, freemium 100 calls/mês é o certo? cobrança por call vs assinatura; benchmarks de conversão dev-grátis→pago em APIs.

## Saída esperada

Veredito GO/NO-GO com números: TAM BR estimado, preço recomendado/tier, 3 canais de aquisição de devs/parceiros ranqueados, e os 3 maiores riscos jurídicos (LGPD/ToS/ANVISA) com mitigação.
