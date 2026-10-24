import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, CalendarDays, Check, ChevronLeft, ChevronRight, MessageCircle, Plus, X } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import ImportarExcel from '../components/ImportarExcel';

const VACIO = { paciente_id: '', sede_id: '', servicio_id: '', medico_id: '', fecha: '', hora: '', motivo_consulta: '' };
const ESTADOS = {
  solicitada: ['Solicitada', 'estado-programada'], programada: ['Programada', 'estado-programada'],
  confirmada: ['Confirmada', 'estado-confirmada'], atendida: ['Atendida', 'estado-atendida'],
  cancelada: ['Cancelada', 'estado-cancelada'], no_asistio: ['No asistió', 'estado-cancelada'],
};

function fechaLocal(date) {
  const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function inicioSemana(base = null) {
  const fecha = base ? new Date(base) : new Date(`${hoyGuatemala()}T12:00:00`); const dia = fecha.getDay() || 7;
  fecha.setHours(0, 0, 0, 0); fecha.setDate(fecha.getDate() - dia + 1); return fecha;
}
function telefonoWhatsApp(valor) { const d = String(valor || '').replace(/\D/g, ''); return d.length === 8 ? `502${d}` : d; }


const INICIO=7, FIN=21, PX_MIN=1.6;
const formatoGT=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guatemala',year:'numeric',month:'2-digit',day:'2-digit'});
function fechaGuatemala(valor){const partes=formatoGT.formatToParts(new Date(valor));const get=t=>partes.find(p=>p.type===t).value;return `${get('year')}-${get('month')}-${get('day')}`;}
function hoyGuatemala(){return fechaGuatemala(new Date());}
function horaGuatemala(valor){return new Intl.DateTimeFormat('en-GB',{timeZone:'America/Guatemala',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(valor));}
function sumarDias(fecha,n){const d=new Date(fecha);d.setDate(d.getDate()+n);return d;}
function distribuir(citas){
 const eventos=citas.map(cita=>{const [h,m]=horaGuatemala(cita.fecha_hora).split(':').map(Number);return {cita,inicio:h*60+m,fin:h*60+m+Number(cita.duracion_minutos)};}).sort((a,b)=>a.inicio-b.inicio);
 let grupo=[],limite=-1;const resultado=[];
 function terminar(){const carriles=[];for(const e of grupo){let c=carriles.findIndex(fin=>fin<=e.inicio);if(c<0)c=carriles.length;carriles[c]=e.fin;e.carril=c;}for(const e of grupo)resultado.push({...e,columnas:carriles.length});grupo=[];}
 for(const e of eventos){if(grupo.length&&e.inicio>=limite){terminar();limite=-1;}grupo.push(e);limite=Math.max(limite,e.fin);}terminar();return resultado;
}

export default function Citas() {
  const { usuario } = useAuth();
  const [semana, setSemana] = useState(inicioSemana());
  const [citas, setCitas] = useState([]);
  const [seleccionada, setSeleccionada] = useState(null);
  const [medicoFiltro, setMedicoFiltro] = useState('');
  const [medicosFiltro, setMedicosFiltro] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const ultimaCarga = useRef(0);
  const [pacientes, setPacientes] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [cargandoHorarios, setCargandoHorarios] = useState(false);
  const [sedeFiltro, setSedeFiltro] = useState('');
  const [modal, setModal] = useState(false);
  const [formulario, setFormulario] = useState(VACIO);
  const [error, setError] = useState('');
  const puedeConfirmar = ['administrador', 'recepcion'].includes(usuario?.rol);
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(semana); d.setDate(d.getDate() + i); return d; }), [semana]);

  async function cargar() {
    const carga = ++ultimaCarga.current;
    const desde = fechaLocal(dias[0]); const hasta = fechaLocal(dias[6]);
    try {
      const datos = await api.citas.listar({ desde, hasta, ...(sedeFiltro ? { sede_id: sedeFiltro } : {}) });
      if(carga === ultimaCarga.current) setCitas(datos);
    } catch (err) { if(carga === ultimaCarga.current) setError(err.message); }
  }
  useEffect(() => { cargar(); }, [semana, sedeFiltro]);
  useEffect(() => { let vigente=true; api.citas.medicos(sedeFiltro).then(datos=>{if(vigente){setMedicosFiltro(datos);setMedicoFiltro('');}}).catch(err=>setError(err.message)); return ()=>{vigente=false;}; },[sedeFiltro]);
  useEffect(() => { const cerrar=e=>{if(e.key==='Escape'){setSeleccionada(null);setModal(false);}}; document.addEventListener('keydown',cerrar); return ()=>document.removeEventListener('keydown',cerrar); },[]);
  useEffect(() => {
    Promise.all([api.pacientes.listar(), api.servicios.listar(), api.citas.sedes()])
      .then(([p, s, sedesDatos]) => { setPacientes(p); setServicios(s); setSedes(sedesDatos); if (sedesDatos.length === 1) setSedeFiltro(String(sedesDatos[0].id)); })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!formulario.sede_id) { setMedicos([]); return; }
    api.citas.medicos(formulario.sede_id).then(setMedicos).catch(() => setMedicos([]));
  }, [formulario.sede_id]);
  useEffect(() => {
    const { medico_id, sede_id, servicio_id, fecha } = formulario;
    if (!medico_id || !sede_id || !servicio_id || !fecha) { setHorarios([]); return; }
    setCargandoHorarios(true); setFormulario((actual) => ({ ...actual, hora: '' }));
    api.citas.disponibilidad(medico_id, sede_id, servicio_id, fecha)
      .then(setHorarios).catch((err) => setError(err.message)).finally(() => setCargandoHorarios(false));
  }, [formulario.medico_id, formulario.sede_id, formulario.servicio_id, formulario.fecha]);

  function abrirNueva(fecha = null) {
    const sedeInicial = sedeFiltro || (sedes.length === 1 ? String(sedes[0].id) : '');
    setFormulario({ ...VACIO, sede_id: sedeInicial, medico_id: usuario.rol === 'medico' ? usuario.id : '', fecha: fecha ? fechaLocal(fecha) : '' });
    setHorarios([]); setError(''); setModal(true);
  }
  async function guardar(e) {
    e.preventDefault(); setError('');
    try { await api.citas.crear({ ...formulario, fecha_hora: `${formulario.fecha}T${formulario.hora}:00` }); setModal(false); cargar(); }
    catch (err) { setError(err.message); }
  }
  async function cambiarEstado(id, estado) {
    if(ocupado)return; setOcupado(true);
    try { const actualizada=await api.citas.cambiarEstado(id, estado); setSeleccionada(actualizada); setError(''); await cargar(); } catch (err) { setError(err.message); } finally { setOcupado(false); }
  }
  function recordar(cita) {
    if (!cita.medico_telefono) { setError('Agrega el teléfono del médico en Usuarios para enviar recordatorios.'); return; }
    const fecha = new Date(cita.fecha_hora).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' });
    const mensaje = encodeURIComponent(`Hola, Dr(a). ${cita.medico_nombre}. Recordatorio de cita en K-MISS, ${cita.sede_nombre}: ${fecha}, paciente ${cita.paciente_nombre}, servicio ${cita.servicio_nombre}.`);
    window.open(`https://wa.me/${telefonoWhatsApp(cita.medico_telefono)}?text=${mensaje}`, '_blank', 'noopener,noreferrer');
  }

  return <div className="pagina">
    <header className="pagina-encabezado"><div><h1>Agenda de citas</h1><p>Calendario semanal · Hora de Guatemala (UTC−6)</p></div><div className="acciones-encabezado">
      {usuario.rol === 'administrador' && <ImportarExcel onImportar={(a) => api.citas.importar(a)} alTerminar={cargar} columnas={['paciente','servicio','sede','fecha_hora','medico','motivo_consulta','estado']} />}
      <button className="boton-primario" onClick={() => abrirNueva()}><Plus size={17} /> Nueva cita</button>
    </div></header>
    {error && !modal && <p className="login-error">{error}</p>}
    <div className="cal-controles">
      <div className="cal-filtros"><label>Sede<select aria-label="Filtrar por sede" value={sedeFiltro} onChange={e=>setSedeFiltro(e.target.value)}><option value="">Todas las sedes</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
      <label>Médico<select aria-label="Filtrar por médico" value={medicoFiltro} onChange={e=>setMedicoFiltro(e.target.value)}><option value="">Todos los médicos</option>{medicosFiltro.map(m=><option key={m.id} value={m.id}>{m.nombre}</option>)}</select></label></div>
      <div className="cal-navegacion"><button className="boton-secundario" title="Semana anterior" onClick={()=>setSemana(s=>sumarDias(s,-7))}><ChevronLeft size={17}/></button><button className="boton-secundario" onClick={()=>setSemana(inicioSemana())}>Hoy</button><strong>{dias[0].toLocaleDateString('es-GT',{day:'numeric',month:'short'})} - {dias[6].toLocaleDateString('es-GT',{day:'numeric',month:'short',year:'numeric'})}</strong><button className="boton-secundario" title="Semana siguiente" onClick={()=>setSemana(s=>sumarDias(s,7))}><ChevronRight size={17}/></button></div>
    </div>
    <div className="cal-leyenda"><span><i className="marca-programada"/>Solicitada / programada</span><span><i className="marca-confirmada"/>Confirmada / atendida</span><span>Selecciona una cita para ver los detalles y acciones.</span></div>
    <div className="cal-scroll" aria-label="Calendario semanal de citas"><div className="cal-grid">
      <div className="cal-cabecera"><div>Hora</div>{dias.map(dia=><button key={fechaLocal(dia)} className={fechaLocal(dia)===hoyGuatemala()?'cal-hoy':''} onClick={()=>abrirNueva(dia)}><span>{dia.toLocaleDateString('es-GT',{weekday:'short'})}</span><strong>{dia.getDate()}</strong></button>)}</div>
      <div className="cal-cuerpo"><div className="cal-horas">{Array.from({length:FIN-INICIO},(_,i)=><div key={i}>{String(INICIO+i).padStart(2,'0')}:00</div>)}</div>
      {dias.map(dia=>{const fecha=fechaLocal(dia);const citasDia=citas.filter(c=>fechaGuatemala(c.fecha_hora)===fecha&&(!medicoFiltro||String(c.medico_id)===medicoFiltro)); const eventos=distribuir(citasDia);return <div className={`cal-columna ${fecha===hoyGuatemala()?'cal-hoy':''}`} key={fecha}>
      {eventos.map(({cita,inicio,fin,carril,columnas})=><button key={cita.id} className={`cal-evento cal-estado-${cita.estado}`} style={{top:(inicio-INICIO*60)*PX_MIN,height:Math.max((fin-inicio)*PX_MIN,28),left:`calc(${carril*100/columnas}% + 3px)`,width:`calc(${100/columnas}% - 6px)`}} onClick={()=>{setSeleccionada(cita);setError('');}} aria-label={`${cita.paciente_nombre}, ${horaGuatemala(cita.fecha_hora)}, ${ESTADOS[cita.estado]?.[0]}`}><span>{horaGuatemala(cita.fecha_hora)}–{horaGuatemala(new Date(new Date(cita.fecha_hora).getTime()+Number(cita.duracion_minutos)*60000))}</span><strong>{cita.paciente_nombre}</strong><small>{cita.medico_nombre}</small></button>)}
      </div>;})}</div>
    </div></div>
    {seleccionada && <div className="modal-fondo" onClick={()=>setSeleccionada(null)}><div className="modal cita-detalle" role="dialog" aria-modal="true" aria-labelledby="detalle-cita-titulo" onClick={e=>e.stopPropagation()}>
      <div className="modal-encabezado"><h2 id="detalle-cita-titulo">{seleccionada.paciente_nombre}</h2><button className="modal-cerrar" aria-label="Cerrar detalle" onClick={()=>setSeleccionada(null)}><X size={18}/></button></div>
      <div className="cita-detalle-info"><strong>{fechaGuatemala(seleccionada.fecha_hora)} · {horaGuatemala(seleccionada.fecha_hora)} (Guatemala)</strong><p>{seleccionada.servicio_nombre} · {seleccionada.duracion_minutos} min</p><p>{seleccionada.medico_nombre} · {seleccionada.sede_nombre}</p><span className={`etiqueta-estado ${ESTADOS[seleccionada.estado]?.[1]}`}>{ESTADOS[seleccionada.estado]?.[0]}</span></div>
      {error&&<p className="login-error" role="alert">{error}</p>}
      <div className="modal-acciones cita-detalle-acciones"><button className="boton-secundario" onClick={()=>recordar(seleccionada)}><MessageCircle size={16}/>Recordar</button>
      {['solicitada','programada'].includes(seleccionada.estado)&&puedeConfirmar&&<button disabled={ocupado} className="boton-primario" onClick={()=>cambiarEstado(seleccionada.id,'confirmada')}><Check size={16}/>Confirmar cita</button>}
      {['programada','confirmada'].includes(seleccionada.estado)&&<button disabled={ocupado} className="boton-secundario" onClick={()=>cambiarEstado(seleccionada.id,'atendida')}><Check size={16}/>Marcar atendida</button>}
      {!['cancelada','atendida','no_asistio'].includes(seleccionada.estado)&&<button disabled={ocupado} className="boton-secundario" onClick={()=>cambiarEstado(seleccionada.id,'cancelada')}><Ban size={16}/>Cancelar cita</button>}</div>
    </div></div>}
    {modal && <div className="modal-fondo" onClick={() => setModal(false)}><div className="modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-encabezado"><h2>Nueva cita</h2><button className="modal-cerrar" onClick={() => setModal(false)}><X size={18} /></button></div>
      <form className="formulario-grid" onSubmit={guardar}>
        <label className="campo-ancho">Paciente *<select required value={formulario.paciente_id} onChange={(e) => setFormulario({...formulario,paciente_id:e.target.value})}><option value="">Selecciona un paciente</option>{pacientes.map((p)=><option key={p.id} value={p.id}>{p.nombre_completo}</option>)}</select></label>
        <label className="campo-ancho">Establecimiento *<select required value={formulario.sede_id} onChange={(e) => setFormulario({...formulario,sede_id:e.target.value,medico_id:'',hora:''})}><option value="">Selecciona una sede</option>{sedes.map((s)=><option key={s.id} value={s.id}>{s.nombre} · {s.direccion}</option>)}</select></label>
        <label>Servicio *<select required value={formulario.servicio_id} onChange={(e) => setFormulario({...formulario,servicio_id:e.target.value,hora:''})}><option value="">Selecciona un servicio</option>{servicios.filter((s)=>s.activo).map((s)=><option key={s.id} value={s.id}>{s.nombre} · {s.duracion_minutos} min</option>)}</select></label>
        <label>Médico *<select required disabled={!formulario.sede_id || usuario.rol==='medico'} value={formulario.medico_id} onChange={(e) => setFormulario({...formulario,medico_id:e.target.value,hora:''})}><option value="">Selecciona un médico</option>{medicos.map((m)=><option key={m.id} value={m.id}>{m.nombre}</option>)}</select></label>
        <label>Fecha *<input type="date" required value={formulario.fecha} onChange={(e) => setFormulario({...formulario,fecha:e.target.value,hora:''})} /></label>
        <label>Horario disponible *<select required disabled={!formulario.fecha || cargandoHorarios} value={formulario.hora} onChange={(e) => setFormulario({...formulario,hora:e.target.value})}><option value="">{cargandoHorarios ? 'Consultando...' : horarios.length ? 'Selecciona una hora' : 'No hay horarios disponibles'}</option>{horarios.map((h)=><option key={h} value={h}>{h}</option>)}</select></label>
        <label className="campo-ancho">Motivo<textarea rows={2} value={formulario.motivo_consulta} onChange={(e) => setFormulario({...formulario,motivo_consulta:e.target.value})} /></label>
        {error && <p className="login-error campo-ancho">{error}</p>}
        <div className="modal-acciones campo-ancho"><button type="button" className="boton-secundario" onClick={() => setModal(false)}>Cancelar</button><button className="boton-primario" disabled={!formulario.hora}><CalendarDays size={16} /> Agendar</button></div>
      </form>
    </div></div>}
  </div>;
}
