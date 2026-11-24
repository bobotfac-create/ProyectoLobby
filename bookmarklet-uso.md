# Uso del bookmarklet Ley Lobby

Este bookmarklet es un asistente de llenado. No envia el formulario, no presiona `Solicitar`, no presiona `Guardar` en el modal y no toca Cloudflare Turnstile.

## Archivos

- `bookmarklet-dev.js`: version legible para desarrollo.
- `bookmarklet.txt`: version lista para pegar como URL de un favorito del navegador.

## Instalacion

1. Abre `bookmarklet.txt`.
2. Copia todo el contenido del archivo.
3. Crea un favorito nuevo en Chrome, Chromium, Brave o Firefox.
4. Usa un nombre como `Rellenar Ley Lobby`.
5. Pega el contenido copiado en el campo URL/direccion del favorito.

## Flujo de uso

1. Abre `https://www.leylobby.gob.cl/solicitud/audiencia` en tu navegador normal.
2. Selecciona la institucion manualmente.
3. Llega al formulario final `/solicitud/audiencia/{id}`.
4. Haz click en el favorito `Rellenar Ley Lobby`.
5. Pega el JSON con `solicitud` y `usuarios`.
6. En la seccion `Usuarios`, elige quien sera el solicitante.
7. Presiona `Rellenar formulario principal`.
8. En `Usuario para modal`, elige cualquier usuario, incluido el solicitante si corresponde.
9. Presiona `Abrir y rellenar modal`.
10. Revisa el modal y presiona `Guardar` manualmente si corresponde.
11. Repite el proceso para otros asistentes.
12. Revisa manualmente todo el formulario.
13. Resuelve Turnstile manualmente.
14. Presiona `Solicitar` manualmente solo si todo esta correcto.

## Cargar usuarios desde Firebase

El bookmarklet tambien puede cargar usuarios desde la API Firebase segura si ya esta desplegada.

1. Ejecuta el bookmarklet en la pagina de Ley Lobby.
2. En `Buscar usuarios en Firebase`, escribe nombre, id, documento o email.
3. Presiona `Cargar Firebase`.
4. La primera vez indica la URL de Firebase Hosting, por ejemplo `https://TU_PROJECT_ID.web.app`.
5. Inicia sesion en el popup si el bookmarklet lo pide.
6. El bookmarklet reemplazara la lista `usuarios` del JSON actual con los resultados autorizados.
7. Usa los selectores de solicitante y asistente normalmente.

El modo Firebase es opcional. El modo manual pegando JSON sigue funcionando igual.

## Formato JSON recomendado

```json
{
  "solicitud": {
    "cargo": "Subsecretario",
    "asistira": null,
    "materias": ["1"],
    "referencia": "Materia especifica a tratar en la audiencia.",
    "observaciones": "Observaciones adicionales.",
    "aceptaPoliticas": true
  },
  "usuarios": [
    {
      "id": "ana_rojas",
      "label": "Ana Rojas - Lobista remunerada",
      "nombres": "Ana",
      "apellidos": "Rojas",
      "pasaporte": "11111111-1",
      "pais": "CHL",
      "medio": "email",
      "telefono": "+56911111111",
      "email": "ana.rojas@example.com",
      "genero": "femenino",
      "otroContacto": "Disponible por WhatsApp en horario laboral",
      "tipo": "lobista",
      "remunerado": true,
      "representado": {},
      "empleador": {}
    }
  ]
}
```

Tambien sigue soportado el formato plano anterior y el formato con `asistentes`, pero el formato con `solicitud` y `usuarios` es el recomendado.

## Campos de solicitud

| Campo | Descripcion |
|---|---|
| `cargo` | Valor exacto del select o texto parcial visible del cargo. |
| `asistira` | `true`, `false` o `null` para decidir manualmente. |
| `materias` | Lista de valores `1`, `2`, `3`, `4` o textos parciales de materias. |
| `referencia` | Materia especifica a abordar. Campo requerido. |
| `observaciones` | Informacion adicional opcional. |
| `aceptaPoliticas` | `true` para marcar el checkbox de buenas practicas. |

Los datos personales del solicitante vienen del usuario seleccionado en el panel.

## Campos de usuario

```json
{
  "id": "mock_lobista_remunerado",
  "label": "Ana Rojas - Lobista remunerada",
  "nombres": "Ana",
  "apellidos": "Rojas",
  "pasaporte": "11111111-1",
  "pais": "CHL",
  "medio": "email",
  "telefono": "+56911111111",
  "email": "ana.rojas@example.com",
  "genero": "femenino",
  "otroContacto": "Disponible por WhatsApp en horario laboral",
  "tipo": "lobista",
  "remunerado": true,
  "representado": {},
  "empleador": {}
}
```

Cada usuario puede ser elegido como solicitante y tambien puede cargarse en el modal como asistente. Valores para `tipo`:

- `lobista`: abre Representado y puede abrir Empleador si `remunerado` es `true`.
- `gestor`: abre Representado y no requiere Empleador si `remunerado` es `false`.
- `pasivo`: usa `cargoInstitucion`, sin Representado ni Empleador.

Valores para `representado.tipo`:

- `persona_natural`
- `persona_juridica`
- `otras_entidades`

## Mock users incluidos

El boton `Cargar ejemplo completo` carga tres usuarios para probar todas las rutas principales:

- `mock_lobista_remunerado`: lobista, remunerado, representado persona juridica y empleador completo.
- `mock_gestor_no_remunerado`: gestor, no remunerado, representado persona natural y sin empleador.
- `mock_pasivo`: sujeto pasivo, con cargo/institucion y sin representado/empleador.

## Materias

Valores disponibles:

- `1`: actos administrativos, proyectos de ley y leyes.
- `2`: acuerdos, declaraciones o decisiones del Congreso Nacional.
- `3`: contratos necesarios para el funcionamiento de sujetos pasivos.
- `4`: politicas, planes y programas.

Tambien se pueden usar textos parciales:

```json
"materias": ["actos administrativos", "politicas"]
```

## Advertencias importantes

- El bookmarklet no presiona `Guardar` en el modal de asistentes.
- El bookmarklet no presiona `Solicitar`.
- El campo antispam `website` se mantiene vacio.
- El bookmarklet ignora `captcha_token`, `cf-turnstile-response`, `.cf-turnstile` y `#btnSolicitar`.
- Si `asistira` es `true`, el sitio puede abrir automaticamente el modal de asistente porque copia al solicitante como asistente.
- Para el flujo guiado se recomienda usar `"asistira": null` y agregar asistentes desde el selector del bookmarklet.
- El envio siempre debe hacerlo una persona despues de revisar.

## Actualizar el bookmarklet

Si se modifica `bookmarklet-dev.js`, hay que regenerar `bookmarklet.txt` con:

```bash
node -e "const fs=require('fs'); const code=fs.readFileSync('bookmarklet-dev.js','utf8'); fs.writeFileSync('bookmarklet.txt','javascript:'+encodeURIComponent(code));"
```
