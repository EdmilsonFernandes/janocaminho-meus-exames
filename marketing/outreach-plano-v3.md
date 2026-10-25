# Plano de outreach v3 — Dr. Exame → médicos (out/2026)

Template: `marketing/outreach-medicos-v3.html` (+ `.txt`) · Disparadores: `marketing/outreach-medicos/send-batch.mjs` (lote) e `send-test.mjs` (teste 1:1).
Prints hospedados: `packages/web/public/promo/brief-medico.png` (portal do médico) + `promo/consulta-paciente.png` (card da consulta com PIX) — URL absoluta `https://drexame.janocaminho.com.br/promo/...`.

## Mudança vs v2
- v2: zero links (anti-golpe), convite a testar manualmente. **v3: 1 CTA** (`/#/para-medicos`, conta com CRM em ~5 min) + links oficiais site/Play. iPhone: sem badge Apple (não há app iOS) — texto "funciona no Safari".
- Copy v3 = dor (exame no WhatsApp) → solução (brief antes da consulta, 1 link de convite, PIX na consulta, transcrição+resumo que o médico aprova) → PS anti-marketplace.
- Fatos verificados no código: convite magic-link `/convite/:token` com share já aceito (14 dias, escopos); estorno automático em no-show/falha técnica (ledger refund); CID-10 base oficial DATASUS (12.451 subcategorias); uso de IA registrado Res. CFM 2.454/2026.

## Segmentação por especialidade (ordem de prioridade)
1. **Endocrinologia / Metabologia** — mais exames de acompanhamento por paciente (TSH, glicose, vitamina D: o trio do brief mock). Mensagem: brief com evolução de marcadores.
2. **Clínica geral / Medicina de família** — volume de consulta + retorno com exames novos. Mensagem: 1 link de convite organiza o retorno.
3. **Cardiologia** — lipídios + vitamina D + tendências. Mensagem: tendências ao longo do tempo.
4. **Gastro / Hepatologia** — vigilância com exames seriados. Mensagem: histórico completo sem caçar PDF.
5. Clínicas multiespecialidade (62 da lista-semente) → destinatário é o gestor/clínico-geral: copia igual, greeting "equipe X".

CSV atual: `lista-semente.csv` (35 confirmados, 18 "medico" + 62 "clinica" → após dedup ~30-40 alvos únicos). Expandir por especialidade com o mesmo coletor do research 12/09.

## Volume (aquecimento de domínio)
| Semana | Volume | Alvo |
|---|---|---|
| 0 (pré) | 1 teste → edmls2008@gmail.com (coordenador dispara) | validar render nos clients (Gmail/Outlook), alt-text, CTA |
| 1 | 20–30/dia, dias úteis | aquecimento + respostas |
| 2 | 40–50/dia | subir só se bounce <2% e resposta ≥2% |

Delay entre envios: `--delay=4000` (padrão) → 20-25/dia por execução ~2h. Para 40-50: duas janelas (manhã/tarde), nunca paralelo.

## Assuntos A/B (prontos no disparador, `--subject=A|B`)
- **A (padrão):** `Seu paciente te manda foto de exame no WhatsApp?` — dor, pergunta, curto.
- **B:** `Exames dos seus pacientes, organizados ANTES da consulta` — benefício.
Regra: 50/50 alternado por destinatário na semana 1; semana 2 usa só o vencedor (respostas por assunto via BCC edmls2008 + replies).

## Métricas (planilha manual ou plan do Notion)
- **Respostas** (reply direto — alvo ≥3%; qualquer resposta = lead quente, responder em <24h).
- **Cadastros de médico** com CRM (funil: admin DoctorsTab ou `SELECT count(*) FROM doctors WHERE "createdAt" > ...`).
- **Bounces** (furos do coletor) — alvo <2%; acima disso revisar coleta antes de continuar.
- **Aberturas/cliques**: limitado (Zoho 1:1 sem tracking) — usar respostas+cadastros como proxy; se migrar p/ Zoho Campaigns, ligar tracking.
- **Spam complaints**: acompanhar Postmaster Tools do janocaminho.com.br.

## Regras
- **Retry**: quem não respondeu em 7 dias → 1 follow-up curto (máx 1; assunto `Re: <assunto original>`, 3 linhas). Nunca reenviar o template inteiro.
- **Bounce permanente** → remover da lista no ato (registro em `lista-retry.csv`).
- **REMOVER/descadastro** → supressão imediata e permanente (lista de bloqueio no disparo; LGPD opt-out).
- **PARAR TUDO se**: spam complaint >0,1% (Postmaster), bounce >5% num dia, ou qualquer bloqueio/rejeição SMTP 5xx em massa do Zoho. Revisar antes de retomar.
- 1:1 pelo Zoho Mail (contato@) até ~150/dia; acima disso migrar fase 2 (Zoho Campaigns, unsubscribe 1-clique RFC 8058).
