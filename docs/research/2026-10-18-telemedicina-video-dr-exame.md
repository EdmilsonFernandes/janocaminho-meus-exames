# Estudo — Telemedicina por vídeo com documentação (Dr. Exame)

> 18/10/2026 · Deep-research: 101 agentes, 507 buscas/fetches, claims verificadas com
> votação adversarial (3 verificadores/claim; refutações listadas). Fontes-chave:
> Res. CFM 2.314/2022 (PDF oficial), Lei 13.787/2018, Rol ANS (RN 465→681/2026),
> docs LiveKit, pricing Daily.co, iClinic.

## Pergunta
Vale levar ao Dr. Exame uma camada de **videoconsulta gravada/documentada** para o
caso de o convênio questionar — **sem** virar agendamento de agenda?

## TL;DR (veredito)

**Viável e validado pelo mercado (iClinic faz exatamente isso) — mas o vídeo em si
não é o que protege contra convênio, e embutir chamada nativa no app ativa um custo
regulatório sério (Art. 17: CRM + médico responsável técnico).** Recomendação:
fasear — Fase 1 entrega ~80% do valor documental com ZERO risco regulatório.

## 1. Regulação (Res. CFM 2.314/2022 — vigente em out/2026) ✅ 3-0

- **Gravar áudio/vídeo da teleconsulta é PERMITIDO e OPCIONAL** — nem obrigatório,
  nem proibido. Considerando da norma: o que vale na presencial vale na tele.
- **O que É obrigatório** (Art. 3º + 13): registro em prontuário/SRES; para
  relatório/atestado/prescrição à distância: (a) médico (nome, CRM, endereço),
  (b) paciente + local do atendimento, (c) data/hora, (d) **assinatura ICP-Brasil**,
  (e) menção "modalidade telemedicina".
- **Consentimento (Art. 15)**: livre, esclarecido e EXPLÍCITO, por meio eletrônico
  OU gravação de leitura do termo — arquivado junto ao registro. Cobre transmissão
  de imagens (base legal da gravação).
- **Art. 17 (o ponto crítico)**: pessoa jurídica que presta serviço de telemedicina
  — **inclusive plataforma de comunicação/arquivamento** — exige sede BR, inscrição
  no CRM do estado e médico responsável técnico. Usar Meet/Zoom por fora (cenário
  atual) mantém a responsabilidade prática sobre o MÉDICO.

## 2. Gravação como prova — honestidade primeiro ⚠️ REFUTADAS (0-3)

Duas claims de "valor probatório do documento digital" foram **refutadas** na
verificação: a validade jurídica da gravação como PROVA em disputa com operadora
**não ficou estabelecida**. Tratar vídeo como **evidência suplementar** — nunca
prometer "isso te protege juridicamente".

## 3. Convênios/ANS ✅ 3-0

- O **Rol (RN 465/2021 → RN 681/2026) NÃO tem código de telemedicina** — consulta
  remota é coberta como "CONSULTA MÉDICA" genérica.
- Reembolso ANS = "qualquer documento hábil que comprove o efetivo pagamento";
  operadora **não pode exigir CNES**; nada exige documentação audiovisual.
- Conclusão: vídeo/documento = **arma para contestar glosa** (diferencial de
  produto), **não requisito**.

## 4. Retenção ✅ 3-0

Prontuário: **20 anos** a partir do último registro (Lei 13.787/2018, Art. 6º,
inclusive nato-digital). Gravação anexada ao prontuário herda isso → passivo de
storage longuíssimo (modelar Glacier sa-east-1; considerar **áudio+resumo assinado**
como formato padrão em vez de vídeo cheio — openQuestion de custo).

## 5. Stack ✅ 3-0

| Opção | Gravação | LGPD/BR | Custo |
|---|---|---|---|
| **LiveKit self-hosted** (Apache 2.0, Egress incluso) | MP4 próprio → S3 sa-east-1 | ✅ melhor encaixe (dados 100% nossos) | Fixo (instância dedicada — t2.micro atual NÃO roda Egress) |
| LiveKit Cloud | Egress configurável p/ bucket BR | ⚠️ região 'sa' = 1 localidade s/ redundância | Por minuto |
| Daily.co | Cloud pronta | ❌ só citam HIPAA; LGPD não mencionada | ~**US$0,65**/consulta 30 min gravada + storage |

## 6. Benchmark ✅

**iClinic (Afya)** faz EXATAMENTE o modelo proposto: gravação opcional anexada ao
prontuário com 1 clique + tela dividida chamada/prontuário + já adicionou
**transcrição por IA** (direção de mercado). Feegow/Doctoralia não anunciam
gravação in-platform (ausência de anúncio ≠ ausência).

## 7. Recomendação — 3 fases

1. **Fase 1 (sem vídeo, zero risco regulatório — começar aqui):** "Registro de
   teleconsulta por fora". Médico continua no Meet/WhatsApp; o Dr. Exame registra o
   ATO: termo de consentimento Art. 15 (clique/assinatura eletrônica), registro
   estruturado com os 5 itens do Art. 13, duração, link/notas da sessão, anexos.
   Gera o "dossiê da teleconsulta" exportável (PDF) para apresentar ao convênio.
2. **Fase 2 (vídeo, se a Fase 1 validar demanda):** LiveKit self-hosted + Egress →
   S3 sa-east-1; infra dedicada (não na t2.micro compartilhada); formato padrão
   áudio+resumo assinado (custo 20 anos) com vídeo como opt-in.
3. **Fase 3 (decisão de negócio, não de código):** Art. 17 — abrir videoconsulta
   NATIVA no app = CRM + responsável técnico. Exige opinião jurídica antes.

## Open questions
1. Enquadramento Art. 17 do Dr. Exame (plataforma × ferramenta de documentação) — opinião jurídica.
2. Valor probatório real na prática de glosas (jurisprudência não pesquisada).
3. Benchmark incompleto (Conexa/Feegow sem confirmação).
4. Modelagem de custo de retenção 20 anos (vídeo × áudio+resumo).
