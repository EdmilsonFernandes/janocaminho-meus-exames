# Modo Hormônios — Jornada do Paciente (detalhamento UX)

> Pedido do dono 27/10: "facilidade de usar o modo de hormônios — colocar Durateston, Deca, Masteron etc. e o dashboard tratar tudo conforme essa nova categoria. Como usuário paciente não quero dificuldade."

## 1. Jornada atual — passo a passo real (validada por QA 390px)

### Cadastro da substância (≤30 segundos, 4 toques)
| Passo | Ação | O que o paciente vê |
|---|---|---|
| 1 | Perfil → **"Declarar substância"** | Form abre direto (sem tela intermediária) |
| 2 | Digita `dura`, `deca`, `masteron`, `trembo`, `gh`… | Autocomplete com **50 substâncias por nome OU apelido** (Deca → Nandrolona; Masteron → Drostanolona; Sustanon → Durateston) + **badge "Lista C5 — ANVISA"** ao lado (educativo, sem julgamento) |
| 3 | (opcional) Escolhe fim de uso: **Em uso / Interrompi / Não sei** (default: Não sei) + mês/ano se interrompi | Máscara mm/aaaa; campo inválido NUNCA bloqueia |
| 4 | **Salvar** | Chip aparece na hora + "contexto aplicado" |

**Tudo mais é opcional**: dose relatada (texto livre — "300mg/semana" ou "não sei"), última administração (date), médico acompanhante (texto). **Zero campo obrigatório além do nome.** Registro parcial > registro ausente.

### Novo atalho (corrigido hoje)
A aba "Consulta & Drogas" do dashboard mostrava só TEXTO ("declare no seu Perfil…"). Agora tem **botão "Declarar agora"** que leva direto — sem caçar o Perfil.

## 2. O que o app faz com a declaração (tudo automático, zero configuração)
| Superfície | Como usa | Desde |
|---|---|---|
| **Dashboard (lente esportiva)** | Perfil ativo → home vira painel esportivo; arquétipo hormonal reordena domínios; chips com **"interrompido em mm/aaaa"** e impacto educativo por substância (HDL, eixo, Hct) | E4/E5 + hoje |
| **Timeline** | Janelas de uso: exames colhidos durante uso ganham chip tracejado cobre **"durante uso: X"**; eventos Início/Interrompi sempre visíveis | hoje |
| **"O que mudou"** | Delta entre coletas com contexto da janela (sem causalidade: "mudança ≠ por causa de") | hoje |
| **Alertas** | CK×treino recente, HDL×andrógeno declarado, hematócrito (linguagem SBEM) + **coexistência Hct≥54×HDL<20 → prioridade médica** | E5 + hoje |
| **IA (chat/resumo/checagem)** | Addendum "SUBSTÂNCIAS DECLARADAS + CONTEXTO DE COLETA" em chat, health-summary e **/check/full** (interações remédio×exame) | hoje |
| **Brief da teleconsulta** | Seção **"Uso relatado (não verificado)"** com janelas mm/aaaa, prescritor e badge — o médico vê antes da consulta | hoje |
| **Notificações diárias** | Tema hormonal = prioridade máxima quando há declaração (dicas 2×/semana entendem o que ele toma); opt-out = desligar perfil esportivo | 26/10 + hoje |
| **Cards clínicos (PSA, glicemia, GGT/FA, PA)** | DRAFT bloqueado até revisão médica E6 assinar | hoje (gated) |

## 3. Fricções conhecidas + estado
1. ✅ **CORRIGIDA hoje**: instrução textual virou botão direto ("Declarar agora").
2. ⚠️ **Onboarding**: quem ativa o perfil esportivo não recebe convite ativo p/ declarar (só vê os chips). *Sugestão P1.5*: após ativar perfil esportivo, 1 card "Usa algo? Declare em 30s" no dashboard (1 semana, depois some).
3. ⚠️ **Dependentes**: form usa o paciente TITULAR (firstPatientId) — declaração de dependente não suportada (igual resto do modo esportivo).
4. ✅ Nome fora do catálogo: texto livre aceito (classe continua "Hormônio") — nada trava.

## 4. Guardrails que protegem o paciente (não atrapalham)
- Nunca sugerimos dose/combinação/TPC; nunca "ciclo seguro" (lint do CI quebra o build se aparecer).
- Declaração = CONTEXTO, não verificação — badge "não verificado" no brief médico.
- LGPD art.11: substância nunca vai pra push/analytics/logs; push sem valor clínico no payload.
- Opt-out: desligar Perfil Esportivo para TUDO (dashboard, IA, brief, dicas).

## 5. Como testar agora (2 min)
1. Dev: login → Perfil → "Declarar substância" → digite `deca` → toque na opção → fim de uso "Interrompi" 09/2026 → Salvar.
2. Dashboard → aba "🗓️ Linha do tempo": eventos Início/Interrompi + chip "durante uso" nos exames da janela.
3. Aba "Consulta & Drogas": impacto educativo da substância + disclaimers.
