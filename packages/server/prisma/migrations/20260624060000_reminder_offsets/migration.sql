-- Lembretes com antecedências configuráveis (estilo Agenda do Google).
-- notifyOffsetsMin: minutos ANTES do dueDate que o usuário quer ser avisado (1 dia/5h/na hora...).
-- sentOffsets: offsets já disparados — dedup persistente (substitui o Set em memória que zerava a cada restart).
-- Migração ADITIVA (só ADD COLUMN com default) — segura de rodar com o código antigo ainda no ar.
ALTER TABLE "reminders" ADD COLUMN "notifyOffsetsMin" INTEGER[] NOT NULL DEFAULT ARRAY[1440, 300, 0];
ALTER TABLE "reminders" ADD COLUMN "sentOffsets" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
