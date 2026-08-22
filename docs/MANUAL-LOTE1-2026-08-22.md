# MANUAL — Lote 1 da Estratégia (commit `4807414`, 22/08/2026)

> Implementado a partir de `research-dr-exame-2026/ESTRATEGIA-DIFERENCIACAO.md`.
> Este manual = **o que mudou** + **o que você deve olhar/testar**, item por item.

---

## 1 · Primeira leitura grátis (sempre)

**O que mudou:** o PRIMEIRO resumo IA de cada usuário não custa mais créditos. A partir do segundo, cobra os 10 normais. Marcação no extrato (ledger) com a linha `Primeiro resumo — grátis` (delta 0) — é ela que impede o "primeiro" de repetir.

**Sem remendo (config no padrão existente):** virou knob do admin, como `creditCosts`/`uploadRules`:
- Setting **`firstFree.summary`** — `1` = ligado (padrão), `0` = desligado.
- Editável live no painel admin (AppSetting `firstFree`) — sobrevive a restart.

**O que olhar:**
1. Admin → Config: confirme que `firstFree` aparece com `{ summary: 1 }`.
2. Conta nova → subir exame → gerar resumo → **créditos intactos** (extrato mostra a linha grátis).
3. Regenerar (`force`) ou gerar noutro exame → cobra 10 normalmente.
4. Segundo resumo sem saldo → 402 `insufficient_credits` (comportamento preservado).

---

## 2 · WhatsApp "exame pronto" (+ push)

**O que mudou:** ao concluir a extração, o usuário agora recebe aviso (antes: silêncio absoluto pós-upload):
- **Push in-app sempre** — "Seu exame foi lido 🧬 … toque pra ver o que mudou" (rota direta pro exame).
- **WhatsApp** quando o usuário tem telefone no perfil — canal que o BR já usa (Hermes entrega zap desde 2014; Dr. Consulta fatura R$1,2M/mês no canal; nenhum intérprete global tem).
- Guard anti-spam: re-extração ("gerar novamente") **não** renotifica.
- A mensagem NÃO contém dado clínico: só nome do exame + contagem de valores (LGPD).

**Setup único (você, ~15min) — número da empresa (12) 3933-4979 (Business):**
1. [business.facebook.com](https://business.facebook.com) → **WhatsApp Manager** → cadastrar/verificar o número **(12) 3933-4979** como WhatsApp Business.
2. Criar **template** categoria **UTILITY**, nome `exame_pronto`, idioma `pt_BR`, corpo:
   > `{{1}}, seu exame "{{2}}" foi lido — {{3}} valores analisados. Abra o Dr. Exame para ver o que mudou.`
3. Gerar **token permanente do sistema** e anotar o **Phone Number ID**.
4. Na EC2 (`.env.prod`), adicionar e reiniciar:
   ```
   WHATSAPP_TOKEN=<token permanente>
   WHATSAPP_PHONE_ID=<phone number id>
   ```
   (script pronto em `.ai/SKILL.md` §"Adicionar env var em produção")
5. **Sem as env vars o sistema funciona igual** — o canal apenas fica desligado (1 log no boot).

**O que olhar:**
1. Sem as env vars: subir exame → push chega, nada quebra, log `[whatsapp] ... ausentes`.
2. Com env vars: telefone no Perfil → subir exame → zap chega no número cadastrado.
3. Telefone com formatos diferentes (11 98765-4321, +55..., lixo) → normalização testada (4 testes unit).

---

## 3 · Brief do médico em PDF (1 página)

**O que mudou:** no Portal do Médico → aba **Relatório** → botão **"Salvar PDF"** ao lado de "Ouvir". Abre janela A4 pronta pra imprimir/Salvar-como-PDF: resumo geral + pontos de atenção + exames considerados + disclaimer educativo. É o artefato que o clínico recebe ANTES da consulta (STAT/2026: frustração com despejo de exames D2C sem contexto — nenhum global oferece).

**O que olhar:**
1. Portal do médico → paciente com relatório gerado → Relatório → **Salvar PDF** → janela A4 → Ctrl+P → "Salvar como PDF".
2. Sem relatório gerado → botão não aparece (só existe com análise).
3. Print deve caber em 1 página (A4, margens 14/12mm).

---

## 4 · FAQ linkado

**O que mudou:** a página `/#/faq` (18 perguntas) agora é alcançável:
- Menu do app: **"Dúvidas frequentes"** (ícone 💬, acima de Ajuda & Suporte) — pt/en via i18n.
- Landing: **"Dúvidas"** no nav (desktop) + **"Dúvidas frequentes"** no rodapé.

**Play Store — texto pronto pra colar** (Console → Store listing → seção apropriada):
> **Perguntas frequentes**
> Como enviar meu exame? — Envie o PDF do laboratório ou uma foto do laudo; a IA lê os valores em segundos. Grátis pra começar.
> A IA dá diagnóstico? — Não. Ela explica cada valor em linguagem simples, compara com sua faixa ideal e monta perguntas pra levar ao médico. A decisão é sempre do profissional.
> Meus dados estão seguros? — Sim. LGPD: dados sensíveis criptografados, PDFs fora do banco, acesso só seu e de médicos que você autorizar.
> Mais dúvidas: janocaminho.com.br/minhasaude/#/faq

**O que olhar:** menu no APK (após AAB 348) e no navegador; landing com os 2 links.

---

## 5 · PhenoAge — verificado, NÃO mexido

Você estava certo: **já funciona** (canonicals PCR/FOSFATASE corrigidos + `BiologicalAgeCard` no Dashboard + botão de share). Minha nota antiga estava defasada — memory corrigida. Ação do plano "reviver" foi dada como **concluída por já existir**.

---

## Validação & entregas

| Artefato | Estado |
|---|---|
| Commit | `4807414` (main) — CI roda vitest em DB efêmero = gate |
| tsc server + web | ✅ limpos |
| Testes novos/atualizados | credits (contrato 1º grátis) + whatsapp (normalização) = **11/11** isolados |
| Suíte full local | ⚠️ interferida por sessão paralela resetando o test DB (falhas rotativas FK/401 em arquivos não tocados) — se o CI reprovar, corrijo |
| AAB | **348 (2.7.107)** buildado — subir no Play: `packages\mobile\android\app\build\outputs\bundle\release\app-release.aab` |
| Deploy web/server | automático pelo push |
