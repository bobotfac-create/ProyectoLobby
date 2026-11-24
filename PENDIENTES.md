# Pendientes de Implementacion

Backlog tecnico y funcional para evolucionar Asistente Lobby.

## Media prioridad

- Comprobar el paquete actualizado con los validadores de Chrome y Firefox antes de publicarlo.
- Revisar accesibilidad del panel:
  - foco visible,
  - navegacion por teclado,
  - contraste,
  - labels claros,
  - estados de error.
- Mejorar estado de carga del login Google y busqueda Firebase.
- Agregar notificaciones visuales mas persistentes para solicitud de acceso pendiente.
- Agregar filtros por rol/estado en la tabla de usuarios autorizados.
- Agregar reasignacion masiva de dueño para `lobbyUsers` si crece la base de datos.
- Agregar opcion para que admin cree `lobbyUsers` directamente desde una solicitud o plantilla predefinida.
- Agregar versionado formal de la extension.
- Definir identidades finales y registrar las URL de autenticacion autorizadas antes de desplegar Hosting.
- Firmar y validar paquetes para Chrome y Firefox; documentar instalacion y actualizacion para usuarios no tecnicos.
- Revisar la declaracion de datos de Firefox segun el tratamiento real y las politicas vigentes.

## Baja prioridad

- Agregar iconos reales para la extension.
- Recordar preferencia de panel abierto/minimizado por pestaña o sesion.
- Mejorar diseno visual del panel sin aumentar interferencia sobre el formulario.
- Agregar opcion de limpiar sesion y datos temporales desde el panel.
- Revisar si conviene mantener email/password o retirarlo cuando Google este estable.
- Agregar historial visible de aprobaciones/rechazos por usuario.
- Evaluar retiro definitivo del flujo email/password si Google queda estable.

## Implementado recientemente

- Empaquetado reproducible por navegador y validacion de destinos exactos para autenticacion Google.
- La extension admite el formulario de solicitud de audiencia de la Camara de
  Diputadas y Diputados mediante un adaptador propio.
- Portal admin permite entrada de usuarios `operator` con vista limitada.
- Backend permite a `operator` listar, crear, editar, importar y desactivar solo sus propios `lobbyUsers`.
- `lobbyUsers` usa `ownerUid`/`ownerEmail` para separar datos por operador.
- Portal admin permite a `admin` filtrar por dueño y asignar dueño al crear/importar `lobbyUsers`.
- `admin.html` usa cache-busting para cargar la version nueva de `admin.js`.

## Futuro

- Agregar adaptador para un tercer formulario.
- Generalizar configuracion del panel por adaptador.
- Agregar pruebas automatizadas de selectores por sitio/formulario.
- Evaluar publicacion en Chrome Web Store.
- Evaluar publicacion en Firefox Add-ons.

## Riesgos a monitorear

- Completar el piloto de Render siguiendo `RENDER.md`: credenciales, URL, permisos de extension, publicacion y pruebas reales.
- Validar la actualizacion mayor de Firebase Admin y Functions con Authentication y Firestore en un entorno de pruebas antes de desplegar.
- Revisar las alertas moderadas de dependencias de desarrollo de Firebase CLI cuando haya versiones compatibles corregidas.
- El filtrado de texto recorre documentos en lotes; evaluar un indice de busqueda si crecen los costos o la latencia.
- La auditoria es de mejor esfuerzo: una falla al escribir el log no cancela la operacion.
- Validar consultas Firestore e integracion de transacciones en un entorno de pruebas.
- La lista inicial de destinos de autenticacion esta vacia: desplegarla sin configuracion bloquearia el login Google de la extension.
- Cambios de DOM o JS interno de Ley Lobby pueden romper selectores o `window.SolicitudesAudienciaAdmin`.
- Cambios de politicas de Chrome/Firefox pueden afectar `identity.launchWebAuthFlow`.
- Usuarios autenticados con Google igualmente requieren documento valido en `appUsers`; si no existe, la API negara acceso.
- `innerHTML` en el panel puede ser aceptable para uso interno, pero conviene endurecerlo antes de publicacion publica.
