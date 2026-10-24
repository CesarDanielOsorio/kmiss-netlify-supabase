# KMISS: preparación y despliegue gratuito

## Estado y responsabilidades

Actualización de la instalación: el usuario creó el proyecto Supabase, ejecutó
SUPABASE-INSTALAR-NUEVO.sql y se verificaron remotamente 15 tablas y kmiss-media.
Se incorporó su CA pública en backend/certs/prod-ca-2021.crt para validar TLS;
netlify.toml incluye el certificado en el paquete de Functions.
Se creó únicamente admin@vitalis.local y se comprobaron login y /api/auth/me (200).
Su contraseña inicial es DEMO_PASSWORD en backend/.env, ignorado por Git.
Storage también fue validado con subida, lectura pública y eliminación de una
imagen temporal. Falta desplegar en Netlify y reconstruir los datos de catálogo.
El usuario eligió reconstruir manualmente los datos visibles mediante capturas;
no se ha importado ningún respaldo de Azure. Azure despliega desde otro repositorio,
dennismorales12/kmiss-clinica-demo, al que el conector actual no tiene acceso.

Código preparado en la copia local, rama `codex/netlify-supabase`, desde
`55c90b29d479102c6de16448dd2bd6d77845f148`. El historial original se respaldó
en `../kmiss-original.bundle`. No se ha publicado esta rama ni modificado GitHub.

| Paso | Responsable | Estado |
|---|---|---|
| Copia local, rama aislada y respaldo del historial | Codex | Hecho |
| Express exportable + Netlify Function + redirecciones | Codex | Preparado |
| Storage para productos, servicios y noticias | Codex | Preparado |
| SQL de protección de tablas y bucket público de catálogo | Ambos | Ejecutado en Supabase |
| Crear proyectos gratuitos en Supabase y Netlify | Usuario | Supabase creado; Netlify pendiente |
| Introducir claves en paneles o `.env` local ignorado | Usuario | Configuración local lista; Netlify pendiente |
| Inicializar una base nueva o restaurar copia de datos | Ambos | Base nueva lista; datos manuales pendientes |
| Publicar rama y conectar Netlify a ella | Ambos | Pendiente |
| Validar sistema desplegado con datos y roles | Ambos | Pendiente |

GitHub ya está conectado en esta conversación y tiene acceso al repositorio.
Supabase no necesita conectarse a GitHub: solo requiere un proyecto de BD/Storage.
Para que Netlify importe el repositorio, hay que autorizar también su propia
integración de GitHub. Si la autorización del repositorio lo exige, Dennis
deberá conceder el acceso desde su cuenta.

## 1. Crear un proyecto Supabase nuevo

Crear cuenta/organización en plan **Free**, proyecto KMISS y contraseña de BD
larga. Guardar la contraseña en un gestor. No poner claves en el chat, MD ni Git.
Usar datos ficticios para las primeras pruebas.

Si necesitan conservar información actual, hacer antes un respaldo de la BD
original con `pg_dump` y restaurarlo en el proyecto nuevo. El repositorio y el
archivo bundle NO incluyen datos, imágenes de la BD, `.env` ni archivos externos.
No ejecutar `init.sql` sobre la base original: contiene migraciones y un
`DROP TABLE IF EXISTS horarios_medicos`; requiere revisión si ya hay datos.

## 2. Crear tablas y Storage

En el SQL Editor del proyecto **nuevo y vacío**, ejecutar `db/init.sql` una vez.
Después ejecutar `db/supabase.sql` para activar RLS, retirar permisos de las
claves públicas sobre tablas KMISS y crear el bucket `kmiss-media`.
Express conserva JWT/roles propios y accede mediante PostgreSQL. No usa Supabase Auth.

El bucket es público para imágenes de productos, servicios y noticias. No crear
políticas públicas de escritura. La clave service role solo vive en el backend.
No colocar documentos de pacientes en este bucket.

## 3. Crear datos iniciales o recuperar datos existentes

Solo para una base nueva: copiar `backend/.env.example` a `backend/.env`.
Configurar allí `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production` y
`DEMO_PASSWORD` (larga y diferente de cualquier contraseña personal).
Para tareas de esquema usar la URI **Session pooler**, puerto 5432, del panel
Connect de Supabase y TLS (`?sslmode=verify-full`). Si hace falta una CA, descargar
la indicada por Supabase y configurar `PGSSLROOTCERT`; no desactivar validación.

Ejecutar desde `backend/`:

```powershell
npm run seed
```

No ejecutar `init-db` otra vez si ya se creó el esquema con el SQL Editor.
El seed crea admin@vitalis.local, recepcion@vitalis.local y medico@vitalis.local.
Sus contraseñas serán el valor de DEMO_PASSWORD. No vuelve a cambiar las
contraseñas de usuarios existentes. No conectar el seed al build de Netlify.

## 4. Variables en Netlify

Crear un proyecto con plan Free, sin activar recargas de pago. Importar el
repositorio, seleccionando la rama `codex/netlify-supabase` cuando esté publicada.
Mantener la base del proyecto en la **raíz** del repositorio, no `frontend/`:
`netlify.toml` instala ambos paquetes y empaqueta la API.

