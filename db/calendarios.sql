BEGIN;
CREATE TABLE IF NOT EXISTS calendarios (
 id SERIAL PRIMARY KEY,
 nombre VARCHAR(150) NOT NULL UNIQUE,
 semana JSONB NOT NULL DEFAULT '{}'::jsonb,
 creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
 actualizado_en TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE horarios_semanales ADD COLUMN IF NOT EXISTS calendario_id INTEGER REFERENCES calendarios(id) ON DELETE RESTRICT;
ALTER TABLE calendarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON calendarios FROM anon, authenticated;
REVOKE ALL ON SEQUENCE calendarios_id_seq FROM anon, authenticated;
COMMIT;
