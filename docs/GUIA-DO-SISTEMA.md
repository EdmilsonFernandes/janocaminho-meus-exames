# 📘 Guia do Sistema — Dr. Exame / Meus Exames
> Mapa completo de funcionalidades por perfil (atualizado 27/10/2026 · v2.7.295).
> Para o dono, suporte e onboarding. "Onde tocar" em cada linha.

---

## 👤 PACIENTE — 3 perfis (o app inteiro é o mesmo, o que muda é o contexto)

### Perfil 1 · Paciente geral (padrão)
| Funcionalidade | Onde tocar | O que faz |
|---|---|---|
| **Upload de exame** | Exames → ➕ | PDF ou foto → IA extrai itens, painel, faixa do lab, página-fonte. PDF multi-exame é dividido automaticamente |
| **Dashboard** | Home | Score, alterados, evolução por marcador, tendências, linha do tempo, mapa do corpo, idade biológica |
| **Resumo IA por exame** | Exame → "Resumir" | Robô animado gera leitura educativa com carimbo IA (Res. CFM 2.454) |
| **Resumo consolidado** | Menu → Relatório completo | Todos os exames num laudo compartilhável c/ perguntas pro médico |
| **Chat IA** | Dr. Exame (menu) | Conversa sobre seus exames, com voz; contexto do seu perfil clínico |
| **Sinais vitais** | Home → card atividade | Health Connect (Samsung/Google): passos, FC repouso, sono, peso, calorias |
| **Medicamentos** | Menu → Medicações | Cadastro c/ preço comparado entre farmácias, interações A–X grátis, checagem completa por créditos |
| **Remédio por foto** | Medicações → 📷 | Foto da caixa → IA lê o nome |
| **Lembretes + push** | Menu → Lembretes | Consultas, exames, vacinas; notificações inteligentes |
| **Teleconsulta** | Consultas | Agenda c/ médico, paga (PIX/cartão), Google Meet, gravação c/ consentimento, transcrição, resumo aprovado pelo médico |
| **Compartilhar c/ médico** | Médicos (menu) | Convite por CRM, escopos (exames/alertas/resumo/evolução), revogável |
| **Família** | Menu → Família | Dependentes (filhos/pais/cônjuge) com histórico separado |
| **Planos** | Menu → Planos | Grátis c/ créditos, Premium mensal (fundador R$29,90), pacotes de créditos |
| **Privacidade** | Menu → Privacidade | Baixar seus dados, excluir conta; CPF/RG cifrados no banco (LGPD) |
| **Extras** | — | Modo exemplo (dashboard demo), conquistas, indicar amigos, texto grande, Libras, tema claro/escuro |

### Perfil 2 · Pediatria (dependente)
| O que muda | Detalhe |
|---|---|
| Curvas de crescimento OMS vendorizadas | Exames do dependente interpretados por faixa etária |
| Histórico isolado por pessoa | Cores distintas por membro na família |
| Mesmo fluxo de exames/share/teleconsulta | Selecionando o dependente no seletor de perfil |

### Perfil 3 · Esportivo / Hormonal 🆕 (o que entrou agora)
| Funcionalidade | Onde tocar | O que faz |
|---|---|---|
| **Perfil atleta** | Perfil → Saúde Esportiva | Modalidade, frequência, contexto de coleta (jejum, treino <24h) |
| **Lente esportiva** | Home (perfil ativo) | Dashboard reorganizado por domínio: Hormonal · Hemograma · Cardio · Músculo-Fígado · Renal |
| **Declarar substância** | Perfil → "Declarar substância" | Durateston/Deca/Masteron/GH… por nome ou apelido + badge ANVISA; fim-de-uso, última dose, médico — tudo opcional |
| **O que mudou** 🆕 | Home (lente) | Delta de cada marcador vs coleta anterior, na/fora da faixa, perguntas prontas pro médico |
| **Timeline c/ janelas de uso** 🆕 | 🗓️ Linha do tempo | Exames marcados "durante uso: X"; início/fim de uso como eventos |
| **Brief teleconsulta "uso relatado"** 🆕 | Lado do médico | Substâncias + janelas + badge "não verificado" |
| **Dicas hormonais** 🆕 | Push 2×/semana | Notificação entende o que você declara (opt-out: desligar perfil) |
| **Alertas contextuais** | Topo da lente | CK×treino, HDL×andrógeno, hematócrito, coexistência → prioridade médica |

---

## 🩺 MÉDICO — portal `/doctor`
| Funcionalidade | Onde tocar | O que faz |
|---|---|---|
| Cadastro + verificação CRM | janocaminho.com.br/minhasaude/#/doctor | CRM + e-mail verificado |
| Painel de pacientes | Abas: Exames · Alterados · Tendências · Relatório · Perguntas · Esportivo · Notas | Pacientes que compartilharam com você |
| Laudo original + extração | Exame do paciente | PDF original + itens com página-fonte |
| **Notas clínicas c/ modelos** 🆕 | Aba Notas | Templates 1-clique (peso/sinais, conduta, ajuste, retorno) |
| **Brief clínico v2** | Teleconsulta | Alergias, medicações, **uso relatado**, vitais 30d (HC) |
| Perguntas e respostas | Aba Perguntas | Paciente pergunta no app, médico responde |
| Resumo consolidado médico | Aba Relatório | Laudo IA orientado a médico |
| Teleconsulta médica | Agenda | Recorrência, no-show com tolerância, cobrança automática, Meet |
| Metas clínicas | Portal esportivo | Define faixa-alvo (ex.: T 450–600) — aparece no gráfico do paciente |
| Financeiro | Financeiro | Repasses, teleconsultas pagas |

---

## 🛠 ADMIN — painel `/admin`
Créditos/custos IA · grants por plano · upload rules · campanhas de push segmentadas · providers IA (chaves + failover) · dashboards de uso · flag sportsMode (ligar modo esportivo em produção) · histórico do dia · usuários de teste.

---

## 🌐 Público
- **Landing principal**: janocaminho.com.br/minhasaude — agora com bloco esportivo
- **Landing esportiva** `/saude-esportiva`: 3 variantes (A cargas · B histórico `?v=b` · C médico `?v=c`) + simulador de régua + seção academia 🆕
- **Decifre seu exame**: cole o texto do exame, recebe leitura (funil público)
- **API pública v1**: `/api-docs` (ledger pré-pago p/ parceiros)

## 🚦 O que NÃO está ativo (gates)
- **Cards clínicos AAS** (PSA, glicemia, GGT/FA, PA): DRAFT até revisão médica E6
- **Modo esportivo em produção**: flag OFF no admin — liga quando você decidir (dev já ON)
