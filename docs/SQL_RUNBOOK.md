# 🗄️ Runbook SQL — Meus Exames / Dr. Exame

> Suporte e análise direto no banco de PRODUÇÃO. Toda query aqui é **SELECT (read-only)** —
> nada altera dado. Para operações de escrita (reset de senha, P3009 etc.), ver `.ai/SKILL.md`.

## Como conectar

```bash
ssh -i /tmp/jano.pem ec2-user@janocaminho.com.br
cd ~/meus-exames/janocaminho-meus-exames
DBC=$(grep '^DATABASE_URL=' .env.prod | head -1 | cut -d= -f2- | sed 's/?.*//')

# padrão de uso (uma linha):
docker exec janocaminho-postgres psql "$DBC" -c "SELECT ...;"
```

**Convenções**: colunas camelCase exigem aspas duplas (`"patientId"`). Tabelas são minúsculas.
Substitua `EMAIL@AQUI` / `<id>` conforme a query. `-x` mostra resultado em coluna (legível p/ 1 linha).

---

## 1. 🧭 DOSSIÊ 360° — por e-mail (comece sempre aqui)

```sql
-- Quem é, saldo, plano, patients (titular + dependentes) e contagem de exames por status
SELECT u.id, u.email, u.name, u.credits,
       u."planExpiresAt", u."emailVerified", u.blocked, u."tokenVersion", u."createdAt",
       p.id AS "patientId", p."fullName", p.relationship,
       COUNT(e.id) FILTER (WHERE e.status='EXTRACTED')  AS ok,
       COUNT(e.id) FILTER (WHERE e.status='FAILED')     AS falhos,
       COUNT(e.id) FILTER (WHERE e.status='REJECTED')   AS rejeitados,
       COUNT(e.id) FILTER (WHERE e.status IN ('UPLOADED','EXTRACTING')) AS pendentes
FROM users u
JOIN patients p ON p."ownerId" = u.id
LEFT JOIN exams e ON e."patientId" = p.id
WHERE u.email = 'EMAIL@AQUI'
GROUP BY u.id, p.id ORDER BY p."createdAt";
```

## 2. 👤 Usuários

```sql
-- Buscar por e-mail (id, bloqueio, premium)
SELECT id, email, name, credits, blocked, "emailVerified", "planExpiresAt", "createdAt"
FROM users WHERE email ILIKE '%PARTE%';

-- Premium ativos agora
SELECT email, "planExpiresAt", credits FROM users
WHERE "planExpiresAt" > now() ORDER BY "planExpiresAt" DESC;

-- Contas bloqueadas
SELECT id, email, blocked FROM users WHERE blocked = true;

-- Novos cadastros nos últimos 7 dias
SELECT date_trunc('day', "createdAt") AS dia, COUNT(*) FROM users
WHERE "createdAt" > now() - interval '7 days' GROUP BY 1 ORDER BY 1;
```

## 3. 👨‍👩‍👧 Pacientes (titular × dependentes)

```sql
-- Perfis de um usuário (titular primeiro)
SELECT id, "fullName", relationship, gender, "dateOfBirth", "heightCm",
       "clinicalProfile", "cpfLast4", "createdAt"
FROM patients WHERE "ownerId" = (SELECT id FROM users WHERE email='EMAIL@AQUI')
ORDER BY (relationship='Titular') DESC, "createdAt";

-- Pacientes SEM titular na conta (inconsistência)
SELECT u.email, p."fullName", p.relationship FROM patients p
JOIN users u ON u.id = p."ownerId"
WHERE NOT EXISTS (SELECT 1 FROM patients t WHERE t."ownerId"=p."ownerId" AND t.relationship='Titular');
```

## 4. 🧪 Exames — quais deram CERTO, quais deram ERRO

Status possíveis: `UPLOADED → EXTRACTING → EXTRACTED | FAILED | DUPLICATE | REJECTED`.

