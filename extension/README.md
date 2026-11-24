# Asistente Lobby Extension

Extension de navegador que reemplaza el bookmarklet actual para asistir el llenado de formularios en Ley Lobby.

## Alcance actual

- Sitios soportados: `leylobby.gob.cl` y el formulario de audiencia de `camara.cl`.
- Firebase fijo: `https://asistente-lobby.web.app`.
- Login principal: Google mediante Firebase Auth y `identity.launchWebAuthFlow`.
- Login alternativo: email/password de Firebase Auth.
- Datos sensibles: consultados por Cloud Functions con token Firebase.
- Modal de asistentes: manejado mediante `page-bridge.js` en el contexto de la pagina.

## Instalacion en Chrome

1. Abre `chrome://extensions`.
2. Activa `Developer mode`.
3. Presiona `Load unpacked`.
4. Selecciona la carpeta `extension/`.
5. Abre `https://www.leylobby.gob.cl/solicitud/audiencia` y continua hasta el formulario final.

## Instalacion en Firefox

Para pruebas de desarrollo, genera los paquetes como se indica abajo, descomprime
el ZIP de Firefox en una carpeta y selecciona su `manifest.json` desde
`about:debugging#/runtime/this-firefox` > `Load Temporary Add-on`. La instalacion
temporal desaparece al reiniciar Firefox. Para una instalacion persistente se
necesita un complemento firmado por Mozilla.

## Preparar paquetes para un piloto

En el equipo de desarrollo, con Python 3 instalado, desde la raiz del proyecto:

```bash
python3 extension/package.py
python3 extension/test-package.py
node extension/test-auth-redirects.js
node extension/test-panel.js
node extension/test-background.js
```

Se crean `extension/dist/asistente-lobby-chrome.zip` y
`extension/dist/asistente-lobby-firefox.zip`. En Windows usa `py` si corresponde.
No se sobrescriben paquetes existentes: elimina o mueve los archivos anteriores,
o indica un directorio distinto con `--output`. Los ZIP contienen solo el
manifiesto correspondiente y `src/`; aun no estan firmados ni publicados.
Se pueden enviar a las tiendas para su revision y firma, una vez completadas las
validaciones de publicacion y los datos de identidad y privacidad.

Para Chrome en desarrollo, descomprime el ZIP y carga su carpeta con `Load unpacked`.
No distribuyas estos ZIP como instaladores definitivos: Chrome requiere una via
compatible con sus politicas y Firefox necesita firma para instalacion permanente.

### Configurar el login Google antes de desplegar

`public/extension-auth-redirects.js` contiene la lista de URL de retorno exactas
autorizadas y comienza vacia. **Con la lista vacia, el login Google desde la
extension queda deshabilitado** al publicar Hosting. No despliegues esa pagina
hasta registrar las URL de todas las instalaciones que deben seguir funcionando.

1. Confirma las identidades de Chrome y Firefox y prepara las versiones que usara
   el piloto. Conserva el ID de Firefox del manifiesto para futuras actualizaciones.
2. Obtiene en cada navegador la URL completa de
   `identity.getRedirectURL("firebase")` desde el contexto de la extension.
   Verifica que pertenezca al paquete autorizado, no a otra extension ni a un
   paquete temporal con una identidad distinta. En Chrome, abre la inspeccion
   del service worker desde `chrome://extensions` y ejecuta en su consola
   `chrome.identity.getRedirectURL("firebase")`. En Firefox, inspecciona el
   complemento desde `about:debugging` y ejecuta en la consola de su contexto
   de fondo `browser.identity.getRedirectURL("firebase")`.
3. Agrega esas URL exactas al arreglo `Object.freeze([...])` de
   `public/extension-auth-redirects.js`, ejecuta las pruebas y verifica el login
   en Chrome y Firefox antes de distribuir. Un cambio de identidad requiere
   registrar la nueva URL antes de migrar a los usuarios.

El acceso a los registros sigue requiriendo autorizacion individual en Firebase.

## Uso

