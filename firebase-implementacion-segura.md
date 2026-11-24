# Implementacion segura con Firebase

Este documento guarda el plan para evolucionar el bookmarklet de Ley Lobby hacia una base central privada con autenticacion real. El objetivo es mantener el llenado asistido desde el navegador normal, pero evitar que los datos sensibles queden expuestos en un JSON publico, en el propio bookmarklet o en un Google Sheet publicado.

## Objetivo

- Centralizar la lista de usuarios usados para llenar la peticion de Lobby.
- Permitir edicion controlada de esa lista.
- Evitar que personas ajenas al grupo puedan acceder facilmente a datos sensibles.
- Mantener revision humana, resolucion manual de Turnstile y envio manual del formulario.
- No automatizar requests directos al backend de Ley Lobby.

## Arquitectura recomendada

```text
Bookmarklet
   -> Firebase Hosting / script loader
   -> Firebase Auth
   -> Cloud Functions API
   -> Firestore
```

El bookmarklet no debe leer Firestore directamente. Para datos sensibles, la lectura debe pasar por Cloud Functions, porque ahi se puede validar identidad, permisos, estado del usuario y registrar auditoria antes de devolver datos.

## Componentes

### Bookmarklet

Responsabilidades:

- Ejecutarse dentro de la pagina de Ley Lobby en el navegador normal del usuario.
- Cargar el script principal desde Firebase Hosting.
- Abrir o reutilizar una sesion autenticada con Firebase Auth.
- Pedir a la API solo los registros necesarios.
- Rellenar campos del formulario.
- No presionar `Solicitar`.
- No manipular Turnstile, captcha ni tokens internos del sitio.

El bookmarklet nunca debe contener claves privadas, service accounts, tokens permanentes ni datos sensibles embebidos.

### Firebase Auth

Responsabilidades:

- Identificar a cada persona autorizada.
- Soportar login con Google o email/password.
- Emitir ID tokens temporales.
- Permitir revocar acceso desactivando usuarios en la base de autorizacion.

La configuracion publica de Firebase puede estar en el frontend. No es un secreto. La seguridad real debe estar en Auth, Cloud Functions y Firestore.

### Cloud Functions

Responsabilidades:

- Recibir llamadas del bookmarklet.
- Validar `Authorization: Bearer <firebase_id_token>`.
- Verificar que el usuario autenticado este autorizado y activo.
- Aplicar roles como `admin` u `operator`.
- Consultar Firestore con Admin SDK.
- Devolver solo los campos necesarios para el flujo solicitado.
- Registrar consultas en `auditLogs`.

Cloud Functions es la capa que impide que el cliente lea toda la base completa.

### Firestore

Responsabilidades:

- Guardar usuarios de Lobby y sus datos sensibles.
- Guardar usuarios autorizados de la aplicacion.
- Guardar auditoria de accesos.
- Mantener datos editables desde un panel admin o herramientas internas.

En la primera version, Firestore debe bloquear lectura y escritura directa desde clientes web. El acceso operativo debe pasar por Cloud Functions.

### Firebase Hosting

Responsabilidades:

- Alojar el script principal que carga el bookmarklet.
- Alojar una pagina de login si el usuario no tiene sesion.
- Alojar un panel admin privado en una etapa posterior.

## Flujo operativo

1. La persona abre el formulario de Ley Lobby en su navegador normal.
2. La persona selecciona la institucion y llega al formulario final.
3. La persona ejecuta el bookmarklet.
4. El bookmarklet carga el script principal desde Firebase Hosting.
5. Si no hay sesion valida, se abre una pagina de login.
6. La persona inicia sesion con Firebase Auth.
7. El bookmarklet obtiene un ID token temporal.
8. El bookmarklet llama a Cloud Functions con el token.
9. Cloud Functions valida identidad, permisos y estado activo.
10. Cloud Functions consulta Firestore y registra auditoria.
11. Cloud Functions devuelve solo el registro necesario.
12. El bookmarklet rellena los campos correspondientes.
13. La persona revisa, resuelve Turnstile y envia manualmente si corresponde.

## Modelo de datos inicial

### `lobbyUsers`

Registros usados para llenar los campos de Ley Lobby.

```text
lobbyUsers/{lobbyUserId}
id
label
nombres
apellidos
pasaporte
pais
medio
telefono
email
genero
otroContacto
tipo
remunerado
representado
empleador
cargoInstitucion
active
createdAt
updatedAt
```

Notas:

- `tipo` puede ser `lobista`, `gestor` o `pasivo`.
- `representado` y `empleador` son objetos opcionales segun el tipo de usuario.
- `active` permite deshabilitar registros sin borrarlos.

### `appUsers`

Usuarios autorizados para usar la herramienta.

```text
appUsers/{uid}
uid
email
displayName
role
active
createdAt
updatedAt
```

Roles iniciales:

- `admin`: puede editar usuarios de Lobby y administrar accesos.
- `operator`: puede consultar registros para llenar formularios.
- `disabled`: sin acceso operativo.

### `auditLogs`

