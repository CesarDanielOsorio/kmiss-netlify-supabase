function normalizarSemana(valor) {
  const semana = {};
  const horaValida = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (let dia = 0; dia <= 6; dia++) {
    const bloques = Array.isArray(valor?.[dia]) ? valor[dia] : [];
    semana[dia] = bloques.map((bloque) => ({ inicio: bloque.inicio, fin: bloque.fin }))
      .filter((bloque) => bloque.inicio || bloque.fin)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
    for (let i = 0; i < semana[dia].length; i++) {
      const bloque = semana[dia][i];
      if (!horaValida.test(bloque.inicio || '') || !horaValida.test(bloque.fin || '') || bloque.fin <= bloque.inicio) {
        throw new Error('Cada turno debe tener una hora inicial y final validas');
      }
      if (i > 0 && semana[dia][i - 1].fin > bloque.inicio) throw new Error('Hay turnos que se cruzan en un mismo dia');
    }
  }
  return semana;
}

function semanasSeCruzan(semanaA, semanaB) {
  for (let dia = 0; dia <= 6; dia++) {
    for (const a of semanaA[dia] || []) for (const b of semanaB[dia] || []) {
      if (a.inicio < b.fin && a.fin > b.inicio) return true;
    }
  }
  return false;
}


module.exports = { normalizarSemana, semanasSeCruzan };
