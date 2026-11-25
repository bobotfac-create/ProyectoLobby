# Changelog

Registro cronologico de cambios relevantes del proyecto Asistente Lobby.

Formato: `YYYY-MM-DD HH:mm CLT`.

## [Sin versionar]

### 2026-11-25 - Catalogo independiente de representados

- Nuevo catalogo por dueño con gestion, busqueda, importacion y simulacion de migracion sin escrituras.
- La extension permite seleccionar representados por solicitante o asistente; los datos antiguos requieren seleccion explicita.
- Se conservan los representados anidados existentes y los archivos de importacion anteriores.

### 2026-11-25 - Datos de personas existentes en Senado

- El adaptador espera la consulta de RUT del Senado, conserva los campos bloqueados por el sitio y avisa de diferencias con el portal.
- Si no se confirma la consulta, el llenado dependiente se detiene para revision manual.

### 2026-11-25 - Panel del Senado fuera del iframe

- El panel se muestra en la pagina principal y comunica el llenado al iframe mediante el background de la extension.

### 2026-11-25 - Visibilidad del asistente en Senado

- El boton del asistente aparece en la parte superior del iframe para facilitar encontrarlo en el formulario embebido.

### 2026-11-25 - Formulario del Senado

- La extension carga en el iframe de audiencia del Senado y rellena datos disponibles tras la seleccion manual de autoridad.
- Se admiten los tres tipos de representado con comprobaciones para campos y listas dinamicas; los asistentes adicionales se gestionan manualmente.
- La integracion requiere validacion en el sitio real y sus estados dinamicos.

### 2026-11-25 - Panel de la extension

- Se priorizan busqueda, seleccion, llenado y revision; JSON y ejemplos quedan en carga manual avanzada.
- El panel inicia sin datos de ejemplo, exige seleccionar personas y protege las ediciones manuales durante busquedas.

### 2026-11-25 - Navegacion del portal

- El listado de usuarios queda primero; accesos e importacion se agrupan en secciones desplegables.
- El formulario avisa antes de descartar cambios, enfoca la edicion y conserva la confirmacion de guardado.

### 2026-11-25 - Destinos del piloto

- Se autorizan los destinos de autenticacion de Chrome y de la instalacion temporal de Firefox 0.1.2.

### 2026-11-25 - Conexion del piloto con Render

- El portal y la extension version 0.1.2 usan `https://proyectolobby.onrender.com/api`.
- Los manifiestos permiten el dominio exacto de Render; el login sigue usando Firebase Hosting.

### 2026-11-24 - Preparacion de API para Render

- La API Express admite ejecucion independiente en Render con credenciales Firebase de servidor configuradas en una variable secreta.
- Portal y extension preparan URLs de API configurables y muestran el estado HTTP cuando la respuesta no es JSON.
- Se excluyen capturas HAR y nombres habituales de claves del repositorio; se documenta el piloto en `RENDER.md`.

### 2026-11-24 - Actualizacion de dependencias de produccion

- Se actualizan Express, Firebase Admin y Firebase Functions; el backend usa las APIs modulares de Admin SDK.
- Se agrega una prueba HTTP de arranque y autorizacion basica con los SDK reales.
- `npm audit --omit=dev` no informa vulnerabilidades; quedan advertencias moderadas en dependencias de Firebase CLI.

### 2026-11-24 - Firebase CLI local

- Firebase CLI queda disponible como dependencia de desarrollo de `functions/`, sin instalacion global.

### 2026-11-24 - Revision del complemento Firefox

- El manifiesto de Firefox usa `background.scripts` sin la propiedad `service_worker` incompatible.
- El panel y los resultados se construyen con elementos DOM sin asignaciones a `innerHTML`.
- Version de extension actualizada a `0.1.1` para nueva entrega.

### 2026-11-24 - Nuevo ID de Firefox

- Se asigna un ID nuevo al complemento Firefox para preparar un nuevo registro en Mozilla.

### 2026-11-24 - Preparacion de distribucion piloto

- El manifiesto de Firefox admite el dominio `www.camara.cl`.
- Se generan ZIP reproducibles separados para Chrome y Firefox, con pruebas locales y sin sobrescribir paquetes existentes.
- La pagina de autenticacion Google exige destinos exactos autorizados; la lista inicial vacia bloquea el login hasta configurarla antes del despliegue.

