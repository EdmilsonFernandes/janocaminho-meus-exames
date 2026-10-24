# Spec — Fechamento dos gaps da Teleconsulta (dono, 24/10)

> Fonte: prompt do dono + bugs reais (Dr. Enrico entrou antes, encerrou sem o paciente; lista ainda mostra "Entrar"; PIX quebra ao copiar no app; exame novo não aparece pro médico sem re-compartilhar; prioridade clínica quebra layout; painel poluído; auditoria sem agrupar).
> **Regra de ouro (§11): cada regra precisa de critério verificável + teste. Sem evidência = pendente. Backend é a barreira, nunca só a UI.**

## 1. Ciclo de vida (estado da teleconsulta)
- Coluna `teleStatus`: `scheduled | in_progress | completed | no_show | cancelled | technical` (+ `patientJoinedAt`, `jointSeconds`, `minJointSecondsCfg?` via AppSetting `teleconsulta` — default explícito, ex. 300s) — migration ADITIVA.
- **Janela de entrada**: join liberado só a partir de `dueDate − 5 min` (server clock; 403 `TOO_EARLY` com `opensAt` ISO pro client mostrar countdown).
- **Sair ≠ concluir**; um participante sozinho NÃO inicia atendimento (`in_progress` só quando AMBOS com JOIN registrado).
- **/end**: médico só conclui como `completed` se paciente joined E jointSeconds ≥ mínimo; senão exige `outcome` explícito (`no_show`|`technical`) → resultado distinto, sem marcar realizado.
- **Encerrada nunca mostra "Entrar"**: lists (Reminders paciente, PortalTeleconsultas) filtram/param o CTA pelo estado do server; join por link antigo → 403 `TELECONSULTA_ENDED` (já existe) + listas reativas (poll/focus já existe).
- Auto-end job: alinhar (30min → janela coerente; não marcar `completed` sem critério).
- Transições simultâneas: updateMany condicional por estado (sem race).

## 2. Pagamento × atendimento (SEPARAR)
- PIX confirmado (`paidAt`) = **condição de acesso** ao join quando `consultPriceCents>0` (join bloqueia com 402 `PAYMENT_REQUIRED` + dados pro dialog).
- Pago NÃO = realizado: `completed` (remuneração elegível) só com ambos + tempo conjunto ≥ mínimo.
- **Presença conjunta**: intervalos AMBOS conectados (JOIN/leave events auditados; degradação honesta: sem webhook LiveKit no v1, presença = eventos de join/disconnect reportados + validação server; documentar limitação).
- Reconexão não duplica tempo (merge de intervalos por papel).
- Não atingiu critério → `pending_reason` (`no_show`/`technical`/`min_time_not_met`) + política v1: **estorno/reembolso MANUAL** (documentar — sem promessa de automação sem suporte do provedor).
- **Presets de valor**: 120/150/170/190 + livre (portal dialog + perfil; server valida range 500–2.000.000 cents — já existe).

## 3. PIX no app (WebView)
- Reproduzir e corrigir copy no WebView (clipboard API falha → fallback textarea/select + `navigator.share`? + toast claro sucesso/falha).
- Sem cobrança dupla (idempotência por reminder — já existe lock 10min; revisar duplo-clique).
- Expiração → "Gerar novo QR" explícito; poll fecha sozinho na confirmação (server-verified, nunca por copy).

## 4. Compartilhamento de exames NOVOS (bug real)
- Hoje: exame novo não aparece pro médico sem re-compartilhar (share.examIds congelado).
- Regra: quando share é "todos" (examIds vazio) novos entram sozinhos (já é assim?) — quando é POR-EXAME, novo exame precisa de ação: ao extrair exame novo, paciente recebe prompt "compartilhar com Dr. X?" OU médico pede. **Investigar causa real** (share total vs parcial) e corrigir o fluxo + revogação impede leitura (server-side, já é por share).