```sql
-- Exames do usuário com status e motivo de falha
SELECT e.id, p."fullName", e.title, e.status, e."failureKind",
       left(e."extractionError", 120) AS erro, e."performedAt", e."createdAt"
FROM exams e JOIN patients p ON p.id = e."patientId"
WHERE p."ownerId" = (SELECT id FROM users WHERE email='EMAIL@AQUI')
ORDER BY e."createdAt" DESC;

-- TODOS os FAILED das últimas 24h (vigilância)
SELECT e.id, u.email, e.title, e."failureKind", left(e."extractionError",100) AS erro, e."createdAt"
FROM exams e JOIN patients p ON p.id=e."patientId" JOIN users u ON u.id=p."ownerId"
WHERE e.status='FAILED' AND e."createdAt" > now() - interval '24h'
ORDER BY e."createdAt" DESC;

-- STUCK: ficou EXTRACTING/UPLOADED há mais de 1h (nunca terminou)
SELECT e.id, u.email, e.title, e.status, e."createdAt"
FROM exams e JOIN patients p ON p.id=e."patientId" JOIN users u ON u.id=p."ownerId"
WHERE e.status IN ('UPLOADED','EXTRACTING') AND e."createdAt" < now() - interval '1 hour'
ORDER BY e."createdAt";

-- REJECTED (CPF do documento ≠ CPF da conta) — últimos 7 dias
SELECT e.id, u.email, p."fullName", e.title, e."createdAt"
FROM exams e JOIN patients p ON p.id=e."patientId" JOIN users u ON u.id=p."ownerId"
WHERE e.status='REJECTED' AND e."createdAt" > now() - interval '7 days'
ORDER BY e."createdAt" DESC;

-- Funil de status geral (saúde do pipeline hoje)
SELECT status, COUNT(*), max("createdAt")::date AS ultimo FROM exams GROUP BY status;
```

## 5. 🔬 Analitos de um exame (valores + flags)

```sql
-- Valores do exame (troque <examId>)
SELECT panel, name, "valueNumeric", "valueText", unit, "refLow", "refHigh", flag, "isAbnormal", "extractedPage"
FROM exam_items WHERE "examId" = '<examId>' ORDER BY panel, name;

-- Só os ALTERADOS de todos os exames do paciente
SELECT e.title, e."performedAt"::date AS data, i.name, i."valueNumeric", i.unit, i.flag
FROM exam_items i JOIN exams e ON e.id = i."examId"
WHERE i."examId" IN (SELECT id FROM exams WHERE "patientId"='<patientId>' AND status='EXTRACTED')
  AND i."isAbnormal" = true
ORDER BY e."performedAt" DESC, i.name;
```

## 6. 💊 Remédios do paciente

```sql
-- O que o paciente toma (+ status do pipeline de preço)
SELECT m.name, m.dosage, m.frequency, m.active, m."activeIngredient",
       m."priceStatus", m."priceCheckedAt", m."createdAt"
FROM medications m
WHERE m."patientId" = (SELECT id FROM patients WHERE "ownerId"=(SELECT id FROM users WHERE email='EMAIL@AQUI') AND relationship='Titular')
ORDER BY m.active DESC, m."createdAt" DESC;

-- Remédios com preço ERRANDO no worker (fila travada)
SELECT m."priceStatus", COUNT(*) FROM medications m
WHERE m.active AND m."priceStatus" IN ('queued','searching','provider_error')
GROUP BY 1;
```

## 7. 💎 CRÉDITOS — caiu? não caiu? debitou sem entregar?

O extrato é `credit_transactions` (ledger): toda entrada/saída é uma linha.
Kinds: `purchase|plan_monthly|achievement|referral|signup|ai_chat|ai_chat_refund|ai_summary|ai_consolidated|upload|share|patient_extra`.

