# Puesta en marcha Firebase

Esta guia describe como activar la implementacion segura creada para el bookmarklet.

## Archivos agregados

- `firebase.json`: configuracion de Hosting, Functions y Firestore.
- `.firebaserc.example`: ejemplo de proyecto Firebase.
- `firestore.rules`: bloquea lectura/escritura directa desde clientes.
- `functions/index.js`: API segura con Auth, roles y auditoria.
- `functions/package.json`: dependencias de Cloud Functions.
- `public/auth.html`: login por popup para entregar ID token al bookmarklet.
- `public/admin.html`: portal admin para crear, editar e importar usuarios.
- `public/admin.js`: logica del portal admin.
- `public/lobby-api-client.js`: cliente JS que usa el bookmarklet para llamar la API.
- `public/firebase-config.example.js`: plantilla de configuracion web Firebase.
- `bookmarklet-firebase-loader.example.txt`: ejemplo de loader directo del cliente Firebase.

## Requisitos

1. Tener un proyecto Firebase.
2. Activar Firestore.
3. Activar Firebase Auth.
4. Activar al menos un proveedor de login: Google o email/password.
5. Usar plan Blaze si se van a desplegar Cloud Functions de segunda generacion.
6. Tener Firebase CLI instalado o usar `npx firebase-tools`.

## Configuracion local

1. Copia `.firebaserc.example` a `.firebaserc`.
2. Reemplaza `TU_PROJECT_ID` por el ID real del proyecto Firebase.
3. Copia `public/firebase-config.example.js` a `public/firebase-config.js`.
4. Reemplaza los valores de `public/firebase-config.js` por la configuracion de una Web App de Firebase.

Ejemplo de `public/firebase-config.js`:

```js
window.LOBBY_FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  appId: "..."
};
```

`public/firebase-config.js` esta ignorado por Git porque depende del proyecto real.

## Auth

En Firebase Console:

1. Entra a `Authentication`.
2. Activa `Google` o `Email/Password`.
3. Revisa `Settings > Authorized domains`.
4. Deben estar autorizados los dominios de Firebase Hosting, normalmente `TU_PROJECT_ID.web.app` y `TU_PROJECT_ID.firebaseapp.com`.

## Primer admin

La API solo permite acceso a usuarios que existan en `appUsers/{uid}`.

Flujo inicial:

1. Crea o inicia sesion con el usuario admin en Firebase Auth.
2. Copia su `uid` desde Firebase Console > Authentication > Users.
3. En Firestore, crea manualmente el documento `appUsers/{uid}`.

Contenido recomendado:

```json
{
  "uid": "UID_DEL_USUARIO",
  "email": "admin@example.com",
  "displayName": "Admin",
  "role": "admin",
  "active": true
}
```

Roles validos iniciales:

- `admin`: puede crear, editar, desactivar y consultar usuarios de Lobby.
- `operator`: puede buscar y consultar usuarios de Lobby.
- `disabled`: queda sin acceso.

## Despliegue

Instala dependencias de Functions si no estan instaladas:

```bash
cd functions
npm install
```

Desde la raiz del proyecto:

```bash
firebase deploy --only firestore:rules,functions,hosting
```

Si usas `npx`:

```bash
npx firebase-tools deploy --only firestore:rules,functions,hosting
```

## Probar la API

Despues del despliegue, abre:

```text
https://TU_PROJECT_ID.web.app/api/health
```

Respuesta esperada:

```json
{
  "ok": true,
  "service": "lobby-firebase-api"
}
```

## Usar desde el bookmarklet actual

El bookmarklet actual mantiene el modo manual con JSON y agrega un bloque opcional llamado `Buscar usuarios en Firebase`.

Flujo:

1. Actualiza el favorito usando el contenido regenerado de `bookmarklet.txt`.
2. Abre el formulario de Ley Lobby.
3. Ejecuta el bookmarklet.
4. En `Buscar usuarios en Firebase`, escribe una busqueda.
5. Presiona `Cargar Firebase`.
6. La primera vez pedira la URL de Firebase Hosting, por ejemplo `https://TU_PROJECT_ID.web.app`.
7. Si no hay sesion, abrira el popup de login.
8. Al autenticar, cargara hasta 25 resultados y reemplazara la lista `usuarios` del JSON actual.
9. Selecciona solicitante/asistente y usa el flujo normal.

La busqueda devuelve resumenes primero y luego pide el detalle de cada resultado. No descarga la base completa salvo que la API se modifique para hacerlo.

## Portal admin

Despues del despliegue, el portal queda disponible en:

```text
https://TU_PROJECT_ID.web.app/admin.html
```

Solo usuarios con documento `appUsers/{uid}` y `role: "admin"` pueden usarlo.

Funciones disponibles:

