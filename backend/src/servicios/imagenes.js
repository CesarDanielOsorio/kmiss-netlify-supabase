const { randomUUID } = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const pool = require('../db');

const recursos = {
  productos: 'id,nombre,imagen_url',
  servicios: 'id,nombre,imagen_url',
  noticias: 'id,titulo,imagen_url',
};

let cliente;
function storage() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Falta configurar Supabase Storage en el backend');
  }
  cliente ||= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cliente.storage.from(process.env.SUPABASE_STORAGE_BUCKET || 'kmiss-media');
}

async function eliminarImagen(url) {
  if (!url || !process.env.SUPABASE_URL) return;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'kmiss-media';
  const prefijo = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/`;
  if (!url.startsWith(prefijo)) return;
  try {
    const { error } = await storage().remove([decodeURIComponent(url.slice(prefijo.length))]);
    if (error) throw error;
  } catch {
    // La operación de BD ya terminó. Se puede limpiar el objeto huérfano desde Storage.
    console.error('No se pudo limpiar un archivo de Storage; revisar el bucket.');
  }
}

async function guardarImagen(recurso, id, archivo) {
  if (!recursos[recurso]) throw new Error('Recurso de imagen no permitido');
  const modo = process.env.IMAGE_STORAGE || 'postgres';
  if (!['postgres', 'supabase'].includes(modo)) throw new Error('IMAGE_STORAGE no válido');
  if (modo === 'postgres') {
    const resultado = await pool.query(
      `UPDATE ${recurso} SET imagen_url=$1, imagen_datos=$2, imagen_mime=$3${recurso === 'noticias' ? ',actualizado_en=NOW()' : ''} WHERE id=$4 RETURNING ${recursos[recurso]}`,
      [`/api/media/${recurso}/${id}?v=${Date.now()}`, archivo.buffer, archivo.mimetype, id]
    );
    return resultado.rows[0];
  }

  const conexion = await pool.connect();
  let nuevaUrl;
  let anterior;
  let registro;
  try {
    await conexion.query('BEGIN');
    // Serializa reemplazos del mismo registro y evita sobrescribir imágenes concurrentes.
    const resultado = await conexion.query(`SELECT imagen_url FROM ${recurso} WHERE id=$1 FOR UPDATE`, [id]);
    if (!resultado.rows[0]) {
      await conexion.query('ROLLBACK');
      return undefined;
    }
    anterior = resultado.rows[0].imagen_url;
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[archivo.mimetype];
    if (!extension) throw new Error('Formato de imagen no permitido');
    const ruta = `${recurso}/${id}-${randomUUID()}.${extension}`;
    const bucket = storage();
    const { error } = await bucket.upload(ruta, archivo.buffer, {
      contentType: archivo.mimetype, cacheControl: '31536000', upsert: false,
    });
    if (error) throw error;
    nuevaUrl = bucket.getPublicUrl(ruta).data.publicUrl;
    const actualizado = await conexion.query(
      `UPDATE ${recurso} SET imagen_url=$1, imagen_datos=NULL, imagen_mime=NULL${recurso === 'noticias' ? ',actualizado_en=NOW()' : ''} WHERE id=$2 RETURNING ${recursos[recurso]}`,
      [nuevaUrl, id]
    );
    registro = actualizado.rows[0];
    await conexion.query('COMMIT');
  } catch (error) {
    await conexion.query('ROLLBACK').catch(() => {});
    if (nuevaUrl) await eliminarImagen(nuevaUrl);
    throw error;
  } finally {
    conexion.release();
  }
  await eliminarImagen(anterior);
  return registro;
}

module.exports = { guardarImagen, eliminarImagen };
