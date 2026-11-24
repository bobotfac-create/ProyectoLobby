# Contexto para agentes de IA

Ultima revision: 2026-09-01.

Lee este archivo antes de explorar el proyecto. No recorras todo el repositorio
por defecto: abre solamente los archivos de la seccion relacionada con la tarea.
Si el codigo contradice este documento, el codigo es la fuente de verdad y este
archivo debe actualizarse en el mismo cambio.

## Resumen

Asistente Lobby ayuda a operadores y administradores a completar solicitudes de
audiencia en `leylobby.gob.cl` y Camara de Diputadas y Diputados con datos privados almacenados en Firebase. La
implementacion principal es una extension Chrome/Firefox, respaldada por una API
en Cloud Functions y un portal web de administracion.

El proyecto usa JavaScript sin framework. No hay bundler, TypeScript, Docker
ni CI/CD. Existe un repositorio Git local y una prueba automatizada basica de
integridad del backend en `functions/test-integrity.js`.

## Reglas de producto no negociables

- La herramienta asiste; una persona siempre revisa y decide la accion final.
- Nunca presionar automaticamente `Guardar` ni `Solicitar`.
- Nunca manipular Turnstile, captcha ni sus tokens.
- No exponer tokens Firebase al contexto JavaScript de Ley Lobby.
- Mantener el honeypot `[name="website"]` vacio.
- Minimizar la interferencia visual sobre el formulario.
- Agregar formularios futuros mediante adaptadores, no reescribiendo el flujo.
- Mantener contraste, teclado, foco visible y textos claros como base de acceso.

La fuente de verdad del producto es `PRODUCT.md`.

## Arquitectura actual

| Pieza | Ruta | Responsabilidad |
|---|---|---|
| Extension MV3 | `extension/` | Login, panel, consulta de usuarios y llenado guiado |
| Background | `extension/src/background.js` | OAuth, sesion, renovacion de tokens y llamadas a la API |
| Content script | `extension/src/content.js` | Panel y coordinacion de adaptadores |
| Adaptador | `extension/src/sites/leylobby/form-filler.js` | Selectores y llenado del formulario principal |
| Adaptador | `extension/src/sites/camara/form-filler.js` | Selectores y llenado en Camara |
| Page bridge | `extension/src/page-bridge.js` | Acceso controlado al modal y variables de la pagina |
| Payload compartido | `extension/src/shared/payload.js` | Ejemplos, normalizacion, etiquetas y escape HTML |
| API | `functions/app.js` | Express, autenticacion, roles, ownership y auditoria |
| Entradas API | `functions/index.js`, `functions/server.js` | Cloud Functions y servidor independiente para Render |
| Portal web | `public/admin.html`, `public/admin.js` | Gestion de accesos y usuarios Lobby |
| Persistencia | Firestore | `appUsers`, `accessRequests`, `lobbyUsers`, `auditLogs` |
| Hosting | `public/`, `firebase.json` | Portal, login y rewrite de `/api/**` a la Function `api` |

Firebase usa el proyecto `asistente-lobby`, la URL
`https://asistente-lobby.web.app` y Functions en `us-central1`.

## Flujo principal

1. El operador abre el formulario de Ley Lobby o de Camara compatible.
2. El manifiesto carga `config.js`, `payload.js`, los adaptadores y `content.js`.
3. El content script muestra un boton flotante y el panel inicia minimizado.
4. El operador pega JSON o inicia sesion y busca usuarios privados.
5. El content script pide la operacion al background; nunca recibe tokens.
6. El background llama a la API con un ID token Firebase.
7. El adaptador rellena el formulario principal y dispara `input`, `change` y `blur`.
8. En Ley Lobby, el content script inyecta `page-bridge.js` para el modal; Camara usa campos directos.
9. Content y bridge se comunican mediante `window.postMessage` solo en Ley Lobby.
10. El operador revisa, resuelve Turnstile o reCAPTCHA y guarda o envia manualmente.

Detalles fragiles del sitio externo:

- Formulario principal: `#SolicitudesAudienciaForm`.
- Boton que la herramienta no debe pulsar: `#btnSolicitar`.
- Elegir pais antes de pasaporte; el sitio puede reemplazar el input.
- El sitio mantiene estado en `window.solicitud` y `window.SolicitudesAudienciaAdmin`.
- `asistira=true` puede copiar al solicitante como invitado y abrir el modal.
- Se recomienda `asistira: null` cuando la decision debe quedar manual.
- Tipos actuales: `lobista`, `gestor` y `pasivo`.

