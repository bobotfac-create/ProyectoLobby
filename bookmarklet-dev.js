(function () {
  "use strict";

  var PANEL_ID = "lobby-bookmarklet-panel";
  var RESULT_ID = "lobby-bookmarklet-result";
  var FIREBASE_BASE_URL_STORAGE_KEY = "lobbyFirebaseBaseUrl";

  var EXAMPLE_DATA = {
    cargo: "Subsecretario",
    nombres: "Juan",
    apellidos: "Perez",
    pasaporte: "12345678-9",
    paisEmisor: "CHL",
    medio: "email",
    telefono: "+56912345678",
    email: "juan@example.com",
    genero: "masculino",
    asistira: true,
    materias: ["1"],
    referencia: "Materia especifica a tratar en la audiencia.",
    observaciones: "Observaciones adicionales.",
    aceptaPoliticas: true
  };

  var EXAMPLE_FULL_DATA = {
    solicitud: {
      cargo: "Subsecretario",
      asistira: null,
      materias: ["1"],
      referencia: "Materia especifica a tratar en la audiencia.",
      observaciones: "Observaciones adicionales.",
      aceptaPoliticas: true
    },
    usuarios: [
      {
        id: "mock_lobista_remunerado",
        label: "Ana Rojas - Lobista remunerada",
        nombres: "Ana",
        apellidos: "Rojas",
        pasaporte: "11111111-1",
        pais: "CHL",
        medio: "email",
        telefono: "+56911111111",
        email: "ana.rojas@example.com",
        genero: "femenino",
        otroContacto: "Disponible por WhatsApp en horario laboral",
        tipo: "lobista",
        remunerado: true,
        representado: {
          tipo: "persona_juridica",
          nombre: "Empresa Mock SpA",
          pasaporte: "76543210-9",
          pais: "CHL",
          actividades: "Servicios de consultoria",
          giro: "Consultoria y asesoria",
          domicilio: "Av. Principal 123, Santiago",
          representanteLegal: "Carlos Perez",
          naturaleza: "Sociedad por acciones",
          directorio: "Directorio mock integrado por Ana Rojas y Carlos Perez"
        },
        empleador: {
          nombre: "Consultora Lobby Mock Ltda",
          pasaporte: "77777777-7",
          pais: "CHL",
          actividades: "Gestion de intereses y asesoria regulatoria",
          giro: "Consultoria",
          domicilio: "Calle Mock 456, Santiago",
          representanteLegal: "Mariana Soto",
          naturaleza: "Sociedad limitada",
          directorio: "Mariana Soto; Pedro Fuentes"
        }
      },
      {
        id: "mock_gestor_no_remunerado",
        label: "Pedro Fuentes - Gestor no remunerado",
        nombres: "Pedro",
        apellidos: "Fuentes",
        pasaporte: "22222222-2",
        pais: "CHL",
        medio: "email",
        telefono: "+56922222222",
        email: "pedro.fuentes@example.com",
        genero: "masculino",
        otroContacto: "Contacto alternativo por correo",
        tipo: "gestor",
        remunerado: false,
        representado: {
          tipo: "persona_natural",
          nombre: "Marcela Gonzalez",
          pasaporte: "33333333-3",
          pais: "CHL"
        }
      },
      {
        id: "mock_pasivo",
        label: "Laura Morales - Sujeto pasivo",
        nombres: "Laura",
        apellidos: "Morales",
        pasaporte: "44444444-4",
        pais: "CHL",
        medio: "telefono",
        telefono: "+56944444444",
        email: "laura.morales@example.com",
        genero: "femenino",
        otroContacto: "Secretaria coordina agenda",
        tipo: "pasivo",
        cargoInstitucion: "Jefa de division, institucion mock"
      }
    ]
  };

  function normalize(value) {
    return String(value == null ? "" : value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizePayload(data) {
    var users = [];
    if (Array.isArray(data && data.usuarios)) {
      users = data.usuarios;
    } else if (Array.isArray(data && data.asistentes)) {
      users = data.asistentes;
    }

    return {
      solicitud: data && data.solicitud ? data.solicitud : data || {},
      usuarios: users,
      asistentes: users
    };
  }

  function inferMedio(user, solicitud) {
    if (user && user.medio) {
      return user.medio;
    }
    if (solicitud && solicitud.medio) {
      return solicitud.medio;
    }
    if (user && user.email) {
      return "email";
    }
    if (user && user.telefono) {
      return "telefono";
    }
    return "";
  }

  function buildSolicitudFromUser(solicitud, user) {
    var source = user || {};
    var merged = Object.assign({}, solicitud || {});
    ["nombres", "apellidos", "pasaporte", "telefono", "email", "genero"].forEach(function (key) {
      if (source[key] != null && source[key] !== "") {
        merged[key] = source[key];
      }
    });
    merged.paisEmisor = source.paisEmisor || source.pais || merged.paisEmisor;
    merged.medio = inferMedio(source, merged);
    return merged;
  }

  function parsePanelJson() {
    var textarea = document.querySelector("#" + PANEL_ID + " [data-lobby-json]");
    if (!textarea) {
      throw new Error("No se encontro el textarea del panel.");
    }
    return JSON.parse(textarea.value);
  }

  function isLeyLobbyPage() {
    return location.hostname === "www.leylobby.gob.cl" || location.hostname === "leylobby.gob.cl";
  }

  function getForm() {
    return document.querySelector("#SolicitudesAudienciaForm");
  }

  function query(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function dispatchFieldEvents(element) {
    if (!element) {
      return;
    }
    ["input", "change", "blur"].forEach(function (eventName) {
      element.dispatchEvent(new Event(eventName, { bubbles: true }));
    });
  }

  function setValueIn(root, selector, value, label, summary) {
    if (value == null || value === "") {
      return false;
    }

    var element = query(root, selector);
    if (!element) {
      summary.missing.push(label + " (no encontrado: " + selector + ")");
      return false;
    }

    element.value = String(value);
    dispatchFieldEvents(element);
    summary.filled.push(label);
    return true;
  }

  function selectOptionIn(root, selector, value, label, summary) {
    if (value == null || value === "") {
      return false;
    }

    var select = query(root, selector);
    if (!select) {
      summary.missing.push(label + " (no encontrado: " + selector + ")");
      return false;
    }

    var raw = String(value).trim();
    var target = normalize(raw);
    var options = Array.prototype.slice.call(select.options || []);
    var exactValue = options.find(function (option) {
      return String(option.value).trim() === raw;
    });
    var exactText = options.find(function (option) {
      return normalize(option.textContent) === target;
    });
    var partialText = options.find(function (option) {
      return target && normalize(option.textContent).indexOf(target) !== -1;
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

  function clickIn(root, selector, label, summary) {
    var element = query(root, selector);
    if (!element) {
      summary.missing.push(label + " (no encontrado: " + selector + ")");
      return false;
    }
    if (!element.checked) {
      element.click();
    } else {
      dispatchFieldEvents(element);
    }
    summary.filled.push(label);
    return true;
  }

  function normalizeMedio(value) {
    var normalized = normalize(value);
    if (["email", "e-mail", "mail", "correo", "correo electronico"].indexOf(normalized) !== -1) {
      return "email";
    }
    if (["telefono", "tel", "fono"].indexOf(normalized) !== -1) {
      return "telefono";
    }
    return value;
  }

  function normalizeGenero(value) {
    var normalized = normalize(value);
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

  function normalizeAssistantType(value) {
    var normalized = normalize(value);
    if (["lobista", "lobbista", "remunerado"].indexOf(normalized) !== -1) {
      return "lobista";
    }
    if (["gestor", "gestor de interes", "gestor de intereses", "no remunerado"].indexOf(normalized) !== -1) {
      return "gestor";
    }
    if (["pasivo", "sujeto pasivo", "sujeto_pasivo"].indexOf(normalized) !== -1) {
      return "pasivo";
    }
    return normalized;
  }

  function normalizeRepresentedType(value) {
    var normalized = normalize(value);
    if (["persona natural", "natural", "persona_natural"].indexOf(normalized) !== -1) {
      return "persona_natural";
    }
    if (["persona juridica", "juridica", "persona_juridica"].indexOf(normalized) !== -1) {
      return "persona_juridica";
    }
    if (["otras entidades", "entidad", "entidad sin personalidad juridica", "otras_entidades"].indexOf(normalized) !== -1) {
      return "otras_entidades";
    }
    return normalized;
  }

  function setCheckbox(element, desired, label, summary) {
    if (!element) {
      summary.missing.push(label + " (no encontrado)");
      return false;
    }

    var shouldCheck = Boolean(desired);
    if (element.checked !== shouldCheck) {
      element.click();
    }
    summary.filled.push(label + " -> " + (shouldCheck ? "marcado" : "desmarcado"));
    return true;
  }

  function selectMatter(form, matter, summary) {
    var checkboxes = Array.prototype.slice.call(
      form.querySelectorAll('input[type="checkbox"][onchange*="onMateriaChange"]')
    );
    var raw = String(matter == null ? "" : matter).trim();
    var target = normalize(raw);

    var checkbox = checkboxes.find(function (element) {
      return String(element.value).trim() === raw;
    });

    if (!checkbox) {
      checkbox = checkboxes.find(function (element) {
        var text = element.closest("label, .form-check");
        return target && normalize(text ? text.textContent : "").indexOf(target) !== -1;
      });
    }

    if (!checkbox) {
      summary.notFound.push("Materia no encontrada: " + raw);
      return false;
    }

    if (!checkbox.checked) {
      checkbox.click();
    }

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

    if (!radio.checked) {
      radio.click();
    }

    summary.filled.push("Asistira -> " + (expected === "1" ? "Si" : "No"));

    if (expected === "1") {
      summary.warnings.push("Marcar 'Si asistira' puede abrir el modal de asistente; revisalo manualmente.");
    } else {
      summary.warnings.push("Con 'No asistira' el formulario exigira asistentes; agregalos desde el selector del bookmarklet.");
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
      if (data[key] == null || data[key] === "") {
        summary.warnings.push("Falta dato recomendado: " + key);
      }
    });

    if (!Array.isArray(data.materias) || data.materias.length === 0) {
      summary.warnings.push("Falta al menos una materia.");
    }

    if (data.aceptaPoliticas !== true) {
      summary.warnings.push("aceptaPoliticas no es true; el checkbox no se marcara automaticamente.");
    }
  }

  function fillForm(data, requesterIndex) {
    var payload = normalizePayload(data);
    var summary = {
      filled: [],
      missing: [],
      notFound: [],
      warnings: []
    };

    if (!isLeyLobbyPage()) {
      summary.warnings.push("No parece ser www.leylobby.gob.cl. Revisa antes de continuar.");
    }

    var form = getForm();
    if (!form) {
      throw new Error("No se encontro #SolicitudesAudienciaForm. Abre primero el formulario final de audiencia.");
    }

    var requester = null;
    if (payload.usuarios.length) {
      requester = payload.usuarios[requesterIndex];
      if (!requester) {
        throw new Error("Selecciona un solicitante valido.");
      }
      summary.filled.push("Solicitante -> " + userLabel(requester, requesterIndex));
    } else {
      summary.warnings.push("No hay lista de usuarios; se usara el JSON plano como solicitante.");
    }

    var solicitud = buildSolicitudFromUser(payload.solicitud, requester);

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

    if (window.solicitud) {
      summary.warnings.push(
        "Estado interno: invitados=" +
          (Array.isArray(window.solicitud.invitados) ? window.solicitud.invitados.length : "?") +
          ", asistente=" +
          (window.solicitud.asistente == null ? "null" : window.solicitud.asistente)
      );
    }

    summary.warnings.push("Revisa manualmente el formulario, resuelve Turnstile y presiona Solicitar solo si todo esta correcto.");
    return summary;
  }

  function getOpenAssistantModal() {
    var modals = Array.prototype.slice.call(document.querySelectorAll("body > .modal, .modal"));
    return modals.reverse().find(function (modal) {
      return query(modal, "#nombreItem") && query(modal, "#apellidoItem");
    });
  }

  function openAssistantModalIfNeeded(summary) {
    var modal = getOpenAssistantModal();
    if (modal) {
      summary.warnings.push("Se usara el modal de asistente que ya estaba abierto.");
      return modal;
    }

    if (!window.SolicitudesAudienciaAdmin || typeof window.SolicitudesAudienciaAdmin.openItemModal !== "function") {
      throw new Error("No esta disponible SolicitudesAudienciaAdmin.openItemModal().");
    }

    window.SolicitudesAudienciaAdmin.openItemModal();
    modal = getOpenAssistantModal();
    if (!modal) {
      throw new Error("No se pudo abrir el modal de asistente.");
    }
    summary.filled.push("Modal de asistente abierto");
    return modal;
  }

  function updateItemSujeto(assistant) {
    window.item = window.item || {};
    window.item.sujeto = window.item.sujeto || {};
    window.item.sujeto.nombres = assistant.nombres || "";
    window.item.sujeto.apellidos = assistant.apellidos || "";
    window.item.sujeto.pasaporte = assistant.pasaporte || "";
    window.item.sujeto.pais_id = assistant.pais || assistant.paisEmisor || "CHL";
    window.item.sujeto.telefono = assistant.telefono || "";
    window.item.sujeto.email = assistant.email || "";
    window.item.sujeto.contacto = assistant.contacto || assistant.medio || "";
    window.item.sujeto.otro_contacto = assistant.otroContacto || assistant.otro_contacto || assistant.contactoOtro || "";
  }

  function updateItemRepresentado(representado) {
    if (!representado) {
      return;
    }
    window.item = window.item || {};
    window.item.representado = {
      tipo: normalizeRepresentedType(representado.tipo),
      nombre: representado.nombre || "",
      pasaporte: representado.pasaporte || "",
      pais_id: representado.pais || representado.paisEmisor || "CHL",
      actividades: representado.actividades || "",
      giro: representado.giro || "",
      domicilio: representado.domicilio || "",
      representante_legal: representado.representanteLegal || representado.representante_legal || "",
      naturaleza: representado.naturaleza || "",
      directorio: representado.directorio || ""
    };
  }

  function updateItemEmpleador(empleador) {
    if (!empleador) {
      delete window.item.empleador;
      window.item.empleador_id = null;
      return;
    }
    window.item = window.item || {};
    window.item.empleador = {
      nombre: empleador.nombre || "",
      pasaporte: empleador.pasaporte || "",
      pais_id: empleador.pais || empleador.paisEmisor || "CHL",
      actividades: empleador.actividades || "",
      giro: empleador.giro || "",
      domicilio: empleador.domicilio || "",
      representante_legal: empleador.representanteLegal || empleador.representante_legal || "",
      naturaleza: empleador.naturaleza || "",
      directorio: empleador.directorio || ""
    };
  }

  function setAssistantType(modal, assistant, summary) {
    var type = normalizeAssistantType(assistant.tipo);
    window.item = window.item || {};
    window.item.tipo = type;

    if (type === "lobista") {
      clickIn(modal, "#calidadAsistente1", "Calidad asistente -> Lobista", summary);
    } else if (type === "gestor") {
      clickIn(modal, "#calidadAsistente2", "Calidad asistente -> Gestor", summary);
    } else if (type === "pasivo") {
      clickIn(modal, "#calidadAsistente3", "Calidad asistente -> Sujeto pasivo", summary);
      window.item.remunerado = null;
    } else if (assistant.tipo) {
      summary.notFound.push("Tipo de asistente no reconocido: " + assistant.tipo);
    }

    if (type !== "pasivo" && assistant.remunerado != null) {
      if (assistant.remunerado === true) {
        clickIn(modal, "#remuneradoOption1", "Remunerado -> Si", summary);
        window.item.remunerado = true;
      } else {
        clickIn(modal, "#remuneradoOption2", "Remunerado -> No", summary);
        window.item.remunerado = false;
      }
    }

    if (type === "pasivo") {
      setValueIn(modal, "#cargoInstitucion", assistant.cargoInstitucion || assistant.cargo_institucion, "Cargo / Institucion", summary);
      window.item.cargo = assistant.cargoInstitucion || assistant.cargo_institucion || "";
    }
  }

  function setRepresentedType(modal, represented, summary) {
    if (!represented) {
      return;
    }
    var type = normalizeRepresentedType(represented.tipo);
    if (type === "persona_natural") {
      clickIn(modal, "#representadoRadio1", "Representado -> Persona natural", summary);
    } else if (type === "persona_juridica") {
      clickIn(modal, "#representadoRadio2", "Representado -> Persona juridica", summary);
    } else if (type === "otras_entidades") {
      clickIn(modal, "#representadoRadio3", "Representado -> Entidad sin personalidad juridica", summary);
    } else if (represented.tipo) {
      summary.notFound.push("Tipo de representado no reconocido: " + represented.tipo);
    }
  }

  function fillRepresented(modal, represented, summary) {
    if (!represented) {
      return;
    }

    setRepresentedType(modal, represented, summary);
    selectOptionIn(modal, "#rep_pais", represented.pais || represented.paisEmisor || "CHL", "Representado pais", summary);
    setValueIn(modal, "#rep_nombre", represented.nombre, "Representado nombre", summary);
    setValueIn(modal, "#rep_pasaporte, #passRep input[name='rep_pasaporte']", represented.pasaporte, "Representado RUT/Pasaporte", summary);
    setValueIn(modal, "#rep_actividades", represented.actividades, "Representado actividades", summary);
    setValueIn(modal, "#rep_giro", represented.giro, "Representado giro", summary);
    setValueIn(modal, "#rep_domicilio", represented.domicilio, "Representado domicilio", summary);
    setValueIn(modal, "#rep_legal", represented.representanteLegal || represented.representante_legal, "Representado representante legal", summary);
    setValueIn(modal, "#rep_naturaleza", represented.naturaleza, "Representado naturaleza", summary);
    setValueIn(modal, "#rep_directorio", represented.directorio, "Representado directorio", summary);
    updateItemRepresentado(represented);
  }

  function fillEmployer(modal, employer, summary) {
    if (!employer) {
      updateItemEmpleador(null);
      return;
    }

    selectOptionIn(modal, "#emp_pais", employer.pais || employer.paisEmisor || "CHL", "Empleador pais", summary);
    setValueIn(modal, "#emp_nombre", employer.nombre, "Empleador nombre", summary);
    setValueIn(modal, "#emp_pasaporte, #passEmp input[name='emp_pasaporte']", employer.pasaporte, "Empleador RUT/Pasaporte", summary);
    setValueIn(modal, "#emp_actividades", employer.actividades, "Empleador actividades", summary);
    setValueIn(modal, "#emp_giro", employer.giro, "Empleador giro", summary);
    setValueIn(modal, "#emp_domicilio", employer.domicilio, "Empleador domicilio", summary);
    setValueIn(modal, "#emp_legal", employer.representanteLegal || employer.representante_legal, "Empleador representante legal", summary);
    setValueIn(modal, "#emp_naturaleza", employer.naturaleza, "Empleador naturaleza", summary);
    setValueIn(modal, "#emp_directorio", employer.directorio, "Empleador directorio", summary);
    updateItemEmpleador(employer);
  }

  function openAndFillAssistantModal(assistant) {
    var summary = {
      filled: [],
      missing: [],
      notFound: [],
      warnings: []
    };
    var modal = openAssistantModalIfNeeded(summary);

    updateItemSujeto(assistant);
    setValueIn(modal, "#nombreItem", assistant.nombres, "Asistente nombres", summary);
    setValueIn(modal, "#apellidoItem", assistant.apellidos, "Asistente apellidos", summary);
    selectOptionIn(modal, "#paisItem", assistant.pais || assistant.paisEmisor || "CHL", "Asistente pais", summary);
    setValueIn(modal, "#pasaporteItem, #passItem input[name='pasaporte'], input[name='pasaporte']", assistant.pasaporte, "Asistente RUT/Pasaporte", summary);
    setValueIn(modal, "#telefonoItem", assistant.telefono, "Asistente telefono", summary);
    setValueIn(modal, "#medioemail, input[name='medioemail']", assistant.email, "Asistente email", summary);
    setValueIn(modal, "#otroContactoItem", assistant.otroContacto || assistant.otro_contacto || assistant.contactoOtro, "Asistente otro contacto", summary);

    setAssistantType(modal, assistant, summary);

    if (normalizeAssistantType(assistant.tipo) !== "pasivo") {
      fillRepresented(modal, assistant.representado, summary);
      if (assistant.remunerado === true) {
        fillEmployer(modal, assistant.empleador, summary);
      } else {
        updateItemEmpleador(null);
      }
    }

    updateItemSujeto(assistant);
    summary.warnings.push("Modal rellenado. Revisa la informacion y presiona Guardar manualmente si corresponde.");
    summary.warnings.push("El bookmarklet no presiono Guardar, Solicitar ni Turnstile.");
    return summary;
  }

  function renderList(title, items, emptyText) {
    var safeItems = items || [];
    if (!safeItems.length) {
      return "<h4>" + escapeHtml(title) + "</h4><p>" + escapeHtml(emptyText || "Sin registros") + "</p>";
    }
    return (
      "<h4>" +
      escapeHtml(title) +
      "</h4><ul>" +
      safeItems.map(function (item) {
        return "<li>" + escapeHtml(item) + "</li>";
      }).join("") +
      "</ul>"
    );
  }

  function showResult(summary) {
    var result = document.getElementById(RESULT_ID);
    if (!result) {
      return;
    }

    result.innerHTML =
      renderList("Completados", summary.filled, "Nada completado") +
      renderList("No encontrados", summary.missing, "Sin campos faltantes") +
      renderList("Opciones no encontradas", summary.notFound, "Sin opciones faltantes") +
      renderList("Advertencias", summary.warnings, "Sin advertencias");
  }

  function userLabel(user, index) {
    if (user.label) {
      return user.label;
    }
    return [user.nombres, user.apellidos].filter(Boolean).join(" ") || user.id || "Usuario " + (index + 1);
  }

  function updateUserLists() {
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      return;
    }

    var requesterSelect = panel.querySelector("[data-lobby-requester-select]");
    var modalSelect = panel.querySelector("[data-lobby-user-select]");
    var status = panel.querySelector("[data-lobby-users-status]");
    if (!requesterSelect || !modalSelect || !status) {
      return;
    }

    var previousRequesterValue = requesterSelect.value;
    var previousModalValue = modalSelect.value;
    requesterSelect.innerHTML = "";
    modalSelect.innerHTML = "";
    try {
      var payload = normalizePayload(parsePanelJson());
      if (!payload.usuarios.length) {
        requesterSelect.disabled = true;
        modalSelect.disabled = true;
        status.textContent = "No hay usuarios en el JSON.";
        return;
      }
      payload.usuarios.forEach(function (user, index) {
        var requesterOption = document.createElement("option");
        requesterOption.value = String(index);
        requesterOption.textContent = userLabel(user, index);
        requesterSelect.appendChild(requesterOption);

        var modalOption = document.createElement("option");
        modalOption.value = String(index);
        modalOption.textContent = userLabel(user, index);
        modalSelect.appendChild(modalOption);
      });
      if (previousRequesterValue !== "" && payload.usuarios[Number(previousRequesterValue)]) {
        requesterSelect.value = previousRequesterValue;
      }
      if (previousModalValue !== "" && payload.usuarios[Number(previousModalValue)]) {
        modalSelect.value = previousModalValue;
      }
      requesterSelect.disabled = false;
      modalSelect.disabled = false;
      status.textContent = "Usuarios disponibles: " + payload.usuarios.length;
    } catch (error) {
      requesterSelect.disabled = true;
      modalSelect.disabled = true;
      status.textContent = "JSON invalido: " + (error && error.message ? error.message : String(error));
    }
  }

  function getFirebaseBaseUrl() {
    var saved = "";
    try {
      saved = localStorage.getItem(FIREBASE_BASE_URL_STORAGE_KEY) || "";
    } catch (error) {
      saved = "";
    }

    var value = saved || prompt("URL de Firebase Hosting (ej: https://tu-proyecto.web.app)", saved || "");
    if (!value) {
      throw new Error("Falta URL de Firebase Hosting.");
    }

    value = String(value).trim().replace(/\/+$/, "");
    if (!/^https:\/\//.test(value) && !/^http:\/\/localhost/.test(value) && !/^http:\/\/127\.0\.0\.1/.test(value)) {
      throw new Error("La URL de Firebase debe usar HTTPS.");
    }

    try {
      localStorage.setItem(FIREBASE_BASE_URL_STORAGE_KEY, value);
    } catch (error) {
      // Ignorar si el navegador bloquea localStorage.
    }

    return value;
  }

  function ensureFirebaseClient() {
    if (window.LobbyFirebaseClient) {
      return Promise.resolve(window.LobbyFirebaseClient);
    }

    return new Promise(function (resolve, reject) {
      var baseUrl = getFirebaseBaseUrl();
      var script = document.createElement("script");
      window.LOBBY_FIREBASE_BASE_URL = baseUrl;
      script.src = baseUrl + "/lobby-api-client.js?v=1";
      script.async = true;
      script.onload = function () {
        if (!window.LobbyFirebaseClient) {
          reject(new Error("El cliente Firebase no quedo disponible."));
          return;
        }
        resolve(window.LobbyFirebaseClient);
      };
      script.onerror = function () {
        reject(new Error("No se pudo cargar el cliente Firebase."));
      };
      document.documentElement.appendChild(script);
    });
  }

  function saveTextareaJson(textarea) {
    try {
      localStorage.setItem("lobbyBookmarkletLastJson", textarea.value);
    } catch (error) {
      // Ignorar si el navegador bloquea localStorage.
    }
  }

  function loadFirebaseUsersIntoTextarea(panel, textarea) {
    var status = panel.querySelector("[data-lobby-users-status]");
    var searchInput = panel.querySelector("[data-lobby-firebase-query]");
    var queryText = searchInput ? searchInput.value : "";

    status.textContent = "Conectando con Firebase...";

    ensureFirebaseClient()
      .then(function (client) {
        status.textContent = "Buscando usuarios en Firebase...";
        return client.searchLobbyUsers(queryText).then(function (response) {
          if (!response.users || !response.users.length) {
            throw new Error("No se encontraron usuarios para esa busqueda.");
          }
          status.textContent = "Cargando detalles de " + response.users.length + " usuario(s)...";
          return Promise.all(response.users.map(function (user) {
            return client.getLobbyUser(user.id);
          }));
        });
      })
      .then(function (responses) {
        var currentPayload;
        var users = responses.map(function (response) {
          return response.user;
        }).filter(Boolean);

        try {
          currentPayload = normalizePayload(parsePanelJson());
        } catch (error) {
          currentPayload = normalizePayload(EXAMPLE_FULL_DATA);
        }

        textarea.value = JSON.stringify({
          solicitud: currentPayload.solicitud || {},
          usuarios: users
        }, null, 2);
        saveTextareaJson(textarea);
        updateUserLists();
        status.textContent = "Usuarios cargados desde Firebase: " + users.length;
      })
      .catch(function (error) {
        status.textContent = "Error Firebase: " + (error && error.message ? error.message : String(error));
      });
  }

  function createPanel() {
    var existing = document.getElementById(PANEL_ID);
    if (existing) {
      existing.remove();
      return;
    }

    var panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "top:20px",
      "right:20px",
      "width:min(680px,calc(100vw - 40px))",
      "max-height:calc(100vh - 40px)",
      "overflow:auto",
      "background:#fff",
      "color:#111",
      "border:1px solid #999",
      "border-radius:8px",
      "box-shadow:0 12px 40px rgba(0,0,0,.25)",
      "font:14px/1.4 Arial,sans-serif",
      "padding:16px"
    ].join(";");

    panel.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px">' +
      '<strong style="font-size:16px">Asistente Ley Lobby</strong>' +
      '<button type="button" data-lobby-close style="border:0;background:#eee;border-radius:4px;padding:6px 10px;cursor:pointer">Cerrar</button>' +
      "</div>" +
      '<p style="margin:0 0 8px;color:#444">Pega el JSON y usa los botones. No se toca Turnstile, Guardar ni Solicitar.</p>' +
      '<textarea data-lobby-json style="width:100%;height:260px;box-sizing:border-box;font:13px/1.4 monospace;border:1px solid #bbb;border-radius:4px;padding:8px"></textarea>' +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
      '<button type="button" data-lobby-example style="background:#eee;color:#111;border:0;border-radius:4px;padding:8px 12px;cursor:pointer">Cargar ejemplo simple</button>' +
      '<button type="button" data-lobby-full-example style="background:#eee;color:#111;border:0;border-radius:4px;padding:8px 12px;cursor:pointer">Cargar ejemplo completo</button>' +
      '<button type="button" data-lobby-clear style="background:#eee;color:#111;border:0;border-radius:4px;padding:8px 12px;cursor:pointer">Limpiar resultado</button>' +
      "</div>" +
      '<div style="display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:10px;align-items:end">' +
      '<label style="display:grid;gap:4px"><span>Buscar usuarios en Firebase</span><input data-lobby-firebase-query type="text" placeholder="Nombre, id, documento o email" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #bbb;border-radius:4px"></label>' +
      '<button type="button" data-lobby-firebase-load style="background:#212529;color:#fff;border:0;border-radius:4px;padding:9px 12px;cursor:pointer">Cargar Firebase</button>' +
      "</div>" +
      '<div style="margin-top:14px;border:1px solid #ddd;border-radius:6px;padding:10px;background:#fafafa">' +
      '<strong>Usuarios</strong>' +
      '<p data-lobby-users-status style="margin:6px 0;color:#555">Sin cargar.</p>' +
      '<div style="display:grid;grid-template-columns:1fr;gap:10px">' +
      '<label style="display:grid;gap:4px"><span>Solicitante</span><select data-lobby-requester-select style="min-width:260px;max-width:100%;padding:7px;border:1px solid #bbb;border-radius:4px"></select></label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<button type="button" data-lobby-fill style="background:#0b5ed7;color:#fff;border:0;border-radius:4px;padding:8px 12px;cursor:pointer">Rellenar formulario principal</button>' +
      '<button type="button" data-lobby-refresh-users style="background:#eee;color:#111;border:0;border-radius:4px;padding:8px 12px;cursor:pointer">Actualizar listas</button>' +
      "</div>" +
      '<label style="display:grid;gap:4px"><span>Usuario para modal</span><select data-lobby-user-select style="min-width:260px;max-width:100%;padding:7px;border:1px solid #bbb;border-radius:4px"></select></label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<button type="button" data-lobby-fill-assistant style="background:#198754;color:#fff;border:0;border-radius:4px;padding:8px 12px;cursor:pointer">Abrir y rellenar modal</button>' +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div id="' + RESULT_ID + '" style="margin-top:14px;border-top:1px solid #ddd;padding-top:10px"></div>';

    document.body.appendChild(panel);

    var textarea = panel.querySelector("[data-lobby-json]");
    var saved = "";
    try {
      saved = localStorage.getItem("lobbyBookmarkletLastJson") || "";
    } catch (error) {
      saved = "";
    }
    textarea.value = saved || JSON.stringify(EXAMPLE_FULL_DATA, null, 2);

    panel.querySelector("[data-lobby-close]").addEventListener("click", function () {
      panel.remove();
    });

    panel.querySelector("[data-lobby-example]").addEventListener("click", function () {
      textarea.value = JSON.stringify(EXAMPLE_DATA, null, 2);
      updateUserLists();
    });

    panel.querySelector("[data-lobby-full-example]").addEventListener("click", function () {
      textarea.value = JSON.stringify(EXAMPLE_FULL_DATA, null, 2);
      updateUserLists();
    });

    panel.querySelector("[data-lobby-clear]").addEventListener("click", function () {
      showResult({ filled: [], missing: [], notFound: [], warnings: [] });
    });

    panel.querySelector("[data-lobby-firebase-load]").addEventListener("click", function () {
      loadFirebaseUsersIntoTextarea(panel, textarea);
    });

    panel.querySelector("[data-lobby-refresh-users]").addEventListener("click", function () {
      updateUserLists();
    });

    textarea.addEventListener("input", function () {
      updateUserLists();
    });

    panel.querySelector("[data-lobby-fill]").addEventListener("click", function () {
      try {
        var data = parsePanelJson();
        saveTextareaJson(textarea);
        updateUserLists();
        var requesterSelect = panel.querySelector("[data-lobby-requester-select]");
        var requesterIndex = requesterSelect && requesterSelect.value !== "" ? Number(requesterSelect.value) : 0;
        showResult(fillForm(data, requesterIndex));
      } catch (error) {
        showResult({
          filled: [],
          missing: [],
          notFound: [],
          warnings: ["Error: " + (error && error.message ? error.message : String(error))]
        });
      }
    });

    panel.querySelector("[data-lobby-fill-assistant]").addEventListener("click", function () {
      try {
        var payload = normalizePayload(parsePanelJson());
        var select = panel.querySelector("[data-lobby-user-select]");
        var index = Number(select.value);
        var assistant = payload.usuarios[index];
        if (!assistant) {
          throw new Error("Selecciona un asistente valido.");
        }
        saveTextareaJson(textarea);
        showResult(openAndFillAssistantModal(assistant));
      } catch (error) {
        showResult({
          filled: [],
          missing: [],
          notFound: [],
          warnings: ["Error: " + (error && error.message ? error.message : String(error))]
        });
      }
    });

    updateUserLists();
  }

  createPanel();
})();
