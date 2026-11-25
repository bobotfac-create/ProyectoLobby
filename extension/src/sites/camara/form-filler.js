(function () {
  "use strict";

  var root = typeof globalThis !== "undefined" ? globalThis : window;
  var ns = root.AsistenteLobby = root.AsistenteLobby || {};
  var payloadUtils = ns.payload;
  var COUNTRY_NAMES = {
    AFG: "Afganistan", ARG: "Argentina", AUS: "Australia", AUT: "Austria", BEL: "Belgica",
    BOL: "Bolivia", BRA: "Brasil", CAN: "Canada", CHL: "Chile", CHN: "China", COL: "Colombia",
    CRI: "Costa Rica", CUB: "Cuba", DEU: "Alemania", DNK: "Dinamarca", DOM: "Republica Dominicana",
    ECU: "Ecuador", EGY: "Egipto", ESP: "Espana", FIN: "Finlandia", FRA: "Francia", GBR: "Reino Unido",
    GRC: "Grecia", GTM: "Guatemala", HND: "Honduras", IDN: "Indonesia", IND: "India", IRL: "Irlanda",
    ISR: "Israel", ITA: "Italia", JPN: "Japon", KOR: "Corea del Sur", MEX: "Mexico", NIC: "Nicaragua",
    NLD: "Paises Bajos", NOR: "Noruega", NZL: "Nueva Zelanda", PAN: "Panama", PER: "Peru", PHL: "Filipinas",
    POL: "Polonia", PRT: "Portugal", PRY: "Paraguay", RUS: "Rusia", SLV: "El Salvador", SWE: "Suecia",
    THA: "Tailandia", TUR: "Turquia", UKR: "Ucrania", URY: "Uruguay", USA: "Estados Unidos", VEN: "Venezuela"
  };

  function query(selector) {
    return document.querySelector(selector);
  }

  function isCamaraPage() {
    return (location.hostname === "www.camara.cl" || location.hostname === "camara.cl") &&
      location.pathname.toLowerCase() === "/transparencia/formulariosolicitudaudiencia.aspx";
  }

  function getForm() {
    return query("#ff");
  }

  function summary() {
    return { filled: [], missing: [], notFound: [], warnings: [] };
  }

  function dispatchFieldEvents(element) {
    ["input", "change", "blur"].forEach(function (eventName) {
      element.dispatchEvent(new Event(eventName, { bubbles: true }));
    });
  }

  function setValue(selector, value, label, result) {
    if (value == null || value === "") return false;
    var element = query(selector);
    if (!element) {
      result.missing.push(label + " (no encontrado: " + selector + ")");
      return false;
    }
    element.value = String(value);
    dispatchFieldEvents(element);
    result.filled.push(label);
    return true;
  }

  function optionFor(select, value) {
    var raw = String(value == null ? "" : value).trim();
    var normalized = payloadUtils.normalize(raw);
    return Array.prototype.slice.call(select.options || []).find(function (option) {
      return String(option.value).trim() === raw || payloadUtils.normalize(option.textContent) === normalized;
    }) || Array.prototype.slice.call(select.options || []).find(function (option) {
      return normalized && payloadUtils.normalize(option.textContent).indexOf(normalized) !== -1;
    });
  }

  function selectOption(selector, value, label, result) {
    if (value == null || value === "") return false;
    var select = query(selector);
    if (!select) {
      result.missing.push(label + " (no encontrado: " + selector + ")");
      return false;
    }
    var option = optionFor(select, value);
    if (!option) {
      result.notFound.push(label + " opcion no encontrada: " + value);
      return false;
    }
    select.value = option.value;
    dispatchFieldEvents(select);
    result.filled.push(label + " -> " + option.textContent.trim());
    return true;
  }

  function waitForPostback(action) {
    return new Promise(function (resolve, reject) {
      var panel = query("#ContentPlaceHolder1_ContentPlaceHolder1_UpdatePanel3");
      if (!panel || typeof MutationObserver === "undefined") {
        action();
        resolve();
        return;
      }
      var timeout = window.setTimeout(function () {
        observer.disconnect();
        reject(new Error("La Camara no termino de actualizar el formulario."));
      }, 15000);
      var observer = new MutationObserver(function () {
        window.clearTimeout(timeout);
        observer.disconnect();
        resolve();
      });
      observer.observe(panel, { childList: true, subtree: true });
      action();
    });
  }

  function selectWithPostback(selector, value, label, result) {
    var select = query(selector);
    if (!select) {
      result.missing.push(label + " (no encontrado: " + selector + ")");
      return Promise.resolve(false);
    }
    var option = optionFor(select, value);
    if (!option) {
      result.notFound.push(label + " opcion no encontrada: " + value);
      return Promise.resolve(false);
    }
    if (select.value === option.value) return Promise.resolve(true);
    return waitForPostback(function () {
      select.value = option.value;
      dispatchFieldEvents(select);
    }).then(function () {
      result.filled.push(label + " -> " + option.textContent.trim());
      return true;
    });
  }

  function clickWithPostback(selector, label, result) {
    var input = query(selector);
    if (!input) {
      result.missing.push(label + " (no encontrado: " + selector + ")");
      return Promise.resolve(false);
    }
    if (input.checked) return Promise.resolve(true);
    return waitForPostback(function () { input.click(); }).then(function () {
      result.filled.push(label);
      return true;
    });
  }

  function isChile(value) {
    var country = payloadUtils.normalize(value || "CHL");
    return !country || country === "chl" || country === "chile";
  }

  function countryName(value) {
    var raw = String(value || "").trim();
    return COUNTRY_NAMES[raw.toUpperCase()] || raw;
  }

  function splitRut(value, result, label) {
    var match = String(value || "").replace(/[^0-9kK]/g, "").match(/^(\d{1,8})([0-9kK])$/);
    if (!match) {
      result.warnings.push(label + " debe tener RUT y digito verificador.");
      return null;
    }
    return { rut: match[1], dv: match[2].toUpperCase() };
  }

  function fillRut(value, rutSelector, dvSelector, label, result) {
    var rut = splitRut(value, result, label);
    if (!rut) return;
    setValue(rutSelector, rut.rut, label + " numero", result);
    setValue(dvSelector, rut.dv, label + " digito verificador", result);
  }

  function splitPhone(value, label, result) {
    var digits = String(value || "").replace(/\D/g, "");
    if (digits.indexOf("56") === 0) digits = digits.slice(2);
    if (digits.length !== 9) {
      result.warnings.push(label + " debe usar el formato +569XXXXXXXX.");
      return null;
    }
    return { code: digits.charAt(0), number: digits.slice(1) };
  }

  function fillPhone(value, codeSelector, phoneSelector, label, result) {
    if (value == null || value === "") return;
    var phone = splitPhone(value, label, result);
    if (!phone) return;
    setValue(codeSelector, phone.code, label + " codigo", result);
    setValue(phoneSelector, phone.number, label, result);
  }

  function normalizeType(value) {
    var type = payloadUtils.normalize(value);
    if (["persona natural", "persona_natural", "natural"].indexOf(type) !== -1) return "persona_natural";
    if (["persona juridica", "persona_juridica", "juridica"].indexOf(type) !== -1) return "persona_juridica";
    if (["entidad", "entidad sin personalidad juridica", "otras_entidades", "entidad_sin_personalidad_juridica"].indexOf(type) !== -1) return "entidad";
    return type || "persona_natural";
  }

  function wantsCode(data) {
    return payloadUtils.normalize(data.identificacion) === "codigo" || payloadUtils.normalize(data.identificadorTipo) === "codigo";
  }

  function fillCountry(selector, country, label, result) {
    if (!country) {
      result.warnings.push("Falta pais para " + label + ".");
      return;
    }
    selectOption(selector, countryName(country), label + " pais", result);
  }

  function fillNatural(data, prefix, result) {
    var foreign = !isChile(data.pais);
    var radioSelector = foreign ? prefix.foreignRadio : prefix.chileRadio;
    return clickWithPostback(radioSelector, prefix.label + " nacionalidad", result).then(function () {
      if (foreign) {
        fillCountry(prefix.country, data.pais, prefix.label, result);
        setValue(prefix.passport, data.pasaporte, prefix.label + " pasaporte", result);
      } else {
        fillRut(data.pasaporte, prefix.rut, prefix.dv, prefix.label, result);
      }
      setValue(prefix.names, data.nombres, prefix.label + " nombres", result);
      setValue(prefix.surnames, data.apellidos, prefix.label + " apellidos", result);
    });
  }

  function fillRepresentative(data, result) {
    if (!data || !data.tipo) {
      result.warnings.push("Falta representado; revisalo manualmente.");
      return Promise.resolve();
    }
    var type = normalizeType(data.tipo);
    var typeValue = type === "persona_juridica" ? "12" : type === "entidad" ? "13" : "11";
    return selectWithPostback("#ContentPlaceHolder1_ContentPlaceHolder1_ddlTipo", typeValue, "Representado tipo", result)
      .then(function () {
        if (!data.tipoRepresentacion) {
          result.warnings.push("Tipo de representacion no indicado; selecciona y revisa manualmente.");
          return;
        }
        return selectWithPostback("#ContentPlaceHolder1_ContentPlaceHolder1_ddlTipoRep", data.tipoRepresentacion, "Naturaleza de la representacion", result);
      })
      .then(function () {
        if (type === "persona_natural") {
          return fillNatural(data, {
            label: "Representado",
            chileRadio: "#ContentPlaceHolder1_ContentPlaceHolder1_RadioRut2",
            foreignRadio: "#ContentPlaceHolder1_ContentPlaceHolder1_RadioPasaporte2",
            country: "#ContentPlaceHolder1_ContentPlaceHolder1_ddlPaisesPNatural",
            passport: "#ContentPlaceHolder1_ContentPlaceHolder1_txtPasaportePNatural",
            rut: "#ContentPlaceHolder1_ContentPlaceHolder1_txtRutPNatural",
            dv: "#ContentPlaceHolder1_ContentPlaceHolder1_txtDvPNatural",
            names: "#ContentPlaceHolder1_ContentPlaceHolder1_txtNombrePNatural",
            surnames: "#ContentPlaceHolder1_ContentPlaceHolder1_txtApellidosPNatural"
          }, result);
        }
        if (type === "persona_juridica") return fillLegalRepresentative(data, result);
        return fillEntityRepresentative(data, result);
      });
  }

  function fillRegion(regionSelector, communeSelector, data, label, result) {
    if (!data.region) {
      result.warnings.push("Falta region para " + label + ".");
      return Promise.resolve();
    }
    return selectWithPostback(regionSelector, data.region, label + " region", result).then(function () {
      if (data.comuna) selectOption(communeSelector, data.comuna, label + " comuna", result);
      else result.warnings.push("Falta comuna para " + label + ".");
    });
  }

  function fillLegalRepresentative(data, result) {
    var foreign = !isChile(data.pais);
    return clickWithPostback(foreign ? "#ContentPlaceHolder1_ContentPlaceHolder1_RadioSinRut" : "#ContentPlaceHolder1_ContentPlaceHolder1_RadioRut3", "Representado empresa nacionalidad", result)
      .then(function () {
        setValue("#ContentPlaceHolder1_ContentPlaceHolder1_txtRSocialEmpresa", data.nombre, "Representado razon social", result);
        if (foreign) return;
        return clickWithPostback(wantsCode(data) ? "#ContentPlaceHolder1_ContentPlaceHolder1_RadioCodPJ1" : "#ContentPlaceHolder1_ContentPlaceHolder1_RadioRutPJ1", "Representado empresa identificacion", result)
          .then(function () {
            setValue("#ContentPlaceHolder1_ContentPlaceHolder1_txtGiroEmpresa", data.giro || data.actividades, "Representado giro", result);
            if (wantsCode(data)) setValue("#ContentPlaceHolder1_ContentPlaceHolder1_txtCodigoPJuridica1", data.identificador, "Representado codigo", result);
            else fillRut(data.pasaporte, "#ContentPlaceHolder1_ContentPlaceHolder1_txtRutEmpresa", "#ContentPlaceHolder1_ContentPlaceHolder1_txtDvEmpresa", "Representado empresa", result);
          });
      })
      .then(function () {
        return fillRegion("#ContentPlaceHolder1_ContentPlaceHolder1_dllRegion", "#ContentPlaceHolder1_ContentPlaceHolder1_dllComuna", data, "Representado empresa", result);
      })
      .then(function () {
        setValue("#ContentPlaceHolder1_ContentPlaceHolder1_txtDireccionEmpresa", data.domicilio, "Representado domicilio", result);
        setValue("#ContentPlaceHolder1_ContentPlaceHolder1_txtRepresentanteEmpresa", data.representanteLegal || data.representante_legal, "Representado representante legal", result);
        setValue("#ContentPlaceHolder1_ContentPlaceHolder1_txtCategoriaJuridica", data.naturaleza, "Representado categoria juridica", result);
      });
  }

  function fillEntityRepresentative(data, result) {
    setValue("#ContentPlaceHolder1_ContentPlaceHolder1_txtNombreEntidad", data.nombre, "Representado entidad nombre", result);
    return clickWithPostback(wantsCode(data) ? "#ContentPlaceHolder1_ContentPlaceHolder1_RadioCodEJ2" : "#ContentPlaceHolder1_ContentPlaceHolder1_RadioRutEJ2", "Representado entidad identificacion", result)
      .then(function () {
        if (wantsCode(data)) setValue("#ContentPlaceHolder1_ContentPlaceHolder1_txtCodigoEJuridica3", data.identificador, "Representado entidad codigo", result);
        else fillRut(data.pasaporte, "#ContentPlaceHolder1_ContentPlaceHolder1_txtRutEntidad", "#ContentPlaceHolder1_ContentPlaceHolder1_txtDvEntidad", "Representado entidad", result);
        setValue("#ContentPlaceHolder1_ContentPlaceHolder1_txtDescripcionEntidad", data.actividades || data.giro, "Representado entidad actividades", result);
        return fillRegion("#ContentPlaceHolder1_ContentPlaceHolder1_dllRegion2", "#ContentPlaceHolder1_ContentPlaceHolder1_dllComuna2", data, "Representado entidad", result);
      })
      .then(function () {
        setValue("#ContentPlaceHolder1_ContentPlaceHolder1_txtDomicilioEntidad", data.domicilio, "Representado entidad domicilio", result);
      });
  }

  function fillApplicantNatural(data, result) {
    return fillNatural(data, {
      label: "Solicitante",
      chileRadio: "#ContentPlaceHolder1_ContentPlaceHolder1_RadioRut",
      foreignRadio: "#ContentPlaceHolder1_ContentPlaceHolder1_RadioPasaporte",
      country: "#ContentPlaceHolder1_ContentPlaceHolder1_ddlPaisesSolicitante",
      passport: "#ContentPlaceHolder1_ContentPlaceHolder1_TxtPasaporteSolicitante",
      rut: "#ContentPlaceHolder1_ContentPlaceHolder1_TxtRutSolicitante",
      dv: "#ContentPlaceHolder1_ContentPlaceHolder1_TxtDvSolicitante",
      names: "#ContentPlaceHolder1_ContentPlaceHolder1_TxtNombreSolicitante",
      surnames: "#ContentPlaceHolder1_ContentPlaceHolder1_TxtApellidosSolicitante"
    }, result).then(function () {
      setValue("#ContentPlaceHolder1_ContentPlaceHolder1_txtCorreoSolicitante", data.email, "Solicitante email", result);
      fillPhone(data.telefono, "#ContentPlaceHolder1_ContentPlaceHolder1_txtCodAreaSolicitante", "#ContentPlaceHolder1_ContentPlaceHolder1_txtTelefonoSolicitante", "Solicitante telefono", result);
      fillPhone(data.telefonoAlternativo, "#ContentPlaceHolder1_ContentPlaceHolder1_txtCodOtroSolicitante", "#ContentPlaceHolder1_ContentPlaceHolder1_txtTelefonoOtroSolicitante", "Solicitante telefono alternativo", result);
    });
  }

  function fillApplicantOrganization(data, type, result) {
    var entity = type === "entidad";
    var selectors = entity ? {
      name: "#ContentPlaceHolder1_ContentPlaceHolder1_txtNombreEntidadSolicitante",
      foreign: "#ContentPlaceHolder1_ContentPlaceHolder1_RadioSinRut3",
      chile: "#ContentPlaceHolder1_ContentPlaceHolder1_RadioRut5",
      code: "#ContentPlaceHolder1_ContentPlaceHolder1_RadioCodEJ",
      rut: "#ContentPlaceHolder1_ContentPlaceHolder1_txtRutEntidadSolicitante",
      dv: "#ContentPlaceHolder1_ContentPlaceHolder1_txtDvEntidadSolicitante",
      email: "#ContentPlaceHolder1_ContentPlaceHolder1_txtCorreoEntidadSolicitante",
      phoneCode: "#ContentPlaceHolder1_ContentPlaceHolder1_txtCodAreaEntidadSolicitante",
      phone: "#ContentPlaceHolder1_ContentPlaceHolder1_txtTelefonoEntidadSolicitante",
      otherCode: "#ContentPlaceHolder1_ContentPlaceHolder1_txtCodOtroEntidadSolicitante",
      other: "#ContentPlaceHolder1_ContentPlaceHolder1_txtTelefonoOtroEntidadSolicitante"
    } : {
      name: "#ContentPlaceHolder1_ContentPlaceHolder1_TxtRazonSocialSolicitante",
      foreign: "#ContentPlaceHolder1_ContentPlaceHolder1_RadioSinRut2",
      chile: "#ContentPlaceHolder1_ContentPlaceHolder1_RadioRut4",
      code: "#ContentPlaceHolder1_ContentPlaceHolder1_RadioCodPJ",
      rut: "#ContentPlaceHolder1_ContentPlaceHolder1_TxtRutEmpresaSolicitante",
      dv: "#ContentPlaceHolder1_ContentPlaceHolder1_TxtDvEmpresaSolicitante",
      email: "#ContentPlaceHolder1_ContentPlaceHolder1_txtCorreoEmpresaSolicitante",
      phoneCode: "#ContentPlaceHolder1_ContentPlaceHolder1_txtCodAreaEmpresaSolicitante",
      phone: "#ContentPlaceHolder1_ContentPlaceHolder1_txtTelefonoEmpresaSolicitante",
      otherCode: "#ContentPlaceHolder1_ContentPlaceHolder1_txtCodOtroEmpresaSolicitante",
      other: "#ContentPlaceHolder1_ContentPlaceHolder1_txtTelefonoOtroEmpresaSolicitante"
    };
    var foreign = !isChile(data.pais);
    return clickWithPostback(foreign ? selectors.foreign : selectors.chile, "Solicitante organizacion nacionalidad", result)
      .then(function () {
        setValue(selectors.name, data.nombre || data.razonSocial, "Solicitante organizacion nombre", result);
        if (foreign) return;
        return clickWithPostback(wantsCode(data) ? selectors.code : entity ? "#ContentPlaceHolder1_ContentPlaceHolder1_RadioRutEJ" : "#ContentPlaceHolder1_ContentPlaceHolder1_RadioRutPJ", "Solicitante organizacion identificacion", result)
          .then(function () {
            if (wantsCode(data)) setValue('input[id*="Codigo"]', data.identificador, "Solicitante organizacion codigo", result);
            else fillRut(data.pasaporte, selectors.rut, selectors.dv, "Solicitante organizacion", result);
          });
      })
      .then(function () {
        setValue(selectors.email, data.email, "Solicitante organizacion email", result);
        fillPhone(data.telefono, selectors.phoneCode, selectors.phone, "Solicitante organizacion telefono", result);
        fillPhone(data.telefonoAlternativo, selectors.otherCode, selectors.other, "Solicitante organizacion telefono alternativo", result);
      });
  }

  function fillAssistant(assistant) {
    var result = summary();
    if (!getForm()) return Promise.reject(new Error("No se encontro #ff. Abre el formulario de solicitud de audiencia de la Camara."));
    var remuneration = assistant.remunerado === true ? "1" : "0";
    return selectWithPostback("#ContentPlaceHolder1_ContentPlaceHolder1_listaRemuneracion", remuneration, "Asistente remuneracion", result)
      .then(function () {
        return fillNatural(assistant, {
          label: "Asistente",
          chileRadio: "#ContentPlaceHolder1_ContentPlaceHolder1_RadioRut1",
          foreignRadio: "#ContentPlaceHolder1_ContentPlaceHolder1_RadioPasaporte1",
          country: "#ContentPlaceHolder1_ContentPlaceHolder1_ddlPaisesAsistentes",
          passport: "#ContentPlaceHolder1_ContentPlaceHolder1_TxtPasaporteAsistente",
          rut: "#ContentPlaceHolder1_ContentPlaceHolder1_TxtRutAsistente",
          dv: "#ContentPlaceHolder1_ContentPlaceHolder1_TxtDvAsistente",
          names: "#ContentPlaceHolder1_ContentPlaceHolder1_txtNombreAsistente",
          surnames: "#ContentPlaceHolder1_ContentPlaceHolder1_txtApellidosAsistente"
        }, result);
      })
      .then(function () {
        result.warnings.push("Asistente rellenado. Revisa y presiona Agregar manualmente si corresponde.");
        result.warnings.push("La extension no presiono Agregar, Enviar ni reCAPTCHA.");
        return result;
      });
  }

  function fillMainForm(data, requesterIndex) {
    if (!getForm()) throw new Error("No se encontro #ff. Abre el formulario de solicitud de audiencia de la Camara.");
    var payload = payloadUtils.normalizePayload(data);
    var result = summary();
    var user = payload.usuarios[requesterIndex] || null;
    var solicitud = payload.solicitud || {};
    var applicant = solicitud.solicitante || payloadUtils.buildSolicitudFromUser(solicitud, user);
    var type = normalizeType(applicant.tipo);
    var typeValue = type === "persona_juridica" ? "12" : type === "entidad" ? "13" : "11";

    if (!solicitud.solicitante && user) result.filled.push("Solicitante -> " + payloadUtils.userLabel(user, requesterIndex));
    if (!solicitud.solicitante && !user) result.warnings.push("No hay solicitante seleccionado; se usara el JSON plano.");

    return selectWithPostback("#ContentPlaceHolder1_ContentPlaceHolder1_ddlTipoSolicitante", typeValue, "Solicitante tipo", result)
      .then(function () {
        return type === "persona_natural" ? fillApplicantNatural(applicant, result) : fillApplicantOrganization(applicant, type, result);
      })
      .then(function () {
        return fillRepresentative(user && user.representado, result);
      })
      .then(function () {
        setValue("#ContentPlaceHolder1_ContentPlaceHolder1_txtMateria", solicitud.referencia, "Materia especifica", result);
        setValue("#ContentPlaceHolder1_ContentPlaceHolder1_txtDecision", solicitud.observaciones, "Decision especifica", result);
        if (solicitud.aceptaPoliticas === true) {
          var policies = query("#ContentPlaceHolder1_ContentPlaceHolder1_chkPoliticasDatos");
          if (policies && !policies.checked) policies.click();
          result.filled.push("Politicas de datos");
        }
        if (solicitud.asistira == null) {
          result.warnings.push("asistira no fue indicado; queda para revision manual.");
        } else {
          return clickWithPostback(solicitud.asistira ? "#ContentPlaceHolder1_ContentPlaceHolder1_solAsistenteSi" : "#ContentPlaceHolder1_ContentPlaceHolder1_solAsistenteNo", "Asistira", result);
        }
      })
      .then(function () {
        result.warnings.push("Revisa el formulario, resuelve reCAPTCHA y presiona Enviar solo si todo esta correcto.");
        return result;
      });
  }

  ns.camara = ns.camara || {};
  ns.camara.adapter = {
    id: "camara-audiencia",
    label: "Camara de Diputadas y Diputados - Solicitud de audiencia",
    assistantActionLabel: "Rellenar asistente",
    detect: function () { return isCamaraPage() && Boolean(getForm()); },
    fillMainForm: fillMainForm,
    fillAssistant: fillAssistant
  };
}());