## 5. UI/limpeza
- Prioridade clínica: círculo vermelho quebrando layout (tile do dashboard) — corrigir overflow.
- Painel paciente: avaliar remover "última teleconsulta" (poluição) — decisão: deixar só se pendente/hoje.
- Admin auditoria: agrupar por usuário (dias consecutivos do mesmo ator → 1 linha expansível).
- Gravação/transcrição: já é "ambos na sala" (banner) — garantir com o novo gate de pagamento/janela.

## 6. WhatsApp share + link direto (§10)
- "Compartilhar pelo WhatsApp" + "Copiar link" nos detalhes (paciente e médico): msg com nome/médico/data/hora fuso + link `drexame/#/teleconsulta/:id` (App Link; web fallback).
- Link: autentica → vai DIRETO pra consulta; antes da janela → countdown; PIX pendente → pagar → sala; encerrada → estado correto. Sem dados clínicos na URL; autorização sempre server-side (token do dono/médico com share — link não substitui auth).

## 7. Matriz de validação (§11 — obrigatória ao entregar)
Tabela: `regra | cenário | esperado | teste | evidência` — cobrindo: janela (antes/limite/depois, relógio server), sozinho/ambos/múltiplas desconexões, tempo abaixo/igual/acima do mínimo, reconexão/2 abas/dispositivos/eventos duplicados, PIX pendente/expirado/confirmado/webhook repetido, duplo clique, finalização simultânea, link antigo/encerrada/não-autorizado, exame novo pós-share + revogação, transcrição antes/depois do 2º participante.
- Unitários: transições, janela, cálculo conjunto, elegibilidade, permissões. Integração: join/end/billing/webhook. E2E: jornada com link. WebView real: copy PIX (marcar BLOQUEADO se sem device).
- Relógio controlado (vitest fake timers); concorrência → validar estado final no DB. Falhas preexistentes listadas à parte. Sem evidência = NÃO VALIDADO.

## Ordem de execução (agents serializados por arquivo)
1. **CORE server** (estado + janela + presença + gate pagamento + presets + auto-end) — schema/teleconsulta.routes/doctor.routes.
2. **PIX-APP web** (copy WebView + duplo-clique + expiração; dialog pago→sala) — Reminders/billing client.
3. **UI/limpeza + WhatsApp** (estados nas listas, prioridade clínica, painel, auditoria agrupada, share WhatsApp) — web.
4. **Share exames novos** (investigação server + fluxo) — pode paralelizar com 3 se arquivos distintos.
5. **Validação final** (matriz + suíte + E2E) + AAB.

## 12. Brief clínico e prioridade sempre atualizados (dono, 24/10 — adicionado em voo)
- **Novo exame com share contínuo**: extração concluída → brief/tendências/prioridade recalculam SOZINHOS (sem re-compartilhar); revogação bloqueia no server; **data de coleta ≠ data de upload** (exame antigo enviado hoje NÃO é o mais recente — evolui por performedAt).
- **Abertura do médico**: se dados novos ainda não analisados → "Novos dados recebidos — atualizando análise" + resumo anterior marcado desatualizado (data/hora) + auto-update pós-processamento + retry em erro (nunca análise velha como atual). Controle de VERSÃO da análise (atrasada não sobrescreve recente); sem processamento duplicado.
- **Brief responde rápido**: o que mudou desde a última consulta · exames novos · alterações + tendência · o que falta confirmar. Datas visíveis, link ao dado-fonte, diferenciar extraído × relato × interpretação IA (nunca hipótese como fato).
- **Durante a chamada**: aviso discreto "Novo exame disponível" + atualizar brief sem interromper/perder anotações (poll 30s já existe no brief — usar).
- **Prioridade clínica fundamentada**: motivo + dados que sustentam; prioridade ≠ fora-de-referência; sem dados suficientes → limitação explícita (não "baixa"); critérios clínicos explícitos (não só resposta livre da IA); ajuste do MÉDICO tem autoria/data/histórico e atualização automática NÃO apaga decisão clínica; consistente em todas as telas.
- **10 cenários de teste obrigatórios** (verbatim do dono): share ativo envia→médico vê sem recompartilhar; abre durante processamento (estado honesto); 2 uploads seguidos (versão final, atrasado não sobrescreve); exame antigo hoje (evolução por coleta); extração falha (sem prioridade nova com dados inválidos); corrigido/excluído → reavalia; revogado durante processamento → inacessível; novo exame NA CHAMADA (aviso+update sem perder anotações); ajuste médico rastreável pós-auto; mesma versão em todas as telas.
- **Fila**: fase 4.5 do pipeline (após CORE + UI/WhatsApp; toca extraction/pipeline + BriefClinico + prioridade — BriefClinico fica LIVRE após a fase 3).

