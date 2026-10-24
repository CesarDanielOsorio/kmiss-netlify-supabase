-- Ejecutar DESPUÉS de init.sql, solo en el proyecto Supabase de KMISS.
-- Las tablas se consultan desde Express con PostgreSQL, no desde la API pública.
BEGIN;
DO $$
DECLARE tabla text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY[
    'usuarios','pacientes','servicios','citas','sedes','horarios_semanales','calendarios',
    'bloqueos_medicos','categorias_productos','productos','ventas','venta_detalles',
    'promociones_productos','noticias','pedidos_publicos','pedido_detalles'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabla);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', tabla);
  END LOOP;
END $$;

-- Público solo para imágenes de catálogo/noticias. Escritura únicamente desde backend.
-- No subir documentos de pacientes ni imágenes médicas a este bucket público.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kmiss-media', 'kmiss-media', true, 4194304,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
COMMIT;