Registro de consultas y acciones sensibles.

```text
auditLogs/{logId}
uid
email
action
recordId
success
error
createdAt
```

Acciones iniciales:

- `searchLobbyUsers`
- `getLobbyUser`
- `createLobbyUser`
- `updateLobbyUser`
- `disableLobbyUser`

## Endpoints iniciales

### `GET /api/search-lobby-users?q=...`

Uso: buscar usuarios por nombre, etiqueta, documento u otro identificador.

Permisos: `admin`, `operator`.

Respuesta recomendada: lista minima, sin todos los datos sensibles si no son necesarios para elegir.

```json
{
  "ok": true,
  "users": [
    {
      "id": "ana_rojas",
      "label": "Ana Rojas - Lobista remunerada",
      "tipo": "lobista"
    }
  ]
}
```

### `GET /api/lobby-users/{id}`

Uso: obtener el registro completo necesario para llenar campos.

Permisos: `admin`, `operator`.

Respuesta recomendada: solo el registro solicitado.

```json
{
  "ok": true,
  "user": {
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
    "tipo": "lobista",
    "remunerado": true,
    "representado": {},
    "empleador": {}
  }
}
```

### `POST /api/lobby-users`

Uso: crear un registro.

Permisos: `admin`.

### `PATCH /api/lobby-users/{id}`

Uso: editar un registro.

Permisos: `admin`.

### `POST /api/lobby-users/{id}/disable`

Uso: desactivar un registro sin borrarlo.

Permisos: `admin`.

## Reglas de Firestore iniciales

Para la primera version, bloquear acceso directo desde el cliente:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Cloud Functions puede acceder con Admin SDK y aplicar las reglas de negocio desde servidor.

## Seguridad minima requerida

- No guardar datos sensibles dentro de `bookmarklet-dev.js` ni `bookmarklet.txt`.
- No usar un JSON publico para la lista de usuarios.
- No usar Google Sheet publicado como CSV/JSON para datos sensibles.
- No poner service account keys ni secretos en el navegador.
- Validar ID token en cada endpoint.
- Verificar `appUsers/{uid}.active === true`.
- Verificar rol antes de cada accion.
- Devolver solo los campos necesarios.
- Evitar endpoints que entreguen toda la base completa sin filtros.
- Registrar consultas y errores en `auditLogs`.
- Desactivar usuarios inmediatamente cuando pierdan acceso al grupo.

## Consideraciones sobre datos sensibles

Aunque la arquitectura proteja la base central, cualquier dato que el bookmarklet use para llenar el formulario llega al navegador del usuario autorizado. Ese usuario podria verlo desde el DOM, DevTools o el propio formulario.

La meta realista es:

- Evitar acceso de personas ajenas.
- Reducir exposicion accidental de la base completa.
- Permitir revocacion de accesos.
- Auditar consultas.
- Entregar solo el dato necesario en cada operacion.

No es posible impedir totalmente que una persona autorizada copie un dato que necesita ver o usar para llenar el formulario.

## Etapas de implementacion

### Etapa 1: base segura minima

1. Crear proyecto Firebase.
2. Activar Firebase Auth.
3. Crear Firestore.
4. Crear colecciones `appUsers`, `lobbyUsers` y `auditLogs`.
5. Configurar reglas de Firestore bloqueando acceso directo.
6. Crear Cloud Function `getLobbyUser`.
7. Crear Cloud Function `searchLobbyUsers`.
8. Adaptar bookmarklet para obtener ID token y llamar a Cloud Functions.
9. Registrar auditoria en cada consulta.

### Etapa 2: administracion

1. Crear panel admin privado en Firebase Hosting.
2. Permitir crear, editar y desactivar `lobbyUsers`.
3. Permitir activar o desactivar `appUsers`.
4. Agregar validaciones de campos antes de guardar.
5. Mostrar logs basicos de auditoria.

### Etapa 3: mejora operativa

1. Agregar busqueda y seleccion mas comoda desde el panel del bookmarklet.
2. Agregar cache temporal solo de datos no sensibles o de IDs seleccionados.
3. Mejorar manejo de errores de sesion expirada.
4. Evaluar migracion a extension si el login o la distribucion del bookmarklet se vuelve incomoda.

## Decision sobre extension de navegador

No es obligatorio migrar a extension para proteger la base. Firebase Auth, Cloud Functions y Firestore resuelven la parte de acceso centralizado y controlado.

Conviene evaluar extension mas adelante si aparece alguna de estas necesidades:

- Ejecutar automaticamente en paginas especificas.
- Mejorar experiencia de login y sesion.
- Distribuir actualizaciones de forma mas controlada.
- Usar UI persistente con popup o sidebar.
- Manejar permisos del navegador de forma mas robusta.

## Resumen de la decision

La solucion recomendada para datos sensibles es:

```text
Bookmarklet ligero + Firebase Auth + Cloud Functions + Firestore + auditoria
```

Esto mantiene el flujo actual de navegador normal y revision humana, pero agrega autenticacion real, revocacion de accesos, registros de auditoria y una base central privada editable.