## 13. Lembrete automático por e-mail 5 min antes (dono, 24/10 — ambos os papéis)
- **Backend puro** (app fechado, ninguém conectado): email pro PACIENTE e pro MÉDICO quando faltarem `entryWindowMin` (mesma config do CORE — fonte única). Alavancar o job `reminderEmails.ts` existente (offsets) + destinatário médico novo.
- **Conteúdo**: identificação Dr. Exame, nome do outro participante, data/hora/fuso, botão "Acessar teleconsulta" (link da consulta, sobrevive ao login), check de câmera/mic/conexão, pagamento pendente quando aplicável (sem prometer sala liberada). SEM dados de saúde. Emails individuais (sem vazar endereço).
- **Confiabilidade**: revalidar estado+horário ANTES de enviar (reagendada/cancelada/encerrada → não manda); falha num destinatário não bloqueia o outro; dedup em reprocessamento/restart/workers simultâneos (sentOffsets padrão da casa); log de tentativas (aceite provedor ≠ entrega); retry janela útil; agendada com <5 min de antecedência e válida → dispara imediato; fuso explícito e relógio SERVER (nunca device).
- **Complementos UX**: aviso in-app "Sua consulta começa em 5 min"; sala de espera com estado REAL ("Aguardando médico/paciente/Pagamento pendente" — usa teleStatus do CORE); teste de câmera/mic ANTES de entrar (sem iniciar gravação/transcrição/tempo elegível); "X já está aguardando" pro outro; "Adicionar ao calendário" (.ics com data/fuso/link; reagendamento atualiza); ajuda clara se não conseguir entrar. Sem mensagens repetidas; validação de acesso sempre no backend.
- **12 testes obrigatórios** (verbatim): ambos recebem no horário; envia com app fechado; reagendamento invalida lembrete antigo; cancelamento impede pendentes; reexecução não duplica; falha num não bloqueia o outro; criada <5min → imediato; fusos não alteram o instante; links autenticado/deslogado/pagamento pendente; link antigo/encaminhado não contorna; restart recupera pendentes sem obsoletos; teste câmera/mic não inicia transcrição nem tempo elegível. Relógio controlado + envio em ambiente de integração + evidências sem PII.
- **Fila**: fase 3.5 (após CORE e junto com UI/WhatsApp — mesmo mecanismo de link; job do email + templates).

## 14. Resumo pós-consulta, encerramento estruturado e exceções (dono, 24/10 — v2 do spec)
**Skills**: usar as relevantes do ambiente (arquitetura/backend/UX/segurança/testes/a11y/review) — ler de verdade, sem declarar uso sem ler; respeitar orientações do repo.

### 14.1 Resumo pós-consulta revisado pelo MÉDICO
- IA prepara RASCUNHO estruturado dos dados autorizados: motivo, pontos discutidos, exames avaliados + datas, avaliação do médico, orientações/próximos passos, exames/encaminhamentos solicitados, retorno/pendências. Diferenciar relatado×exame×avaliação; transcrição incompleta → sinalizar; NUNCA inventar diagnóstico/prescrição/dose.
- Rascunho é do MÉDICO: revisar/editar/aprovar; SÓ depois de aprovado o paciente vê. Salvar e continuar; autor+aprovação+data+VERSÕES (correção rastreável, sem sobrescrever aprovado silenciosamente). Falha na geração NÃO impede registro (manual + retry sem duplicar/apagar edições).