- Buscar usuarios activos o incluir inactivos.
- Crear usuario individual.
- Editar usuario existente.
- Desactivar usuario.
- Importar usuarios desde JSON o CSV.
- Validar importacion antes de escribir en Firestore.

### Crear usuarios desde el portal

1. Abre `/admin.html`.
2. Inicia sesion con Google.
3. Presiona `Nuevo usuario`.
4. Completa `ID` y `Etiqueta visible` como minimo.
5. Guarda.

El `ID` se usa como Document ID en `lobbyUsers/{id}`. No se edita despues de crear para evitar inconsistencias con el bookmarklet.

El formulario individual esta dividido en pestañas:

- `Datos personales`: identidad, contacto, tipo de usuario, remuneracion y estado activo.
- `Representado`: persona, empresa o entidad en cuyo nombre actua el usuario.
- `Empleador`: empresa o entidad que emplea o remunera al usuario.

Aunque visualmente esten separados, los datos se guardan con la misma estructura usada por el bookmarklet:

```json
{
  "representado": {
    "tipo": "persona_juridica",
    "nombre": "Empresa SpA"
  },
  "empleador": {
    "nombre": "Consultora Ltda"
  }
}
```

Uso recomendado:

- `pasivo`: normalmente deja `Representado` y `Empleador` vacios.
- `gestor`: normalmente completa `Representado` y deja `Empleador` vacio.
- `lobista` no remunerado: normalmente completa `Representado`.
- `lobista` remunerado: normalmente completa `Representado` y `Empleador`.

### Importar JSON

Formatos aceptados:

```json
[
  {
    "id": "ana_rojas",
    "label": "Ana Rojas",
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
    "empleador": {},
    "active": true
  }
]
```

Tambien se acepta:

```json
{
  "usuarios": []
}
```

o:

```json
{
  "users": []
}
```

### Importar CSV

La primera fila debe contener encabezados. Ejemplo:

```csv
id,label,nombres,apellidos,pasaporte,pais,medio,telefono,email,genero,tipo,remunerado,active,representado.tipo,representado.nombre,empleador.nombre
ana_rojas,Ana Rojas - Lobista,Ana,Rojas,11111111-1,CHL,email,+56911111111,ana.rojas@example.com,femenino,lobista,true,true,persona_juridica,Empresa SpA,Consultora Ltda
```

Columnas con punto crean objetos anidados, por ejemplo `representado.nombre` queda guardado como:

```json
{
  "representado": {
    "nombre": "Empresa SpA"
  }
}
```

El importador tambien acepta algunos encabezados en espanol y los convierte automaticamente:

- `etiqueta` -> `label`
- `documento` -> `pasaporte`
- `activo` -> `active`
- `correo` -> `email`
- `nombre` -> `nombres`
- `apellido` -> `apellidos`

Modos de importacion:

- `Crear o actualizar`: crea nuevos y actualiza existentes.
- `Crear solo nuevos`: omite registros que ya existen.
- `Actualizar existentes`: omite registros que no existen.

Usa primero `Validar` para hacer una prueba sin escribir. Luego usa `Importar`.

## Crear usuarios de Lobby manualmente

Si necesitas crear documentos directamente en Firestore, usa estas reglas:

1. Crear documentos en `lobbyUsers`.
2. Usar como Document ID el mismo valor del campo `id`.
3. Mantener `active` como boolean, no como texto.

Documento minimo recomendado en `lobbyUsers/{id}`:

```json
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
  "tipo": "lobista",
  "remunerado": true,
  "representado": {},
  "empleador": {},
  "active": true,
  "searchText": "ana_rojas ana rojas ana rojas 11111111-1 ana.rojas@example.com lobista"
}
```

Si creas o editas por API, `searchText` se genera automaticamente. Si creas documentos manualmente, conviene agregar `searchText` normalizado para que la busqueda funcione mejor.

## Seguridad

- El bookmarklet no contiene claves privadas.
- `firebase-config.js` no es secreto; identifica la app web, pero no otorga permisos por si solo.
- Firestore esta cerrado a clientes directos por `firestore.rules`.
- Cloud Functions valida ID token, usuario activo y rol.
- Cada busqueda y consulta queda registrada en `auditLogs`.
- Los datos sensibles solo llegan al navegador cuando un usuario autorizado los pide.

## Estado actual

Implementado:

- Firebase Hosting base.
- Login por popup.
- Cliente JS para bookmarklet.
- API con endpoints de busqueda, listado admin, detalle, creacion, edicion, desactivacion e importacion.
- Roles `admin` y `operator`.
- Auditoria en `auditLogs`.
- Integracion opcional del bookmarklet con Firebase.
- Portal admin para crear, editar e importar CSV/JSON.

Pendiente para una etapa posterior:

- Importador desde Excel.
- Mejoras de busqueda para bases mas grandes.
- Pruebas end-to-end contra un proyecto Firebase real.