### 2026-11-24 - Busqueda completa y paginacion

- La API busca en todos los registros autorizados por lotes y pagina resultados mediante cursores ordenados por ID.
- El portal y la extension permiten avanzar y retroceder; la extension reemplaza el contenido cargado por cada pagina.
- Se declara el indice Firestore de estado y dueño. La busqueda por texto sigue filtrando en memoria y puede requerir muchas lecturas.

### 2026-11-24 - Visibilidad de limites de busqueda

- La API informa cuando la busqueda o el listado no revisan todos los registros, o cuando hay mas de 25 coincidencias en la extension.
- El portal y la extension muestran una advertencia cuando los resultados pueden estar incompletos.

### 2026-11-24 - Integridad de usuarios

- La importacion conserva el estado y los campos existentes al actualizar, y reconstruye el texto de busqueda completo.
- La creacion evita sobrescrituras por IDs duplicados; actualizaciones, bajas e importaciones comprueban ownership mediante transacciones.
- Los campos de trazabilidad son asignados por el servidor. Se agregan pruebas locales de integridad con `npm test` en `functions/`.

### 2026-09-01 - Formulario de audiencia Camara

#### Agregado

- Adaptador de extension para la solicitud de audiencia de la Camara de
  Diputadas y Diputados.
- Campos de representado para nombres, apellidos, identificador, region,
  comuna y tipo de representacion en el portal.
- Telefono alternativo y tipo de identificacion del representado para Camara.

#### Cambiado

- El panel selecciona el adaptador segun el formulario abierto.
- La accion de asistente en Camara rellena datos sin pulsar `Agregar`.
- El portal aclara los campos `RUT / Pasaporte` y agrega descriptores de llenado.

### 2026-06-19 16:10 CLT - Plan de extension de navegador

#### Agregado

- `plan-extension-navegador.md` con arquitectura objetivo para reemplazar el bookmarklet por extension Chrome/Firefox.
- Decision de usar Firebase fijo en `https://asistente-lobby.web.app`.
- Decision de arquitectura robusta con `background.js`, content script y `page-bridge.js`.
- Preparacion conceptual para futuros formularios mediante adaptadores.

### 2026-06-19 16:45 CLT - Extension base Asistente Lobby

#### Agregado

- Carpeta `extension/`.
- Manifiestos base para Chrome y Firefox.
- `extension/src/background.js` para login, token y llamadas API.
- `extension/src/content.js` para panel, flujo manual y coordinacion con backend.
- `extension/src/page-bridge.js` para abrir/rellenar el modal desde el contexto real de Ley Lobby.
- `extension/src/shared/payload.js` con ejemplos y normalizacion de payload.
- `extension/src/sites/leylobby/form-filler.js` con llenado del formulario principal.
- `extension/README.md` con instrucciones iniciales.
- Panel con modo JSON manual y ejemplos.
- Llenado de formulario principal desde la extension.
- Llenado de modal mediante bridge.

#### Cambiado

- El flujo principal pasa de bookmarklet a extension de navegador.
- El acceso a datos Firebase se mueve al background de la extension.

#### Validado

- Sintaxis JS de scripts de extension con `node --check`.
- Manifiestos JSON parsean correctamente.
- Carga basica de extension en Chromium headless.

### 2026-06-19 17:25 CLT - CORS para extension y despliegue inicial

#### Corregido

- CORS de Cloud Functions acepta origenes `chrome-extension://...` y `moz-extension://...`.

#### Desplegado

- Cloud Functions desplegadas para activar CORS de extensiones.

#### Validado

- `/api/health` responde correctamente para origenes Chrome Extension y Firefox Extension.

### 2026-06-19 17:50 CLT - Panel minimizable y contexto de producto

#### Agregado

- `PRODUCT.md` con contexto estrategico del producto.
- Boton flotante `Abrir Asistente Lobby`.
- Accion `Minimizar` para ocultar el panel sin perder estado mientras la pagina siga cargada.

#### Cambiado

- El panel ya no aparece completamente abierto al cargar la pagina.

#### Corregido

- Mensaje para `PASSWORD_LOGIN_DISABLED` ahora explica que Email/Password debe habilitarse en Firebase Auth o usarse Google.

### 2026-06-19 18:15 CLT - Login Google en extension

#### Agregado

