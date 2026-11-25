(function () {
  "use strict";

  var root = typeof globalThis !== "undefined" ? globalThis : window;
  var ns = root.AsistenteLobby = root.AsistenteLobby || {};
  var utils = ns.payload;
  var formSelector = "#main.formulario-audiencia #form1";
  var typeSelector = formSelector + " select.select_tipo";
  var lookupObserver = null;
  var filling = false;

  function query(selector) { return document.querySelector(selector); }
  function summary() { return { filled: [], recovered: [], missing: [], notFound: [], warnings: [] }; }
  function events(field) {
    ["input", "change", "blur"].forEach(function (name) {
      field.dispatchEvent(new Event(name, { bubbles: true }));
    });
  }
  function setValue(selector, value, label, result) {
    if (value == null || value === "") return false;
    var field = query(formSelector + " " + selector);
    if (!field || field.disabled || field.readOnly) {
      result.missing.push(label + " no disponible; completa manualmente.");
      return false;
    }
    field.value = String(value);
    events(field);
    result.filled.push(label);
    return true;
  }
  function lookupEvent(event) {
    return event.source === window && event.origin === window.location.origin && event.data &&
      event.data.source === "asistente-lobby-senado-lookup";
  }
  function ensureLookupObserver() {
    if (lookupObserver) return lookupObserver;
    lookupObserver = new Promise(function (resolve, reject) {
      var ext = root.browser || root.chrome;
      var timer = window.setTimeout(function () { cleanup(); reject(new Error("No se pudo observar la consulta del Senado.")); }, 3000);
      function cleanup() { window.clearTimeout(timer); window.removeEventListener("message", receive); }
      function receive(event) {
        if (!lookupEvent(event) || event.data.phase !== "ready") return;
        cleanup(); resolve();
      }
      window.addEventListener("message", receive);
      var script = document.createElement("script");
      script.src = ext.runtime.getURL("src/sites/senado/lookup-observer.js");
      script.onload = function () { script.remove(); };
      script.onerror = function () { cleanup(); script.remove(); reject(new Error("No se pudo cargar el observador del Senado.")); };
      document.documentElement.appendChild(script);
    }).catch(function (error) { lookupObserver = null; throw error; });
    return lookupObserver;
  }
  function lookupRut(data, result) {
    var rut = validRut(data.pasaporte);
    var country = String(data.pais || data.paisEmisor || "").trim().toUpperCase();
    var other = query(formSelector + " #pasaporte");
    if (data.pasaporte && country === "CHL" && !rut) {
      return Promise.reject(new Error("RUT no valido; revisa la identificacion manualmente."));
    }
    if (country === "CHL" && rut && other && other.value) {
      return Promise.reject(new Error("Ya hay un pasaporte ingresado; revisa la identificacion manualmente."));
    }
    if (country !== "CHL" || !rut || (other && other.value)) {
      fillIdentity(data, "#rut", "#pasaporte", "Solicitante", result);
      return Promise.resolve(false);
    }
    return ensureLookupObserver().then(function () {
      return new Promise(function (resolve, reject) {
        var id = null;
        var timer = window.setTimeout(function () { cleanup(); reject(new Error("El Senado no confirmo el resultado de la consulta de RUT.")); }, 10000);
        function cleanup() { window.clearTimeout(timer); window.removeEventListener("message", receive); }
        function receive(event) {
          if (!lookupEvent(event)) return;
          if (event.data.phase === "start" && id === null) id = event.data.id;
          else if (event.data.phase === "complete" && id === event.data.id) {
            cleanup();
            if (event.data.ok) resolve(true);
            else reject(new Error("La consulta de RUT del Senado fallo."));
          }
        }
        window.addEventListener("message", receive);
        var field = query(formSelector + " #rut");
        if (!field || field.disabled || field.readOnly) {
          cleanup();
          result.missing.push("Solicitante RUT no disponible; completa manualmente.");
          resolve(false);
          return;
        }
        field.focus();
        if (document.activeElement !== field) { cleanup(); reject(new Error("No se pudo activar la consulta de RUT del Senado.")); return; }
        field.value = rut;
        ["input", "change"].forEach(function (name) { field.dispatchEvent(new Event(name, { bubbles: true })); });
        result.filled.push("Solicitante RUT");
        field.blur();
      });
    });
  }
  function fillApplicantField(selector, value, label, confirmedLookup, result) {
    var field = query(formSelector + " " + selector);
    if (!field || field.disabled) {
      if (value != null && value !== "") result.missing.push(label + " no disponible; completa manualmente.");
      return;
    }
    if (field.readOnly) {
      if (confirmedLookup && field.value) {
        result.recovered.push(label);
        if (value != null && value !== "" && utils.normalize(field.value) !== utils.normalize(value)) {
          result.warnings.push(label + ": el dato del Senado difiere del registro seleccionado; revisa manualmente.");
        }
      } else result.warnings.push(label + ": campo bloqueado o vacio; revisa los datos del Senado.");
      return;
    }
    setValue(selector, value, label, result);
  }
  function validRut(value) {
    var raw = String(value || "").replace(/[.\s-]/g, "").toUpperCase();
    if (!/^\d{7,8}[0-9K]$/.test(raw)) return null;
    var body = raw.slice(0, -1), sum = 0, factor = 2;
    for (var i = body.length - 1; i >= 0; i--) {
      sum += Number(body[i]) * factor;
      factor = factor === 7 ? 2 : factor + 1;
    }
    var check = 11 - sum % 11;
    if ((check === 11 ? "0" : check === 10 ? "K" : String(check)) !== raw.slice(-1)) return null;
    return body.padStart(8, "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + raw.slice(-1);
  }
  function fillIdentity(data, rutSelector, passportSelector, label, result) {
    if (!data.pasaporte) return;
    var country = String(data.pais || data.paisEmisor || "").trim().toUpperCase();
    var other;
    if (country === "CHL") {
      var rut = validRut(data.pasaporte);
      other = passportSelector && query(formSelector + " " + passportSelector);
      if (other && other.value) result.warnings.push(label + ": ya hay un pasaporte ingresado; revisa la identificacion manualmente.");
      else if (rut) setValue(rutSelector, rut, label + " RUT", result);
      else result.warnings.push(label + ": RUT no valido; revisa e ingresa la identificacion manualmente.");
    } else if (country && passportSelector) {
      other = query(formSelector + " " + rutSelector);
      if (validRut(data.pasaporte) || (other && other.value)) result.warnings.push(label + ": identificacion ambigua; revisa RUT y pasaporte manualmente.");
      else setValue(passportSelector, data.pasaporte, label + " pasaporte", result);
    } else {
      result.warnings.push(label + ": no se puede determinar el tipo de identificacion; completa manualmente.");
    }
  }
  function authorityKey() {
    var authority = query(formSelector + " #seleccion select");
    var category = query(formSelector + ' input[name="id_seleccion"]:checked');
    return authority && !authority.disabled && authority.value && authority.value !== "0" ?
      (category ? category.value : "") + ":" + authority.value : "";
  }
  function ready(expectedAuthority) {
    var authority = query(formSelector + " #seleccion select");
    var type = query(typeSelector);
    var key = authorityKey();
    return authority && key && (!expectedAuthority || key === expectedAuthority) && type && !type.disabled;
  }
  function waitFor(test) {
    return new Promise(function (resolve) {
      var deadline = Date.now() + 5000;
      function check() {
        if (test()) return resolve(true);
        if (Date.now() >= deadline) return resolve(false);
        window.setTimeout(check, 100);
      }
      check();
    });
  }
  function findOption(select, value) {
    var normalized = utils.normalize(value);
    var options = Array.prototype.slice.call(select.options || []).filter(function (option) {
      return option.value && option.value !== "0" && option.value !== "00";
    });
    var exact = options.filter(function (option) {
      return option.value === String(value).trim() || utils.normalize(option.textContent) === normalized;
    });
    if (exact.length === 1) return exact[0];
    var partial = options.filter(function (option) {
      var text = utils.normalize(option.textContent);
      return normalized.length >= 4 && text.indexOf(normalized) !== -1;
    });
    return partial.length === 1 ? partial[0] : null;
  }
  function fillRegion(data, expectedType, selectedAuthority, result) {
    if (!data.region && !data.comuna) return Promise.resolve();
    var region = query(formSelector + " #entidades #region");
    if (!region || region.disabled || !data.region) {
      result.missing.push("Region y comuna del representado requieren revision manual.");
      return Promise.resolve();
    }
    var option = findOption(region, data.region);
    if (!option) {
      result.notFound.push("Region del representado: " + data.region);
      return Promise.resolve();
    }
    var container = query(formSelector + " #entidades #seleccion_comuna");
    var before = container && container.innerHTML;
    var changed = region.value !== option.value;
    if (changed) { region.value = option.value; events(region); }
    result.filled.push("Region del representado");
    if (!data.comuna) return Promise.resolve();
    return waitFor(function () {
      var current = query(formSelector + " #entidades #seleccion_comuna");
      var select = current && current.querySelector("select");
      return ready(selectedAuthority) && query(typeSelector).value === expectedType && current && select && !select.disabled && (!changed || current.innerHTML !== before);
    }).then(function (loaded) {
      if (!loaded) { result.warnings.push("Comuna no disponible o sin actualizar; selecciona manualmente."); return; }
      var select = query(formSelector + " #entidades #seleccion_comuna select");
      var match = findOption(select, data.comuna);
      if (!match) { result.notFound.push("Comuna del representado: " + data.comuna); return; }
      select.value = match.value;
      events(select);
      result.filled.push("Comuna del representado");
    });
  }
  function fillRepresented(data, selectedAuthority, result) {
    if (!data || !data.tipo) return Promise.resolve();
    var types = { persona_natural: "1", persona_juridica: "2", otras_entidades: "3" };
    var expected = types[data.tipo];
    var select = query(typeSelector);
    if (!expected || !select || select.disabled) {
      result.warnings.push("Tipo de representado no disponible; completa manualmente.");
      return Promise.resolve();
    }
    var target = { "1": "#Nombre_persona_natural", "2": "#razon", "3": "#nombres_sin_personalidad" }[expected];
    if (select.value !== expected) { select.value = expected; events(select); }
    return waitFor(function () {
      return ready(selectedAuthority) && query(typeSelector).value === expected && Boolean(query(formSelector + " #entidades " + target));
    }).then(function (loaded) {
      if (!loaded) { result.warnings.push("Los campos del representado no terminaron de cargar; completa manualmente."); return; }
      var scope = "#entidades ";
      var name = data.nombre || [data.nombres, data.apellidos].filter(Boolean).join(" ");
      if (expected === "1") {
        setValue(scope + "#Nombre_persona_natural", name, "Representado nombre", result);
        fillIdentity(data, scope + "#rut_persona_natural", scope + "#pasaporte_natural", "Representado", result);
      } else {
        setValue(scope + (expected === "2" ? "#razon" : "#nombres_sin_personalidad"), name, "Representado nombre", result);
        setValue(scope + (expected === "2" ? "#giro_persona_juridica" : "#giro_sin_personalidad"), data.giro, "Representado giro", result);
        setValue(scope + (expected === "2" ? "#domicilio" : "#domicilio_sin_personalidad"), data.domicilio, "Representado domicilio", result);
        fillIdentity(data, scope + (expected === "2" ? "#rut_persona_juridica" : "#rut_sin_personalidad"), null, "Representado", result);
        if (expected === "2") result.warnings.push("Completa el nombre de fantasia de la persona juridica manualmente.");
      }
      setValue(scope + "#naturaleza_representacion", data.tipoRepresentacion, "Naturaleza de representacion", result);
      if (expected !== "1") return fillRegion(data, expected, selectedAuthority, result);
    });
  }
  function fillMainForm(data, index) {
    var result = summary();
    if (filling) {
      result.warnings.push("Ya hay un llenado en curso; espera a que termine.");
      return Promise.resolve(result);
    }
    if (!ready()) {
      result.warnings.push("Selecciona primero la autoridad en el formulario del Senado y espera a que se habiliten los campos.");
      return Promise.resolve(result);
    }
    var payload = utils.normalizePayload(data);
    var selectedAuthority = authorityKey();
    var user = payload.usuarios[index] || null;
    var solicitud = payload.solicitud || {};
    var applicant = utils.buildSolicitudFromUser(solicitud, user);
    filling = true;
    return lookupRut(applicant, result).then(function (confirmedLookup) {
    if (!ready(selectedAuthority)) throw new Error("La autoridad cambio durante la consulta. Revisa el formulario y vuelve a intentar.");
    var actualRut = query(formSelector + " #rut");
    if (confirmedLookup && (!actualRut || validRut(actualRut.value) !== validRut(applicant.pasaporte))) {
      throw new Error("El RUT cambio durante la consulta. Revisa el formulario y vuelve a intentar.");
    }
    fillApplicantField("#nombres", applicant.nombres, "Solicitante nombres", confirmedLookup, result);
    fillApplicantField("#apellido", applicant.apellidos, "Solicitante apellidos", confirmedLookup, result);
    fillApplicantField("#correo", applicant.email, "Solicitante correo", confirmedLookup, result);
    fillApplicantField("#telefono", applicant.telefono, "Solicitante telefono", confirmedLookup, result);
    if (user && typeof user.remunerado === "boolean") {
      var radio = query(formSelector + (user.remunerado ? " #id_remuneracion_2" : " #id_remuneracion_1"));
      if (confirmedLookup && radio && radio.disabled) result.warnings.push("La remuneracion del Senado difiere del registro seleccionado; revisa manualmente.");
      else if (radio && !radio.disabled) { radio.checked = true; events(radio); result.filled.push("Remuneracion"); }
      else result.missing.push("Remuneracion no disponible; completa manualmente.");
    }
    setValue("#materia_tratar", solicitud.referencia, "Materia a tratar", result);
    setValue("#observacion_adicional", solicitud.observaciones, "Observaciones", result);
    result.warnings.push("Indica la comuna de la reunion y revisa los datos antes de enviar manualmente.");
    return fillRepresented(user && user.representado, selectedAuthority, result);
    }).catch(function (error) {
      result.warnings.push(error.message + " Revisa los datos antes de continuar.");
    }).then(function () { return result; }).finally(function () { filling = false; });
  }
  ns.senado = ns.senado || {};
  ns.senado.adapter = {
    id: "senado-audiencia",
    assistantActionLabel: "Como agregar asistentes",
    detect: function () {
      return location.hostname === "lobby.senado.cl" && location.pathname === "/public_html/forms/masters-senado/audiencia.php" && Boolean(query(formSelector));
    },
    fillMainForm: fillMainForm,
    fillAssistant: function () {
      var result = summary();
      result.warnings.push("Agrega otros asistentes manualmente en el formulario del Senado. El asistente no modifico el solicitante ni presiono Agregar.");
      return Promise.resolve(result);
    }
  };
}());
