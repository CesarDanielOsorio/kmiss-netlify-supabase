const express = require('express');
const pool = require('../db');
const { guardarImagen, eliminarImagen } = require('../servicios/imagenes');
const { autenticar, permitirRoles } = require('../middleware/auth');
const uploadImagenNoticia = require('../middleware/uploadImagenNoticia');

const router = express.Router();
router.use(autenticar);
router.use(permitirRoles('administrador'));

const { normalizarSemana, semanasSeCruzan } = require('../servicios/semana');
router.use('/calendarios', require('./calendarios'));

router.get('/categorias', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM categorias_productos ORDER BY orden, nombre');
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ error: 'No se pudieron obtener las categorias' });
  }
});

router.post('/categorias', async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });
  try {
    const resultado = await pool.query(
      'INSERT INTO categorias_productos (nombre, orden) VALUES ($1,$2) RETURNING *',
      [nombre, Number(req.body.orden) || 0]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Ya existe una categoria con ese nombre' });
    res.status(500).json({ error: 'No se pudo crear la categoria' });
  }
});

router.put('/categorias/:id', async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });
  try {
    const resultado = await pool.query(
      'UPDATE categorias_productos SET nombre=$1, orden=$2, activo=$3 WHERE id=$4 RETURNING *',
      [nombre, Number(req.body.orden) || 0, req.body.activo !== false, req.params.id]
    );
    if (!resultado.rows[0]) return res.status(404).json({ error: 'Categoria no encontrada' });
    res.json(resultado.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Ya existe una categoria con ese nombre' });
    res.status(500).json({ error: 'No se pudo actualizar la categoria' });
  }
});

router.delete('/categorias/:id', async (req, res) => {
  try {
    const resultado = await pool.query('DELETE FROM categorias_productos WHERE id=$1 RETURNING id', [req.params.id]);
    if (!resultado.rows[0]) return res.status(404).json({ error: 'Categoria no encontrada' });
    res.json({ mensaje: 'Categoria eliminada' });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({ error: 'No se puede eliminar porque hay productos en esta categoria. Reasignalos o desactiva la categoria.' });
    }
    res.status(500).json({ error: 'No se pudo eliminar la categoria' });
  }
});

router.get('/promociones', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT pr.*, p.nombre AS producto_nombre, p.precio, c.nombre AS categoria_nombre,
              CASE WHEN pr.categoria_id IS NOT NULL THEN 'categoria' ELSE 'producto' END AS alcance
       FROM promociones_productos pr
       LEFT JOIN productos p ON p.id=pr.producto_id
       LEFT JOIN categorias_productos c ON c.id=pr.categoria_id
       ORDER BY pr.activo DESC, pr.creado_en DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ error: 'No se pudieron obtener las promociones' });
  }
});

