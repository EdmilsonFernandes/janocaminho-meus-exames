# Produto — Funil de Aquisição via Médico (Doctor-Pushed)

> Estratégia: virar o eixo de *patient-pulled* (paciente acha o app) para **doctor-pushed** (o consultório é o canal de aquisição). O médico é cliente **e** canal de aquisição — confiança transferida, custo de aquisição ~zero, retenção alta.
>
> Dono do produto: Edmilson. Status: **proposta p/ revisão** (ainda não implementado).

---

## 1. A tese (por que funciona)

O momento do **agendamento no consultório** é o ponto de menor atrito do funil: o paciente já está dando os dados, já tem um motivo (a consulta), já confia no médico. Hoje esse momento é desperdiçado.

**Flywheel:**
1. Médico/atendente **convida o paciente** no portal (pré-cadastro: nome + WhatsApp/email).
2. Paciente recebe o convite → instala o app (Android Play / iOS PWA) → **o médico já aparece com compartilhamento pré-aceito**.
3. Paciente sobe os exames que o médico pediu.
4. Médico ganha o **pré-consulta** (brief de 1 página — *endpoint já existe*: `/doctor/patients/:id/pre-visit`). **Esforço de convidar → recompensa imediata.**
5. IA sinaliza "refazer exame X em 3 meses" → paciente volta ao médico → **loop de retorno**.

O pré-consulta é o **prêmio do médico por convidar** — ele entra na consulta já sabendo o que importa. Esse é o motor.

---

## 2. Os 3 problemas que essa tese resolve

### A. "Pergunta enche o médico" → portão por relacionamento, NÃO por dinheiro
Cobrar do paciente pra falar com o próprio médico = pedágio (UX ruim). Solução = **gating por vínculo**:
- Cada vínculo ativo médico↔paciente permite **N perguntas em aberto ao mesmo tempo** (default 2). Médico precisa responder/fechar uma antes de o paciente abrir outra → nunca vira inundação.
- Médico (Pro) configura o próprio limite.
- **A consulta libera cota:** botão "Atendi" no portal → +1 pergunta em aberto pra aquele paciente (cap p/ não virar flood). Realiza "cada consulta = direito a perguntas" e vira **gatilho de retorno**.

### B. "Agenda do médico" → NÃO construir (opinião franca)
Agenda completa concorre com software de clínica (que o consultório já tem), build enorme, ROI baixo agora. **Versão enxuta que captura 100% do valor:** não substituir a agenda do consultório — só um botão **"Atendi [paciente]"** (1 toque) que registra a consulta + libera cota + alimenta a pré-consulta da próxima vez. *Agenda real só se os médicos pedirem (demand-pull).*

### C. Pré-cadastro + convite (WhatsApp/email) → coração do MVP, escopo pequeno
- Médico/atendente: **"Convidar paciente"** → nome + telefone/email → sistema cria convite com **share pré-autorizado** + gera link.
- **Landing de convite inteligente:** detecta Android → Play Store; iOS → instruções PWA (é PWA, sem app nativo Apple); desktop → web. Mensagem WhatsApp pronta com o link + "seu médico Dr. X já te espera no app".
- Paciente entra → médico **já aparece com compartilhamento aceito** (zero fricção).

---

## 3. Monetização (dual)

| Quem paga | O quê | Já existe? |
|---|---|---|
| **Médico** | **Pro** (SOAP/planos ilimitados) = porta de aquisição. Grátis pra convidar X pacientes/mês; Pro p/ mais + branding + SOAP ilimitado. | ✅ Pro existe |
| **Paciente** | Grátis p/ subir/compartilhar/perguntar. Paga **créditos só na IA** (relatório, chat, consolidado). | ✅ créditos existem |
| **Pergunta ao médico** | **Não cobrar** — é retenção, não produto. | — |
| **Futuro** | Pro Clínica: cobrança por pacientes ativos/mês (alto volume). | ❌ depois |

> Alavanca nova: médico adquire → mais pacientes → mais créditos de IA → médico vê valor → renova Pro. **A aquisição é grátis; o médico monetiza via Pro + retenção.**

---

## 4. Escopo do MVP (por prioridade)

| # | Fatia | Valor | Esforço |
|---|---|---|---|
| **1** | **"Convidar paciente" no portal** → cria convite (share pré-autorizado) + link WhatsApp copia-e-cola | 🔥 Maior alavanca de aquisição | Médio |
| **2** | **Landing de convite** que decide Play Store / PWA-iOS / web por dispositivo + consome o token no registro | 🔥 Fecha o funil mobile (PWA Apple) | Médio |
| **3** | **Gate de perguntas por cota** (N em aberto por vínculo; médico configura no Pro) | 🛡️ Protege o médico (sem isso ele abandona o recurso) | Pequeno |
| **4** | **Botão "Atendi"** no portal → registra consulta + libera +1 pergunta | 💸 Realiza "consulta → perguntas" + retorno | Pequeno |

**Fora do escopo (depois, se houver demanda):** agenda completa, role de recepcionista/clínica multi-usuário, cobrança por paciente ativo.

---

## 5. Modelo de dados (novo/alterado)

