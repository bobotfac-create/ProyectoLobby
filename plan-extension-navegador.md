# Plan de implementacion: Extension Asistente Lobby

## Objetivo

Transformar la herramienta actual basada en bookmarklet en una extension de navegador llamada **Asistente Lobby**, reemplazando completamente el bookmarklet para el flujo de `leylobby.gob.cl`.

La primera version funcionara solo en Ley Lobby, pero la arquitectura debe quedar preparada para agregar posteriormente otros formularios con logicas distintas sin reescribir la extension completa.

## Alcance inicial

- Sitio soportado: `https://www.leylobby.gob.cl/*` y `https://leylobby.gob.cl/*`.
- Firebase Hosting/API fijo: `https://asistente-lobby.web.app`.
- Navegadores objetivo: Chrome y Firefox.
- Arquitectura robusta con `background.js` manejando login, token y llamadas API.
- La pagina Ley Lobby no debe recibir tokens ni credenciales.
- La extension no debe cargar JavaScript remoto.
- Se mantiene revision humana antes del envio.

## Reglas operativas

La extension debe conservar las mismas restricciones de seguridad operacional del bookmarklet:

- No presionar `Solicitar`.
- No presionar `Guardar` en modales.
- No tocar Turnstile, captcha ni tokens antispam.
- No hacer requests directos al backend de Ley Lobby.
- No incluir datos sensibles embebidos en la extension.
- Todo acceso a datos sensibles debe pasar por Firebase Auth, Cloud Functions y Firestore.

## Arquitectura objetivo

```text
Extension Asistente Lobby
  -> content script
       -> detecta sitio/formulario actual
       -> renderiza panel
       -> llena campos del DOM accesibles
       -> conversa con page bridge para APIs internas de la pagina
  -> page bridge
       -> corre en el contexto real de la pagina
       -> accede a window.SolicitudesAudienciaAdmin y window.item
       -> no accede a Firebase ni tokens
  -> background
       -> maneja login, token y sesion
       -> llama a Cloud Functions API
       -> nunca expone tokens a Ley Lobby
  -> Firebase Hosting / Cloud Functions
       -> valida Firebase ID token
       -> aplica roles y auditoria
       -> lee/escribe Firestore con Admin SDK
```

## Estructura propuesta

```text
extension/
  manifest.chrome.json
  manifest.firefox.json
  src/
    background.js
    content.js
    page-bridge.js
    config.js
    shared/
      api-client.js
      browser-api.js
      panel.js
      payload.js
    sites/
      leylobby/
        adapter.js
        detector.js
        form-filler.js
        modal-filler.js
        selectors.js
  assets/
    icon-16.png
    icon-32.png
    icon-48.png
    icon-128.png
```

## Configuracion fija

```js
export const EXTENSION_NAME = "Asistente Lobby";
export const FIREBASE_BASE_URL = "https://asistente-lobby.web.app";
```

No se debe pedir al usuario la URL de Firebase. El proyecto es fijo.

## Diseno por adaptadores

Aunque la primera version solo soportara Ley Lobby, la extension debe implementar una interfaz por adaptador para permitir nuevos formularios en el futuro.

Ejemplo conceptual:

```js
export const leylobbyAdapter = {
  id: "leylobby-audiencia",
  label: "Ley Lobby - Solicitud de audiencia",
  matches: [
    "https://www.leylobby.gob.cl/solicitud/audiencia*",
    "https://leylobby.gob.cl/solicitud/audiencia*"
  ],
  detect() {},
  createPanelConfig() {},
  fillMainForm(payload, requesterIndex) {},
  fillAssistantModal(user) {}
};
```

Cuando se agreguen los otros formularios, se deben incorporar nuevos adaptadores bajo `src/sites/`, sin modificar la arquitectura base.

## Responsabilidades por modulo

### `background.js`

- Mantener estado de autenticacion.
- Obtener, renovar o limpiar token.
- Ejecutar llamadas a `https://asistente-lobby.web.app/api`.
- Atender mensajes del content script:
  - `auth:getState`
  - `auth:login`
  - `auth:logout`
  - `api:me`
  - `api:searchLobbyUsers`
  - `api:getLobbyUser`