### 14.2 Encerramento estruturado
- SEPARAR: fim da chamada ≠ conclusão do atendimento ≠ aprovação do resumo ≠ elegibilidade financeira ≠ repasse. Tempo mínimo conjunto é necessário, não suficiente (exige conclusão do médico + sem intercorrência).
- Resultados distintos: realizado / ausência / interrupção técnica / cancelamento — transições validadas no BACKEND. NUNCA auto-concluir por saída/tempo/PIX.

### 14.3 Recuperação de falhas na chamada
- Queda → estado real + "Reconectar à consulta" (mesma consulta, autorização/estado respeitados); anotações salvas e intervalos de presença validados PRESERVADOS; contar só presença simultânea; transcrição pausa/retoma conforme regras; sem duplicar sessões/cobranças/transcrições/tempo; sem reconexão após encerramento definitivo. Diferenciar falha temporária × saída voluntária × encerramento; não depender só do estado do browser.

### 14.4 Situação financeira compreensível
- Paciente: estado real do pagamento + estorno/crédito com orientação clara. Médico: valor contratado × em análise × elegível × REPASSE EFETIVO (só estados CONFIRMADOS pela integração — solicitado ≠ concluído).
- Tratamento explícito: pago sem atendimento / falha técnica / ausência / abaixo do mínimo. Política inexistente → **decisão pendente destacada, nunca regra silenciosa**.

### 14.5 Central de exceções no ADMIN
- Visão operacional: pago sem atendimento · sem conclusão após período esperado · divergência de eventos de presença · falha de entrada · falha de resumo/transcrição · estorno/repasse pendente-erro · brief desatualizado/análise com falha · falha de lembrete. Cada ocorrência: consulta, motivo, horário, responsável, situação, histórico, resolução. Agrupar relacionadas (sem poluir, preservando eventos); reprocessamento seguro sem efeito financeiro duplicado; dados mínimos por perfil.

### 14.6 Preparação antes da consulta (checklist contextual)
- Motivo informado · share conferido · novos exames (processado/pendente explícito) · câmera/mic testados · pagamento · horário/acesso. Teste de dispositivos NÃO inicia gravação/transcrição/tempo elegível. Sem etapas desnecessárias; não bloquear por opcional; impedimento real explicado.

### 14.7 Continuidade pós-consulta (paciente)
- Pós-aprovação: visão simples com orientações e pendências DO MÉDICO; acompanhar ações (enviar exame solicitado, agendar retorno); IA organiza, NÃO cria conduta; pendente×concluído com origem+data; sem card sem ação útil. Notificações → conteúdo autenticado no app (sem dado clínico no email).

### 14.8 Coerência entre perfis
- Paciente/médico/admin veem a MESMA consulta de forma consistente (permissões respeitadas); estados claros de carregamento/processamento/falha/recuperação; nunca dado antigo como atual nem sucesso antes de confirmação do server; responsividade/a11y/WebView; brief preservado na chamada, sem interrupções excessivas.

### 14.9 Testes obrigatórios (matriz §11 + estes)
Geração/edição/aprovação/disponibilização do resumo; paciente BLOQUEADO em rascunho não-aprovado; transcrição incompleta sem invenção; falha de geração com recuperação sem apagar edições; queda+reconexão (um/ambos); eventos duplicados/atrasados/fora de ordem; 2 abas + encerramento simultâneo; paga que não ocorreu; mínimo atingido com intercorrência técnica; estorno/repasse repetido sem duplicidade; restart durante processamento; permissões por perfil. Item concluído só com evidência reproduzível.

**Fila**: fase 5+ do pipeline (após CORE/PIX/UI/§12/§13 — depende do estado machine e do resumo; extrair subfases: 5a resumo versionado médico, 5b encerramento+financeiro, 5c central exceções, 5d checklist+continuidade).

