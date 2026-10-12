# Research — Mapeamento de e-mails de médicos no Brasil (Dr. Exame)

> Deep-research 12/09/2026 · 106 agentes · 516 tool calls · claims verificadas adversarialmente
> (3 votos/claim, fetch primário nas fontes). Escopo: clínico geral, cardio, endocrino, gastro,
> gineco, uro — nacional.

## TL;DR (a verdade verificada)

1. **NÃO existe diretório público de e-mails de médicos no Brasil.** CFM classifica
   e-mail/telefone como dado privado; sociedades de especialidade publicam telefone/endereço
   mas não e-mail; Doctoralia não expõe e-mail.
2. A única fonte **sistemática** de e-mail é o **site do próprio consultório** — colhida via
   tooling de Google Maps (Apify/Outscraper/PhantomBuster varrem o Maps e depois rastreiam o
   site de cada clínica). ~10 mil e-mails ≈ **US$ 100–260**.
3. **Sociedades de especialidade dão TELEFONE em bulk** (SBEM-SP: 1.074 endocrinologistas de
   SP numa única requisição) → canal **WhatsApp** pode converter melhor que e-mail no Brasil.
4. LGPD: e-mail profissional = dado não-sensível → **legítimo interesse é viável**, mas exige
   teste de balanceamento documentado + opt-out fácil. **Público ≠ permissão.**
5. Gmail/Yahoo: SPF+DKIM+DMARC, spam-rate <0,3% (alvo <0,1%), one-click unsubscribe.
   Exceder trava o domínio (mitigação só após 7 dias abaixo do teto).

---

## Findings verificadas

### Fontes de dados

