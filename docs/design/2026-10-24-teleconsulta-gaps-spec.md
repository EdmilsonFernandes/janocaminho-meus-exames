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