| Variable | Valor y alcance |
|---|---|
| DATABASE_URL | URI **Transaction pooler**, puerto 6543, con TLS; Functions |
| JWT_SECRET | Secreto aleatorio largo; Functions |
| JWT_EXPIRES_IN | `8h`; Functions |
| SUPABASE_URL | URL del proyecto Supabase; Functions |
| SUPABASE_SERVICE_ROLE_KEY | Clave `service_role`; Functions, nunca frontend |
| SUPABASE_STORAGE_BUCKET | `kmiss-media`; Functions |
| IMAGE_STORAGE | `supabase`; Functions |
| NODE_ENV | `production`; Build y Functions |

VITE_API_URL=/api y Node 22 están en `netlify.toml`. No usar prefijo `VITE_` para
ningún secreto. La anon key no es necesaria para esta arquitectura.
NETLIFY=true lo proporciona Netlify automáticamente; no hace falta crearlo.

Configuración versionada:

- Build: `npm run build`.
- Publish: `frontend/dist`.
- Functions: `netlify/functions`.
- `/api/*` llega a Express y las demás rutas a React Router.

## 5. Imágenes y migración opcional

Configurar IMAGE_STORAGE=supabase para las cargas nuevas. En local, el valor
postgres conserva la compatibilidad BYTEA. Las imágenes antiguas siguen siendo
accesibles desde `/api/media/...` mientras no se migren.

Para trasladar imágenes BYTEA, primero respaldar la **copia de BD** y detener
ediciones de catálogo. En backend/.env configurar también las variables Storage
y IMAGE_STORAGE=supabase; ejecutar desde `backend/`:

```powershell
npm run migrate-images
```

El script procesa registros con BYTEA, sube cada archivo y guarda su URL antes de
vaciar sus campos binarios. Si se interrumpe, los registros pendientes conservan
su imagen y se puede volver a ejecutar. Comprimir primero imágenes mayores de
4 MB. Los antiguos archivos `/uploads/...` no están incluidos en esta migración;
si existen, copiarlos y volver a subirlos desde el sistema.
Los reemplazos y eliminaciones intentan limpiar los objetos antiguos del bucket;
un fallo de limpieza se registra y puede dejar objetos huérfanos para revisión.

## 6. Publicación y pruebas

Compartir la rama con el compañero y revisar los cambios antes de integrarlos a
main. Se puede crear un pull request y desplegar esa rama en un sitio de pruebas.

Comprobar desde la URL pública:

1. `/api/health` devuelve JSON, y una ruta privada sin token devuelve 401.
2. Login con los tres roles; cada uno conserva sus permisos.
3. Pacientes, citas, médicos, horarios y ajustes cargan y permiten operaciones.
4. Productos, servicios y noticias: subir/reemplazar imagen, recargar y verificar.
5. Tienda pública, pedido, recepción del pedido, venta e inventario.
6. Importación Excel pequeña (límite 4 MB).
7. Abrir directamente una ruta interna de React y recargar.
8. Logout y acceso desde otra computadora.

Las pruebas locales con BD y Storage simulados no sustituyen estas pruebas reales.

Validación local realizada: 15 pruebas Jest aprobadas (incluyendo las existentes),
compilación Vite correcta y empaquetado esbuild de la Function para Node 22.
El equipo local ejecuta Node 24; falta validar el runtime real de Netlify y los
servicios conectados. La comprobación posterior de PostgreSQL y login reales
se detalla al inicio de esta guía; aún falta validar Storage y el sitio desplegado.

## Límites del objetivo $0

Supabase Free puede pausar proyectos con baja actividad durante siete días.
Antes de la presentación revisar el panel y restaurarlo si está pausado.
Las funciones también pueden tener arranques en frío. No hay garantía de
disponibilidad permanente gratuita.

Netlify Free tiene cuotas/créditos; vigilar Usage/Billing y mantener el plan
gratuito. El límite documentado de petición binaria es aproximadamente 4.5 MB;
la aplicación limita imágenes y Excel a 4 MB para dejar margen a multipart.

Referencias consultadas:

- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/storage/security/access-control
- https://docs.netlify.com/build/functions/configuration/
- https://docs.netlify.com/build/functions/usage-and-billing/


## Reconstrucción de agenda, calendarios y notificaciones desde capturas

La agenda se reconstruyó como cuadrícula horaria con filtros por sede y médico y modal de detalle. Ajustes usa navegación por secciones y calendarios reutilizables. Las asignaciones actualizan horarios_semanales, por lo que la disponibilidad pública e interna utiliza la misma información. El panel de notificaciones consulta pedidos nuevos reales y enlaza a Pedidos web.

En una instalación Supabase existente, aplicar `db/calendarios.sql` una vez antes de publicar este código. No volver a ejecutar el instalador de base nueva. En la instalación utilizada ya se aplicó esta migración y se vincularon las tres asignaciones visibles en las capturas. Los contadores de asignaciones se calculan con los registros existentes: no se reconstruyeron asignaciones ocultas.

La agenda usa horas de Guatemala para agrupar y mostrar las citas; el backend convierte el timestamp local a un instante con zona explícita. Las excepciones permiten rango de fechas y días completos. No se recuperó el código de Azure; se implementó el comportamiento visible aportado por el usuario.
