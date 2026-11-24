(function () {
  "use strict";

  var root = typeof globalThis !== "undefined" ? globalThis : window;
  var ns = root.AsistenteLobby = root.AsistenteLobby || {};
  var payloadUtils = ns.payload;
  var config = ns.config;
  var browserApi = root.browser || root.chrome;
  var PANEL_ID = "asistente-lobby-panel";
  var TOGGLE_ID = "asistente-lobby-toggle";
  var RESULT_ID = "asistente-lobby-result";
  var bridgeRequestId = 0;
  var bridgeRequests = {};
  var bridgeReadyPromise = null;
  var searchPages = { cursors: [null], index: 0, next: null, query: "" };

  function getAdapter() {
    var adapters = [
      ns.leylobby && ns.leylobby.adapter,
      ns.camara && ns.camara.adapter
    ];
    return adapters.find(function (adapter) {
      return adapter && adapter.detect && adapter.detect();
    }) || null;
  }

  function sendBackground(message) {
    if (!browserApi || !browserApi.runtime || !browserApi.runtime.sendMessage) {
      return Promise.reject(new Error("API de extension no disponible."));
    }

    if (root.browser && root.browser.runtime && root.browser.runtime.sendMessage) {
      return root.browser.runtime.sendMessage(message);
    }

    return new Promise(function (resolve, reject) {
      browserApi.runtime.sendMessage(message, function (response) {
        var lastError = browserApi.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function parsePanelJson(panel) {
    var textarea = panel.querySelector("[data-lobby-json]");
    if (!textarea) throw new Error("No se encontro el textarea del panel.");
    return JSON.parse(textarea.value);
  }

  function getPayload(panel) {
    return payloadUtils.normalizePayload(parsePanelJson(panel));
  }

  function element(tag, attributes, children) {
    var node = document.createElement(tag);
    Object.keys(attributes || {}).forEach(function (name) {
      node.setAttribute(name, attributes[name]);
    });
    (children || []).forEach(function (child) {
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function renderList(result, title, items, emptyText) {
    result.appendChild(element("h4", null, [title]));
    if (!items || !items.length) {
      result.appendChild(element("p", null, [emptyText]));
      return;
    }
    var list = element("ul");
    items.forEach(function (item) {
      var entry = element("li");
      entry.textContent = String(item == null ? "" : item);
      list.appendChild(entry);
    });
    result.appendChild(list);
  }

  function showResult(summary) {
    var result = document.getElementById(RESULT_ID);
    if (!result) return;

    result.replaceChildren();
    renderList(result, "Completados", summary.filled, "Nada completado");
    renderList(result, "No encontrados", summary.missing, "Sin campos faltantes");
    renderList(result, "Opciones no encontradas", summary.notFound, "Sin opciones faltantes");
    renderList(result, "Advertencias", summary.warnings, "Sin advertencias");
  }

  function setStatus(panel, message, isError) {
    var status = panel.querySelector("[data-lobby-users-status]");
    if (!status) return;
    status.textContent = message || "";
    status.style.color = isError ? "#b42318" : "#475467";
  }

  function setAuthStatus(panel, message, isError) {
    var status = panel.querySelector("[data-lobby-auth-status]");
    if (!status) return;
    status.textContent = message || "";
    status.style.color = isError ? "#b42318" : "#475467";
  }

  function setAccessRequestVisible(panel, isVisible) {
    var button = panel.querySelector("[data-lobby-request-access]");
    if (button) button.style.display = isVisible ? "inline-flex" : "none";
  }

  function setAdminButtonVisible(panel, isVisible) {
    var button = panel.querySelector("[data-lobby-open-admin]");
    if (button) button.style.display = isVisible ? "inline-flex" : "none";
  }

  function isAuthorizationError(error) {
    var message = String(error && error.message ? error.message : error || "");
    return message.indexOf("Usuario no autorizado") !== -1 || message.indexOf("Usuario desactivado") !== -1;
  }

  function updateUserLists(panel) {
    var requesterSelect = panel.querySelector("[data-lobby-requester-select]");
    var modalSelect = panel.querySelector("[data-lobby-user-select]");
    if (!requesterSelect || !modalSelect) return;

    var previousRequesterValue = requesterSelect.value;
    var previousModalValue = modalSelect.value;
    requesterSelect.replaceChildren();
    modalSelect.replaceChildren();

    try {
      var normalized = getPayload(panel);
      if (!normalized.usuarios.length) {
        requesterSelect.disabled = true;
        modalSelect.disabled = true;
        setStatus(panel, "No hay usuarios en el JSON.");
        return;
      }

      normalized.usuarios.forEach(function (user, index) {
        var requesterOption = document.createElement("option");
        requesterOption.value = String(index);
        requesterOption.textContent = payloadUtils.userLabel(user, index);
        requesterSelect.appendChild(requesterOption);

        var modalOption = document.createElement("option");
        modalOption.value = String(index);
        modalOption.textContent = payloadUtils.userLabel(user, index);
        modalSelect.appendChild(modalOption);
      });

      if (previousRequesterValue !== "" && normalized.usuarios[Number(previousRequesterValue)]) {
        requesterSelect.value = previousRequesterValue;
      }
      if (previousModalValue !== "" && normalized.usuarios[Number(previousModalValue)]) {
        modalSelect.value = previousModalValue;
      }

      requesterSelect.disabled = false;
      modalSelect.disabled = false;
      setStatus(panel, "Usuarios disponibles: " + normalized.usuarios.length);
    } catch (error) {
      requesterSelect.disabled = true;
      modalSelect.disabled = true;
      setStatus(panel, "JSON invalido: " + (error && error.message ? error.message : String(error)), true);
    }
  }

  function injectBridge() {
    if (document.documentElement.dataset.asistenteLobbyBridgeInjected === "true") {
      return bridgeReadyPromise || Promise.resolve();
    }
    document.documentElement.dataset.asistenteLobbyBridgeInjected = "true";

    bridgeReadyPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = browserApi.runtime.getURL("src/page-bridge.js");
      script.async = false;
      script.onload = function () {
        script.remove();
        resolve();
      };
      script.onerror = function () {
        reject(new Error("No se pudo cargar page-bridge.js."));
      };
      document.documentElement.appendChild(script);
    });

    return bridgeReadyPromise;
  }

  function callBridge(type, payload) {
    return injectBridge().then(function () {
      return new Promise(function (resolve, reject) {
      var requestId = "bridge-" + Date.now() + "-" + (++bridgeRequestId);
      var timeout = window.setTimeout(function () {
        delete bridgeRequests[requestId];
        reject(new Error("Tiempo agotado esperando respuesta del bridge."));
      }, 15000);

      bridgeRequests[requestId] = function (response) {
        window.clearTimeout(timeout);
        if (!response.ok) {
          reject(new Error(response.payload && response.payload.error ? response.payload.error : "Error en page bridge."));
          return;
        }
        resolve(response.payload);
      };

      window.postMessage({
        source: config.contentMessageSource,
        type: type,
        requestId: requestId,
        payload: payload
      }, window.location.origin);
      });
    });
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;

    var data = event.data || {};
    if (data.source !== config.bridgeMessageSource) return;

    var handler = bridgeRequests[data.requestId];
    if (!handler) return;
    delete bridgeRequests[data.requestId];
    handler(data);
  });

  function loadFirebaseUsersIntoTextarea(panel, direction) {
    var textarea = panel.querySelector("[data-lobby-json]");
    var searchInput = panel.querySelector("[data-lobby-firebase-query]");
    var queryText = direction ? searchPages.query : (searchInput ? searchInput.value : "");
    var cursors = direction ? searchPages.cursors.slice() : [null];
    var index = direction === "next" ? searchPages.index + 1 : direction === "previous" ? searchPages.index - 1 : 0;
    if (direction === "next") cursors[index] = searchPages.next;
    var searchWarning = "";
    var nextCursor = null;
    var previousButton = panel.querySelector("[data-lobby-search-previous]");
    var nextButton = panel.querySelector("[data-lobby-search-next]");
    var loadButton = panel.querySelector("[data-lobby-firebase-load]");
    previousButton.disabled = nextButton.disabled = loadButton.disabled = true;

    setStatus(panel, "Buscando usuarios en Firebase...");

    return sendBackground({ type: "api:searchLobbyUsers", query: queryText, cursor: cursors[index] })
      .then(function (response) {
        if (!response || !response.ok) throw new Error(response && response.error ? response.error : "No se pudo buscar usuarios.");
        if (response.scanTruncated) searchWarning = " La busqueda solo reviso los primeros 200 registros; pueden faltar coincidencias.";
        if (response.resultsTruncated && !response.nextCursor) searchWarning += " Hay mas de 25 coincidencias; precisa la busqueda.";
        if (!response.users || !response.users.length) throw new Error("No se encontraron usuarios para esa busqueda." + searchWarning);

        nextCursor = response.nextCursor || null;

        setStatus(panel, "Cargando detalles de " + response.users.length + " usuario(s)...");
        return Promise.all(response.users.map(function (user) {
          return sendBackground({ type: "api:getLobbyUser", id: user.id });
        }));
      })
      .then(function (responses) {
        var users = responses.map(function (response) {
          if (!response || !response.ok) throw new Error(response && response.error ? response.error : "No se pudo cargar un usuario.");
          return response.user;
        }).filter(Boolean);

        var currentPayload;
        try {
          currentPayload = getPayload(panel);
        } catch (error) {
          currentPayload = payloadUtils.normalizePayload(payloadUtils.EXAMPLE_FULL_DATA);
        }

        textarea.value = JSON.stringify({
          solicitud: currentPayload.solicitud || {},
          usuarios: users
        }, null, 2);
        searchPages = { cursors: cursors.slice(0, index + 1), index: index, next: nextCursor, query: queryText };
        updateUserLists(panel);
        setStatus(panel, "Pagina " + (index + 1) + ": usuarios cargados desde Firebase: " + users.length + searchWarning);
      })
      .catch(function (error) {
        if (isAuthorizationError(error)) {
          setAccessRequestVisible(panel, true);
          setAuthStatus(panel, "Tu cuenta no tiene acceso autorizado. Puedes solicitar acceso a un administrador.", true);
        }
        setStatus(panel, "Error Firebase: " + (error && error.message ? error.message : String(error)), true);
      }).finally(function () {
        loadButton.disabled = false;
        previousButton.disabled = searchPages.index === 0;
        nextButton.disabled = !searchPages.next;
      });
  }

  function refreshAuthState(panel) {
    return sendBackground({ type: "auth:getState" })
      .then(function (response) {
        if (response && response.authenticated) {
          setAdminButtonVisible(panel, true);
          setAuthStatus(panel, "Sesion activa: " + (response.email || "usuario autenticado"));
          return;
        }
        setAdminButtonVisible(panel, false);
        setAuthStatus(panel, "Sin sesion. Inicia sesion para buscar usuarios en Firebase.");
      })
      .catch(function (error) {
        setAuthStatus(panel, "No se pudo leer la sesion: " + (error && error.message ? error.message : String(error)), true);
      });
  }

  function setPanelVisible(isVisible) {
    var panel = document.getElementById(PANEL_ID);
    var toggle = document.getElementById(TOGGLE_ID);

    if (panel) panel.style.display = isVisible ? "block" : "none";
    if (toggle) {
      toggle.textContent = isVisible ? "Ocultar Asistente Lobby" : "Abrir Asistente Lobby";
      toggle.setAttribute("aria-expanded", isVisible ? "true" : "false");
    }
  }

  function hidePanel() {
    setPanelVisible(false);
  }

  function showPanel() {
    createPanel();
    setPanelVisible(true);
  }

  function togglePanel() {
    var panel = document.getElementById(PANEL_ID);
    var isVisible = panel && panel.style.display !== "none";
    if (isVisible) {
      hidePanel();
    } else {
      showPanel();
    }
  }

  function createToggleButton() {
    if (document.getElementById(TOGGLE_ID)) return;

    var button = document.createElement("button");
    button.id = TOGGLE_ID;
    button.type = "button";
    button.textContent = "Abrir Asistente Lobby";
    button.setAttribute("aria-controls", PANEL_ID);
    button.setAttribute("aria-expanded", "false");
    button.style.cssText = [
      "position:fixed",
      "z-index:2147483646",
      "right:18px",
      "bottom:18px",
      "background:#101828",
      "color:#fff",
      "border:0",
      "border-radius:999px",
      "box-shadow:0 12px 30px rgba(16,24,40,.26)",
      "font:700 14px/1 Arial,sans-serif",
      "padding:12px 16px",
      "cursor:pointer"
    ].join(";");
    button.addEventListener("click", togglePanel);
    document.body.appendChild(button);
  }

  function createPanel() {
    var existing = document.getElementById(PANEL_ID);
    if (existing) {
      return existing;
    }

    var panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "top:20px",
      "right:20px",
      "width:min(720px,calc(100vw - 40px))",
      "max-height:calc(100vh - 40px)",
      "overflow:auto",
      "background:#fff",
      "color:#101828",
      "border:1px solid #cfd7e6",
      "border-radius:12px",
      "box-shadow:0 18px 54px rgba(16,24,40,.24)",
      "font:14px/1.4 Arial,sans-serif",
      "padding:16px"
    ].join(";");

    function button(name, label, style, disabled) {
      var attrs = { type: "button", style: style || "" };
      attrs["data-lobby-" + name] = "";
      if (disabled) attrs.disabled = "";
      return element("button", attrs, [label]);
    }
    function label(text, control) {
      return element("label", { style: "display:grid;gap:4px" }, [element("span", null, [text]), control]);
    }
    var inputStyle = "padding:8px;border:1px solid #bdc7d8;border-radius:7px";
    var selectStyle = "min-width:260px;max-width:100%;padding:7px;border:1px solid #bdc7d8;border-radius:7px";
    var lightButton = "background:#eef2f7;color:#101828;border:0;border-radius:7px;padding:8px 12px;cursor:pointer";
    var authButton = "background:#174ea6;color:#fff;border:0;border-radius:7px;padding:9px 12px;cursor:pointer;font-weight:700";
    panel.append(
      element("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px" }, [
        element("strong", { style: "font-size:17px" }, ["Asistente Lobby"]),
        button("close", "Minimizar", "border:0;background:#eef2f7;border-radius:8px;padding:7px 11px;cursor:pointer")
      ]),
      element("p", { style: "margin:0 0 10px;color:#475467" }, ["Pega el JSON o carga usuarios desde Firebase. La extension no toca captcha ni envia formularios."]),
      element("section", { style: "border:1px solid #d9e0eb;border-radius:10px;padding:10px;margin-bottom:10px;background:#f8fafc" }, [
        element("strong", null, ["Sesion Firebase"]),
        element("p", { "data-lobby-auth-status": "", style: "margin:6px 0;color:#475467" }, ["Revisando sesion..."]),
        element("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px" }, [
          button("google-login", "Entrar con Google", authButton + ";font-weight:800"),
          button("logout", "Salir", lightButton + ";padding:9px 12px;font-weight:700"),
          button("open-admin", "Abrir portal admin", "display:none;" + lightButton + ";padding:9px 12px;font-weight:700"),
          button("request-access", "Solicitar acceso", "display:none;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:7px;padding:9px 12px;cursor:pointer;font-weight:800")
        ]),
        element("details", { style: "margin-top:4px" }, [
          element("summary", { style: "cursor:pointer;color:#344054;font-weight:700" }, ["Usar email/password como alternativa"]),
          element("div", { style: "display:grid;grid-template-columns:minmax(160px,1fr) minmax(160px,1fr) auto;gap:8px;align-items:end;margin-top:8px" }, [
            label("Email", element("input", { "data-lobby-auth-email": "", type: "email", autocomplete: "username", style: inputStyle })),
            label("Password", element("input", { "data-lobby-auth-password": "", type: "password", autocomplete: "current-password", style: inputStyle })),
            button("login", "Entrar", authButton)
          ])
        ])
      ]),
      element("textarea", { "data-lobby-json": "", style: "width:100%;height:240px;box-sizing:border-box;font:13px/1.4 monospace;border:1px solid #bdc7d8;border-radius:8px;padding:9px" }),
      element("div", { style: "display:flex;gap:8px;margin-top:10px;flex-wrap:wrap" }, [
        button("example", "Ejemplo simple", lightButton), button("full-example", "Ejemplo completo", lightButton), button("clear", "Limpiar resultado", lightButton)
      ]),
      element("div", { style: "display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:10px;align-items:end" }, [
        label("Buscar usuarios en Firebase", element("input", { "data-lobby-firebase-query": "", type: "text", placeholder: "Nombre, id, documento o email", style: "width:100%;box-sizing:border-box;" + inputStyle })),
        button("firebase-load", "Cargar Firebase", "background:#101828;color:#fff;border:0;border-radius:7px;padding:9px 12px;cursor:pointer;font-weight:700")
      ]),
      element("div", { style: "display:flex;gap:8px;margin-top:8px" }, [button("search-previous", "Pagina anterior", "", true), button("search-next", "Pagina siguiente", "", true)]),
      element("p", { style: "margin:6px 0;color:#475467" }, ["Cada pagina reemplaza los usuarios cargados en el panel."]),
      element("div", { style: "margin-top:14px;border:1px solid #d9e0eb;border-radius:10px;padding:10px;background:#f8fafc" }, [
        element("strong", null, ["Usuarios"]),
        element("p", { "data-lobby-users-status": "", role: "status", style: "margin:6px 0;color:#475467" }, ["Sin cargar."]),
        element("div", { style: "display:grid;grid-template-columns:1fr;gap:10px" }, [
          label("Solicitante", element("select", { "data-lobby-requester-select": "", style: selectStyle })),
          element("div", { style: "display:flex;gap:8px;flex-wrap:wrap;align-items:center" }, [
            button("fill", "Rellenar formulario principal", "background:#0b5ed7;color:#fff;border:0;border-radius:7px;padding:8px 12px;cursor:pointer;font-weight:700"),
            button("refresh-users", "Actualizar listas", lightButton)
          ]),
          label("Usuario para modal", element("select", { "data-lobby-user-select": "", style: selectStyle })),
          button("fill-assistant", "Abrir y rellenar modal", "justify-self:start;background:#198754;color:#fff;border:0;border-radius:7px;padding:8px 12px;cursor:pointer;font-weight:700")
        ])
      ]),
      element("div", { id: RESULT_ID, style: "margin-top:14px;border-top:1px solid #d9e0eb;padding-top:10px" })
    );

    document.body.appendChild(panel);

    var adapter = getAdapter();
    if (adapter && adapter.assistantActionLabel) {
      panel.querySelector("[data-lobby-fill-assistant]").textContent = adapter.assistantActionLabel;
    }

    var textarea = panel.querySelector("[data-lobby-json]");
    textarea.value = JSON.stringify(payloadUtils.EXAMPLE_FULL_DATA, null, 2);

    panel.querySelector("[data-lobby-close]").addEventListener("click", hidePanel);
    panel.querySelector("[data-lobby-example]").addEventListener("click", function () {
      textarea.value = JSON.stringify(payloadUtils.EXAMPLE_DATA, null, 2);
      updateUserLists(panel);
    });
    panel.querySelector("[data-lobby-full-example]").addEventListener("click", function () {
      textarea.value = JSON.stringify(payloadUtils.EXAMPLE_FULL_DATA, null, 2);
      updateUserLists(panel);
    });
    panel.querySelector("[data-lobby-clear]").addEventListener("click", function () {
      showResult({ filled: [], missing: [], notFound: [], warnings: [] });
    });
    panel.querySelector("[data-lobby-refresh-users]").addEventListener("click", function () { updateUserLists(panel); });
    panel.querySelector("[data-lobby-firebase-load]").addEventListener("click", function () { loadFirebaseUsersIntoTextarea(panel); });
    panel.querySelector("[data-lobby-search-previous]").addEventListener("click", function () { loadFirebaseUsersIntoTextarea(panel, "previous"); });
    panel.querySelector("[data-lobby-search-next]").addEventListener("click", function () { loadFirebaseUsersIntoTextarea(panel, "next"); });
    textarea.addEventListener("input", function () { updateUserLists(panel); });

    panel.querySelector("[data-lobby-login]").addEventListener("click", function () {
      var email = panel.querySelector("[data-lobby-auth-email]").value.trim();
      var password = panel.querySelector("[data-lobby-auth-password]").value;
      setAuthStatus(panel, "Iniciando sesion...");
      sendBackground({ type: "auth:login", email: email, password: password })
        .then(function (response) {
          if (!response || !response.ok) throw new Error(response && response.error ? response.error : "No se pudo iniciar sesion.");
          panel.querySelector("[data-lobby-auth-password]").value = "";
          setAccessRequestVisible(panel, false);
          setAdminButtonVisible(panel, true);
          setAuthStatus(panel, "Sesion activa: " + (response.email || email));
        })
        .catch(function (error) {
          setAuthStatus(panel, error && error.message ? error.message : String(error), true);
        });
    });

    panel.querySelector("[data-lobby-google-login]").addEventListener("click", function () {
      setAuthStatus(panel, "Abriendo login de Google...");
      sendBackground({ type: "auth:loginGoogle" })
        .then(function (response) {
          if (!response || !response.ok) throw new Error(response && response.error ? response.error : "No se pudo iniciar sesion con Google.");
          setAccessRequestVisible(panel, false);
          setAdminButtonVisible(panel, true);
          setAuthStatus(panel, "Sesion activa: " + (response.email || "usuario Google"));
        })
        .catch(function (error) {
          setAuthStatus(panel, error && error.message ? error.message : String(error), true);
        });
    });

    panel.querySelector("[data-lobby-logout]").addEventListener("click", function () {
      sendBackground({ type: "auth:logout" }).then(function () {
        setAccessRequestVisible(panel, false);
        setAdminButtonVisible(panel, false);
        setAuthStatus(panel, "Sesion cerrada.");
      });
    });

    panel.querySelector("[data-lobby-open-admin]").addEventListener("click", function () {
      window.open(config.firebaseBaseUrl + "/admin.html", "_blank", "noopener");
    });

    panel.querySelector("[data-lobby-request-access]").addEventListener("click", function () {
      setAuthStatus(panel, "Enviando solicitud de acceso...");
      sendBackground({ type: "api:requestAccess" })
        .then(function (response) {
          if (!response || !response.ok) throw new Error(response && response.error ? response.error : "No se pudo solicitar acceso.");
          if (response.alreadyAuthorized) {
            setAccessRequestVisible(panel, false);
            setAuthStatus(panel, "Tu cuenta ya esta autorizada. Intenta cargar usuarios nuevamente.");
            return;
          }
          setAuthStatus(panel, "Solicitud enviada. Un administrador debe aprobar tu acceso.");
        })
        .catch(function (error) {
          setAuthStatus(panel, error && error.message ? error.message : String(error), true);
        });
    });

    panel.querySelector("[data-lobby-fill]").addEventListener("click", function () {
      try {
        updateUserLists(panel);
        var requesterSelect = panel.querySelector("[data-lobby-requester-select]");
        var requesterIndex = requesterSelect && requesterSelect.value !== "" ? Number(requesterSelect.value) : 0;
        var adapter = getAdapter();
        if (!adapter) throw new Error("No se encontro un adaptador para este formulario.");
        Promise.resolve(adapter.fillMainForm(parsePanelJson(panel), requesterIndex))
          .then(showResult)
          .catch(function (error) {
            showResult({ filled: [], missing: [], notFound: [], warnings: ["Error: " + (error && error.message ? error.message : String(error))] });
          });
      } catch (error) {
        showResult({ filled: [], missing: [], notFound: [], warnings: ["Error: " + (error && error.message ? error.message : String(error))] });
      }
    });

    panel.querySelector("[data-lobby-fill-assistant]").addEventListener("click", function () {
      try {
        var normalized = getPayload(panel);
        var select = panel.querySelector("[data-lobby-user-select]");
        var index = Number(select.value);
        var assistant = normalized.usuarios[index];
        if (!assistant) throw new Error("Selecciona un asistente valido.");

        var adapter = getAdapter();
        if (!adapter) throw new Error("No se encontro un adaptador para este formulario.");
        var fillAssistant = adapter.fillAssistant
          ? adapter.fillAssistant(assistant)
          : callBridge("leylobby:fillAssistantModal", assistant);
        Promise.resolve(fillAssistant)
          .then(showResult)
          .catch(function (error) {
            showResult({ filled: [], missing: [], notFound: [], warnings: ["Error: " + (error && error.message ? error.message : String(error))] });
          });
      } catch (error) {
        showResult({ filled: [], missing: [], notFound: [], warnings: ["Error: " + (error && error.message ? error.message : String(error))] });
      }
    });

    updateUserLists(panel);
    refreshAuthState(panel);

    return panel;
  }

  if (!getAdapter()) return;
  createToggleButton();
}());
