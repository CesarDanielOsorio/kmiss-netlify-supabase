BEGIN;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS duracion_total_minutos INTEGER CHECK(duracion_total_minutos>0);
CREATE TABLE IF NOT EXISTS cita_servicios (
 cita_id INTEGER NOT NULL REFERENCES citas(id) ON DELETE CASCADE,
 servicio_id INTEGER NOT NULL REFERENCES servicios(id),
 nombre VARCHAR(150) NOT NULL,
 duracion_minutos INTEGER NOT NULL CHECK(duracion_minutos>0),
 precio NUMERIC(10,2) NOT NULL,
 PRIMARY KEY(cita_id,servicio_id)
);
ALTER TABLE cita_servicios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cita_servicios FROM anon,authenticated;
ALTER TABLE bloqueos_medicos ALTER COLUMN sede_id DROP NOT NULL;
COMMIT;
