(function () {
  "use strict";

  var CONTENT_SOURCE = "asistente-lobby-content";
  var BRIDGE_SOURCE = "asistente-lobby-page-bridge";

  if (window.__ASISTENTE_LOBBY_PAGE_BRIDGE__) return;
  window.__ASISTENTE_LOBBY_PAGE_BRIDGE__ = true;

  function normalize(value) {
    return String(value == null ? "" : value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function query(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function dispatchFieldEvents(element) {
    if (!element) return;
    ["input", "change", "blur"].forEach(function (eventName) {
      element.dispatchEvent(new Event(eventName, { bubbles: true }));
    });
  }

  function setValueIn(root, selector, value, label, summary) {
    if (value == null || value === "") return false;

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
    if (value == null || value === "") return false;

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

  function normalizeAssistantType(value) {
    var normalized = normalize(value);
    if (["lobista", "lobbista", "remunerado"].indexOf(normalized) !== -1) return "lobista";
    if (["gestor", "gestor de interes", "gestor de intereses", "no remunerado"].indexOf(normalized) !== -1) return "gestor";
    if (["pasivo", "sujeto pasivo", "sujeto_pasivo"].indexOf(normalized) !== -1) return "pasivo";
    return normalized;
  }

  function normalizeRepresentedType(value) {
    var normalized = normalize(value);
    if (["persona natural", "natural", "persona_natural"].indexOf(normalized) !== -1) return "persona_natural";
    if (["persona juridica", "juridica", "persona_juridica"].indexOf(normalized) !== -1) return "persona_juridica";
    if (["otras entidades", "entidad", "entidad sin personalidad juridica", "otras_entidades"].indexOf(normalized) !== -1) return "otras_entidades";
    return normalized;
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
    if (!modal) throw new Error("No se pudo abrir el modal de asistente.");
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
    if (!representado) return;
    window.item = window.item || {};
    window.item.representado = {
      tipo: normalizeRepresentedType(representado.tipo),
      nombre: representado.nombre || "",
      pasaporte: representado.pasaporte || "",
      pais_id: representado.pais || representado.paisEmisor || "CHL",
      actividades: representado.actividades || "",
      giro: representedValue(representado, "giro"),
      domicilio: representado.domicilio || "",
      representante_legal: representado.representanteLegal || representado.representante_legal || "",
      naturaleza: representado.naturaleza || "",
      directorio: representado.directorio || ""
    };
  }

  function representedValue(source, key) {
    return source && source[key] ? source[key] : "";
  }

  function updateItemEmpleador(empleador) {
    window.item = window.item || {};
    if (!empleador) {
      delete window.item.empleador;
      window.item.empleador_id = null;
      return;
    }

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
    if (!represented) return;
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
    if (!represented) return;
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
    var summary = { filled: [], missing: [], notFound: [], warnings: [] };
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
    summary.warnings.push("La extension no presiono Guardar, Solicitar ni Turnstile.");
    return summary;
  }

  function respond(requestId, ok, payload) {
    window.postMessage({
      source: BRIDGE_SOURCE,
      requestId: requestId,
      ok: ok,
      payload: payload
    }, window.location.origin);
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;

    var data = event.data || {};
    if (data.source !== CONTENT_SOURCE) return;
    if (data.type !== "leylobby:fillAssistantModal") return;

    try {
      respond(data.requestId, true, openAndFillAssistantModal(data.payload || {}));
    } catch (error) {
      respond(data.requestId, false, {
        error: error && error.message ? error.message : String(error)
      });
    }
  });
}());