Detalles de Camara:

- Formulario: `#ff`; panel ASP.NET: `#ContentPlaceHolder1_ContentPlaceHolder1_UpdatePanel3`.
- Los cambios de tipo, nacionalidad, identificacion y region pueden disparar postbacks.
- Nunca pulsar `BtnAgregarAsistentes`, `btnEnviar` ni reCAPTCHA.
- Ver `source-analysis/analisis_camara.md` para selectores.

Para investigar selectores abre primero `source-analysis/analisis_fuente.md`. Los
snapshots se obtuvieron el 2026-06-11 y pueden no representar el sitio actual.

## Extension

Puntos de entrada:

- `extension/manifest.json`: manifiesto base y de Chrome.
- `extension/manifest.chrome.json`: copia especifica de Chrome.
- `extension/manifest.firefox.json`: variante Firefox.
- `extension/package.py`: genera ZIP reproducibles por navegador para revision y firma.
- `extension/src/background.js`: service worker; carga `src/api-config.js` para la URL de API.
- `extension/src/content.js`: content script.
- `extension/src/page-bridge.js`: script accesible desde la pagina.

El orden de scripts del manifiesto es significativo. Los modulos usan IIFEs,
`var` y el namespace global `AsistenteLobby`; conserva ese estilo al modificar
la extension. `background.js` duplica parte de la configuracion porque no carga
`config.js`.

Formatos de payload aceptados:

- Recomendado: `{ "solicitud": {...}, "usuarios": [...] }`.
- Legado: `{ "solicitud": {...}, "asistentes": [...] }`.
- JSON plano: se interpreta como datos de la solicitud.

Autenticacion:

- Google es el acceso principal mediante `identity.launchWebAuthFlow`.
- `public/extension-auth-redirects.js` define las URL de retorno exactas autorizadas; una lista vacia bloquea el login Google de la extension.
- Email/password es una alternativa.
- La sesion vive en `storage.session`, con fallback a `storage.local`.
- El background renueva tokens y reintenta una vez despues de un HTTP 401.
- Autenticarse no autoriza por si solo; debe existir un `appUsers/{uid}` activo.

## Backend y API

La API esta en `functions/app.js`, con entradas `index.js` para Cloud Functions y
`server.js` para Render. Usa Node.js 22, CommonJS, Express 4 y Firebase Admin
modular. El cuerpo JSON admite hasta 2 MB y la Function limita a 10 instancias.
El piloto de Render y la configuracion de URLs se describen en `RENDER.md`; no
supone que el servicio este desplegado. Las URLs predeterminadas siguen en Firebase.

Autorizacion:

- `verifyFirebaseAuth` valida el token para solicitar acceso.
- `authenticate` exige tambien un documento activo en `appUsers`.
- `admin` accede a todos los registros y puede asignar dueno.
- `operator` accede solo a registros cuyo `ownerUid` coincide con su UID.
- `disabled` no tiene acceso.
- El backend vuelve a comprobar ownership; no confiar en controles ocultos del portal.

Endpoints:

| Metodo y ruta | Acceso | Uso |
|---|---|---|
| `GET /api/health` | Publico | Estado del servicio |
| `POST /api/access-requests` | Firebase Auth | Crear o reabrir solicitud de acceso |
| `GET /api/me` | Autorizado | Usuario y rol actuales |
| `GET /api/access-requests` | Admin | Listar solicitudes |
| `POST /api/access-requests/:uid/approve` | Admin | Aprobar acceso |
| `POST /api/access-requests/:uid/reject` | Admin | Rechazar acceso |
| `GET /api/app-users` | Admin | Listar usuarios de la aplicacion |
| `POST /api/app-users` | Admin | Crear autorizacion |
| `PATCH /api/app-users/:uid` | Admin | Actualizar autorizacion |
| `POST /api/app-users/:uid/disable` | Admin | Desactivar usuario |
| `POST /api/app-users/:uid/enable` | Admin | Reactivar usuario |
| `GET /api/search-lobby-users` | Admin/operator | Buscar activos; retorna hasta 25 |
| `GET /api/lobby-users` | Admin/operator | Listar registros del portal |
| `GET /api/lobby-users/:id` | Admin/operator | Obtener detalle activo |
| `POST /api/lobby-users` | Admin/operator | Crear registro |
| `POST /api/lobby-users/import` | Admin/operator | Importar hasta 500; dry-run por defecto |
| `PATCH /api/lobby-users/:id` | Admin/operator | Actualizar registro |
| `POST /api/lobby-users/:id/disable` | Admin/operator | Baja logica |

