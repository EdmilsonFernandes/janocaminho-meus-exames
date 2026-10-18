-- Monetização P0 — ajustes de settings em PRODUÇÃO (auditoria 18/10/2026)
-- Rodar ANTES/COM o deploy do branch monetizacao-p0 (o restart do container faz loadSettings
-- pegar estes valores; o cache do container antigo nem percebe até lá — sem janela de erro).
--
--   1. uploadRules.freeCost 5 → 1  (tirar a catraca do upload — o gancho volta a ser grátis;
--      o limite de 2 exames/mês (freeExamLimit) continua como régua de uso justo)
--   2. founder LIGADO (R$19,90 para os primeiros 100 — urgência real com 16 signups/sem;
--      preserva `used` caso já exista)
--   3. isTest=true nas contas do dono/demo/testes — saem das métricas do admin
--      (o maior "usuário de IA" era o próprio dono)
--
-- Reversível: admin edita uploadRules/founder live (sem deploy); isTest=false via SQL/admin.

-- 1) Upload: 5 → 1
UPDATE app_settings
SET value = jsonb_set(value, '{freeCost}', '1'::jsonb, true)
WHERE key = 'uploadRules';

-- 2) Fundador ON (mantém used/limit já gravados, se houver)
INSERT INTO app_settings (key, value)
VALUES ('founder', '{"enabled": 1, "price": 19.9, "limit": 100, "used": 0}'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = jsonb_set(
  jsonb_set(app_settings.value, '{enabled}', '1'::jsonb),
  '{price}', '19.9'::jsonb
);

-- 3) Contas de teste/equipe fora das métricas (isTest)
UPDATE users
SET "isTest" = true
WHERE email IN ('edmls2008@gmail.com', 'demo.revisao@janocaminho.com.br')
   OR email LIKE '%@example.com'
   OR email LIKE '%@cloudtestlabaccounts.com';

-- Confirmação (rodar e conferir):
-- SELECT key, value FROM app_settings WHERE key IN ('uploadRules','founder');
-- SELECT email FROM users WHERE "isTest" = true;