router.post('/promociones', async (req, res) => {
  const descuento = Number(req.body.descuento_porcentaje);
  const productoId = req.body.producto_id ? Number(req.body.producto_id) : null;
  const categoriaId = req.body.categoria_id ? Number(req.body.categoria_id) : null;
  if ((!productoId && !categoriaId) || (productoId && categoriaId) || descuento <= 0 || descuento > 100) {
    return res.status(400).json({ error: 'Selecciona un artículo o una categoría y un descuento entre 1% y 100%' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO promociones_productos (producto_id, categoria_id, descuento_porcentaje, fecha_inicio, fecha_fin, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [productoId, categoriaId, descuento, req.body.fecha_inicio || new Date(), req.body.fecha_fin || null, req.usuario.id]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo crear la promocion' });
  }
});

router.put('/promociones/:id', async (req, res) => {
  const descuento = Number(req.body.descuento_porcentaje);
  const productoId = req.body.producto_id ? Number(req.body.producto_id) : null;
  const categoriaId = req.body.categoria_id ? Number(req.body.categoria_id) : null;
  if ((!productoId && !categoriaId) || (productoId && categoriaId) || descuento <= 0 || descuento > 100) {
    return res.status(400).json({ error: 'Selecciona un artículo o una categoría y un descuento entre 1% y 100%' });
  }
  try {
    const resultado = await pool.query(
      `UPDATE promociones_productos SET producto_id=$1, categoria_id=$2, descuento_porcentaje=$3,
       fecha_inicio=$4, fecha_fin=$5, activo=$6, actualizado_en=NOW()
       WHERE id=$7 RETURNING *`,
      [productoId, categoriaId, descuento, req.body.fecha_inicio, req.body.fecha_fin || null, req.body.activo !== false, req.params.id]
    );
    if (!resultado.rows[0]) return res.status(404).json({ error: 'Promocion no encontrada' });
    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo actualizar la promocion' });
  }
});

router.delete('/promociones/:id', async (req, res) => {
  try {
    const resultado = await pool.query('DELETE FROM promociones_productos WHERE id=$1 RETURNING id', [req.params.id]);
    if (!resultado.rows[0]) return res.status(404).json({ error: 'Promocion no encontrada' });
    res.json({ mensaje: 'Promocion eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo eliminar la promocion' });
  }
});

router.get('/noticias', async (req, res) => {
  try { res.json((await pool.query('SELECT id,titulo,resumen,contenido,fecha_evento,enlace_url,imagen_url,activo,creado_por,creado_en,actualizado_en FROM noticias ORDER BY COALESCE(fecha_evento, creado_en::date) DESC, creado_en DESC')).rows); }
  catch (error) { res.status(500).json({ error: 'No se pudieron obtener las noticias' }); }
});

router.post('/noticias', async (req, res) => {
  const titulo = String(req.body.titulo || '').trim();
  if (!titulo) return res.status(400).json({ error: 'El titulo es requerido' });
  try {
    const resultado = await pool.query(
      `INSERT INTO noticias(titulo,resumen,contenido,fecha_evento,enlace_url,activo,creado_por)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       RETURNING id,titulo,resumen,contenido,fecha_evento,enlace_url,imagen_url,activo,creado_por,creado_en,actualizado_en`,
      [titulo, req.body.resumen || null, req.body.contenido || null, req.body.fecha_evento || null,
        req.body.enlace_url || null, req.body.activo !== false, req.usuario.id]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) { res.status(400).json({ error: error.message || 'No se pudo crear la noticia' }); }
});

router.put('/noticias/:id', async (req, res) => {
  const titulo = String(req.body.titulo || '').trim();
  if (!titulo) return res.status(400).json({ error: 'El titulo es requerido' });
  try {
    const resultado = await pool.query(
      `UPDATE noticias SET titulo=$1,resumen=$2,contenido=$3,fecha_evento=$4,enlace_url=$5,
       activo=$6,actualizado_en=NOW() WHERE id=$7
       RETURNING id,titulo,resumen,contenido,fecha_evento,enlace_url,imagen_url,activo,creado_por,creado_en,actualizado_en`,
      [titulo, req.body.resumen || null, req.body.contenido || null, req.body.fecha_evento || null,
        req.body.enlace_url || null, req.body.activo !== false, req.params.id]
    );
    if (!resultado.rows[0]) return res.status(404).json({ error: 'Noticia no encontrada' });
    res.json(resultado.rows[0]);
  } catch (error) { res.status(400).json({ error: error.message || 'No se pudo actualizar la noticia' }); }
});

router.post('/noticias/:id/imagen', uploadImagenNoticia.single('imagen'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibio ninguna imagen' });
  try {
    const registro = await guardarImagen('noticias', req.params.id, req.file);
    if (!registro) return res.status(404).json({ error: 'Noticia no encontrada' });
    res.json(registro);
  } catch (error) { res.status(500).json({ error: 'No se pudo guardar la imagen de la noticia' }); }
});

router.delete('/noticias/:id', async (req, res) => {
  try {
    const resultado = await pool.query('DELETE FROM noticias WHERE id=$1 RETURNING id,imagen_url', [req.params.id]);
    if (!resultado.rows[0]) return res.status(404).json({ error: 'Noticia no encontrada' });
    await eliminarImagen(resultado.rows[0].imagen_url);
    res.json({ mensaje: 'Noticia eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo eliminar la noticia' });
  }
});

router.get('/sedes', async (req, res) => {
  try { res.json((await pool.query('SELECT * FROM sedes ORDER BY activo DESC, nombre')).rows); }
  catch (error) { res.status(500).json({ error: 'No se pudieron obtener las sedes' }); }
});

router.post('/sedes', async (req, res) => {
  const nombre=String(req.body.nombre||'').trim(); const direccion=String(req.body.direccion||'').trim();
  if (!nombre || !direccion) return res.status(400).json({ error: 'Nombre y direccion son requeridos' });
  try {
    const resultado=await pool.query('INSERT INTO sedes(nombre,direccion,telefono) VALUES($1,$2,$3) RETURNING *',[nombre,direccion,req.body.telefono||null]);
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    if (error.code==='23505') return res.status(409).json({ error: 'Ya existe una sede con ese nombre' });
    res.status(500).json({ error: 'No se pudo crear la sede' });
  }
});

router.put('/sedes/:id', async (req, res) => {
  const nombre=String(req.body.nombre||'').trim(); const direccion=String(req.body.direccion||'').trim();
  if (!nombre || !direccion) return res.status(400).json({ error: 'Nombre y direccion son requeridos' });
  try {
    const resultado=await pool.query('UPDATE sedes SET nombre=$1,direccion=$2,telefono=$3,activo=$4,actualizado_en=NOW() WHERE id=$5 RETURNING *',[nombre,direccion,req.body.telefono||null,req.body.activo!==false,req.params.id]);
    if (!resultado.rows[0]) return res.status(404).json({ error: 'Sede no encontrada' });
    res.json(resultado.rows[0]);
  } catch (error) {
    if (error.code==='23505') return res.status(409).json({ error: 'Ya existe una sede con ese nombre' });
    res.status(500).json({ error: 'No se pudo actualizar la sede' });
  }
});

router.delete('/sedes/:id', async (req, res) => {
  try {
    const resultado = await pool.query('DELETE FROM sedes WHERE id=$1 RETURNING id', [req.params.id]);
    if (!resultado.rows[0]) return res.status(404).json({ error: 'Sede no encontrada' });
    res.json({ mensaje: 'Sede eliminada' });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({ error: 'No se puede eliminar porque la sede tiene citas registradas. Desactivala para conservar el historial.' });
    }
    res.status(500).json({ error: 'No se pudo eliminar la sede' });
  }
});

router.get('/horarios-semanales', async (req, res) => {
  try {
    const resultado=await pool.query(`SELECT h.*,u.nombre AS medico_nombre,s.nombre AS sede_nombre
      FROM horarios_semanales h JOIN usuarios u ON u.id=h.medico_id JOIN sedes s ON s.id=h.sede_id
      ORDER BY u.nombre,s.nombre`);
    res.json(resultado.rows);
  } catch (error) { res.status(500).json({ error: 'No se pudieron obtener los horarios' }); }
});

router.post('/horarios-semanales', async (req, res) => {
  const { medico_id,sede_id }=req.body;
  if (!medico_id || !sede_id) return res.status(400).json({ error: 'Selecciona medico y sede' });
  try {
    const semana=normalizarSemana(req.body.semana);
    const otros=await pool.query('SELECT semana FROM horarios_semanales WHERE medico_id=$1 AND sede_id<>$2 AND activo=TRUE',[medico_id,sede_id]);
    if (otros.rows.some((fila)=>semanasSeCruzan(semana,fila.semana))) return res.status(409).json({ error: 'El horario se cruza con el turno del medico en otra sede' });
    const resultado=await pool.query(`INSERT INTO horarios_semanales(medico_id,sede_id,semana) VALUES($1,$2,$3) RETURNING *`,[medico_id,sede_id,JSON.stringify(semana)]);
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    if (error.code==='23505') return res.status(409).json({ error: 'Ese medico ya tiene un horario en la sede seleccionada' });
    res.status(400).json({ error: error.message || 'No se pudo crear el horario' });
  }
});

router.put('/horarios-semanales/:id', async (req, res) => {
  const { medico_id,sede_id }=req.body;
  if (!medico_id || !sede_id) return res.status(400).json({ error: 'Selecciona medico y sede' });
  try {
    const semana=normalizarSemana(req.body.semana);
    const otros=await pool.query('SELECT semana FROM horarios_semanales WHERE medico_id=$1 AND id<>$2 AND activo=TRUE',[medico_id,req.params.id]);
    if (otros.rows.some((fila)=>semanasSeCruzan(semana,fila.semana))) return res.status(409).json({ error: 'El horario se cruza con el turno del medico en otra sede' });
    const resultado=await pool.query(`UPDATE horarios_semanales SET medico_id=$1,sede_id=$2,semana=$3,activo=$4,actualizado_en=NOW() WHERE id=$5 RETURNING *`,[medico_id,sede_id,JSON.stringify(semana),req.body.activo!==false,req.params.id]);
    if (!resultado.rows[0]) return res.status(404).json({ error: 'Horario no encontrado' });
    res.json(resultado.rows[0]);
  } catch (error) {
    if (error.code==='23505') return res.status(409).json({ error: 'Ese medico ya tiene un horario en la sede seleccionada' });
    res.status(400).json({ error: error.message || 'No se pudo actualizar el horario' });
  }
});

router.delete('/horarios-semanales/:id', async (req, res) => {
  try {
    const resultado=await pool.query('DELETE FROM horarios_semanales WHERE id=$1 RETURNING id',[req.params.id]);
    if (!resultado.rows[0]) return res.status(404).json({ error: 'Horario no encontrado' });
    res.json({ mensaje: 'Horario semanal eliminado' });
  }
  catch (error) { res.status(500).json({ error: 'No se pudo eliminar el turno' }); }
});

router.get('/bloqueos-medicos', async (req, res) => {
  try {
    const resultado=await pool.query(`SELECT b.*,u.nombre AS medico_nombre,COALESCE(s.nombre,'Todas las sedes') AS sede_nombre
      FROM bloqueos_medicos b JOIN usuarios u ON u.id=b.medico_id LEFT JOIN sedes s ON s.id=b.sede_id
      WHERE b.fecha>=CURRENT_DATE-INTERVAL '30 days' ORDER BY b.fecha DESC,b.hora_inicio`);
    res.json(resultado.rows);
  } catch (error) { res.status(500).json({ error: 'No se pudieron obtener los bloqueos' }); }
});

router.post('/bloqueos-medicos', async (req, res) => {
  const {medico_id,fecha,motivo}=req.body;
  const sede_id=req.body.sede_id||null;
  const inicio=req.body.dia_completo?'00:00':req.body.hora_inicio;
  const fin=req.body.dia_completo?'23:59:59':req.body.hora_fin;
  const ultima=req.body.fecha_fin||fecha;
  const fechaValida=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&!Number.isNaN(new Date(v+'T00:00:00Z').getTime())&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  if(!medico_id||!fechaValida(fecha)||!fechaValida(ultima)||ultima<fecha||!inicio||!fin||fin<=inicio||String(motivo||'').length>150)return res.status(400).json({error:'Completa médico, sede, fechas y un rango de horas válido'});
  const cantidad=Math.round((new Date(ultima+'T00:00:00Z')-new Date(fecha+'T00:00:00Z'))/86400000)+1;
  if(cantidad>366)return res.status(400).json({error:'El rango máximo es de 366 días'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)',[Number(medico_id)]);
    if(!(await client.query("SELECT id FROM usuarios WHERE id=$1 AND rol='medico' AND activo=TRUE",[medico_id])).rowCount)throw new Error('Médico no disponible');
    const r=await client.query(`INSERT INTO bloqueos_medicos(medico_id,sede_id,fecha,hora_inicio,hora_fin,motivo)
      SELECT $1::integer,$2::integer,d::date,$4::time,$5::time,$6 FROM generate_series($3::date,$7::date,INTERVAL '1 day') d RETURNING id`,[medico_id,sede_id,fecha,inicio,fin,String(motivo||'No disponible').trim(),ultima]);
    const afectadas=await client.query(`SELECT count(*)::integer AS cantidad FROM citas c JOIN servicios s ON s.id=c.servicio_id
      WHERE c.medico_id=$1 AND ($2::integer IS NULL OR c.sede_id=$2) AND c.estado NOT IN ('cancelada','atendida','no_asistio')
      AND c.fecha_hora::date BETWEEN $3::date AND $4::date AND c.fecha_hora::time<$6::time
      AND (c.fecha_hora+(COALESCE(c.duracion_total_minutos,s.duracion_minutos)||' minutes')::interval)::time>$5::time`,[medico_id,sede_id,fecha,ultima,inicio,fin]);
    await client.query('COMMIT');
    res.status(201).json({creadas:r.rowCount,citas_afectadas:afectadas.rows[0].cantidad});
  }catch(e){await client.query('ROLLBACK');res.status(400).json({error:'No se pudo crear la excepción. Revisa los campos y las horas.'});}
  finally{client.release();}

});

router.delete('/bloqueos-medicos/:id', async (req, res) => {
  try {
    const resultado=await pool.query('DELETE FROM bloqueos_medicos WHERE id=$1 RETURNING id',[req.params.id]);
    if (!resultado.rows[0]) return res.status(404).json({ error: 'Bloqueo no encontrado' });
    res.json({ mensaje: 'Bloqueo eliminado' });
  }
  catch (error) { res.status(500).json({ error: 'No se pudo eliminar el bloqueo' }); }
});

module.exports = router;
