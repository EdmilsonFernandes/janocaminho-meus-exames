-- Perfil público do médico (visto pelo paciente na lista de médicos): telefone/WhatsApp p/
-- agendamento, consultório e cidade. Campos opcionais — o médico preenche no portal.
-- Criada manualmente (prisma migrate dev falha no shadow DB por drift de credits/vaccines,
-- adicionados via db push em prod). migrate deploy aplica no DB real sem recriar shadow.

ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "phone" TEXT,
ADD COLUMN IF NOT EXISTS "clinicName" TEXT,
ADD COLUMN IF NOT EXISTS "clinicCity" TEXT,
ADD COLUMN IF NOT EXISTS "bio" TEXT;
