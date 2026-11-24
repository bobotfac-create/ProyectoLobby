(function () {
  "use strict";

  var root = typeof globalThis !== "undefined" ? globalThis : window;
  var ns = root.AsistenteLobby = root.AsistenteLobby || {};
  var payloadUtils = ns.payload;

  function isLeyLobbyPage() {
    return location.hostname === "www.leylobby.gob.cl" || location.hostname === "leylobby.gob.cl";
  }

  function getForm() {
    return document.querySelector("#SolicitudesAudienciaForm");
  }

  function query(rootNode, selector) {
    return rootNode ? rootNode.querySelector(selector) : null;
  }

  function dispatchFieldEvents(element) {
    if (!element) return;
    ["input", "change", "blur"].forEach(function (eventName) {
      element.dispatchEvent(new Event(eventName, { bubbles: true }));
    });
  }

  function setValueIn(rootNode, selector, value, label, summary) {
    if (value == null || value === "") return false;

    var element = query(rootNode, selector);
    if (!element) {
      summary.missing.push(label + " (no encontrado: " + selector + ")");
      return false;
    }

    element.value = String(value);
    dispatchFieldEvents(element);
    summary.filled.push(label);
    return true;
  }

  function selectOptionIn(rootNode, selector, value, label, summary) {
    if (value == null || value === "") return false;

    var select = query(rootNode, selector);
    if (!select) {
      summary.missing.push(label + " (no encontrado: " + selector + ")");
      return false;
    }

    var raw = String(value).trim();
    var target = payloadUtils.normalize(raw);
    var options = Array.prototype.slice.call(select.options || []);
    var exactValue = options.find(function (option) {
      return String(option.value).trim() === raw;
    });
    var exactText = options.find(function (option) {
      return payloadUtils.normalize(option.textContent) === target;
    });
    var partialText = options.find(function (option) {
      return target && payloadUtils.normalize(option.textContent).indexOf(target) !== -1;
    });
    var option = exactValue || exactText || partialText;

    if (!option) {
      summary.notFound.push(label + " opcion no encontrada: " + raw);
      return false;
    }

    select.value = option.value;
    dispatchFieldEvents(select);
    summary.filled.push(label + " -> " + option.textContent.trim());
    return true;
  }

  function normalizeMedio(value) {
    var normalized = payloadUtils.normalize(value);
    if (["email", "e-mail", "mail", "correo", "correo electronico"].indexOf(normalized) !== -1) return "email";
    if (["telefono", "tel", "fono"].indexOf(normalized) !== -1) return "telefono";
    return value;
  }

  function normalizeGenero(value) {
    var normalized = payloadUtils.normalize(value);
    var map = {
      masculino: "masculino",
      hombre: "masculino",
      femenino: "femenino",
      mujer: "femenino",
      otro: "otro",
      "prefiero no decir": "prefiero_no_decir",
      prefiero_no_decir: "prefiero_no_decir"
    };
    return map[normalized] || value;
  }

  function setCheckbox(element, desired, label, summary) {
    if (!element) {
      summary.missing.push(label + " (no encontrado)");
      return false;
    }

    var shouldCheck = Boolean(desired);
    if (element.checked !== shouldCheck) element.click();
    summary.filled.push(label + " -> " + (shouldCheck ? "marcado" : "desmarcado"));
    return true;
  }

  function selectMatter(form, matter, summary) {
    var checkboxes = Array.prototype.slice.call(
      form.querySelectorAll('input[type="checkbox"][onchange*="onMateriaChange"]')
    );
    var raw = String(matter == null ? "" : matter).trim();
    var target = payloadUtils.normalize(raw);

    var checkbox = checkboxes.find(function (element) {
      return String(element.value).trim() === raw;
    });

    if (!checkbox) {
      checkbox = checkboxes.find(function (element) {
        var text = element.closest("label, .form-check");
        return target && payloadUtils.normalize(text ? text.textContent : "").indexOf(target) !== -1;
      });
    }

    if (!checkbox) {
      summary.notFound.push("Materia no encontrada: " + raw);
      return false;
    }

    if (!checkbox.checked) checkbox.click();

    var textNode = checkbox.closest("label, .form-check");
    var text = textNode ? textNode.textContent.replace(/\s+/g, " ").trim() : checkbox.value;
    summary.filled.push("Materia -> " + checkbox.value + " " + text.slice(0, 80));
    return true;
  }

  function setAsistira(form, value, summary) {
    if (value == null) {
      summary.warnings.push("asistira no fue indicado; queda para revision manual.");
      return false;
    }

    var expected = Boolean(value) ? "1" : "0";
    var radios = Array.prototype.slice.call(form.querySelectorAll('input[name="asistente"]'));
    var radio = radios.find(function (element) {
      return (element.getAttribute("onchange") || "").indexOf("'" + expected + "'") !== -1;
    });

    if (!radio) {
      summary.missing.push("Asistira (radio no encontrado)");
      return false;
    }

    if (!radio.checked) radio.click();

    summary.filled.push("Asistira -> " + (expected === "1" ? "Si" : "No"));
    if (expected === "1") {
      summary.warnings.push("Marcar 'Si asistira' puede abrir el modal de asistente; revisalo manualmente.");
    } else {
      summary.warnings.push("Con 'No asistira' el formulario exigira asistentes; agregalos desde el selector de la extension.");
    }

    return true;
  }

  function clearHoneypot(form, summary) {
    var honeypot = query(form, '[name="website"]');
    if (honeypot) {
      honeypot.value = "";
      summary.filled.push("Campo antispam website mantenido vacio");
    }
  }

  function validateRecommendedData(data, summary) {
    ["cargo", "nombres", "apellidos", "pasaporte", "paisEmisor", "medio", "genero", "referencia"].forEach(function (key) {
      if (data[key] == null || data[key] === "") summary.warnings.push("Falta dato recomendado: " + key);
    });

    if (!Array.isArray(data.materias) || data.materias.length === 0) {
      summary.warnings.push("Falta al menos una materia.");
    }

    if (data.aceptaPoliticas !== true) {
      summary.warnings.push("aceptaPoliticas no es true; el checkbox no se marcara automaticamente.");
    }
  }

  function fillMainForm(data, requesterIndex) {
    var payload = payloadUtils.normalizePayload(data);
    var summary = { filled: [], missing: [], notFound: [], warnings: [] };

    if (!isLeyLobbyPage()) {
      summary.warnings.push("No parece ser leylobby.gob.cl. Revisa antes de continuar.");
    }

    var form = getForm();
    if (!form) {
      throw new Error("No se encontro #SolicitudesAudienciaForm. Abre primero el formulario final de audiencia.");
    }

    var requester = null;
    if (payload.usuarios.length) {
      requester = payload.usuarios[requesterIndex];
      if (!requester) throw new Error("Selecciona un solicitante valido.");
      summary.filled.push("Solicitante -> " + payloadUtils.userLabel(requester, requesterIndex));
    } else {
      summary.warnings.push("No hay lista de usuarios; se usara el JSON plano como solicitante.");
    }

    var solicitud = payloadUtils.buildSolicitudFromUser(payload.solicitud, requester);
    validateRecommendedData(solicitud, summary);
    clearHoneypot(form, summary);

    selectOptionIn(form, '[name="cargo"]', solicitud.cargo, "Cargo", summary);
    setValueIn(form, '[name="nombres"]', solicitud.nombres, "Nombres", summary);
    setValueIn(form, '[name="apellidos"]', solicitud.apellidos, "Apellidos", summary);
    selectOptionIn(form, '[name="paisEmisor"]', solicitud.paisEmisor, "Pais emisor", summary);
    setValueIn(form, '[name="pasaporte"]', solicitud.pasaporte, "RUT/Pasaporte", summary);

    selectOptionIn(form, '[name="medio"]', normalizeMedio(solicitud.medio), "Medio de contacto", summary);
    if (normalizeMedio(solicitud.medio) === "telefono") {
      setValueIn(form, '[name="mediotelefono"]', solicitud.telefono, "Telefono", summary);
    } else if (normalizeMedio(solicitud.medio) === "email") {
      setValueIn(form, '[name="medioemail"]', solicitud.email, "Email", summary);
    } else {
      setValueIn(form, '[name="mediotelefono"]', solicitud.telefono, "Telefono", summary);
      setValueIn(form, '[name="medioemail"]', solicitud.email, "Email", summary);
    }

    selectOptionIn(form, '[name="genero"]', normalizeGenero(solicitud.genero), "Genero", summary);

    if (Array.isArray(solicitud.materias)) {
      solicitud.materias.forEach(function (matter) {
        selectMatter(form, matter, summary);
      });
    }

    setValueIn(form, '[name="referencia"]', solicitud.referencia, "Referencia", summary);
    setValueIn(form, '[name="observaciones"]', solicitud.observaciones, "Observaciones", summary);

    if (solicitud.aceptaPoliticas === true) {
      setCheckbox(query(form, "#politicasCheckbox"), true, "Politicas", summary);
    }

    setAsistira(form, solicitud.asistira, summary);

    if (payload.usuarios.length) {
      summary.warnings.push("Usuarios disponibles en JSON: " + payload.usuarios.length + ". Puedes elegir cualquiera para rellenar el modal, incluyendo al solicitante.");
    }

    summary.warnings.push("Revisa manualmente el formulario, resuelve Turnstile y presiona Solicitar solo si todo esta correcto.");
    return summary;
  }

  ns.leylobby = ns.leylobby || {};
  ns.leylobby.adapter = {
    id: "leylobby-audiencia",
    label: "Ley Lobby - Solicitud de audiencia",
    detect: function () {
      return isLeyLobbyPage() && Boolean(getForm());
    },
    fillMainForm: fillMainForm
  };
}());
