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
  var exampleInUse = false;
  var usersFromApi = false;
  var representedPage = { items: [], next: null, cursors: [null], index: 0, query: "" };

  function loadRepresentados(panel, direction) {
    var query = direction ? representedPage.query : panel.querySelector("[data-lobby-represented-query]").value.trim();
    var cursors = direction ? representedPage.cursors.slice() : [null];
    var index = direction === "next" ? representedPage.index + 1 : direction === "previous" ? representedPage.index - 1 : 0;
    if (direction === "next") cursors[index] = representedPage.next;
    var button = panel.querySelector("[data-lobby-represented-search]");
    button.disabled = true;
    panel.querySelector("[data-lobby-represented-previous]").disabled = true;
    panel.querySelector("[data-lobby-represented-next]").disabled = true;
    panel.querySelector("[data-lobby-represented-status]").textContent = "Buscando representados...";
    return sendBackground({ type: "api:searchRepresentados", query: query, cursor: cursors[index] }).then(function (response) {
      if (!response || !response.ok) throw new Error(response && response.error || "No se pudieron buscar representados.");
      representedPage = { items: response.representados || [], next: response.nextCursor || null, cursors: cursors.slice(0, index + 1), index: index, query: query };
      ["requester-represented", "assistant-represented"].forEach(function (name) {
        var select = panel.querySelector("[data-lobby-" + name + "]");
        select.replaceChildren(element("option", { value: "" }, ["Selecciona una opcion"]), element("option", { value: "manual" }, ["Completar representado manualmente"]), element("option", { value: "legacy" }, ["Usar representado antiguo del usuario"]));
        representedPage.items.forEach(function (item, i) { select.appendChild(element("option", { value: "r" + i }, [item.nombre + " (" + item.id + ")"])); });
        select.value = "";
      });
      panel.querySelector("[data-lobby-represented-status]").textContent = "Pagina " + (index + 1) + ": " + representedPage.items.length + " representados. Selecciona nuevamente para cada persona.";
    }).catch(function (error) {
      panel.querySelector("[data-lobby-represented-status]").textContent = error.message;
    }).finally(function () {
      button.disabled = false;
      panel.querySelector("[data-lobby-represented-previous]").disabled = representedPage.index === 0;
      panel.querySelector("[data-lobby-represented-next]").disabled = !representedPage.next;
    });
  }

  function selectedRepresentado(panel, name, user) {
    var choice = panel.querySelector("[data-lobby-" + name + "]").value;
    if (choice === "legacy") {
      if (!user || !user.representado) throw new Error("La persona seleccionada no tiene un representado antiguo.");
      return user.representado;
    }
    if (choice === "manual" || (!choice && user && user.tipo === "pasivo")) return null;
    if (!choice) throw new Error("Selecciona un representado o elige completarlo manualmente.");
    var item = representedPage.items[Number(choice.slice(1))];
    if (!item || choice.charAt(0) !== "r") throw new Error("Selecciona un representado valido.");
    var kindSelector = name === "requester-represented" ? "[data-lobby-requester-representation-kind]" : "[data-lobby-assistant-representation-kind]";
    var kind = panel.querySelector(kindSelector).value;
    return sendBackground({ type: "api:getRepresentado", id: item.id }).then(function (response) {
      if (!response || !response.ok || !response.representado || response.representado.active === false) throw new Error(response && response.error || "El representado ya no esta disponible.");
      if (panel.querySelector("[data-lobby-" + name + "]").value !== choice || panel.querySelector(kindSelector).value !== kind || representedPage.items[Number(choice.slice(1))] !== item) {
        throw new Error("La seleccion de representado cambio. Vuelve a intentar.");
      }
      var represented = {};
      ["tipo", "nombre", "nombres", "apellidos", "pasaporte", "identificacion", "identificador", "pais", "actividades", "giro", "domicilio", "region", "comuna", "representanteLegal", "naturaleza", "directorio"].forEach(function (key) {
        if (response.representado[key] != null) represented[key] = response.representado[key];
      });
      represented.tipoRepresentacion = kind || undefined;
      return represented;
    });
  }

  function getAdapter() {
    var adapters = [
      ns.leylobby && ns.leylobby.adapter,
      ns.camara && ns.camara.adapter,
      ns.senado && ns.senado.adapter
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
    var issues = (summary.missing || []).length + (summary.notFound || []).length + (summary.warnings || []).length;
    result.appendChild(element("strong", null, [(summary.filled || []).length + " campos completados; " + issues + " avisos requieren revision."]));
    result.appendChild(element("p", null, ["Revisa los datos en el formulario antes de guardar o solicitar."]));
    if (summary.recovered && summary.recovered.length) renderList(result, "Datos recuperados por el Senado", summary.recovered);
    if (summary.warnings && summary.warnings.length) renderList(result, "Advertencias", summary.warnings);
    if (summary.missing && summary.missing.length) renderList(result, "No encontrados", summary.missing);
    if (summary.notFound && summary.notFound.length) renderList(result, "Opciones no encontradas", summary.notFound);
    if (summary.filled && summary.filled.length) renderList(result, "Completados", summary.filled);
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
    [requesterSelect, modalSelect].forEach(function (select) {
      select.appendChild(element("option", { value: "" }, ["Selecciona una persona"]));
    });

    try {
      var normalized = getPayload(panel);
      if (!normalized.usuarios.length) {
        requesterSelect.disabled = true;
        modalSelect.disabled = true;
        panel.querySelector("[data-lobby-fill-assistant]").disabled = true;
        panel.querySelector("[data-lobby-fill]").disabled = !Object.keys(normalized.solicitud || {}).length;
        setStatus(panel, (exampleInUse ? "Datos de ejemplo activos. " : "") + "No hay usuarios cargados. Busca una persona o usa la carga manual.");
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
      panel.querySelector("[data-lobby-fill]").disabled = false;
      panel.querySelector("[data-lobby-fill-assistant]").disabled = false;
      setStatus(panel, (exampleInUse ? "Datos de ejemplo: no son registros reales. " : "") + "Usuarios disponibles: " + normalized.usuarios.length);
    } catch (error) {
      requesterSelect.disabled = true;
      modalSelect.disabled = true;
      panel.querySelector("[data-lobby-fill]").disabled = true;
      panel.querySelector("[data-lobby-fill-assistant]").disabled = true;
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
    var originalText = textarea.value;
    var currentPayload;
    try {
      currentPayload = getPayload(panel);
    } catch (error) {
      setStatus(panel, "Corrige el JSON de carga manual antes de buscar usuarios.", true);
      return Promise.resolve();
    }
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
        if (textarea.value !== originalText) throw new Error("Los datos cambiaron durante la busqueda. Vuelve a buscar para no perder cambios.");
        var users = responses.map(function (response) {
          if (!response || !response.ok) throw new Error(response && response.error ? response.error : "No se pudo cargar un usuario.");
          return response.user;
        }).filter(Boolean);

        textarea.value = JSON.stringify({
          solicitud: currentPayload.solicitud || {},
          usuarios: users
        }, null, 2);
        usersFromApi = true;
        searchPages = { cursors: cursors.slice(0, index + 1), index: index, next: nextCursor, query: queryText };
        panel.querySelector("[data-lobby-requester-select]").value = "";
        panel.querySelector("[data-lobby-user-select]").value = "";
        panel.querySelector("[data-lobby-requester-represented]").value = "";
        panel.querySelector("[data-lobby-assistant-represented]").value = "";
        updateUserLists(panel);
        setStatus(panel, (exampleInUse ? "Atencion: la solicitud contiene datos de ejemplo. " : "") + "Pagina " + (index + 1) + ": usuarios cargados: " + users.length + searchWarning);
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
          panel.querySelector("[data-lobby-google-login]").style.display = "none";
          panel.querySelector("[data-lobby-logout]").style.display = "inline-flex";
          setAdminButtonVisible(panel, true);
          setAuthStatus(panel, "Sesion activa: " + (response.email || "usuario autenticado"));
          return;
        }
        setAdminButtonVisible(panel, false);
        panel.querySelector("[data-lobby-google-login]").style.display = "inline-flex";
        panel.querySelector("[data-lobby-logout]").style.display = "none";
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

    var adapter = getAdapter();
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
      adapter && adapter.id === "senado-audiencia" ? "top:18px" : "bottom:18px",
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
      "width:min(480px,calc(100vw - 40px))",
      "box-sizing:border-box",
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
    var selectStyle = "width:100%;box-sizing:border-box;padding:7px;border:1px solid #bdc7d8;border-radius:7px";
    var lightButton = "background:#eef2f7;color:#101828;border:0;border-radius:7px;padding:8px 12px;cursor:pointer";
    var authButton = "background:#174ea6;color:#fff;border:0;border-radius:7px;padding:9px 12px;cursor:pointer;font-weight:700";
    panel.append(
      element("div", { style: "position:sticky;top:-16px;z-index:1;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;margin-bottom:10px" }, [
        element("strong", { style: "font-size:17px" }, ["Asistente Lobby"]),
        button("close", "Minimizar", "border:0;background:#eef2f7;border-radius:8px;padding:7px 11px;cursor:pointer")
      ]),
      element("p", { style: "margin:0 0 10px;color:#475467" }, ["Busca una persona, completa el formulario y revisa los datos antes de enviarlo."]),
      element("section", { style: "border:1px solid #d9e0eb;border-radius:10px;padding:10px;margin-bottom:10px;background:#f8fafc" }, [
        element("strong", null, ["Sesion Firebase"]),
        element("p", { "data-lobby-auth-status": "", role: "status", style: "margin:6px 0;color:#475467" }, ["Revisando sesion..."]),
        element("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px" }, [
          button("google-login", "Entrar con Google", authButton + ";font-weight:800"),
          button("logout", "Salir", lightButton + ";padding:9px 12px;font-weight:700"),
          button("open-admin", "Abrir portal admin", "display:none;" + lightButton + ";padding:9px 12px;font-weight:700"),
          button("request-access", "Solicitar acceso", "display:none;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:7px;padding:9px 12px;cursor:pointer;font-weight:800")
        ]),
        element("details", { style: "margin-top:4px" }, [
          element("summary", { style: "cursor:pointer;color:#344054;font-weight:700" }, ["Usar email/password como alternativa"]),
          element("div", { style: "display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-top:8px" }, [
            label("Email", element("input", { "data-lobby-auth-email": "", type: "email", autocomplete: "username", style: inputStyle })),
            label("Password", element("input", { "data-lobby-auth-password": "", type: "password", autocomplete: "current-password", style: inputStyle })),
            button("login", "Entrar", authButton)
          ])
        ])
      ]),
      element("div", { style: "display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:end" }, [
        label("Buscar usuarios", element("input", { "data-lobby-firebase-query": "", type: "text", placeholder: "Nombre, ID, documento o email", style: "width:100%;box-sizing:border-box;" + inputStyle })),
        button("firebase-load", "Buscar", "background:#101828;color:#fff;border:0;border-radius:7px;padding:9px 12px;cursor:pointer;font-weight:700")
      ]),
      element("div", { style: "display:flex;gap:8px;margin-top:8px" }, [button("search-previous", "Pagina anterior", "", true), button("search-next", "Pagina siguiente", "", true)]),
      element("p", { style: "margin:6px 0;color:#475467" }, ["Cada pagina reemplaza los usuarios cargados en el panel."]),
      element("section", { style: "margin-top:12px;border:1px solid #d9e0eb;border-radius:10px;padding:10px" }, [
        element("strong", null, ["Representados"]),
        label("Buscar representados", element("input", { "data-lobby-represented-query": "", type: "search", style: "width:100%;box-sizing:border-box;" + inputStyle })),
        element("div", { style: "display:flex;flex-wrap:wrap;gap:8px;margin-top:8px" }, [button("represented-search", "Buscar representados", lightButton), button("represented-previous", "Pagina anterior", lightButton, true), button("represented-next", "Pagina siguiente", lightButton, true)]),
        element("p", { "data-lobby-represented-status": "", role: "status" }, ["Busca y selecciona un representado para cada persona."])
      ]),
      element("div", { style: "margin-top:14px;border:1px solid #d9e0eb;border-radius:10px;padding:10px;background:#f8fafc" }, [
        element("strong", null, ["Usuarios"]),
        element("p", { "data-lobby-users-status": "", role: "status", style: "margin:6px 0;color:#475467" }, ["Sin cargar."]),
        element("div", { style: "display:grid;grid-template-columns:1fr;gap:10px" }, [
          label("Solicitante", element("select", { "data-lobby-requester-select": "", style: selectStyle })),
          label("Representado del solicitante", element("select", { "data-lobby-requester-represented": "", style: selectStyle }, [element("option", { value: "" }, ["Selecciona una opcion"]), element("option", { value: "manual" }, ["Completar representado manualmente"]), element("option", { value: "legacy" }, ["Usar representado antiguo del usuario"])])),
          label("Tipo de representacion del solicitante", element("select", { "data-lobby-requester-representation-kind": "", style: selectStyle }, [element("option", { value: "" }, ["Sin definir"]), element("option", { value: "legal" }, ["Legal"]), element("option", { value: "contractual" }, ["Contractual"]), element("option", { value: "oficiosa" }, ["Oficiosa"])])),
          element("div", { style: "display:flex;gap:8px;flex-wrap:wrap;align-items:center" }, [
            button("fill", "Rellenar formulario principal", "background:#0b5ed7;color:#fff;border:0;border-radius:7px;padding:8px 12px;cursor:pointer;font-weight:700")
          ]),
          label("Asistente", element("select", { "data-lobby-user-select": "", style: selectStyle })),
          label("Representado del asistente", element("select", { "data-lobby-assistant-represented": "", style: selectStyle }, [element("option", { value: "" }, ["Selecciona una opcion"]), element("option", { value: "manual" }, ["Completar representado manualmente"]), element("option", { value: "legacy" }, ["Usar representado antiguo del usuario"])])),
          label("Tipo de representacion del asistente", element("select", { "data-lobby-assistant-representation-kind": "", style: selectStyle }, [element("option", { value: "" }, ["Sin definir"]), element("option", { value: "legal" }, ["Legal"]), element("option", { value: "contractual" }, ["Contractual"]), element("option", { value: "oficiosa" }, ["Oficiosa"])])),
          button("fill-assistant", "Abrir y rellenar modal", "justify-self:start;background:#198754;color:#fff;border:0;border-radius:7px;padding:8px 12px;cursor:pointer;font-weight:700")
        ])
      ]),
      element("div", { id: RESULT_ID, role: "status", style: "margin-top:14px;border-top:1px solid #d9e0eb;padding-top:10px" }),
      element("details", { style: "margin-top:14px" }, [
        element("summary", { style: "cursor:pointer;font-weight:700" }, ["Carga manual avanzada (JSON)"]),
        label("Datos JSON", element("textarea", { "data-lobby-json": "", style: "width:100%;height:180px;box-sizing:border-box;font:13px/1.4 monospace;border:1px solid #bdc7d8;border-radius:8px;padding:9px" })),
        element("div", { style: "display:flex;gap:8px;margin-top:10px;flex-wrap:wrap" }, [
          button("example", "Ejemplo simple", lightButton), button("full-example", "Ejemplo completo", lightButton), button("reset-json", "Vaciar datos", lightButton), button("clear", "Limpiar resultado", lightButton)
        ])
      ])
    );

    document.body.appendChild(panel);

    var adapter = getAdapter();
    if (adapter && adapter.assistantActionLabel) {
      panel.querySelector("[data-lobby-fill-assistant]").textContent = adapter.assistantActionLabel;
    }

    var textarea = panel.querySelector("[data-lobby-json]");
    textarea.value = JSON.stringify({ solicitud: {}, usuarios: [] }, null, 2);

    function confirmReplaceData() {
      return textarea.value === JSON.stringify({ solicitud: {}, usuarios: [] }, null, 2) ||
        window.confirm("¿Reemplazar los datos cargados en el panel?");
    }

    panel.querySelector("[data-lobby-close]").addEventListener("click", function () {
      hidePanel();
      document.getElementById(TOGGLE_ID).focus();
    });
    panel.querySelector("[data-lobby-example]").addEventListener("click", function () {
      if (!confirmReplaceData()) return;
      textarea.value = JSON.stringify(payloadUtils.EXAMPLE_DATA, null, 2);
      exampleInUse = true;
      usersFromApi = false;
      panel.querySelector("[data-lobby-requester-select]").value = "";
      panel.querySelector("[data-lobby-user-select]").value = "";
      panel.querySelector("[data-lobby-requester-represented]").value = "";
      panel.querySelector("[data-lobby-assistant-represented]").value = "";
      updateUserLists(panel);
    });
    panel.querySelector("[data-lobby-full-example]").addEventListener("click", function () {
      if (!confirmReplaceData()) return;
      textarea.value = JSON.stringify(payloadUtils.EXAMPLE_FULL_DATA, null, 2);
      exampleInUse = true;
      usersFromApi = false;
      panel.querySelector("[data-lobby-requester-select]").value = "";
      panel.querySelector("[data-lobby-user-select]").value = "";
      panel.querySelector("[data-lobby-requester-represented]").value = "";
      panel.querySelector("[data-lobby-assistant-represented]").value = "";
      updateUserLists(panel);
    });
    panel.querySelector("[data-lobby-reset-json]").addEventListener("click", function () {
      if (!window.confirm("¿Vaciar los datos cargados en el panel?")) return;
      textarea.value = JSON.stringify({ solicitud: {}, usuarios: [] }, null, 2);
      exampleInUse = false;
      usersFromApi = false;
      panel.querySelector("[data-lobby-requester-represented]").value = "";
      panel.querySelector("[data-lobby-assistant-represented]").value = "";
      updateUserLists(panel);
    });
    panel.querySelector("[data-lobby-clear]").addEventListener("click", function () {
      document.getElementById(RESULT_ID).replaceChildren();
    });
    panel.querySelector("[data-lobby-firebase-load]").addEventListener("click", function () { loadFirebaseUsersIntoTextarea(panel); });
    panel.querySelector("[data-lobby-represented-search]").addEventListener("click", function () { loadRepresentados(panel); });
    panel.querySelector("[data-lobby-represented-previous]").addEventListener("click", function () { loadRepresentados(panel, "previous"); });
    panel.querySelector("[data-lobby-represented-next]").addEventListener("click", function () { loadRepresentados(panel, "next"); });
    panel.querySelector("[data-lobby-requester-select]").addEventListener("change", function () { panel.querySelector("[data-lobby-requester-represented]").value = ""; panel.querySelector("[data-lobby-requester-representation-kind]").value = ""; });
    panel.querySelector("[data-lobby-user-select]").addEventListener("change", function () { panel.querySelector("[data-lobby-assistant-represented]").value = ""; panel.querySelector("[data-lobby-assistant-representation-kind]").value = ""; });
    panel.querySelector("[data-lobby-requester-represented]").addEventListener("change", function () { panel.querySelector("[data-lobby-requester-representation-kind]").value = ""; });
    panel.querySelector("[data-lobby-assistant-represented]").addEventListener("change", function () { panel.querySelector("[data-lobby-assistant-representation-kind]").value = ""; });
    panel.querySelector("[data-lobby-firebase-query]").addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !panel.querySelector("[data-lobby-firebase-load]").disabled) {
        event.preventDefault();
        loadFirebaseUsersIntoTextarea(panel);
      }
    });
    panel.querySelector("[data-lobby-search-previous]").addEventListener("click", function () { loadFirebaseUsersIntoTextarea(panel, "previous"); });
    panel.querySelector("[data-lobby-search-next]").addEventListener("click", function () { loadFirebaseUsersIntoTextarea(panel, "next"); });
    textarea.addEventListener("input", function () {
      usersFromApi = false;
      panel.querySelector("[data-lobby-requester-select]").value = "";
      panel.querySelector("[data-lobby-user-select]").value = "";
      panel.querySelector("[data-lobby-requester-represented]").value = "";
      panel.querySelector("[data-lobby-assistant-represented]").value = "";
      updateUserLists(panel);
    });

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
          refreshAuthState(panel);
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
          refreshAuthState(panel);
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
        refreshAuthState(panel);
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
        if (getPayload(panel).usuarios.length && requesterSelect.value === "") throw new Error("Selecciona un solicitante.");
        var requesterIndex = requesterSelect && requesterSelect.value !== "" ? Number(requesterSelect.value) : 0;
        var adapter = getAdapter();
        if (!adapter) throw new Error("No se encontro un adaptador para este formulario.");
        var payload = getPayload(panel);
        var requesterValue = requesterSelect.value;
        var representedValue = panel.querySelector("[data-lobby-requester-represented]").value;
        var representationKind = panel.querySelector("[data-lobby-requester-representation-kind]").value;
        var originalData = textarea.value;
        var requester = payload.usuarios[requesterIndex];
        var latestRequester = usersFromApi && requester ? sendBackground({ type: "api:getLobbyUser", id: requester.id }).then(function (response) {
          if (!response || !response.ok || !response.user) throw new Error(response && response.error || "El solicitante ya no esta disponible.");
          return response.user;
        }) : Promise.resolve(requester);
        Promise.all([Promise.resolve().then(function () { return requester ? selectedRepresentado(panel, "requester-represented", requester) : null; }), latestRequester])
          .then(function (values) {
            if (requesterSelect.value !== requesterValue || textarea.value !== originalData || panel.querySelector("[data-lobby-requester-represented]").value !== representedValue || panel.querySelector("[data-lobby-requester-representation-kind]").value !== representationKind) throw new Error("La seleccion cambio. Vuelve a intentar.");
            if (requester && panel.querySelector("[data-lobby-requester-represented]").value === "legacy") {
              values[0] = values[1].representado;
              if (!values[0]) throw new Error("El solicitante ya no tiene un representado antiguo.");
            }
            if (requester) payload.usuarios[requesterIndex] = Object.assign({}, values[1], { representado: values[0] });
            return adapter.fillMainForm(payload, requesterIndex);
          })
          .then(function (summary) {
            if (panel.querySelector("[data-lobby-requester-represented]").value === "manual") summary.warnings.push("Revisa y completa el representado manualmente; pueden existir datos previos en el formulario.");
            else if (representedValue) summary.warnings.push("Revisa los datos del representado: los campos sin datos pueden conservar valores anteriores del formulario.");
            showResult(summary);
          })
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
        if (select.value === "") throw new Error("Selecciona un asistente.");
        var index = Number(select.value);
        var assistant = normalized.usuarios[index];
        if (!assistant) throw new Error("Selecciona un asistente valido.");

        var adapter = getAdapter();
        if (!adapter) throw new Error("No se encontro un adaptador para este formulario.");
        var assistantValue = select.value;
        var representedValue = panel.querySelector("[data-lobby-assistant-represented]").value;
        var representationKind = panel.querySelector("[data-lobby-assistant-representation-kind]").value;
        var originalData = textarea.value;
        var latestAssistant = usersFromApi ? sendBackground({ type: "api:getLobbyUser", id: assistant.id }).then(function (response) {
          if (!response || !response.ok || !response.user) throw new Error(response && response.error || "El asistente ya no esta disponible.");
          return response.user;
        }) : Promise.resolve(assistant);
        Promise.all([Promise.resolve().then(function () { return selectedRepresentado(panel, "assistant-represented", assistant); }), latestAssistant]).then(function (values) {
          if (select.value !== assistantValue || textarea.value !== originalData || panel.querySelector("[data-lobby-assistant-represented]").value !== representedValue || panel.querySelector("[data-lobby-assistant-representation-kind]").value !== representationKind) throw new Error("La seleccion cambio. Vuelve a intentar.");
          if (panel.querySelector("[data-lobby-assistant-represented]").value === "legacy") {
            values[0] = values[1].representado;
            if (!values[0]) throw new Error("El asistente ya no tiene un representado antiguo.");
          }
          assistant = Object.assign({}, values[1], { representado: values[0] });
          return adapter.fillAssistant ? adapter.fillAssistant(assistant) : callBridge("leylobby:fillAssistantModal", assistant);
        })
          .then(function (summary) {
            if (panel.querySelector("[data-lobby-assistant-represented]").value === "manual") summary.warnings.push("Revisa y completa el representado manualmente; pueden existir datos previos en el formulario.");
            else if (representedValue) summary.warnings.push("Revisa los datos del representado: los campos sin datos pueden conservar valores anteriores del formulario.");
            showResult(summary);
          })
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
  if (getAdapter().id === "senado-audiencia" && window.top !== window && location.hostname === "lobby.senado.cl") return;
  createToggleButton();
}());
