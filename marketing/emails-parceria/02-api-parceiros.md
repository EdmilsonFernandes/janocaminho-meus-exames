# E-mail — Portais/apps de saúde + labs/clínicas (pitch da API)

> **Público:** produtos digitais de saúde (portais, apps de lembrete de remédio,
> prontuários, telemedicina) e labs/clínicas que digitalizam laudos.
> **Assunto sugerido:** `API de preços de remédios (9 farmácias) + interações — 25 chamadas grátis pro {{empresa}}` ou
> `{{nome}}, seu portal com preço real de remédio sem construir nada`

---

**Corpo (portais/apps):**

Oi {{nome}},

Vi que o {{empresa}} lida com{{...}} — e toda vez que a pergunta é **"quanto custa esse
remédio?"**, alguém precisa manter scraper, catálogo e preço atualizado. Nós já fazemos
isso: sou fundador do **Dr. Exame**, e abrimos nossa infraestrutura como **API pública**:

- `GET /meds/prices` — preço de **9 farmácias brasileiras** (Pague Menos, Pacheco,
  São Paulo…) com foto do produto, link e EAN;
- `GET /meds/interactions` — base curada de interações **D/X** (marcas viram genérico);
- `POST /meds/normalize` — "Dorflex 10cp" digitado por humano → chave canônica;
- `POST /exams/extract` — **laudo em PDF → JSON estruturado** com IA (itens, valores, faixas);
- `POST /exams/interpret` — valor × faixa → rótulo com grau, determinístico.

Tudo documentado em português, com curl copiável:
**drexame.janocaminho.com.br/api/docs** — e a aprovação de acesso vem com
**25 chamadas grátis** pra testar de verdade.

Se fizer sentido, monto uma chave de teste pro {{empresa}} hoje. 15 minutos essa semana?

**Edmilson Fernandes** — fundador, Meus Exames / Dr. Exame
📞 {{whatsapp}} · drexame.janocaminho.com.br/api/docs

*Prefere não receber prospecção? Responda "remover".*

---

**Corpo (labs/clínicas — variante extração):**

Oi {{nome}},

Quantos laudos o {{empresa}} diga/manualiza por dia? Temos um motor que lê o **PDF do
laudo e devolve JSON estruturado** — itens, valores, unidades, faixas e a página-fonte —
usado em produção no app Dr. Exame. Aberto como API: manda o PDF, recebe os dados
(≈ R$ 0,40/laudo, sem setup). **25 chamadas grátis** na aprovação:
**drexame.janocaminho.com.br/api/docs** (endpoint `/exams/extract`).

Posso rodar 5 dos seus laudos de exemplo hoje — manda um PDF anonimizado?

**Edmilson Fernandes** — fundador, Meus Exames / Dr. Exame
📞 {{whatsapp}}

---

**Follow-up 1 (D+3):**
> Atalho: o endpoint que mais economiza tempo de vocês é o /meds/normalize (texto sujo
> do usuário → chave certinha). 25 chamadas grátis dão pra provar valor — crio a chave
> em 2 min. Segue?

**Follow-up 2 (D+8):**
> Fico por aqui — deixo o link da doc salva: drexame.janocaminho.com.br/api/docs.
> Quando aparecer a necessidade (preço de remédio ou laudo digital), me chama direto.
