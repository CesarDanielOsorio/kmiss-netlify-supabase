const express = require('express');
const pool = require('../db');
const { normalizarSemana, semanasSeCruzan } = require('../servicios/semana');
const router = express.Router();

// All operations run under the administrator middleware of /ajustes.
router.get('/', async (req,res) => {
  try {
    const r=await pool.query(`SELECT c.*,COUNT(h.id)::int AS asignaciones FROM calendarios c
      LEFT JOIN horarios_semanales h ON h.calendario_id=c.id GROUP BY c.id ORDER BY replace(lower(c.nombre),'_',' ') COLLATE "C"`);
    res.json(r.rows);
  } catch(e){res.status(500).json({error:'No se pudieron obtener los calendarios'});}
});
router.get('/asignaciones',async(req,res)=>{
  try {res.json((await pool.query(`SELECT h.*,u.nombre AS medico_nombre,s.nombre AS sede_nombre,c.nombre AS calendario_nombre
    FROM horarios_semanales h JOIN usuarios u ON u.id=h.medico_id JOIN sedes s ON s.id=h.sede_id
    LEFT JOIN calendarios c ON c.id=h.calendario_id ORDER BY u.nombre,s.nombre`)).rows);}
  catch(e){res.status(500).json({error:'No se pudieron obtener las asignaciones'});}
});
function errorRespuesta(res,e){
  const code=e.status||(e.code==='23505'||e.code==='23503'?409:400);
  res.status(code).json({error:e.code==='23505'?'Ya existe ese calendario o una asignación para el médico y sede':e.code==='23503'?'El calendario tiene asignaciones o el registro relacionado no está disponible':e.message});
}
function falta(mensaje){const e=new Error(mensaje);e.status=404;return e;}
async function validarMedico(c,id){
 const r=await c.query("SELECT id FROM usuarios WHERE id=$1 AND rol='medico' AND activo=TRUE FOR UPDATE",[id]);
 if(!r.rowCount)throw new Error('Selecciona un médico activo');
}
async function validarCruces(c,medico,semana,excluir){
 const r=await c.query('SELECT semana FROM horarios_semanales WHERE medico_id=$1 AND activo=TRUE AND ($2::int IS NULL OR id<>$2)',[medico,excluir||null]);
 if(r.rows.some(h=>semanasSeCruzan(semana,h.semana)))throw new Error('El horario se cruza con el turno del médico en otra sede');
}
router.post('/',async(req,res)=>{
 try{
  const nombre=String(req.body.nombre||'').trim();
  if(!nombre||nombre.length>150)throw new Error('Escribe un nombre de hasta 150 caracteres');
  const semana=normalizarSemana(req.body.semana);
  if(!Object.values(semana).some(a=>a.length))throw new Error('Selecciona al menos un día de atención');
  res.status(201).json((await pool.query('INSERT INTO calendarios(nombre,semana) VALUES($1,$2) RETURNING *',[nombre,JSON.stringify(semana)])).rows[0]);
 }catch(e){errorRespuesta(res,e);}
});
router.put('/:id',async(req,res)=>{
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  // Serialize edits and assignments; lock calendars before their physicians consistently.
  const cal=await c.query('SELECT id FROM calendarios WHERE id=$1 FOR UPDATE',[req.params.id]);
  if(!cal.rowCount)throw falta('Calendario no encontrado');
  const nombre=String(req.body.nombre||'').trim(),semana=normalizarSemana(req.body.semana);
  if(!nombre||nombre.length>150||!Object.values(semana).some(a=>a.length))throw new Error('Nombre y al menos un día de atención son requeridos');
  const h=await c.query('SELECT id,medico_id FROM horarios_semanales WHERE calendario_id=$1 ORDER BY medico_id',[req.params.id]);
  for(const row of h.rows){await validarMedico(c,row.medico_id);await validarCruces(c,row.medico_id,semana,row.id);}
  const r=await c.query('UPDATE calendarios SET nombre=$1,semana=$2,actualizado_en=NOW() WHERE id=$3 RETURNING *',[nombre,JSON.stringify(semana),req.params.id]);
  await c.query('UPDATE horarios_semanales SET semana=$1,actualizado_en=NOW() WHERE calendario_id=$2',[JSON.stringify(semana),req.params.id]);
  await c.query('COMMIT');res.json(r.rows[0]);
 }catch(e){await c.query('ROLLBACK');errorRespuesta(res,e);}finally{c.release();}
});
async function asignar(req,res){
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const {medico_id,sede_id,calendario_id}=req.body;
  if(!medico_id||!sede_id||!calendario_id)throw new Error('Selecciona médico, sede y calendario');
  const cal=(await c.query('SELECT * FROM calendarios WHERE id=$1 FOR UPDATE',[calendario_id])).rows[0];
  if(!cal)throw falta('Calendario no encontrado');
  await validarMedico(c,medico_id);
  if(!(await c.query('SELECT id FROM sedes WHERE id=$1 AND activo=TRUE',[sede_id])).rowCount)throw new Error('Selecciona una sede activa');
  if(req.params.id&&!(await c.query('SELECT id FROM horarios_semanales WHERE id=$1',[req.params.id])).rowCount)throw falta('Asignación no encontrada');
  await validarCruces(c,medico_id,cal.semana,req.params.id);
  const values=[medico_id,sede_id,calendario_id,JSON.stringify(cal.semana)];
  const sql=req.params.id?'UPDATE horarios_semanales SET medico_id=$1,sede_id=$2,calendario_id=$3,semana=$4,activo=TRUE,actualizado_en=NOW() WHERE id=$5 RETURNING *':'INSERT INTO horarios_semanales(medico_id,sede_id,calendario_id,semana) VALUES($1,$2,$3,$4) RETURNING *';
  if(req.params.id)values.push(req.params.id);
  const r=await c.query(sql,values);await c.query('COMMIT');res.status(req.params.id?200:201).json(r.rows[0]);
 }catch(e){await c.query('ROLLBACK');errorRespuesta(res,e);}finally{c.release();}
}
router.post('/asignaciones',asignar);
router.put('/asignaciones/:id',asignar);
router.delete('/:id',async(req,res)=>{
 try{
  const r=await pool.query('DELETE FROM calendarios WHERE id=$1 RETURNING id',[req.params.id]);
  if(!r.rowCount)throw falta('Calendario no encontrado');
  res.json({mensaje:'Calendario eliminado'});
 }catch(e){errorRespuesta(res,e);}
});
module.exports=router;
