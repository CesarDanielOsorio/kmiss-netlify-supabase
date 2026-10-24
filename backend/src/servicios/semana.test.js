const {normalizarSemana,semanasSeCruzan}=require('./semana');

test('jornadas contiguas en sedes diferentes no se cruzan',()=>{
 const a=normalizarSemana({1:[{inicio:'08:00',fin:'12:00'}]});
 const b=normalizarSemana({1:[{inicio:'12:00',fin:'17:00'}]});
 expect(semanasSeCruzan(a,b)).toBe(false);
});
test('un turno contenido dentro de otro sí se cruza',()=>{
 const a=normalizarSemana({1:[{inicio:'08:00',fin:'17:00'}]});
 const b=normalizarSemana({1:[{inicio:'13:00',fin:'14:00'}]});
 expect(semanasSeCruzan(a,b)).toBe(true);
});
test('la misma hora en días diferentes es válida',()=>{
 expect(semanasSeCruzan(normalizarSemana({1:[{inicio:'08:00',fin:'17:00'}]}),normalizarSemana({2:[{inicio:'08:00',fin:'17:00'}]}))).toBe(false);
});
test.each([
 [{inicio:'13:00',fin:'12:00'}],
 [{inicio:'08:00',fin:'12:00'},{inicio:'11:00',fin:'17:00'}],
 [{inicio:'25:00',fin:'26:00'}],
].map(bloques=>[bloques]))('rechaza jornadas inválidas o superpuestas',bloques=>{
 expect(()=>normalizarSemana({1:bloques})).toThrow();
});
