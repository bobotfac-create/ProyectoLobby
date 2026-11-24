# Posibles opciones de implementacion

Este documento resume tres alternativas para construir una automatizacion hibrida del formulario de Ley Lobby. El objetivo comun es completar formularios con ayuda automatica, pero dejar la revision, el captcha y el envio final en manos de una persona.

## 1. Playwright con navegador normal

**Estado: descartada para operacion real.**

Se probo usando navegador visible, navegador del sistema y perfil persistente dedicado. La pagina cargo correctamente, pero no fue posible resolver Cloudflare Turnstile manualmente dentro del navegador controlado por Playwright. Por eso esta opcion queda descartada para el flujo operativo de llenado y envio revisado por persona.

### Como funcionaria

Playwright abriria un navegador visible y controlaria la navegacion. En vez de usar el Chromium limpio que instala Playwright, se intentaria usar un navegador del sistema o un perfil persistente para parecerse mas al uso normal.

Flujo general:

1. Abrir navegador visible.
2. Entrar a `https://www.leylobby.gob.cl/solicitud/audiencia`.
3. Seleccionar institucion.
4. Completar solicitante principal.
5. Completar asistentes/invitados.
6. Detenerse antes de presionar `Solicitar`.
7. La persona revisa, resuelve Turnstile y envia manualmente.

### Ventajas

- Permite automatizar navegacion, busqueda de institucion y llenado completo.
- Es rapido de desarrollar porque ya existe una base con Python y Playwright.
- Permite registrar network, screenshots y errores facilmente.
- Puede leer directamente Excel o una base local desde Python.

### Desventajas

- El navegador sigue siendo controlado por automatizacion.
- Cloudflare Turnstile puede detectar el entorno automatizado aunque el usuario intente resolver el captcha manualmente.
- Puede fallar de manera variable segun IP, perfil, version del navegador, cookies o fingerprint.
- Requiere mantener selectores y esperas de Playwright.

### Riesgo con Cloudflare

Medio a alto. En pruebas iniciales, la pagina cargo correctamente, pero el captcha no pudo resolverse manualmente dentro del navegador controlado por Playwright. Esto sugiere que Turnstile podria estar detectando senales del entorno automatizado.

### Cuando conviene

No conviene para operacion real en este proyecto. Puede mantenerse solo como herramienta de diagnostico, investigacion de selectores, analisis de network o pruebas no vinculadas al envio final.

## 2. Bookmarklet como opcion ligera de asistente

### Como funcionaria

Un bookmarklet es un favorito del navegador que ejecuta JavaScript sobre la pagina abierta. El usuario abriria la pagina en su navegador normal, llegaria al formulario y luego haria click en el favorito para rellenar campos.

Flujo general:

1. La persona abre la pagina en Chrome, Chromium o Firefox normal.
2. La persona selecciona la institucion y llega al formulario.
3. La persona hace click en el bookmarklet.
4. El script rellena campos del formulario actual.
5. La persona revisa, resuelve Turnstile y envia manualmente.

### Ventajas

- Muy ligero y rapido de probar.
- Usa el navegador real del usuario, no un navegador controlado por WebDriver.
- Reduce el riesgo de bloqueo por automatizacion.
- No requiere instalar extension ni crear infraestructura compleja.
- Sirve como prototipo para validar selectores y reglas de llenado.

### Desventajas

- Por seguridad del navegador, no puede leer directamente un Excel local de forma comoda.
- Los datos tendrian que pegarse como JSON, cargarse desde una fuente permitida o quedar embebidos temporalmente.
- Menos comodo para procesar muchas solicitudes.
- Es mas dificil manejar multiples asistentes, estados, validaciones y errores complejos.
- El codigo del bookmarklet puede volverse incomodo de mantener si crece mucho.

### Riesgo con Cloudflare

Bajo a medio. Como se ejecuta dentro del navegador normal del usuario y no controla el envio ni el captcha, deberia parecerse mas a una interaccion humana normal. Aun asi, si el script hace demasiadas acciones instantaneas o repetitivas, podria generar comportamiento anomalo.