### Novo: `PatientInvite`
```prisma
model PatientInvite {
  id              String    @id @default(cuid())
  doctorId        String
  doctor          Doctor    @relation(fields: [doctorId], references: [id])
  patientName     String
  phone           String?   // WhatsApp (preferencial)
  email           String?
  token           String    @unique            // magic link
  scopes          String[]  @default([])       // pré-autorizados: exams, evolution, alerts, summary
  status          String    @default("pending")// pending | accepted | expired
  expiresAt       DateTime? @default(now() + 14 days)
  acceptedAt      DateTime?
  acceptedUserId  String?   // User que aceitou → vira dono do Patient
  createdAt       DateTime  @default(now())
}
```
- Médico cria → status `pending`. Paciente abre `/convite/:token`, registra/loga → `accepted`, cria `User`+`Patient` (owner = user) e ativa `DoctorShare` com `scopes`.

### Novo: `Consultation` (o "Atendi")
```prisma
model Consultation {
  id         String   @id @default(cuid())
  doctorId   String
  patientId  String
  happenedAt DateTime @default(now())
  note       String?
  createdAt  DateTime @default(now())
}
```
- Ao criar: `DoctorShare.openQuestionLimit += 1` (cap 5) — libera +1 pergunta em aberto.

### Alterado: `DoctorShare`
```prisma
openQuestionLimit Int @default(2)   // máx. perguntas EM ABERTO simultâneas (anti-flood)
```

### Alterado: `Doctor` (config Pro)
```prisma
defaultQuestionLimit Int @default(2)  // limite padrão aplicado a novos shares
```

---

## 6. Fluxos

### 6.1 Médico convida paciente
```
Portal → Pacientes → "+ Convidar paciente"
  → form: nome, telefone OU email, (msg opcional)
  → POST /api/doctor/invites  { patientName, phone, email, scopes }
     → cria PatientInvite (token), status pending
  → retorna link WhatsApp: https://wa.me/<phone>?text=<msg + https://app/convite/:token>
  → botão "Enviar no WhatsApp" (abre wa.me) | "Copiar link"
  → convite aparece em "Pacientes → Pendentes (convites)"
```

### 6.2 Paciente aceita (mobile)
```
WhatsApp → toca no link → /convite/:token (landing pública)
  → mostra: "Dr. X te convidou para o Meus Exames"
  → detecta dispositivo:
      Android → botão "Baixar no Google Play" (leva token via deep-link/cópia)
      iOS     → instruções PWA ("Safari → Compartilhar → Adicionar à Tela de Início")
      Desktop → "Abrir app na web"
  → "Criar conta / Entrar" (carrega token)
  → no registro/login: consome o invite
      → cria User + Patient (owner=user)
      → ativa DoctorShare(patient, doctor, scopes)  ← compartilhamento JÁ aceito
      → grava acceptedAt, acceptedUserId
  → paciente cai no app com o médico já visível
```

### 6.3 Gate de perguntas (proteção do médico)
```
POST /api/doctor-questions  { patientId, doctorId, ... }
  → share = DoctorShare(patient, doctor, active)
  → openCount = DoctorQuestion.count(patient, doctor, status open)
  → if openCount >= share.openQuestionLimit:
       409 "Você tem {openCount} pergunta(s) em aberto com este médico.
            Aguarde a resposta ou agende uma nova consulta."
  → senão: cria (cobre créditos só se for o fluxo do relatório; pergunta avulsa = grátis)
```

### 6.4 "Atendi" (consulta libera cota)
```
Portal → paciente → botão "Atendi / Registrar consulta"
  → POST /api/doctor/patients/:id/consultation
     → cria Consultation(happenedAt=now)
     → DoctorShare.openQuestionLimit = min(openQuestionLimit + 1, 5)
  → paciente recebe nudge: "Consulta registrada — você pode fazer mais uma pergunta ao Dr. X"
```

---

## 7. Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Atendente não usa (atrito) | "Convidar" tem que ser <30s. Considerar **bot de WhatsApp** que o atendente manda "nome, telefone" e o sistema faz o resto. |
| LGPD no pré-cadastro | Convite exige **aceite explícito do paciente** no 1º acesso (termo). Dados mínimos no invite. |
| Spam/abuso de convites | Rate-limit por médico/dia; não virar ferramenta de disparo em massa. |
| iOS PWA confuso | Landing com instruções visuais passo-a-passo (Safari → Compartilhar → Tela de Início). |
| Paciente sem WhatsApp | Fallback email (link mágico). |

---

## 8. Métricas de sucesso

- **Médicos ativos** convidando (semana).
- **Convite → instalação** ( taxa de aceite do token).
- **Convite → primeiro exame enviado** (ativação).
- **Ciclos consulta→pergunta** (consulta gera pergunta gera retorno).
- **Pro → retenção** médico (renovação mensal).

---

## 9. Fases

- **Fase 1 (MVP):** Fatias 1 + 2 (Convidar + Landing) + Fatia 3 (gate de perguntas). *Aquisição + proteção.*
- **Fase 1.5:** Fatia 4 (Atendi + libera cota). *Realiza "consulta → perguntas".*
- **Fase 2:** Dashboard do médico com métricas de convites/aceite; branding no convite (Pro).
- **Fase 3 (se demanda):** Agenda leve, role recepcionista, Pro Clínica.

---

## 10. Aproveitamento do que já existe

- `DoctorShare` (scopes) → base do vínculo, só adicionar `openQuestionLimit`.
- `/doctor/patients/:id/pre-visit` (pré-consulta) → **já é o prêmio do médico**.
- `DoctorQuestion` + `CREDIT_COSTS.question` → plug do gate.
- Padrão OTP/invite de médico (`pending-invite`) → template p/ o `PatientInvite`.
- App já é **PWA** → funciona no iOS sem app nativo.