Las respuestas siguen `{ ok: true|false, ... }`; los errores visibles estan en
espanol. No hay borrado fisico. `ALLOWED_ORIGINS` puede reemplazar los origenes
CORS predeterminados.

La busqueda y el listado de `lobbyUsers` recorren la coleccion autorizada por
lotes, ordenados por ID. Devuelven `nextCursor` cuando existe otra pagina; el
cursor se envia como parametro `cursor`. La busqueda devuelve hasta 25 y el
listado hasta 200 por defecto (maximo 500). El filtrado por texto se realiza
en memoria y puede requerir muchas lecturas si la coleccion crece.

## Datos Firestore

`firestore.rules` deniega todo acceso directo de clientes. Los datos pasan por
Firebase Admin SDK. `firestore.indexes.json` define el indice de estado y dueño.

| Coleccion | Contenido |
|---|---|
| `lobbyUsers/{id}` | Datos personales, clasificacion, representado, empleador, ownership y estado |
| `appUsers/{uid}` | Email, nombre, rol, estado y aprobacion |
| `accessRequests/{uid}` | Solicitud, estado, decision y revisor |
| `auditLogs/{autoId}` | Usuario, accion, registro, resultado y fecha |

Reglas relevantes de `lobbyUsers`:

- ID valido: `[a-zA-Z0-9_-]{2,80}`.
- Baja logica mediante `active: false`.
- Ownership mediante `ownerUid` y `ownerEmail`.
- Trazabilidad mediante `createdByUid`, `updatedByUid` y timestamps de servidor.
- `searchText` se normaliza a minusculas, sin tildes y con espacios compactados.
- Objetos principales: `representado` y `empleador`.

No hay migraciones ni esquema tipado. Revisa `LOBBY_USER_FIELDS` y
`sanitizeLobbyUserPayload()` antes de agregar campos.

## Portal web

- `public/admin.html`: estructura, estilos y carga del portal.
- `public/admin.js`: autenticacion, CRUD, roles, ownership e importacion CSV/JSON.
- `public/extension-auth.html`: OAuth hospedado para la extension.
- `public/auth.html`: login legado del bookmarklet.
- `public/lobby-api-client.js`: cliente legado del bookmarklet.
- `public/index.html`: landing minima, todavia centrada parcialmente en el flujo legado.
- `public/firebase-config.js`: configuracion web local ignorada por Git.

Admin ve accesos y todos los `lobbyUsers`. Operator usa el mismo portal con una
vista limitada a sus registros. El primer admin requiere bootstrap manual en
Firebase Auth y `appUsers/{uid}`.

## Desarrollo y despliegue

Backend, desde `functions/`:

```bash
npm ci
npm run check
npm test
npm run serve
npm run deploy
```

Firebase CLI es una dependencia de desarrollo local en `functions/`. Desde la
raiz se puede usar `npm --prefix functions exec -- firebase --version`; para
comandos del proyecto, usar `npm exec -- firebase ...` desde `functions/`.
La sesion de Firebase CLI y las credenciales por defecto de Firebase Admin son
independientes. El proyecto usa Node.js 22 para Functions.

Despliegue completo, desde la raiz:

```bash
npm --prefix functions exec -- firebase deploy --only firestore:rules,functions,hosting
```

Extension:

- Chrome: cargar `extension/` como unpacked.
- Firefox: generar el ZIP con `python3 extension/package.py`, descomprimirlo y cargarlo temporalmente.
- `python3 extension/test-package.py` y `node extension/test-auth-redirects.js` verifican paquetes y destinos de autenticacion.
- Los ZIP no estan firmados; aun no hay publicacion en stores.

Python solo para diagnostico:

