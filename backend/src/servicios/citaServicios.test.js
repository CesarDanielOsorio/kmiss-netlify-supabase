const {idsServicios,obtenerServicios}=require('./citaServicios');

test('conserva compatibilidad con una cita de un servicio',()=>{
 expect(idsServicios('4',undefined)).toEqual([4]);
});
test.each([[],[1,1],[0],['1 OR 1=1'],['-2'],['2.5']])('rechaza una selección inválida: %j',(...ids)=>{
 expect(()=>idsServicios(null,ids)).toThrow();
});
test('suma los servicios del servidor y conserva su orden',async()=>{
 const client={query:jest.fn().mockResolvedValue({rows:[{id:2,nombre:'General',duracion_minutos:30,precio:'150.00'},{id:1,nombre:'Especializada',duracion_minutos:45,precio:'250.00'}]})};
 const r=await obtenerServicios(client,null,[1,2]);
 expect(r.duracion).toBe(75);expect(r.servicios.map(s=>s.id)).toEqual([1,2]);
});
test('rechaza una selección si alguno de los servicios dejó de estar activo',async()=>{
 const client={query:jest.fn().mockResolvedValue({rows:[{id:1,duracion_minutos:45}]})};
 await expect(obtenerServicios(client,null,[1,2])).rejects.toThrow('no están disponibles');
});
