(function () {
  "use strict";

  var AUTH_MESSAGE_TYPE = "lobbyFirebaseAuth";
  var currentScript = document.currentScript;
  var scriptUrl = currentScript && currentScript.src ? new URL(currentScript.src) : null;
  var baseUrl = window.LOBBY_FIREBASE_BASE_URL || (scriptUrl ? scriptUrl.origin : "");
  var tokenState = {
    idToken: null,
    email: null
  };

  if (!baseUrl) {
    throw new Error("No se pudo determinar la URL base de Firebase Hosting");
  }

  function apiUrl(path) {
    return new URL("/api" + path, baseUrl).toString();
  }

  function authUrl() {
    var url = new URL("/auth.html", baseUrl);
    url.searchParams.set("openerOrigin", window.location.origin);
    return url.toString();
  }

  function ensureToken() {
    if (tokenState.idToken) {
      return Promise.resolve(tokenState.idToken);
    }

    return new Promise(function (resolve, reject) {
      var popup = window.open(authUrl(), "lobbyFirebaseAuth", "width=520,height=680");
      var timeout = window.setTimeout(function () {
        window.removeEventListener("message", onMessage);
        reject(new Error("Tiempo de login agotado"));
      }, 120000);

      function onMessage(event) {
        if (event.origin !== baseUrl) return;
        if (!event.data || event.data.type !== AUTH_MESSAGE_TYPE) return;

        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);

        tokenState.idToken = event.data.idToken;
        tokenState.email = event.data.email || null;

        if (popup && !popup.closed) {
          popup.close();
        }

        resolve(tokenState.idToken);
      }

      window.addEventListener("message", onMessage);
    });
  }

  function request(path, options, hasRetried) {
    options = options || {};

    return ensureToken().then(function (idToken) {
      var headers = Object.assign({}, options.headers || {}, {
        Authorization: "Bearer " + idToken
      });

      if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }

      return fetch(apiUrl(path), Object.assign({}, options, { headers: headers }));
    }).then(function (response) {
      if (response.status === 401 && !hasRetried) {
        tokenState.idToken = null;
        return request(path, options, true);
      }

      return response.json().then(function (body) {
        if (!response.ok || !body.ok) {
          throw new Error(body.error || "Error llamando API Lobby");
        }
        return body;
      });
    });
  }

  window.LobbyFirebaseClient = {
    login: ensureToken,
    me: function () {
      return request("/me");
    },
    searchLobbyUsers: function (query) {
      var path = "/search-lobby-users?q=" + encodeURIComponent(query || "");
      return request(path);
    },
    getLobbyUser: function (id) {
      return request("/lobby-users/" + encodeURIComponent(id));
    },
    createLobbyUser: function (user) {
      return request("/lobby-users", {
        method: "POST",
        body: JSON.stringify(user)
      });
    },
    updateLobbyUser: function (id, user) {
      return request("/lobby-users/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify(user)
      });
    },
    disableLobbyUser: function (id) {
      return request("/lobby-users/" + encodeURIComponent(id) + "/disable", {
        method: "POST"
      });
    },
    clearToken: function () {
      tokenState.idToken = null;
      tokenState.email = null;
    },
    getState: function () {
      return Object.assign({}, tokenState, { baseUrl: baseUrl });
    }
  };
}());
