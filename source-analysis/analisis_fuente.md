# Analisis de fuente Ley Lobby

Archivos recuperados desde el sitio real para preparar el bookmarklet.

## Archivos generados

- `source-analysis/audiencia_index_raw.html`: HTML crudo de `https://www.leylobby.gob.cl/solicitud/audiencia`.
- `source-analysis/audiencia_index.html`: DOM renderizado de la pagina inicial despues de ejecutar JS.
- `source-analysis/audiencia_form_35_raw.html`: HTML crudo de `https://www.leylobby.gob.cl/solicitud/audiencia/35`.
- `source-analysis/audiencia_form_35.html`: DOM renderizado del formulario despues de ejecutar JS.
- `source-analysis/form_model_35.json`: modelo estructurado de campos, materias, radios y estado global del formulario.
- `source-analysis/lobby_app_key_snippets.txt`: fragmentos relevantes de `lobby-app.js`.
- `source-analysis/*_inline_scripts.txt`: scripts inline extraidos desde el HTML.
- `source-analysis/www.leylobby.gob.cl_*.js`: scripts propios descargados desde el sitio.

## Pagina inicial

URL: `https://www.leylobby.gob.cl/solicitud/audiencia`

La pagina inicial contiene un `select` con `id="institucion"` y opciones renderizadas por servidor. Luego Selectize transforma visualmente ese `select`.

El envio de la pagina inicial ejecuta:

```js
function redirect(event) {
  event.preventDefault();
  var institucion_id = $('#institucion').val();
  var url_template = 'https://www.leylobby.gob.cl/solicitud/audiencia/{{id}}';
  url_template = url_template.replace('{{id}}', institucion_id);
  window.location.href = url_template;
}
```

Conclusion: para llegar al formulario final basta con elegir una institucion cuyo valor es el ID y navegar a `/solicitud/audiencia/{id}`.

Ejemplo recuperado:

- `35`: `Subsecretaría del Interior`

## Formulario final

URL usada para analisis: `https://www.leylobby.gob.cl/solicitud/audiencia/35`

Formulario principal:

```text
#SolicitudesAudienciaForm
```

Boton de envio:

```text
#btnSolicitar
```

Evento del boton:

```js
SolicitudesAudienciaAdmin.submitForm()
```

El bookmarklet no debe presionar este boton.

## Campos principales

Campos que el bookmarklet puede llenar en el formulario principal:

| Campo JSON propuesto | Selector | Notas |
|---|---|---|
| `cargo` | `[name="cargo"]` | Select. Puede elegirse por `value` o texto parcial. |
| `nombres` | `[name="nombres"]` | Texto requerido. |
| `apellidos` | `[name="apellidos"]` | Texto requerido. |
| `pasaporte` | `[name="pasaporte"]` dentro del formulario | Hay IDs/names duplicados en modal. Usar scope del formulario. |
| `paisEmisor` | `[name="paisEmisor"]` | Select. Cambiar antes de llenar pasaporte porque puede reemplazar el input. |
| `medio` | `[name="medio"]` | Valores: `telefono` o `email`. Muestra/oculta campos de contacto. |
| `genero` | `[name="genero"]` | Valores: `masculino`, `femenino`, `otro`, `prefiero_no_decir`. |
| `telefono` | `[name="mediotelefono"]` | Solo visible si `medio` es `telefono`. |
| `email` | `[name="medioemail"]` | Solo visible si `medio` es `email`. |
| `asistira` | `[name="asistente"]` | Radio especial. Ver nota abajo. |
| `materias` | checkboxes con `onMateriaChange` | Valores `1`, `2`, `3`, `4` o texto parcial. |
| `referencia` | `[name="referencia"]` | Textarea requerido. |
| `observaciones` | `[name="observaciones"]` | Textarea opcional. |
| `aceptaPoliticas` | `#politicasCheckbox` | Checkbox requerido por validacion. |

Campos que no deben tocarse:

```text
[name="website"]
#lobby-captcha-token
[name="captcha_token"]
[name="cf-turnstile-response"]
.cf-turnstile
#btnSolicitar
```

## Materias disponibles

Las materias son checkboxes sin `name`, por lo que deben seleccionarse por `value` o por texto cercano.