## 15. Complemento de fechamento — verificar ANTES de declarar conclusão (dono, 24/10 final)
### 15.1 Dados antigos e consultas já inconsistentes
- Correções valem para CONSULTAS EXISTENTES, não só novas. Rotina de DIAGNÓSTICO: estados contraditórios (encerrada com entrada disponível, paga sem atendimento, presença incompleta, análise desatualizada) → relatório; correção só quando SEGURO (simulação prévia, rastreabilidade, reversível); NUNCA alterar valores/histórico clínico por suposição; casos duvidosos → fila de revisão humana.
### 15.2 Falhas entre banco, filas e provedores (conciliação)
- Cenários: pago×consulta não atualizada · reagendada×lembrete antigo pendente · exame processado×brief não atualizado · encerrada×resumo não gerado. Recuperação/conciliação NA arquitetura existente (jobs idempotentes — sem infra nova sem necessidade demonstrada). Restart não perde tarefa nem duplica efeito.
### 15.3 Configuração financeira consistente
- Agendamento REGISTRA valor + VERSÃO das regras financeiras aplicáveis (ex.: `financeRulesVersion`); mudança de preço/config não altera retroativamente contratos fechados. Paciente/médico/admin leem o MESMO registro.
### 15.4 Implantação e recuperação
- Compatibilidade app antigo × backend novo × banco (respostas seguras pra clientes antigos: campos opcionais, 402/403 com codes estáveis). Migrações aditivas; rollback da aplicação NÃO apaga pagamentos/eventos de presença/documentos criados pós-deploy (nunca drop/destructive).
### 15.5 Monitoramento verificável
- Detectar falhas de pagamento/entrada/lembrete/análise/resumo com **correlation-id por consulta**; logs SEM conteúdo clínico/credenciais/links secretos. Validar também os MECANISMOS DE RECUPERAÇÃO, não só o caminho feliz.
### 15.6 Entrega final consolidada
- SEM cosmética nova agora: terminar escopo, testar, entregar **UMA matriz de requisitos** com evidências e pendências REAIS — diferenciando: `código implementado` × `teste automatizado aprovado` × `integração validada` × `comportamento ainda não comprovado` (nunca equivalentes).

**Fila**: §15 atravessa TODAS as fases (diagnóstico de legado na fase CORE-deploy; conciliação nos jobs; financeRulesVersion no CORE; matriz única na fase de validação final).

## 16. Protocolo de revisão final integrada (dono, 24/10 — última instrução; executar ANTES de declarar encerrado)
1. **Checklist única da conversa INTEIRA** (nenhum pedido de mensagem anterior de fora): cada item marcado como `implementado e validado` | `implementado sem validação` | `bloqueado` | `pendente`.
2. **Revisão de código e fluxo completo** com as skills relevantes (arquitetura/regras/segurança/UX/testes); corrigir contradições entre as mudanças DENTRO do escopo.
3. **Jornada completa com DOIS usuários distintos** (médico+paciente): agendamento→valor→PIX→lembrete→link WhatsApp/email→auth→entrada na janela→presença simultânea→reconexão→transcrição→encerramento→resumo aprovado→situação financeira + upload de exame novo→brief/prioridade→revogação→admin. Mocks/chamadas isoladas NÃO valem como jornada; declarar explicitamente o que foi comprovado em app real e integrações reais de teste.
4. **Falhas e regressões**: concorrência, eventos duplicados/atrasados, indisponibilidade, permissões, recuperação; corrigir o que as mudanças quebraram e REPETIR testes afetados.
5. **Implantação**: migrações, configs, jobs agendados, compatibilidade com consultas existentes, monitoramento, recuperação; sem segredos na entrega; seguir fluxo de publicação autorizado (código pronto ≠ produção validada).
6. **Relatório final objetivo**: requisitos+evidências · testes+resultados · pendências+decisões · riscos/limitações · instruções curtas de validação (paciente/médico/admin) · situação exata: `pronto para homologação` | `homologado` | `implantado e verificado`. Proibido "100% concluído" com regra crítica sem validação; bloqueio registrado com precisão. Recomendação final fundamentada: **pronto pra uso ou impedimento? com quais evidências**.
**SEM novas funcionalidades** — fechar, corrigir inconsistências, entregar fluxo completo verificável.

## 17. FECHAMENTO OBRIGATÓRIO — homologação da jornada (dono, 24/10 — instrução final)
**Ciclo mandatório: implementar → testar → achar falha → corrigir → REPETIR testes afetados → homologar jornada completa. Não encerrar após escrever código.**

