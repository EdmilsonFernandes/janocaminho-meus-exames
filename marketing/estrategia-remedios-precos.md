# Estratégia: Remédios + Menor Preço (Dr. Exame)

> Pesquisa de mercado 2026-08-24 (deep search com fontes) + plano de ação.
> Feature: usuário adiciona o remédio que toma → app compara 9 farmácias online (VTEX)
> e mostra menor preço com foto, farmácia e link de compra.

## 1. O que o mercado prova

| Player | Modelo | Número |
|---|---|---|
| GoodRx (EUA) | Cupom/afiliação com PBM | US$ 797 mi/ano; "US$ 65 bi economizados" como prova social |
| Consulta Remédios (BR) | Comparador + marketplace | R$ 1,2 bi/ano em vendas; 3.800 farmácias |
| CliqueFarma (BR) | Comparador puro (não vende) | "+R$ 29 mi economizados nos últimos 30 dias" na home |
| Zoom/Buscapé (BR) | Afiliação + cashback | 600+ lojas, vertical medicamentos |

**Prova de mercado BR (Procon-SP)**: o MESMO medicamento varia **até 2.400%** entre
farmácias (caso citado: R$ 8 vs R$ 75). Famílias gastam em média **R$ 59/mês** com
remédios (R$ 168,3 bi/ano no país, IBGE). Online é ~20% mais barato.

**Ninguém no BR tem o nosso contexto**: comparadores fazem busca fria. O Dr. Exame
sabe **o que o usuário toma** (uso contínuo, interações, exames) — o preço chega
pronto, sem buscar. Esse é o diferencial claimable.

## 2. Monetização — 3 camadas priorizadas

### Camada 1 — AGORA: Lomadee nos links (esforço 1 semana, receita imediata)
- **Lomadee (SocialSoul)** tem programa público de 3 das nossas 9 farmácias:
  **Drogasil, Pacheco (~7% CPA, cookie 30d) e Drogaria São Paulo (até 7%)**.
- Cadastro gratuito, sem CNPJ, saque via Pix.
- Ação: trocar o deep-link direto por link rastreável Lomadee nessas 3 farmácias.
  As outras 6 seguem link limpo até fechar B2B.
- Risco: nenhum (mesma UX; regra ANVISA de "indicação de estabelecimento + preço"
  é a prática do CliqueFarma/Zoom).

### Camada 2 — 3-6 meses: pitch B2B com as 9 farmácias
- Proposta: CPS/CPA direto + **posição destacada patrocinada** ("melhor preço" boost).
- Argumento: usuário chega com **receita na mão + intenção de compra recorrente**
  (uso contínuo) — lead mais quente que busca genérica.
- Drogaria Globo, São João, Nova Esperança, Farmais etc. não têm afiliado público →
  só via negociação direta (e-mail comercial com deck de 5 slides + print do app).

### Camada 3 — premium: "Economia em Saúde" dentro da assinatura
- Cupom próprio negociado com farmácia (modelo GoodRx adaptado, GoodRx Gold).
- Alerta de queda de preço do remédio que você toma (push) — **premium**.
- Histórico de preço por remédio + "melhor mês pra comprar".
- Lead gen telemedicina (onde a receita digital renova a compra).

### Guardrails legais (ANVISA RDC 96/2008 + STJ 2024)
- ✅ Mostrar preço + nome da farmácia + link (lista de preços) — como CliqueFarma/Zoom.
- ✅ Comparar preços do MESMO medicamento (mesma apresentação) entre farmácias.
- ❌ NUNCA comparar preços entre medicamentos DIFERENTES (só prescritor pode).
- ❌ Sem linguagem promocional terapêutica ("trate", "cure").
- ❌ Sem link de compra para controlados/tarja preta (venda online proibida; só
  retirada/entrega de compra presencial).
- Recomendação: validação jurídica pontual antes de escalar patrocínio.

## 3. Posicionamento (Nubank lesson: não é 2º produto, é a MESMA promessa)

Promessa-mãe atual: "Entenda seus exames como nunca antes."
Nova promessa-mãe: **"Sua saúde inteira no seu bolso — entendida E mais barata."**
(remédios = mais um ganho da mesma promessa, identidade visual única)

### Headline da seção (testado contra benchmarks)
**"O mesmo remédio pode custar até 20× mais dependendo da farmácia. O Dr. Exame
acha o menor preço pra você."**
(fato Procon 2.400% ≈ 20× + ação concreta)

### Estrutura da seção na landing (padrão GoodRx/CliqueFarma)
1. Título + sub: "O Procon-SP já encontrou variação de até 2.400% no mesmo
   medicamento. O Dr. Exame compara Pague Menos, Pacheco e outras 7 farmácias
   em segundos — com foto do produto."
2. **Mock da interface real** (cards de preço com foto + logo da farmácia — como
   o app mostra; GoodRx/Consulta Remédios SEMPRE mostram a interface).
3. 3 passos: "Adicione o remédio que você toma" → "Comparamos 9 farmácias online"
   → "Menor preço, com foto e farmácia — e alerta quando cair".
4. Prova social: enquanto não temos "R$ X mil economizados este mês", usar o dado
   Procon + contador real assim que o dado existir (tabela: soma de
   (maior_oferta − melhor_oferta) por med ativo).
5. CTA: **"Adicionar meu primeiro remédio"** (produto, não "saiba mais").

## 4. Números internos pra prova social (a medir)
- `economia_total = Σ por remédio ativo (oferta_mais_cara − melhor_oferta)` —
  exibir "R$ 312/mês de diferença encontrada para nossos usuários".
- % de remédios contínuos com ≥3 ofertas (meta >90% pós-fix).
- Converter: 1º remédio adicionado → retenção D30 (hipótese: sobe).

## 5. Roadmap resumido
| Quando | O quê |
|---|---|
| Semana 1 | Landing: seção "Economize nos seus remédios" + mock dos cards |
| Semana 1-2 | Cadastro Lomadee + links rastreáveis (Drogasil/Pacheco/São Paulo) |
| Mês 1 | Contador de economia (dado real) na landing + no dashboard |
| Mês 2-3 | Alerta de queda de preço (push) — gated premium |
| Mês 3-6 | Pitch B2B às 9 farmácias com deck + números do contador |

---
Fontes-chave: Lomadee (Pacheco 7% CPA / Drogasil / São Paulo), GoodRx IR 2025,
CliqueFarma, Consulta Remédios, Procon-SP (variação 2.400%), IBGE POF (R$ 168,3 bi/ano),
ANVISA RDC 96/2008, STJ 2024 (revisão da RDC), CFF (controlados).
