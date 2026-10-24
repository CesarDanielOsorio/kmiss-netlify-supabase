// Opcional: ejecutar una vez sobre la COPIA de BD, con IMAGE_STORAGE=supabase.
require('dotenv').config();
const pool = require('./src/db');
const { guardarImagen } = require('./src/servicios/imagenes');

async function migrar() {
  try {
    if (process.env.IMAGE_STORAGE !== 'supabase') throw new Error('Configurar IMAGE_STORAGE=supabase');
    for (const tabla of ['productos', 'servicios', 'noticias']) {
      const { rows } = await pool.query(`SELECT id FROM ${tabla} WHERE imagen_datos IS NOT NULL ORDER BY id`);
      for (const { id } of rows) {
        const { rows: imagenes } = await pool.query(`SELECT imagen_datos,imagen_mime FROM ${tabla} WHERE id=$1`, [id]);
        const imagen = imagenes[0];
        if (!imagen?.imagen_datos) continue;
        if (imagen.imagen_datos.length > 4 * 1024 * 1024) {
          throw new Error(`${tabla}/${id}: comprimir la imagen a 4 MB antes de migrar`);
        }
        await guardarImagen(tabla, id, { buffer: imagen.imagen_datos, mimetype: imagen.imagen_mime });
        console.log(`Migrada imagen ${tabla}/${id}`);
      }
    }
  } catch (error) {
    console.error('Migración interrumpida:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
migrar();