### 17.1 Referências e implementação real
Skills relevantes + docs oficiais DOS provedores usados (vídeo=LiveKit, pagamento=Asaas/MP, email=Zoho SMTP, transcrição=GROQ Whisper) — identificar ANTES de definir. Requisitos regulatórios (CFM 2.314/2022) × regras comerciais × recomendações técnicas — conformidade integral NÃO se declara por checklist. Refs: Playwright contexts/best-practices (2 usuários simultâneos), MDN RTCPeerConnection.connectionState, docs.asaas.com/webhooks.
### 17.2 Homologação simultânea (médico + paciente)
2 usuários de teste, SESSÕES INDEPENDENTES (browser contexts distintos — nunca alternar perfis na mesma sessão). Jornada: agendamento/valor→PIX→confirmação→lembretes→link→auth→entrada na janela→espera→presença simultânea→áudio/vídeo→brief→transcrição autorizada→reconexão→encerramento→resumo revisado→acesso paciente→financeiro→auditoria. Conferir em CADA etapa: o que cada perfil vê + o que persistiu no backend.
### 17.3 Prova de comunicação real
Sala aberta/"connected" ≠ chamada funcional: áudio NOS DOIS SENTIDOS + vídeo + permissões + recuperação. Mídia sintética É VÁLIDA em automação mas DEVE ser identificada como tal + complementar com câmera/mic REAL quando houver device. Cam/mic desligados voluntariamente ≠ ausência (isoladamente).
### 17.4 Consentimentos separados (versão, data, autoria)
Teleconsulta × compartilhamento × gravação/transcrição — cada um com versão. Transcrição indisponível NUNCA perde atendimento/prontuário (registro manual pelo médico). Rascunhos/gravações/transcrições protegidos por autorização no SERVER; resumo IA só aparece como APROVADO pós-revisão médica.
### 17.5 Regressões OBRIGATÓRIAS (bugs relatados verbatim)
Médico sozinho sai antes · encerrada oferecendo entrada · copiar PIX falha no app · novo exame exige recompartilhar · brief/prioridade desatualizados · prioridade quebra layout · links perdem consulta pós-login · lembrete após cancelamento/horário antigo · transcrição com 1 participante · cobrança/remuneração fora das regras. + duplicidade de eventos, simultaneidade, reconexões, restart, falhas entre etapas.
### 17.6 Definições pendentes (política financeira)
Explicitar valores ainda não definidos (tempo mínimo conjunto default 300s no CORE — confirmar com dono; tolerância de atraso; ausência; cancelamento; estorno; interrupção técnica). Continuar o trabalho INDEPENDENTE delas; NÃO inventar valor; fluxo que dependa de decisão = PENDENTE declarado.
### 17.7 Revisão sobre versão IDENTIFICADA
Commit/build + ambiente + configs + resultados registrados; após última correção REPETIR testes afetados + jornada principal NA VERSÃO FINAL (evidência de versão anterior não vale). Sem cobranças reais nem mensagens a pacientes reais.
### 17.8 Matriz única de aprovação
`Requisito | Cenário | Resultado esperado | Resultado obtido | Evidência | Pendência` — separando: testado automaticamente × validado com integração de teste × validado em DISPOSITIVO REAL × ainda não comprovado. Evidências sanitizadas + comandos + falhas + correções. **Recomendar liberação SÓ sem falha crítica conhecida** (pagamento/autorização/acesso/comunicação/integridade). Bloqueio exato + procedimento restante quando faltar ambiente. "Está tudo funcionando" sem comprovação = proibido.
**Objetivo: concluir a jornada (médico+paciente consultam inteira, exceções tratadas sem estados contraditórios/perda de dados/efeitos financeiros duplicados) — NÃO abrir nova rodada de features.**

## 18. MÓDULO FINANCEIRO — médico, paciente e plataforma (dono, 24/10 — novo escopo)
**Organização: coordenador + 6 papéis (UX/UI, backend jornada, eng. financeira/Asaas, segurança, performance, QA) — ondas se preciso; parecida honesta de quem rodou. Fases: 1 Descoberta/contratos → 2 Fundação financeira (ledger+comissões) → 3 Interfaces médico/admin → 4 Repasses (supervisionado→automático).**

