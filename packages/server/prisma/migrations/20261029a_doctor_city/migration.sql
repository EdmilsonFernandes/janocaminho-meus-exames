-- Fila imediata v1.1 (28/10/26): médicos visíveis na lista do paciente.
-- 1) doctors.city: cidade de atendimento ONLINE (o médico declara no dialog do
--    "Atender agora"; o paciente vê "📍 cidade" no card da fila). Distinta de
--    clinicCity (perfil público do consultório presencial).
-- 2) teleconsulta_queue.specialtyFilter / preferredDoctorId: escolha opcional do
--    paciente na entrada (card de um médico / filtro visual por especialidade).
--    preferredDoctorId é SEM FK de propósito: é preferência macia — médico pode
--    sumir (offline/bloqueado) e o match cai pro FIFO normal do filtro.
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "teleconsulta_queue" ADD COLUMN IF NOT EXISTS "specialtyFilter" TEXT;
ALTER TABLE "teleconsulta_queue" ADD COLUMN IF NOT EXISTS "preferredDoctorId" TEXT;