- Evitar que tokens lleguen al content script salvo que sea estrictamente necesario. La opcion preferida es que el content script solo reciba respuestas ya procesadas.

### `content.js`

- Detectar el adaptador activo.
- Inyectar `page-bridge.js` cuando el adaptador lo requiera.
- Renderizar el panel de la extension.
- Coordinar acciones entre panel, adaptador y background.
- Llenar campos del formulario principal cuando sea posible desde content script.
- Enviar mensajes al page bridge para acciones que requieren contexto real de la pagina.

### `page-bridge.js`

- Ejecutarse en el contexto real de Ley Lobby.
- Acceder a `window.SolicitudesAudienciaAdmin.openItemModal()`.
- Actualizar `window.item` cuando sea necesario para que el sitio reconozca los datos del modal.
- Responder solo a mensajes con tipos conocidos.
- No almacenar datos sensibles.
- No llamar a Firebase.
- No recibir tokens.

### `shared/api-client.js`

- Construir URLs de la API fija.
- Centralizar rutas:
  - `/api/me`
  - `/api/search-lobby-users`
  - `/api/lobby-users/:id`
- Manejar errores normalizados.
- Ejecutarse preferentemente desde `background.js`.

### `shared/panel.js`

- Renderizar UI comun.
- Mantener modo manual JSON.
- Mostrar busqueda Firebase.
- Mostrar selectores de solicitante y asistente.
- Mostrar resultados, advertencias y errores.
- Recibir configuracion desde el adaptador activo.

### `sites/leylobby/*`

- Contener toda la logica especifica de Ley Lobby.
- Centralizar selectores del formulario.
- Migrar aqui la logica actual de `bookmarklet-dev.js`.
- Mantener separadas las funciones de formulario principal y modal.

## Migracion desde archivos actuales

### Desde `bookmarklet-dev.js`

Migrar y separar:

- Normalizacion de payload.
- Ejemplos de datos.
- Llenado de formulario principal.
- Llenado de modal de asistente.
- Render de panel.
- Advertencias de revision manual.

Eliminar o reemplazar:

- Loader remoto de Firebase.
- `prompt()` para URL de Firebase.
- `localStorage` para base URL Firebase.
- Dependencia del bookmarklet.

### Desde `public/lobby-api-client.js`

Reutilizar la idea de cliente API, pero no cargar este archivo remotamente desde la pagina.

La nueva version debe vivir empaquetada en la extension y ejecutarse desde `background.js`.

### Desde `public/auth.html`

Revisar si se reutiliza como pagina de login auxiliar o si se migra el login a un flujo propio de extension.

La prioridad es que el token llegue al background de la extension, no al sitio Ley Lobby.

### Desde `functions/index.js`

Mantener la API y el modelo de permisos actuales.

Revisar CORS para soportar llamadas desde extension si el navegador envia origen `chrome-extension://...` o `moz-extension://...`.

## Login recomendado

La implementacion robusta debe priorizar este flujo:

1. Content script pide al background ejecutar una accion que requiere API.
2. Background revisa si tiene token valido.
3. Si no hay token, inicia login.
4. Login devuelve token al background.
5. Background llama a Cloud Functions con `Authorization: Bearer <token>`.
6. Background devuelve al content script solo los datos necesarios.

Opciones tecnicas a evaluar durante implementacion:

- `chrome.identity.launchWebAuthFlow` / `browser.identity.launchWebAuthFlow`.
- Reutilizar `https://asistente-lobby.web.app/auth.html` adaptado para extension.
- Login email/password como primer flujo si Google OAuth requiere configuracion adicional.

## Permisos iniciales

Manifest inicial:

```json
{
  "name": "Asistente Lobby",
  "permissions": ["storage"],
  "host_permissions": [
    "https://www.leylobby.gob.cl/*",
    "https://leylobby.gob.cl/*",
    "https://asistente-lobby.web.app/*"
  ]
}
```

Agregar `identity` solo si el flujo de login elegido lo requiere.

No pedir permisos para los otros dos formularios futuros hasta que se implementen.

## Compatibilidad Chrome y Firefox

