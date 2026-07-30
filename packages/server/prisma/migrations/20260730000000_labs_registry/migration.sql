-- Registro de laboratórios (redes) — admin gerencia (CRUD + logo). Aditiva/idempotente.
CREATE TABLE IF NOT EXISTS "labs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT,
    "logoUrl" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "labs_name_key" ON "labs"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "labs_slug_key" ON "labs"("slug");

-- Seed das principais redes brasileiras (cor de marca aprox.; logos sobem via admin depois).
-- ON CONFLICT (name) DO NOTHING — re-rodável. aliases em lowercase sem acento.
INSERT INTO "labs" ("id","name","slug","color","aliases","active","createdAt","updatedAt")
VALUES
  ('seed-sabin',   'Sabin',       'sabin',     '#F26522', ARRAY['sabin','sjc','posto sabin','sabin saude'], true, now(), now()),
  ('seed-dasa',    'Dasa',        'dasa',      '#7E1F86', ARRAY['dasa','diagnosticos da america'], true, now(), now()),
  ('seed-fleury',  'Fleury',      'fleury',    '#E30613', ARRAY['fleury','a + medicina diagnostica','a mais'], true, now(), now()),
  ('seed-hermato', 'Hermato',     'hermato',   '#00A859', ARRAY['hermato'], true, now(), now()),
  ('seed-cedi',    'CedImageagem','cedimagem', '#005EB8', ARRAY['cedimagem','cedi imagem','cedi'], true, now(), now()),
  ('seed-lavoi',   'Lavoisier',   'lavoisier', '#0067B1', ARRAY['lavoisier'], true, now(), now()),
  ('seed-delboni', 'Delboni',     'delboni',   '#0094D9', ARRAY['delboni','delboni auriemo'], true, now(), now()),
  ('seed-labsdor', 'Labs D''Or',  'labsdor',   '#00A0AF', ARRAY['labs d or','rede d or','d or','dx'], true, now(), now()),
  ('seed-srl',     'SRL',         'srl',       '#2E7D32', ARRAY['srl'], true, now(), now())
ON CONFLICT ("name") DO NOTHING;
