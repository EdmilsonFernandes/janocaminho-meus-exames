# E-mail de parceria — Dr. Exame → médicos (v2, pós-research)

> Validado contra o research de 12/09/2026 (LGPD/Guia ANPD + regras Gmail/Yahoo).
> Placeholders: `{{ }}`. Antes do disparo: confirmar SPF/DKIM/DMARC + LinkedIn do Edmilson.

---

## Assunto (testar A/B — curto e sem cara de marketing)

1. `Exames dos seus pacientes, organizados` (foco benefício — recomendado p/ A)
2. `Dr. {{SOBRENOME}}, ferramenta BR p/ seus pacientes guardarem exames`
3. `Parceria — app de exames usado por pacientes seus`

**Evitar:** "OFERTA", "GRÁTIS!!!", emojis no assunto, ALL CAPS (gatilhos de spam/golpe).

## Pré-header (preview)

App brasileiro, gratuito para médicos. Dois minutos para conhecer.

---

## Corpo (texto simples, ~180 palavras — imagem hospedada, sem anexo)

Olá, Dr. {{NOME}} 👋

Sou **Edmilson Fernandes**, fundador do **Dr. Exame** — app brasileiro que organiza os
exames laboratoriais dos pacientes e traduz os laudos para linguagem simples
(https://www.linkedin.com/in/edmilson-santos-6805a515/ · drexame.janocaminho.com.br).

**O problema:** paciente chega na consulta com exames espalhados entre WhatsApp, e-mail e
papel. No app ele junta tudo em PDF, vê a evolução dos marcadores no tempo e recebe uma
explicação **educativa** de cada item — comparando com a faixa de referência, **sem
diagnóstico e sem substituir o médico**.

**Para você, médico {{ESPECIALIDADE}}:**
- Paciente compartilha os exames com você direto pelo app — chega na consulta tudo organizado
- **Portal do médico gratuito**: painel dos pacientes, tendências de marcadores, histórico
- Sem custo, sem cadastro obrigatório, sem mudar sua rotina

Parágrafo da IA (após os bullets): *"Por trás do app há **IA que lê o laudo**, compara cada item
com a faixa de referência do laboratório e cruza os exames ao longo do tempo para apontar
**padrões e tendências** — sempre como conteúdo educativo. **A IA nunca dá diagnóstico:** a
interpretação e a decisão continuam sendo suas, com o contexto clínico que só você tem."*

Prints embutidos (grade 2×2, `screenshots/print-email-*.png`, cid inline):
- 📱 **Lado do paciente (celular)**: painel de saúde + exame com faixas de referência
- 🩺 **Lado do médico (computador)**: painel do portal + lista de pacientes com alertas

**Para conhecer os dois lados (bloco SEM links — decisão do dono 12/09):**
1. No navegador, digite você mesmo: **drexame.janocaminho.com.br**
2. **Como paciente:** criar conta grátis e subir um exame PDF
3. **Como médico:** login → aba **Médico** → criar conta com CRM (portal que os pacientes veriam)
4. Android: Google Play, buscar **"Dr. Exame"** (robozinho com escudo). iPhone: site no navegador

Linha de transparência: *"De propósito este e-mail não tem nenhum link clicável — as imagens são
telas reais e os endereços estão escritos para você digitar."* (padrão anti-golpe dos bancos)

**O que peço:** se um paciente perguntar *"doutor, onde guardo meus exames?"*, indicar o
Dr. Exame. Alguns médicos já recebem pacientes com o histórico pronto na tela — e o
feedback tem sido esse: consulta mais rápida, nada perdido.

Qualquer dúvida, é só responder este e-mail — leio pessoalmente.

Abraço,
**Edmilson Fernandes**
Fundador · Dr. Exame — janocaminho.com.br
https://www.linkedin.com/in/edmilson-santos-6805a515/

---
*Contato profissional único. Não quer mais receber? **Descadastrar** (link abaixo) ou responda "REMOVER" — saio da lista na hora.*

---

## Regras de disparo (do research — verificado)

| Regra | Por quê |
|---|---|
| Enviar via ferramenta de e-mail marketing (unsubscribe 1-clique RFC 8058 automático) | Exigência Gmail/Yahoo desde fev/2024 + condição da base legal LGPD |
| ~50–150 e-mails/dia no início, subindo conforme spam-rate | Teto <0,3% no Postmaster Tools; exceder trava o domínio ≥7 dias |
| Personalizar {{NOME}}, {{ESPECIALIDADE}}, referência à especialidade | LGPD: relevância sustenta "expectativa razoável" do teste de balanceamento |
| **ZERO links clicáveis** (nem site, nem Play, nem LinkedIn) — endereços escritos para digitar | Pedido do dono: médico desconfia de link = vírus; padrão anti-golpe dos bancos |
| Convidar a testar os DOIS lados: paciente (conta grátis + PDF) e médico (aba Médico + CRM) | Pedido do dono 12/09 — médico vê o fluxo completo |
| Supressão imediata e permanente de quem descadastrar | ANPD: opt-out é salvaguarda que sustenta o legítimo interesse |
| Remetente: contato@janocaminho.com.br com SPF+DKIM+DMARC confirmados | Bulk sem DMARC = rejeição SMTP 5.7.26 |
| Documentar o teste de balanceamento antes do 1º envio (arquivo interno) | ANPD pode pedir; modelo no guia de legítimo interesse |

## Assets prontos

- Screenshots: `screenshots/` (6 — dashboard/lista/exame × desktop/mobile)
- Relatório completo: `relatorio-research.md`
- Links oficiais: Play `https://play.google.com/store/apps/details?id=com.janocaminho.drexame` · Site `https://drexame.janocaminho.com.br`

## Ferramenta de envio (decisão 12/09/2026)

**Fase 1 — lista-semente (~60-80 e-mails): enviar 1:1 real pelo Zoho Mail (contato@)**
Sem ferramenta. Conta Zoho PAGA do dono → limite diário de envio maior que o free.
E-mail individual personalizado = entregabilidade máxima, resposta cai na caixa, zero
risco de ToS. Volume natural: 15-25/dia.

**Fase 2 — escala (até ~2.000 contatos): Zoho Campaigns (free já cobre; plano pago se crescer)**
- Free: 2.000 contatos / 6.000 e-mails por mês, forever free ([zoho.com/campaigns/pricing](https://www.zoho.com/campaigns/pricing.html))
- Mesmo painel/ecossistema do Zoho Mail pago atual → autenticação de domínio facilitada
- Unsubscribe 1-clique embutido (RFC 8058)
- Backup (volume maior): Brevo free (300/dia ≈ 9k/mês) — mas os ESPs free proíbem "cold
  list" nos termos; risco = suspensão da conta, não multa. Volume baixo + opt-out + B2B
  profissional mitiga.

SPF/DKIM/DMARC do janocaminho.com.br: **já configurados (confirmado pelo dono 12/09)**.
Nota: ao enviar VIA Zoho Campaigns, adicionar os registros DKIM/SPF específicos do
Campaigns no DNS (diferentes dos do Zoho Mail).

## Pendências para fechar

1. ✅ LinkedIn: linkedin.com/in/edmilson-santos-6805a515/
2. ✅ SPF/DKIM/DMARC: confirmados
3. ✅ Ferramenta: Zoho Mail 1:1 (semente) → Zoho Campaigns free (escala)
4. Escolher 2 assuntos p/ A/B inicial (sugestão: #1 vs #2)
5. ✅ Lista-semente: 35 e-mails confirmados (`lista-semente.csv`) — 3 coletores, ~60 sites varridos
6. ✅ Teste visual enviado p/ edmls2008@gmail.com em 12/09 (`send-test.mjs`, merge de exemplo
   Dr. Mário Coutinho) — **aguardando aprovação do dono p/ disparar pra lista**