1. Abre el formulario final de solicitud de audiencia en Ley Lobby.
2. Presiona el boton flotante `Abrir Asistente Lobby`.
3. Usa el JSON manual o inicia sesion para buscar usuarios en Firebase.
   Usa los botones de pagina para recorrer las coincidencias; cada pagina reemplaza los usuarios cargados en el panel.
4. Selecciona el solicitante y presiona `Rellenar formulario principal`.
5. Selecciona el usuario para modal y presiona `Abrir y rellenar modal`.
6. Usa `Minimizar` si necesitas recuperar espacio en pantalla.
7. Revisa manualmente la informacion.
8. Presiona `Guardar` o `Solicitar` manualmente solo si corresponde.

### Camara de Diputadas y Diputados

1. Abre `https://www.camara.cl/transparencia/FormularioSolicitudAudiencia.aspx`.
2. Carga o pega los usuarios y presiona `Rellenar formulario principal`.
3. Para una empresa o entidad solicitante, entrega `solicitud.solicitante` en el JSON.
4. Usa `Rellenar asistente` y presiona `Agregar` manualmente despues de revisar.
5. Resuelve reCAPTCHA y presiona `Enviar` manualmente solo si corresponde.

`solicitud.solicitante` acepta `tipo` (`persona_natural`, `persona_juridica` o
`entidad`), identidad, email, `telefono`, `telefonoAlternativo` e
`identificacion: "codigo"` cuando no se usa RUT. Los telefonos se esperan como
`+569XXXXXXXX`.

Para representados de Camara, usa paises ISO-3 (`CHL`, `ARG`) y completa
`identificacion: "codigo"` junto con `identificador` solo cuando no exista RUT.

## Autenticacion

La extension usa Google como acceso principal. El boton `Entrar con Google` abre `https://asistente-lobby.web.app/extension-auth.html` mediante la API `identity` del navegador y vuelve al background de la extension con los tokens de Firebase.

Email/password queda disponible como alternativa. Si aparece `PASSWORD_LOGIN_DISABLED`, habilita `Email/Password` en Firebase Console > Authentication > Sign-in method o usa Google.

El acceso operativo sigue dependiendo de `appUsers/{uid}`. Iniciar sesion con Google no da permisos si el usuario no existe como `active: true` con rol valido.

Cada registro `lobbyUsers` tiene un dueño (`ownerUid`) asociado a un `appUsers/{uid}`. La extension solo devuelve registros cuyo `ownerUid` coincide con el usuario autenticado, salvo usuarios admin.

Si la cuenta no esta autorizada, la extension muestra `Solicitar acceso`. Esa accion crea una solicitud pendiente para que un administrador la revise desde `/admin.html`.

## Alta de usuarios

Despues del primer admin bootstrap manual, las altas se administran desde el portal admin:

1. El usuario intenta entrar con Google desde la extension.
2. Si no tiene autorizacion, presiona `Solicitar acceso`.
3. Un admin abre `https://asistente-lobby.web.app/admin.html`.
4. En la seccion `Accesos`, aprueba la solicitud como `operator` o `admin`, o la rechaza.
5. El usuario aprobado puede volver a la extension y cargar usuarios desde Firebase.

Los usuarios `operator` tambien pueden entrar a `/admin.html`; veran una vista limitada para administrar solo sus propios `lobbyUsers`. Los controles de accesos y seleccion de dueño quedan disponibles solo para `admin`.

## Restricciones intencionales

- La extension no presiona `Solicitar`.
- La extension no presiona `Guardar`.
- La extension no toca Turnstile ni captcha.
- La extension no ejecuta JavaScript remoto.
- El content script no recibe tokens Firebase.

## Notas de desarrollo

- `src/background.js` maneja login, token y API.
- `src/content.js` renderiza el panel y coordina acciones.
- `src/page-bridge.js` accede a `window.SolicitudesAudienciaAdmin` y `window.item`.
- `src/sites/leylobby/form-filler.js` contiene la logica especifica del formulario Ley Lobby.
- `src/sites/camara/form-filler.js` contiene la logica del formulario de Camara.
- Para futuros formularios, agregar nuevos adaptadores bajo `src/sites/`.