```sql
-- Extrato completo do usuário (mais novo primeiro)
SELECT ct."createdAt", ct.delta, ct.kind, ct.label, ct."refId"
FROM credit_transactions ct
WHERE ct."userId" = (SELECT id FROM users WHERE email='EMAIL@AQUI')
ORDER BY ct."createdAt" DESC LIMIT 50;

-- CONFERÊNCIA DE SALDO: users.credits DEVE bater com a soma do ledger
SELECT u.email, u.credits AS saldo_na_conta,
       COALESCE(SUM(ct.delta),0) AS soma_do_extrato,
       u.credits - COALESCE(SUM(ct.delta),0) AS diferenca
FROM users u LEFT JOIN credit_transactions ct ON ct."userId"=u.id
GROUP BY u.id HAVING u.credits - COALESCE(SUM(ct.delta),0) <> 0
ORDER BY diferenca;                                  -- vazio = tudo casando

-- DEBITOU E NÃO ENTREGOU: gasto de chat SEM análise e SEM reembolso na janela ±2min
SELECT u.email, ct."createdAt", ct.delta, ct.label
FROM credit_transactions ct JOIN users u ON u.id=ct."userId"
WHERE ct.kind = 'ai_chat'
  AND NOT EXISTS (SELECT 1 FROM ai_analyses a WHERE a.type='CHAT'
                  AND a."createdAt" BETWEEN ct."createdAt" - interval '2 minutes'
                                         AND ct."createdAt" + interval '2 minutes')
  AND NOT EXISTS (SELECT 1 FROM credit_transactions r WHERE r."userId"=ct."userId"
                  AND r.kind='ai_chat_refund' AND r.delta > 0
                  AND r."createdAt" BETWEEN ct."createdAt" AND ct."createdAt" + interval '10 minutes')
ORDER BY ct."createdAt" DESC LIMIT 30;

-- REEMBOLSOS recentes (falhas de IA com crédito devolvido)
SELECT u.email, r."createdAt", r.delta, r.label
FROM credit_transactions r JOIN users u ON u.id=r."userId"
WHERE r.kind LIKE '%refund%' AND r."createdAt" > now() - interval '7 days'
ORDER BY r."createdAt" DESC;

-- "PAGUEI E NÃO CAIU": pagamento APPROVED sem crédito de compra na janela ±30min
SELECT u.email, s."createdAt" AS pagamento, s.amount, s.status
FROM subscriptions s JOIN users u ON u.id=s."userId"
WHERE s.status='APPROVED'
  AND NOT EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct."userId"=s."userId"
                  AND ct.delta > 0 AND ct.kind IN ('purchase','plan_monthly')
                  AND ct."createdAt" BETWEEN s."createdAt" - interval '30 minutes'
                                          AND s."createdAt" + interval '30 minutes')
ORDER BY s."createdAt" DESC;

-- Gastos com IA por tipo (últimos 30 dias — custo do produto)
SELECT kind, COUNT(*) AS eventos, SUM(-delta) AS credititos
FROM credit_transactions
WHERE delta < 0 AND "createdAt" > now() - interval '30 days'
GROUP BY kind ORDER BY credititos DESC;
```

## 8. 🤖 IA — quem usou, o que respondeu

```sql
-- Análises (CHAT + SUMMARY) do usuário
SELECT a.type, a."modelUsed", left(a."userMessage", 60) AS pergunta,
       length(a."contentMd") AS tamanho_resposta, a."createdAt"
FROM ai_analyses a
WHERE a."patientId" IN (SELECT id FROM patients WHERE "ownerId"=(SELECT id FROM users WHERE email='EMAIL@AQUI'))
ORDER BY a."createdAt" DESC LIMIT 30;

-- Chats que vieram com ERRO de stream (chat global) — vê a falha, não a resposta
-- (falhas de IA não geram ai_analyses; o traço fica no log do container)
docker logs meus-exames-app --since 24h 2>&1 | grep -E 'chat.global|erro no stream|llm' | tail -30

-- Volume de IA por dia (últimos 14 dias)
SELECT date_trunc('day', "createdAt")::date AS dia, type, COUNT(*)
FROM ai_analyses WHERE "createdAt" > now() - interval '14 days'
GROUP BY 1,2 ORDER BY 1 DESC, 2;
```