### Cuando conviene

Conviene como primera prueba liviana para validar que el llenado automatico funciona en el navegador real. Tambien sirve si el volumen de solicitudes es bajo o si se acepta pegar/cargar datos manualmente.

## 3. Extension de Chrome, Chromium o Firefox

### Como funcionaria

Una extension local del navegador actuaria como asistente de llenado. El usuario abriria la pagina normalmente, cargaria un Excel/CSV/JSON desde la extension, seleccionaria una solicitud y presionaria un boton para completar el formulario.

Flujo general:

1. La persona abre `https://www.leylobby.gob.cl/solicitud/audiencia` en su navegador normal.
2. La persona selecciona la institucion o usa la extension para ayudar con la seleccion.
3. La persona abre el popup o panel de la extension.
4. La persona carga el archivo de datos.
5. La extension muestra las solicitudes disponibles.
6. La persona elige una solicitud.
7. La extension rellena solicitante principal y asistentes/invitados.
8. La extension muestra un resumen de campos llenados y advertencias.
9. La persona revisa, resuelve Turnstile y presiona `Solicitar` manualmente.

### Ventajas

- Usa el navegador normal del usuario.
- No depende de Playwright ni WebDriver para operar el flujo real.
- Puede leer archivos locales seleccionados por el usuario.
- Escala mejor para una base de datos en Excel, CSV o JSON.
- Puede incorporar validaciones antes de rellenar.
- Puede mantener estado de solicitudes pendientes, revisadas o completadas.
- Permite una experiencia mas comoda y segura para revision humana.

### Desventajas

- Requiere mas desarrollo inicial que un bookmarklet.
- Hay que mantener `manifest.json`, popup, content script y logica de datos.
- La compatibilidad entre Chrome/Chromium y Firefox puede requerir ajustes.
- Si el sitio cambia su HTML, habra que actualizar selectores.

### Riesgo con Cloudflare

Bajo a medio. Es la opcion mas equilibrada porque opera dentro del navegador real del usuario y deja el captcha y envio final a una persona. La extension no deberia manipular tokens, cookies ni Turnstile.

### Cuando conviene

Conviene si el proyecto va a usar una base de datos real y procesar muchas solicitudes. Es la opcion mas robusta para una automatizacion hibrida de largo plazo.

## Comparacion rapida

| Opcion | Esfuerzo inicial | Comodidad | Riesgo con Cloudflare | Escala con Excel/base de datos | Recomendacion |
|---|---:|---:|---:|---:|---|
| Playwright con navegador normal | Bajo/medio | Alta | Alto | Alta | Descartado para operacion real; util solo para diagnostico |
| Bookmarklet | Bajo | Media | Bajo/medio | Baja/media | Bueno como prototipo ligero |
| Extension de navegador | Medio/alto | Alta | Bajo/medio | Alta | Mejor opcion para uso sostenido |

## Recomendacion practica

La estrategia recomendada despues de descartar Playwright para operacion real es avanzar por etapas:

1. Usar Playwright solo para investigacion de la pagina, obtencion de selectores y analisis de network.
2. Crear un bookmarklet minimo para probar llenado dentro del navegador real.
3. Si el bookmarklet funciona bien, evolucionar a una extension local para Chrome/Chromium/Firefox.

Para operacion real, la extension es la opcion mas conveniente porque combina automatizacion de llenado, navegador normal, revision humana y menor friccion con Cloudflare Turnstile.

## Principios de seguridad y compatibilidad

- No automatizar el click en `Solicitar`.
- No intentar resolver, saltar ni manipular Cloudflare Turnstile.
- No modificar `captcha_token` manualmente.
- No enviar requests directos al backend del sitio.
- Mantener siempre revision humana antes del envio.
- Usar pausas y eventos normales de formulario al rellenar campos.
- Registrar advertencias cuando un campo no se encuentre o no pueda completarse.
