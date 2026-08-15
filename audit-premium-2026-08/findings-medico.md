# Auditoria Médico — achados ao vivo (scratch)

## Home /doctor (desktop 1440)
- ✔ Shell próprio: nome+especialidade+CRM, PLANO (Grátis 0/5 c/ explicação), menu Pacientes/Convites/Perguntas/Meu perfil/Trocar senha/Sair.
- ✔ Pacientes (2) c/ "🔴 2 com alerta", busca, "Só alerta", cards ricos: idade·sexo·vínculo ("Cônjuge · titular: Edmilson")·alerta·nº exames·última data·plano (AMIL).
- [P3] Banner Pro "Assinar R$29,90" dismissível ok.

## Contexto do paciente (preocupação #7 do dono)
- ✔✔ SOLUÇÃO ATUAL É BOA: header compacto (nome + botão Trocar + meta única "48 anos • Feminino • Cônjuge • AMIL • 68 kg") + 4 chips (Último exame/Alterações 40/Pendências/Anotações). Contexto persistente acima das abas sem repetir em todo bloco. NÃO precisa de sidebar/breadcrumb.
- ✔ Abas: Exames 13 / Alterados 40 / Tendências / Relatório / Perguntas 1 / Anotações.

## Alterados (médico)
- ✔✔ Ordenação 🔴→🟠→🟡 CORRETA aqui (no app do paciente está invertida — bug do lado paciente). Severidade 7/12/21=40 consistente. Datas relativas + médico solicitante + "exame antigo — considere renovar". Footer médico-correto: "A interpretação final é sua."
- [P2] Títulos de exame genéricos ("EXAMES LABORATORIAIS") dificultam scan de 6 anos.

## Tendências
- [P2] SEM filtro de período (histórico 2020-2026 inteiro); médico não isola "últimos 6 meses". Mesmo padrão valor+%+medições do paciente (↑66% · 3 medições ✓).

## Relatório
- "Relatório completo — Atualizado 17/07/2026 23:45" + Resumo da análise numerado + disclaimer IA pré-consulta ✔.
- [P1] NENHUM fluxo de assinatura (nem "Assinar" no DOM). Landing promete SOAP ✓ (aparece) mas "Exportar PES com CID-10" NÃO existe → promessa×produto.

## Exames + detalhe
- ✔ Lista espelha paciente (busca, data/categoria, chips, anos 2020-2026). Detalhe INLINE: h1 + status + lab c/ logo + "31 pág." + médico solicitante + 🚩 4 fora da faixa (valores listados) + 15 seções em acordeão + help "O que é este exame?".
- 🔴 [P1] SEM "Abrir laudo"/PDF em NENHUM lugar do DOM (sem /api/files). Paciente TEM o botão; médico NÃO. Fonte do dado inacessível a quem mais precisa.
- [P3] "1 itens" (singular errado); PROLACTINA/TESTOSTERONA dentro de "HEMOGRAMA COMPLETO" (painel×título).

## Perguntas
- ✔✔ Fluxo excelente: 4 perguntas nascidas do relatório (com valores embutidos), quick-replies prontos ("Recebido!"…), resposta livre, status "✅ Recebido! Dr. … vai analisar".
- [P3] "Dr. Dr. Daniel Shirane" (prefixo duplicado).

## Mobile 390
- ✔ Zero overflow; bottom bar própria presente.

## Desktop
- [P2] Conteúdo em coluna única (~900px útil) — sem master/detail nem sticky context; horizontal subutilizado (usuário pediu avaliar).

## Troca de paciente
- Botão "Trocar" no header — fluxo de troca não testado em profundidade (1 clique só). Risco de confusão A/B não observado, mas não validado.