| Valor | Texto |
|---|---|
| `1` | Elaboración, dictación, modificación, denegación o rechazo de actos administrativos, proyectos de ley y leyes y también de las decisiones que tomen los sujetos pasivos. |
| `2` | Elaboración, tramitación, aprobación, modificación, derogación o rechazo de acuerdo, declaraciones o decisiones del Congreso Nacional o sus miembros incluídas comisiones. |
| `3` | Celebración, modificación o terminación a cualquier título, de contratos que realicen los sujetos pasivos y que sean necesarios para su funcionamiento. |
| `4` | Diseño, implementación y evaluación de políticas, planes y programas efectuados por los sujetos pasivos. |

Cada checkbox ejecuta:

```js
SolicitudesAudienciaAdmin.onMateriaChange(Number(this.value))
```

## Estado interno del formulario

El formulario mantiene estado en variables globales:

```text
window.solicitud
window.materias
window.validPoliticas
window.submitted
window.SolicitudesAudienciaAdmin
```

Los campos no solo deben recibir `value`; tambien deben disparar eventos para que el JS actualice `window.solicitud`.

Eventos minimos recomendados despues de modificar un campo:

```js
element.dispatchEvent(new Event('input', { bubbles: true }));
element.dispatchEvent(new Event('change', { bubbles: true }));
element.dispatchEvent(new Event('blur', { bubbles: true }));
```

## Reglas importantes para el bookmarklet

Orden recomendado de llenado:

1. Buscar `#SolicitudesAudienciaForm`.
2. Mantener `[name="website"]` vacio.
3. Seleccionar `cargo`.
4. Llenar `nombres` y `apellidos`.
5. Seleccionar `paisEmisor`.
6. Llenar `pasaporte`, despues de seleccionar pais.
7. Seleccionar `medio`.
8. Llenar `email` o `telefono` segun el medio.
9. Seleccionar `genero`.
10. Seleccionar materias.
11. Llenar `referencia` y `observaciones`.
12. Marcar politicas.
13. Manejar `asistira` con cuidado.

## Nota sobre asistencia del solicitante

El radio `asistente` tiene comportamiento especial.

Si se marca `Si`, ejecuta:

```js
SolicitudesAudienciaAdmin.asistenteChange('1')
```

Efecto observado:

- Cambia `window.solicitud.asistente` a `'1'`.
- Agrega un invitado a `window.solicitud.invitados` copiando datos desde `window.solicitud.folio`.
- Renderiza la tabla de asistentes.
- Abre el modal de asistente.

Si se marca `No`, ejecuta:

```js
SolicitudesAudienciaAdmin.asistenteChange('0')
```

Esto deja `window.solicitud.asistente` en `'0'`, pero no agrega asistentes. La validacion de envio exige al menos un invitado, por lo que una solicitud con `asistira=false` requerira asistentes en una fase posterior.

Para el MVP de solicitante principal, conviene probar `asistira=true` despues de llenar nombres, apellidos, pais y pasaporte, porque asi el sitio copia esos datos al primer asistente automaticamente. Hay que considerar que se abrira el modal.

## Validacion del formulario

`checkFormAll()` solo muestra errores completos despues de que `submitted` pasa a `true`, lo que ocurre al intentar enviar.

Campos requeridos por la validacion JS:

- Politicas aceptadas.
- Nombres.
- Apellidos.
- RUT/Pasaporte valido si `paisEmisor` es `CHL`.
- Cargo.
- Medio de contacto.
- Email o telefono segun medio seleccionado.
- Genero.
- Indicar si asistira.
- Al menos un asistente en `solicitud.invitados`.
- Al menos una materia.
- Referencia.

## Cloudflare Turnstile

El formulario contiene:

```text
.cf-turnstile
#lobby-captcha-token
[name="cf-turnstile-response"]
```

El callback del sitio es:

```js
function onLobbyTurnstileSuccess(token) {
  window.__lobbyCaptchaToken = token;
  var el = document.getElementById('lobby-captcha-token');
  if (el) {
    el.value = token;
  }
}
```

El bookmarklet no debe interactuar con estos campos ni con Turnstile.

## Implicancias para el MVP

El MVP puede rellenar el solicitante principal de forma segura si usa scope sobre `#SolicitudesAudienciaForm`, dispara eventos normales y no toca captcha/envio.

Punto delicado: `asistira=true` abre el modal de asistente. Se recomienda dejarlo como comportamiento visible y reportarlo en el resumen del bookmarklet, o permitir que el JSON omita `asistira` para que la persona lo decida manualmente en la primera prueba.