### 18.1 Financeiro do médico (área)
Resumo por período: previstos (pagos não realizados — NÃO é dinheiro disponível) · em validação pós-atendimento · liberados p/ repasse · em processamento · repassados · bloqueios/ajustes/estornos com justificativa · extrato por consulta (valor contratado, descontos, base, % plataforma, taxas por parte, honorários, situação repasse) · dados de recebimento/validação cadastral. Filtros período/consulta/situação + export sem dado clínico.

### 18.2 Config comerciais (admin)
% geral + condição específica por médico (precedência: específica vigente > geral vigente). Proposta INICIAL a confirmar: 20% plataforma / 80% médico, taxas de pagamento absorvidas pela plataforma — NÃO ativar condição real silenciosamente. Regra define: %, base, quem paga taxas (pagamento/repasse), descontos/cancelamentos/estornos, prazo/condições de liberação, vigência. **Snapshot da condição em cada agendamento** (mudança não recalcula o passado — §15.3). Médico vê quanto receberá ANTES de contratar + aceite registrado.

### 18.3 Ledger interno
Partidas balanceadas, lançamentos imutáveis, centavos inteiros. Contas: recebidos · vinculados (não realizadas) · obrigações c/ médicos · receita plataforma · taxas provedor · repasses processando/concluídos · estornos/reservas/ajustes. Saldo SEMPRE derivado de lançamentos; correção = lançamento compensatório (nunca apaga). Cada op vinculada a consulta/cobrança/médico/regra/ids provedor; unicidade+rastreabilidade. Controle operacional ≠ escrituração contábil/fiscal. **Total pago pelo paciente NÃO é receita da plataforma; saldo Asaas ≠ lucro.**

### 18.4 Split × repasse posterior (decisão de arquitetura)
Split Asaas = distribui entre CONTAS Asaas; transferência PIX = saída externa. Nossa regra (paga antes, médico elegível só pós-atendimento) → **verificar qual arquitetura a conta/contrato atual suporta**; não presumir que split retém parcela médica até conclusão. Avaliar as duas com requisitos/limites/taxas/impacto em estorno+conciliação. NÃO apresentar saldo interno como custódia/escrow — confirmar enquadramento com Asaas ANTES de movimentação real.

### 18.5 Repasse automático (só quando TUDO)
Pago confirmado + saldo disponível + consulta elegível + sem bloqueio/contestação + dados recebimento validados + prazo configurável cumprido + valor RESERVADO p/ a operação. Prazo/periodicidade configuráveis com previsão visível. Aprovação do resumo ≠ elegibilidade financeira (estados distintos). Titular do destino validado vs médico/PJ; troca de chave PIX = auth reforçada + histórico + aviso (não retroativo). Destino registrado protegido, exibição mascarada.

### 18.6 Antiduplicação
Reserva atômica antes do envio; concorrência/cliques/restart/timeout tratados; resposta perdida → RECONCILIAR com recursos do provedor (nunca reenviar cego); estados: solicitado/processando/concluído/falhou/cancelado/desconhecido (desconhecido = investigação, sem retransferir); "Repassado" só pós-confirmação confiável; webhooks autenticados + recuperação por consulta.

### 18.7 Estornos
Total e parcial, ANTES e DEPOIS do repasse; taxas não devolvidas (quem assume); recuperação de valor já repassado conforme contrato; nunca descontar silenciosamente honorários futuros; estorno×repasse concorrentes nunca usam o mesmo recurso; reserva operacional explícita (não é ganho do admin).

### 18.8 Visão admin
Separar: volume bruto · a devolver · obrigações c/ médicos · receita plataforma · taxas/custos · margem de contribuição (≠ lucro líquido) · caixa Asaas · comprometido + divergências. Filtros + config comercial + auditoria + fila exceções. Conciliação periódica (cobranças/taxas/transferências/saldo vs ledger) com data da última e diferenças abertas.

### 18.9 Transparência paciente
Valor contratado, pagamento, id da consulta, comprovantes, andamento de estorno. SEM extrato do médico; comprovante ≠ documento fiscal (responsabilidade fiscal conforme modelo contratual).