## 9. 🏃 Health Connect (atividade / FC)

```sql
-- Medições do titular por tipo (passos, calorias, km, FC) — últimos 30 dias
SELECT m.type, COUNT(*), min(m."measuredAt")::date AS de, max(m."measuredAt")::date AS ate,
       round(avg(m.value)) AS media
FROM measurements m
WHERE m."patientId" = '<patientId>'
  AND m."measuredAt" > now() - interval '30 days'
GROUP BY m.type ORDER BY m.type;

-- FC manual × FC do Health Connect (mesma tabela, distingue pela note)
SELECT note, COUNT(*), round(avg(value)) AS bpm_medio
FROM measurements WHERE type='HEART_RATE' AND "patientId"='<patientId>'
GROUP BY note;
```

## 10. 💳 Pagamentos / PIX

```sql
-- Últimos pagamentos do usuário
SELECT s.status, s.amount, s."periodDays", s."pixCredits",
       s."pixExpiresAt", s."mpPaymentId", s."createdAt", s."updatedAt"
FROM subscriptions s
WHERE s."userId" = (SELECT id FROM users WHERE email='EMAIL@AQUI')
ORDER BY s."createdAt" DESC LIMIT 10;

-- PIX expirados gerando notificação (últimos 3 dias)
SELECT u.email, s.amount, s."pixExpiresAt" FROM subscriptions s
JOIN users u ON u.id=s."userId"
WHERE s.status='PENDING' AND s."pixExpiresAt" < now()
  AND s."updatedAt" > now() - interval '3 days';

-- Receita aprovada por dia
SELECT date_trunc('day', "updatedAt")::date AS dia, COUNT(*), SUM(amount)
FROM subscriptions WHERE status='APPROVED'
GROUP BY 1 ORDER BY 1 DESC LIMIT 15;
```

## 11. 📊 Painel geral (saúde do produto)

```sql
-- Exames processados por dia (últimos 14 dias, por desfecho)
SELECT date_trunc('day', "updatedAt")::date AS dia,
       COUNT(*) FILTER (WHERE status='EXTRACTED') AS ok,
       COUNT(*) FILTER (WHERE status='FAILED')    AS falha,
       COUNT(*) FILTER (WHERE status='REJECTED')  AS rejeitado
FROM exams WHERE "updatedAt" > now() - interval '14 days'
GROUP BY 1 ORDER BY 1 DESC;

-- Usuários ativos por dia (gerou alguma transação de crédito)
SELECT date_trunc('day', "createdAt")::date AS dia, COUNT(DISTINCT "userId") AS ativos
FROM credit_transactions WHERE "createdAt" > now() - interval '14 days'
GROUP BY 1 ORDER BY 1 DESC;

-- Crédito médio restante por tipo de usuário
SELECT (u."planExpiresAt" > now()) AS premium, COUNT(*), round(avg(u.credits)) AS creditos_medios
FROM users u GROUP BY 1;
```

---

## ⚠️ Regras de ouro

1. **Só SELECT aqui.** Qualquer UPDATE em prod → `.ai/SKILL.md` (procedimentos testados) e com backup em mente (`scripts/pg-backup.sh`).
2. PII (CPF) é **cifrada** — `cpfLast4` é o máximo que aparece. Nunca tente decifrar via SQL.
3. Payloads JSON (`rawExtraction`, `webhook`) podem ser GRANDES — sempre `left()` ou acesse via app.
4. Queries sem `WHERE` em `exams`/`exam_items`/`credit_transactions` varrem a base inteira — sempre filtre por usuário/paciente/data.
