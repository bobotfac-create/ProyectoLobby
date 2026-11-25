# Piloto: API en Render y datos en Firebase

La API Express puede ejecutarse en Render conservando Firebase Authentication y
Firestore. La preparacion local no modifica el proyecto remoto ni activa servicios.

## 1. Preparar repositorio privado

Crear un repositorio GitHub privado y vacio. Antes del primer commit revisar todos
los archivos que se incluiran: `HAR/`, perfiles de navegador, paquetes generados,
archivos de credenciales y `.env` no deben subirse. `.gitignore` cubre nombres
habituales, pero no identifica automaticamente todos los secretos o datos privados.
Las capturas crudas de `source-analysis/` y la planilla local tambien se excluyen;
se conservan los resumenes Markdown y los archivos locales no se eliminan.
No incluir `public/firebase-config.js` en el repositorio; Firebase Hosting necesita
su propia configuracion web ya existente.

## 2. Crear servicio en Render

Conectar el repositorio privado y crear un **Web Service** con estas opciones:

- Root Directory: `functions`
- Runtime: Node.js 22 (la version esta declarada en `functions/package.json`).
- Build Command: `npm ci --omit=dev`
- Start Command: `npm start`
- Health Check Path: `/api/health`
- Plan: Free para pruebas; el servicio puede dormirse por inactividad.

En Firebase / Google Cloud, un administrador debe crear o autorizar una cuenta de
servicio del proyecto `asistente-lobby` con los permisos minimos necesarios para
los metodos usados de Firestore y consulta de usuarios de Authentication. Verificar
las politicas de la organizacion antes de crear una clave. Configurar el JSON
completo de esa cuenta como variable secreta `FIREBASE_SERVICE_ACCOUNT_JSON` en
Render. Conservar los saltos de linea codificados del JSON y no pegar la clave en
archivos del proyecto, GitHub, registros o conversaciones. Render debe recibir la
variable antes de arrancar; el proceso rechaza JSON invalido o de otro proyecto.
Si la organizacion no permite crear claves, configurar una alternativa de
credenciales compatible con Firebase Admin antes de intentar el despliegue.

Por defecto la API acepta los origenes existentes del portal y extensiones. Si se
usa `ALLOWED_ORIGINS`, listar los origenes web necesarios separados por comas;
esta variable reemplaza la lista web predeterminada. La API aun verifica token,
rol y propiedad de cada registro. El endpoint `/api/health` solo comprueba que el
proceso responde; no valida credenciales ni conectividad con Firebase.

## 3. Configuracion de clientes para el piloto

El portal y la extension estan configurados localmente para
`https://proyectolobby.onrender.com/api`, y los manifiestos autorizan solo ese
dominio de Render. La version 0.1.2 necesita instalarse o publicarse como paquete
nuevo; las versiones anteriores siguen llamando a la API antigua. Comprobar
`https://proyectolobby.onrender.com/api/health` antes de probar la integracion.

Preparar Hosting con `public/api-config.js` y el portal actualizado. La lista en
`public/extension-auth-redirects.js` incluye los destinos de la extension Chrome y
la instalacion temporal de Firefox 0.1.2. Confirmar el destino de la version
firmada de Firefox antes de distribuirla y probar ambos inicios de sesion.

No desplegar Hosting, Functions ni reglas automaticamente. Coordinar la
publicacion explicita con el administrador, tras verificar el servicio y el flujo
de autenticacion. El cliente de bookmarklet legado no esta migrado a Render.

## 4. Validar el piloto

Ejecutar `npm run check` y `npm test` en `functions/`, y las pruebas descritas en
`extension/README.md`. Antes de invitar usuarios, probar con datos ficticios:
login, renovacion, acceso denegado, roles, propiedad por usuario, importacion,
paginacion y auditoria. Las pruebas locales no sustituyen estas pruebas de
integracion con Firebase ni la revision de indices Firestore y permisos IAM.