- Usar Manifest V3 como base.
- Mantener manifiestos separados si Firefox requiere ajustes.
- Crear wrapper de APIs:

```js
export const browserApi = globalThis.browser || globalThis.chrome;
```

- Evitar APIs especificas de un navegador en la primera version.
- Evitar `eval`, scripts inline y codigo remoto.

## Plan de fases

### Fase 1: Extension minima sin Firebase

- Crear carpeta `extension/`.
- Crear manifiestos Chrome/Firefox.
- Inyectar content script solo en Ley Lobby.
- Mostrar panel `Asistente Lobby`.
- Migrar modo JSON manual.
- Llenar formulario principal.
- Verificar que no se toca `Solicitar`, `Guardar` ni Turnstile.

### Fase 2: Page bridge para modal

- Inyectar `page-bridge.js`.
- Implementar canal de mensajes content script <-> page bridge.
- Migrar apertura y llenado del modal.
- Mantener advertencia de guardado manual.

### Fase 3: Background y API

- Crear `background.js`.
- Implementar cliente API fijo contra `https://asistente-lobby.web.app/api`.
- Mover llamadas Firebase al background.
- Conectar busqueda de usuarios y obtencion de detalle.

### Fase 4: Login robusto

- Implementar flujo de autenticacion elegido.
- Guardar token en memoria o almacenamiento de sesion.
- Reintentar una vez ante `401`.
- Agregar cierre de sesion.

### Fase 5: Ajustes backend

- Probar CORS desde Chrome y Firefox.
- Ajustar `functions/index.js` si hace falta permitir origen de extension.
- Mantener roles `admin`, `operator` y `disabled`.
- Mantener auditoria.

### Fase 6: Validacion navegador

- Probar Chrome unpacked.
- Probar Firefox temporary add-on.
- Validar pagina incorrecta.
- Validar pagina correcta.
- Validar JSON manual.
- Validar busqueda Firebase.
- Validar token expirado.
- Validar usuario sin permisos.

### Fase 7: Documentacion y retiro del bookmarklet

- Documentar instalacion manual.
- Documentar uso operativo.
- Marcar bookmarklet como obsoleto.
- Mantenerlo temporalmente solo como respaldo hasta que la extension sea estable.

## Preparacion para futuros formularios

No implementar ahora los otros formularios.

Si se implementan antes de conocerlos bien, aumentan el riesgo y la complejidad innecesaria. La extension debe quedar preparada con adaptadores, pero la primera version debe soportar solo Ley Lobby.

Cuando se agregue un nuevo formulario:

1. Agregar host permission del nuevo dominio.
2. Agregar `content_script.matches` o reglas dinamicas.
3. Crear `src/sites/nuevo-formulario/adapter.js`.
4. Implementar detector, selectores y llenadores propios.
5. Reutilizar background, API, login y panel compartido.

## Riesgos principales

- El content script no accede directamente a variables `window` de la pagina por aislamiento de extensiones. Mitigacion: `page-bridge.js`.
- Firebase Auth con Google puede requerir configuracion especifica para extensiones. Mitigacion: evaluar `launchWebAuthFlow` y fallback email/password.
- Chrome Web Store y Firefox Add-ons pueden rechazar codigo remoto. Mitigacion: empaquetar todo el JS en la extension.
- Cambios del DOM de Ley Lobby pueden romper selectores. Mitigacion: centralizar selectores en `sites/leylobby/selectors.js`.
- CORS puede bloquear llamadas desde origen de extension. Mitigacion: ajustar `functions/index.js` despues de probar.

## Criterios de aceptacion inicial

- La extension se carga en Chrome como unpacked.
- La extension se carga en Firefox como temporary add-on.
- El panel aparece solo en Ley Lobby.
- El modo JSON manual funciona.
- La busqueda Firebase funciona con usuario autorizado.
- El formulario principal se rellena correctamente.
- El modal de asistente se abre y rellena correctamente.
- La extension no presiona `Guardar`.
- La extension no presiona `Solicitar`.
- La extension no toca Turnstile/captcha.
- El token no queda expuesto a la pagina Ley Lobby.
- El bookmarklet ya no es necesario para el flujo normal.