- `main.py` abre Ley Lobby con Playwright.
- `test_cloudflare_normal_browser.py` realiza una prueba interactiva con perfil persistente.
- `requirements.txt` contiene Playwright y openpyxl.
- Playwright no es el flujo operativo porque Turnstile requiere control humano.

## Fuentes de verdad por tarea

| Tarea | Leer primero |
|---|---|
| Objetivo o UX | `PRODUCT.md`, luego el archivo de interfaz afectado |
| Extension o login | `extension/README.md`, manifiesto y script afectado |
| Formulario principal Ley Lobby | `form-filler.js`, `payload.js`, `analisis_fuente.md` |
| Formulario Camara | `sites/camara/form-filler.js`, `payload.js`, `analisis_camara.md` |
| Modal de asistentes | `content.js`, `page-bridge.js`, `lobby_app_key_snippets.txt` |
| API, roles u ownership | `functions/app.js`, `functions/index.js`, `firestore.rules` |
| Portal | `public/admin.html`, `public/admin.js` |
| Firebase o despliegue | `firebase.json`, `.firebaserc`, `functions/package.json` |
| Backlog | `PENDIENTES.md`, `CHANGELOG.md` |
| Bookmarklet legado | `bookmarklet-dev.js`, `bookmarklet-uso.md` |

## Archivos que normalmente deben ignorarse

No leas ni indexes estos directorios salvo que la tarea los mencione:

- `.venv/`: dependencias Python.
- `functions/node_modules/`: dependencias npm.
- `browser-profile-lobby/`: perfil local con cookies, historial y sesiones.
- `.firebase/`: cache de despliegue.
- `__pycache__/`: bytecode Python.
- `HAR/`: capturas de red potencialmente sensibles.
- `source-analysis/www.leylobby.gob.cl_*`: JS y librerias descargadas del sitio.

`bookmarklet.txt` es generado y codificado; editar `bookmarklet-dev.js` en su
lugar. Para entender los snapshots usa sus resumenes, no el HTML crudo.

## Convenciones

- Interfaz, errores y documentacion en espanol.
- Codigo actual mayormente ASCII; conserva el estilo del archivo.
- Backend CommonJS y rutas envueltas con `asyncHandler`.
- Extension sin imports, basada en IIFEs y `AsistenteLobby`.
- HTML dinamico debe escapar datos no confiables con `escapeHtml`.
- Firestore usa timestamps de servidor y bajas logicas.
- Mantener `CHANGELOG.md` y `PENDIENTES.md` al dia cuando cambie comportamiento.
- Hacer el cambio minimo en la fuente compartida, no parches repetidos por caller.

## Limitaciones conocidas

- La cobertura automatizada es limitada y no hay CI.
- Los selectores dependen de un DOM externo que puede cambiar sin aviso.
- La busqueda filtra en memoria y puede leer muchos documentos por pagina.
- La importacion procesa hasta 500 registros secuencialmente y puede quedar parcial.
- Bookmarklet y extension duplican logica y pueden divergir.
- Parte de la documentacion Firebase antigua describe el bookmarklet como flujo principal.
- Registros antiguos sin `ownerUid` no son visibles para operadores.
- `functions/app.js`, `public/admin.js` y `content.js` concentran muchas responsabilidades.

El backlog vigente esta en `PENDIENTES.md`. No implementes pendientes solo porque
aparecen aqui; hazlo unicamente cuando la tarea los requiera.

## Validacion minima

Despues de cambiar JavaScript propio, ejecutar al menos:

```bash
node --check functions/index.js
node --check functions/app.js
node --check functions/server.js
node --check extension/src/background.js
node --check extension/src/content.js
node --check extension/src/page-bridge.js
node --check extension/src/shared/payload.js
node --check extension/src/sites/leylobby/form-filler.js
node --check extension/src/sites/camara/form-filler.js
```

Limita la validacion a los archivos afectados cuando sea suficiente. No despliegues,
no abras navegadores interactivos y no modifiques datos Firebase salvo peticion expresa.

## Mantenimiento de este archivo

Actualiza `AGENTS.md` cuando cambien arquitectura, endpoints, colecciones, roles,
comandos, puntos de entrada o restricciones de producto. No copies detalles de
implementacion que ya se encuentran claramente en una fuente de verdad; enlazalos.
Conserva la fecha de revision y elimina informacion obsoleta en vez de acumularla.