| # | Claim (confiança) | Fonte primária |
|---|---|---|
| 1 | CFM/CREMEs: busca pública e webservice pago (~R$948/ano) expõem SÓ dados cadastrais; e-mail/telefone = "dados privados" (**high**) | [portal.cfm.org.br/busca-medicos](https://portal.cfm.org.br/busca-medicos/) · [sistemas.cfm.org.br/listamedicos](https://sistemas.cfm.org.br/listamedicos/informacoes) |
| 2 | SBEM-SP `/socios/`: POST único não autenticado devolve TODOS os 1.074 endocrinologistas de SP (nome, título, endereço c/ CEP, telefone). **Zero e-mails.** (**high**) | [sbemsp.org.br/socios](https://www.sbemsp.org.br/socios/) |
| 3 | Doctoralia-like: sem e-mail em listagem/perfil; telefone da clínica aparece; contato mediado pela plataforma (**medium**) | [doctoralia.com.br](https://www.doctoralia.com.br) |
| 4 | **Única fonte sistemática de e-mail = sites de consultórios**, via Google Maps tooling: coleta estabelecimentos por especialidade+geo → visita homepage//contact//about de cada site (**high**) | [Apify lukaskrivka](https://apify.com/lukaskrivka/google-maps-with-contact-details) · [Apify Healthcare](https://apify.com/mukeshrana90/healthcare-google-maps-scraper) · [PhantomBuster](https://support.phantombuster.com/hc/en-us/articles/26971113168146-How-to-Use-the-Google-Maps-Search-to-Contact-Data) · [Outscraper](https://outscraper.com/google-maps-scraper/) |

### Custos e limites de coleta

| # | Claim (confiança) | Detalhe |
|---|---|---|
| 5 | Custos set/2026 (**high**) | Apify Healthcare: $5/1k negócios + $5/1k enriquecimento de e-mail (cobra só quando acha) → ~$0,010–0,026/registro → **10k e-mails ≈ $100–260**. Outscraper: 500 places GRÁTIS/mês, depois $3/1k; e-mail via add-on "Emails & Contacts". Sem mensalidade. |
| 6 | Teto por busca (**high**) | Google Maps devolve máx **~120–200 resultados por busca** — cobrir especialidade×cidade exige fatiar por bairro/grid de coordenadas + dedup. |

### LGPD (guia ANPD de legítimo interesse, verbatim verificado)

| # | Claim (confiança) | Implicação prática |
|---|---|---|
| 7 | Legítimo interesse NÃO vale para dado sensível (saúde, art. 11); exige teste de balanceamento 3 fases documentado (**high**) | E-mail profissional de médico = não-sensível → LI viável p/ prospecção. Dado de SAÚDE (núcleo do app) = nunca LI. |
| 8 | **Público ≠ permissão**: fonte/forma de coleta é fator explícito na "expectativa razoável"; coleta de fonte pública é fator DESFAVORÁVEL (**high**) | E-mail publicado no site do consultório não autoriza sozinho o reaproveitamento — personalização e relevância (médico que pede exames ↔ app de exames) ajudam a sustentar a expectativa. |
| 9 | Opt-out é CONDIÇÃO da base legal, não cortesia: checklist ANPD exige "canal de fácil acesso" p/ descadastro (**high**) | Link de descadastro + supressão imediata e permanente. Sem isso, LI não se aplica. |

### Entregabilidade (Gmail/Yahoo, vigente 2026)

| # | Claim (confiança) | Detalhe |
|---|---|---|
| 10 | Regras duras (**high**, 3-0 ×6) | (a) SPF ou DKIM p/ todos; bulk (>5k/dia) exige SPF **E** DKIM **E** DMARC alinhados; (b) spam-rate <0,3% no Postmaster Tools (alvo <0,1%) — exceder trava remetente por ≥7 dias; (c) one-click unsubscribe (RFC 8058) + link visível. Outlook adotou equivalente em 05/2025. |

### O que NÃO sobreviveu à verificação

- Comparativo de ferramentas de envio (Brevo/Mailchimp/EmailOctopus/Instantly) — nenhum claim passou; decidir por teste próprio.
- Aquecimento de domínio e volume/dia "seguro" — só os tetos formais (<0,3%) são verificados; volumes diários citados no mercado são inferência.
- Hit-rate de e-mails em sites de consultórios BR — desconhecido; custo real por e-mail VÁLIDO > preço por registro varrido.

---

## Estratégia recomendada (2 canais)

### Canal A — E-mail (consulta ativa, baixo volume, alta qualidade)
1. **Piloto grátis**: Outscraper 500 places/mês — varrer "clinica de exames"…"cardiologista" em 1 cidade (fatiar por bairros).
2. Validar hit-rate e qualidade → escalar com Apify Healthcare ($100–260 p/ ~10k).
3. Enviar da ferramenta de e-mail marketing (one-click unsubscribe automático), ~50–150/dia, monitorar Postmaster Tools.
4. Domínio janocaminho.com.br precisa de SPF+DKIM+DMARC confirmados (checar antes do 1º disparo).

### Canal B — WhatsApp/telefone (sociedades: dados em bulk, verificado)
- SBEM-SP entrega 1.074 endocrinologistas SP com telefone numa requisição.
- Próximo passo do mapeamento: testar os mesmos diretórios de SBC, SBEM nacional, FBG,
  FEBRASGO, SBU, SOBRAMIP e regionais (open question do research).
- WhatsApp comercial 1:1 (não broadcast em massa) — copy curta + link do app.

### Compliance (obrigatório antes de disparar)
- [ ] Documentar teste de balanceamento LI (finalidade/necessidade/balanceamento — modelo no guia ANPD)
- [ ] Opt-out de 1 clique + supressão permanente imediata
- [ ] Nunca tratar dado de saúde sob LI (o app em si pede base distinta — paciente opta)
- [ ] SPF + DKIM + DMARC no janocaminho.com.br (verificar em mxtoolbox)
- [ ] Cadenciar disparos assistindo spam-rate no Google Postmaster Tools

## Lista-semente verificada

| URL | O que dá | Como |
|---|---|---|
| sbemsp.org.br/socios/ | 1.074 endocrinologistas SP (nome, endereço, telefone) | POST `dud_user_srch_key=uf&dud_user_srch_val=SP` — sem login |
| Google Maps via Apify/Outscraper/PhantomBuster | E-mails dos sites de consultórios | Varredura por especialidade×bairro + crawl do site |
| portal.cfm.org.br/busca-medicos | Só nome/CRM/UF/situação/especialidade | Validação cadastral (útil p/ dedup/enriquecer) |
| doctoralia.com.br | Telefone de clínica em perfis públicos | Sem e-mail |

**Beco sem saída p/ e-mail:** CFM, CREMEs, sociedades (só telefone), Doctoralia.

## Alerta de marca ⚠️

Existe **outro "Dr. Exame"** no Brasil: [drexame.com.br](https://drexame.com.br/) — plataforma de
agendamento de exames com descontos, Instagram ativo. Médico buscando "Dr. Exame" pode cair nele.
No e-mail, sempre link direto (Play Store + janocaminho.com.br), nunca "busque na loja".

## Fontes principais

- [ANPD — Guia Legítimo Interesse (PDF oficial)](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_hipoteses_legais_tratamento_de_dados_pessoais_legitimo_interesse)
- [Google — Sender guidelines (81126)](https://support.google.com/a/answer/81126)
- [Yahoo — Sender best practices](https://senders.yahooinc.com/best-practices/)
- [CFM — busca de médicos](https://portal.cfm.org.br/busca-medicos/) · [CFM webservice](https://sistemas.cfm.org.br/listamedicos/informacoes)
- [SBEM-SP sócios](https://www.sbemsp.org.br/socios/) · [Doctoralia](https://www.doctoralia.com.br)
- [Apify lukaskrivka](https://apify.com/lukaskrivka/google-maps-with-contact-details) · [Apify Healthcare](https://apify.com/mukeshrana90/healthcare-google-maps-scraper) · [Outscraper](https://outscraper.com/google-maps-scraper/) · [PhantomBuster](https://support.phantombuster.com/hc/en-us/articles/26971113168146-How-to-Use-the-Google-Maps-Search-to-Contact-Data)
- [Google Play — Dr. Exame (com.janocaminho.drexame)](https://play.google.com/store/apps/details?id=com.janocaminho.drexame)
