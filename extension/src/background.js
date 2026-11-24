if (typeof importScripts === "function") importScripts("api-config.js");

(function () {
  "use strict";

  var ext = typeof browser !== "undefined" ? browser : chrome;
  var FIREBASE_BASE_URL = "https://asistente-lobby.web.app";
  var API_BASE_URL = globalThis.LOBBY_API_BASE_URL;
  var FIREBASE_CONFIG_URL = FIREBASE_BASE_URL + "/firebase-config.js";
  var EXTENSION_AUTH_URL = FIREBASE_BASE_URL + "/extension-auth.html";
  var IDENTITY_TOOLKIT_URL = "https://identitytoolkit.googleapis.com/v1";
  var SECURE_TOKEN_URL = "https://securetoken.googleapis.com/v1/token";
  var memorySession = {};
  var firebaseApiKey = null;

  function getStorageSessionArea() {
    if (!ext.storage) return null;
    return ext.storage.session || ext.storage.local || null;
  }

  function storageGet(area, keys) {
    if (!area) return Promise.resolve({});
    if (typeof browser !== "undefined" && browser.storage) return area.get(keys);
    return new Promise(function (resolve) {
      area.get(keys, function (value) { resolve(value || {}); });
    });
  }

  function storageSet(area, value) {
    if (!area) return Promise.resolve();
    if (typeof browser !== "undefined" && browser.storage) return area.set(value);
    return new Promise(function (resolve) {
      area.set(value, resolve);
    });
  }

  function storageRemove(area, keys) {
    if (!area) return Promise.resolve();
    if (typeof browser !== "undefined" && browser.storage) return area.remove(keys);
    return new Promise(function (resolve) {
      area.remove(keys, resolve);
    });
  }

  function mapFirebaseError(errorCode) {
    var map = {
      EMAIL_NOT_FOUND: "Email o password incorrecto.",
      INVALID_PASSWORD: "Email o password incorrecto.",
      INVALID_LOGIN_CREDENTIALS: "Email o password incorrecto.",
      PASSWORD_LOGIN_DISABLED: "Login email/password esta deshabilitado en Firebase Auth. Habilitalo en Authentication > Sign-in method o usa el login Google del portal web.",
      USER_DISABLED: "Usuario deshabilitado en Firebase Auth.",
      TOO_MANY_ATTEMPTS_TRY_LATER: "Demasiados intentos. Intenta mas tarde.",
      OPERATION_NOT_ALLOWED: "Login email/password no esta habilitado en Firebase Auth."
    };
    return map[errorCode] || errorCode || "Error de autenticacion.";
  }

  function parseApiKey(configText) {
    var match = String(configText || "").match(/apiKey\s*:\s*["']([^"']+)["']/);
    if (!match) throw new Error("No se pudo leer apiKey desde firebase-config.js.");
    return match[1];
  }

  async function getFirebaseApiKey() {
    if (firebaseApiKey) return firebaseApiKey;

    var response = await fetch(FIREBASE_CONFIG_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("No se pudo cargar la configuracion publica de Firebase.");
    }

    firebaseApiKey = parseApiKey(await response.text());
    return firebaseApiKey;
  }

  async function loadSession() {
    if (memorySession.idToken || memorySession.refreshToken) return Object.assign({}, memorySession);

    var area = getStorageSessionArea();
    var stored = await storageGet(area, ["asistenteLobbySession"]);
    memorySession = Object.assign({}, stored.asistenteLobbySession || {});
    return Object.assign({}, memorySession);
  }

  async function saveSession(session) {
    memorySession = Object.assign({}, session || {});
    await storageSet(getStorageSessionArea(), { asistenteLobbySession: memorySession });
  }

  async function clearSession() {
    memorySession = {};
    await storageRemove(getStorageSessionArea(), ["asistenteLobbySession"]);
  }

  function sessionFromAuthResponse(body) {
    var expiresInSeconds = Number(body.expiresIn || body.expires_in || 3600);
    return {
      idToken: body.idToken || body.id_token,
      refreshToken: body.refreshToken || body.refresh_token,
      email: body.email || null,
      localId: body.localId || body.user_id || null,
      expiresAt: Date.now() + (expiresInSeconds * 1000) - 60000
    };
  }

  function randomState() {
    var values = new Uint32Array(4);
    crypto.getRandomValues(values);
    return Array.prototype.map.call(values, function (value) {
      return value.toString(16).padStart(8, "0");
    }).join("");
  }

  function launchWebAuthFlow(options) {
    if (!ext.identity || !ext.identity.launchWebAuthFlow) {
      return Promise.reject(new Error("La API identity no esta disponible en este navegador."));
    }

    if (typeof browser !== "undefined" && browser.identity && browser.identity.launchWebAuthFlow) {
      return browser.identity.launchWebAuthFlow(options);
    }

    return new Promise(function (resolve, reject) {
      ext.identity.launchWebAuthFlow(options, function (responseUrl) {
        var lastError = ext.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(responseUrl);
      });
    });
  }

  function getIdentityRedirectUrl() {
    if (!ext.identity || !ext.identity.getRedirectURL) {
      throw new Error("La API identity no esta disponible en este navegador.");
    }
    return ext.identity.getRedirectURL("firebase");
  }

  function sessionFromGoogleRedirect(responseUrl, expectedState) {
    if (!responseUrl) throw new Error("Login Google cancelado o sin respuesta.");

    var url = new URL(responseUrl);
    var params = new URLSearchParams(url.hash ? url.hash.slice(1) : url.search.slice(1));
    var error = params.get("error");
    if (error) throw new Error(error);
    if (params.get("state") !== expectedState) throw new Error("Estado de autenticacion invalido.");

    var session = {
      idToken: params.get("idToken"),
      refreshToken: params.get("refreshToken"),
      email: params.get("email") || null,
      localId: params.get("uid") || null,
      expiresAt: Date.now() + (3600 * 1000) - 60000
    };

    if (!session.idToken || !session.refreshToken) {
      throw new Error("La autenticacion Google no devolvio tokens completos.");
    }

    return session;
  }

  async function signInWithGoogle() {
    var redirectUri = getIdentityRedirectUrl();
    var state = randomState();
    var url = new URL(EXTENSION_AUTH_URL);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);

    var responseUrl = await launchWebAuthFlow({
      url: url.toString(),
      interactive: true
    });
    var session = sessionFromGoogleRedirect(responseUrl, state);
    await saveSession(session);
    return session;
  }

  async function signInWithPassword(email, password) {
    if (!email || !password) throw new Error("Email y password son requeridos.");

    var apiKey = await getFirebaseApiKey();
    var response = await fetch(IDENTITY_TOOLKIT_URL + "/accounts:signInWithPassword?key=" + encodeURIComponent(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email,
        password: password,
        returnSecureToken: true
      })
    });
    var body = await response.json().catch(function () { return {}; });

    if (!response.ok) {
      throw new Error(mapFirebaseError(body.error && body.error.message));
    }

    var session = sessionFromAuthResponse(body);
    await saveSession(session);
    return session;
  }

  async function refreshIdToken(session) {
    if (!session || !session.refreshToken) throw new Error("Debes iniciar sesion.");

    var apiKey = await getFirebaseApiKey();
    var params = new URLSearchParams();
    params.set("grant_type", "refresh_token");
    params.set("refresh_token", session.refreshToken);

    var response = await fetch(SECURE_TOKEN_URL + "?key=" + encodeURIComponent(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });
    var body = await response.json().catch(function () { return {}; });

    if (!response.ok) {
      await clearSession();
      throw new Error(mapFirebaseError(body.error && body.error.message));
    }

    var nextSession = sessionFromAuthResponse(body);
    nextSession.email = nextSession.email || session.email || null;
    await saveSession(nextSession);
    return nextSession;
  }

  async function ensureToken(forceRefresh) {
    var session = await loadSession();
    if (!forceRefresh && session.idToken && session.expiresAt && session.expiresAt > Date.now()) {
      return session.idToken;
    }

    session = await refreshIdToken(session);
    return session.idToken;
  }

  async function apiRequest(path, options, hasRetried) {
    options = options || {};
    var idToken = await ensureToken(false);
    var headers = Object.assign({}, options.headers || {}, {
      Authorization: "Bearer " + idToken
    });

    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    var response = await fetch(API_BASE_URL + path, Object.assign({}, options, { headers: headers }));
    var body = await response.json().catch(function () { return null; });

    if (response.status === 401 && !hasRetried) {
      await ensureToken(true);
      return apiRequest(path, options, true);
    }

    if (!body) throw new Error("La API no devolvio una respuesta valida (HTTP " + response.status + ").");
    if (!response.ok || !body.ok) {
      throw new Error(body.error || "Error llamando API Lobby (HTTP " + response.status + ").");
    }

    return body;
  }

  async function authState() {
    var session = await loadSession();
    if (!session.refreshToken && !session.idToken) {
      return { authenticated: false };
    }

    try {
      await ensureToken(false);
      session = await loadSession();
      return {
        authenticated: true,
        email: session.email || null,
        localId: session.localId || null
      };
    } catch (error) {
      return { authenticated: false, error: error.message };
    }
  }

  async function handleMessage(message) {
    var type = message && message.type;

    if (type === "auth:getState") return authState();

    if (type === "auth:login") {
      var session = await signInWithPassword(message.email, message.password);
      return { ok: true, email: session.email || message.email };
    }

    if (type === "auth:loginGoogle") {
      var googleSession = await signInWithGoogle();
      return { ok: true, email: googleSession.email || null };
    }

    if (type === "auth:logout") {
      await clearSession();
      return { ok: true };
    }

    if (type === "api:me") return apiRequest("/me");

    if (type === "api:requestAccess") {
      return apiRequest("/access-requests", { method: "POST" });
    }

    if (type === "api:searchLobbyUsers") {
      return apiRequest("/search-lobby-users?q=" + encodeURIComponent(message.query || "") +
        (message.cursor ? "&cursor=" + encodeURIComponent(message.cursor) : ""));
    }

    if (type === "api:getLobbyUser") {
      if (!message.id) throw new Error("ID de usuario requerido.");
      return apiRequest("/lobby-users/" + encodeURIComponent(message.id));
    }

    throw new Error("Mensaje no soportado: " + type);
  }

  ext.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    handleMessage(message)
      .then(function (response) { sendResponse(response); })
      .catch(function (error) {
        sendResponse({ ok: false, error: error && error.message ? error.message : String(error) });
      });
    return true;
  });
}());