### 18.10 Testes obrigatórios
Geral×específica · mudança % sem retroativo · cálculos/arredondamentos/centavos/estorno parcial · **ledger balanceado em todo evento** · pago sem atendimento · elegível sem saldo · **2 repasses simultâneos** · **timeout pós-aceite do provedor** · webhook duplicado/atrasado/ausente · transferência rejeitada/desconhecida · troca de chave PIX em processamento · estorno antes/depois do repasse · concorrência estorno×repasse · médico só vê o próprio · recuperação pós-restart + conciliação de divergências. Sandbox, sem dinheiro real.

### 18.11 Identidade visual/mobile (VALE PRA TUDO DAQUI PRA FRENTE)
Mobile-first de verdade (começa em 320/360 e amplia; não desktop encolhido); larguras 320-1440 sem scroll horizontal; estados completos (loading/vazio/falha/pendência/bloqueio — nunca R$ 0,00 no lugar de "não carregado", nunca sucesso antes de confirmação); tabelas contidas no próprio componente; sem jargão (ledger/webhook/walletId NUNCA em tela); ações de dinheiro mostram valor+destinatário; APK/WebView validação distinta do browser (sem device = pendente declarado); revisão visual com screenshots ANTES de entregar; acessibilidade (contraste/foco/rotulagem/44px).

### 18.12 Entrega
Primeiro arquitetura + decisões comerciais pendentes; implementar o DEFINIDO; demonstrar a jornada (paga→registrado→consulta→elegível→repasse solicitado→confirmado→extratos conciliados); informar exato: implementado × testado em sandbox × dependente de habilitação contratual. **Repasse automático NÃO é "pronto" só porque existe chamada à API.** Skills financeiras (conciliação Anthropic/Stripe/Modern Treasury/Asaas docs): ler e aplicar ao problema certo, declarando onde cada prática entrou no código + qual teste comprova.

## 19. REABERTURA — falhas reais na homologação do dono (24/10 noite) — PRIORIDADE SOBRE TUDO
**2 BLOQUEADORES**: (B1) financeiro — paciente ENTROU sem pagar (reproduzir caminho exato: criação pelo médico está contornando? gate no backend ANTES de credencial do provedor; testar UI/link direto/link antigo/API direta/credencial anterior; valor ausente/erro integração NÃO vira grátis — regra explícita+auditoria) · (B2) áudio iPhone/Safari paciente → APK médico não ouve (cadeia: permissão→captura→track→publish→subscribe→playback; iOS Safari é ambiente distinto; SUSPEITO nº1: WebAudio do MediaRecorder em iOS muta a track original publicada — investigar; sem iPhone real = NÃO VALIDADO declarado).
**Gaps**: (G1) consulta criada pelo médico ESCONDIDA atrás de seta — próxima/ação no topo (médico+foto+data+situação+próxima ação pagar/aguardar/entrar); aparece sem sair/entrar; reagendamento/cancelamento atualizam · (G2) foto do paciente: prontuário mostra, lista só letra — mesma identidade, fallback só quando realmente não há · (G3) presença não atualiza pro médico (estados: não entrou/conectando/presente/reconectando/saiu — via eventos REAIS do provedor; sem "ausente" antes da regra) + sala de espera com identificação/horário/estado/orientação · (G4) gravação/transcrição falharam de novo (rastrear cada etapa; estados reais não-iniciada/capturando/processando/concluída/falhou; recuperação sem duplicar; falha → registro manual).
**Donos de arquivo**: Ag.FIN-B1 = teleconsulta/billing/doctor.routes(schedule) · Ag.AUDIO-B2+G3+G4 = Teleconsulta.tsx+teleconsulta components · Ag.UX-G1+G2 = Reminders.tsx+PortalTeleconsultas · QA reproduz independente no final.
**Aprovação**: os 12 passos do dono demonstrados na MESMA versão; build/commit+dispositivos identificados; iPhone/APK sem device = NÃO VALIDADO (nunca "resolvido por inspeção").