- Login Google para la extension mediante `identity.launchWebAuthFlow`.
- Pagina hospedada `public/extension-auth.html` para autenticar con Firebase Auth y volver al background de la extension.
- Permiso `identity` en manifiestos.
- Boton `Entrar con Google` en el panel.
- Login email/password como alternativa.

#### Corregido

- Renovacion de token en la extension acepta respuestas `snake_case` de Secure Token API.
- Separacion entre manifiesto Chrome/base y `manifest.firefox.json`.

#### Desplegado

- Firebase Hosting desplegado para publicar `extension-auth.html`.

#### Validado

- Pagina `https://asistente-lobby.web.app/extension-auth.html` responde correctamente.
- `web-ext lint` para Firefox sin errores bloqueantes.

### 2026-06-19 18:35 CLT - Documentos de seguimiento

#### Agregado

- `CHANGELOG.md` para registrar cambios del proyecto.
- `PENDIENTES.md` para mantener backlog tecnico y funcional.

### 2026-06-19 19:40 CLT - Solicitudes de acceso y gestion de appUsers

#### Agregado

- Endpoint `POST /api/access-requests` para que usuarios autenticados sin autorizacion soliciten acceso.
- Endpoints admin para listar, aprobar y rechazar solicitudes de acceso.
- Endpoints admin para listar, crear, actualizar, desactivar y reactivar `appUsers`.
- Boton `Solicitar acceso` en la extension cuando la API responde `Usuario no autorizado` o `Usuario desactivado`.
- Seccion `Accesos` en el portal admin para aprobar solicitudes y gestionar usuarios autorizados.
- Auditoria para acciones de acceso.

#### Cambiado

- El alta de operadores deja de depender de Firebase Console despues del primer admin bootstrap.
- La autorizacion distingue entre autenticacion Firebase valida y usuario autorizado en `appUsers`.

#### Desplegado

- Cloud Functions y Hosting desplegados con gestion de accesos.

### 2026-06-19 19:55 CLT - Ownership de lobbyUsers por appUser

#### Agregado

- Campos `ownerUid` y `ownerEmail` en `lobbyUsers` para asignar cada registro a un `appUser`.
- Campos `createdByUid` y `updatedByUid` en `lobbyUsers`.
- Filtro `Dueño` en el portal admin.
- Selector `Usuario dueño` en formulario de `lobbyUsers`.
- Selector `Dueño por defecto` en importacion CSV/JSON.
- Columna `Dueño` en tabla de `lobbyUsers`.

#### Cambiado

- Los operadores solo pueden buscar/ver/editar/desactivar `lobbyUsers` asignados a su propio `uid`.
- Los admins pueden ver todos los `lobbyUsers` y reasignar dueño desde el portal.
- Los registros nuevos de `lobbyUsers` requieren dueño activo en `appUsers`.

#### Desplegado

- Cloud Functions y Hosting desplegados con scoping por `ownerUid`.

### 2026-06-19 20:00 CLT - Acceso directo al portal desde extension

#### Agregado

- Boton `Abrir portal admin` en el panel de la extension para usuarios con sesion activa.

#### Validado

- Sintaxis de `extension/src/content.js` con `node --check`.
- Carga basica de extension en Chromium headless.

### 2026-06-19 20:10 CLT - Vista limitada para operadores en portal

#### Agregado

- Vista limitada para usuarios `operator` en el portal.
- Operadores pueden crear, editar, importar y desactivar solo sus propios `lobbyUsers`.

#### Cambiado

- El portal ya no bloquea a `operator`.
- Para `operator`, se ocultan `Accesos`, filtro de dueño, selector de dueño y dueño por defecto en importacion.
- `GET /api/lobby-users` permite `operator` con scope propio.

#### Desplegado

- Cloud Functions y Hosting desplegados con soporte para portal de operadores.

### 2026-06-19 20:20 CLT - Cache-busting del portal

#### Corregido

- `admin.html` ahora carga `admin.js` con version `?v=20260619-operator-portal` para evitar que navegadores reutilicen el JS anterior.

#### Desplegado

- Hosting desplegado para publicar el cache-busting.

### 2026-06-19 20:25 CLT - Actualizacion de pendientes

#### Cambiado

- `PENDIENTES.md` reorganizado con pruebas pendientes por rol, mejoras de producto, publicacion y seccion `Implementado recientemente`.
