function idsServicios(servicioId,serviciosIds){
 const ids=serviciosIds===undefined?[servicioId]:serviciosIds;
 if(!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(id=>!/^\d+$/.test(String(id))||Number(id)<=0||!Number.isSafeInteger(Number(id))))throw new Error('Selecciona al menos un servicio válido');
 const numeros=ids.map(Number);
 if(new Set(numeros).size!==numeros.length)throw new Error('No repitas servicios en la misma cita');
 return numeros;
}
async function obtenerServicios(client,servicioId,serviciosIds){
 const ids=idsServicios(servicioId,serviciosIds);
 const r=await client.query('SELECT id,nombre,duracion_minutos,precio FROM servicios WHERE id=ANY($1::integer[]) AND activo=TRUE',[ids]);
 if(r.rows.length!==ids.length)throw new Error('Uno o más servicios no están disponibles');
 const servicios=ids.map(id=>r.rows.find(s=>s.id===id));
 const duracion=servicios.reduce((s,x)=>s+Number(x.duracion_minutos),0);
 if(duracion<=0||duracion>=1440)throw new Error('La duración de los servicios no es válida');
 return {servicios,duracion};
}
async function guardarServicios(client,citaId,servicios){
 await client.query('DELETE FROM cita_servicios WHERE cita_id=$1',[citaId]);
 for(const s of servicios)await client.query('INSERT INTO cita_servicios(cita_id,servicio_id,nombre,duracion_minutos,precio) VALUES($1,$2,$3,$4,$5)',[citaId,s.id,s.nombre,s.duracion_minutos,s.precio]);
}
module.exports={idsServicios,obtenerServicios,guardarServicios};
