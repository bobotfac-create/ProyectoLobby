(function () {
  "use strict";

  var root = typeof globalThis !== "undefined" ? globalThis : window;
  var ns = root.AsistenteLobby = root.AsistenteLobby || {};

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
    if (user && user.medio) return user.medio;
    if (solicitud && solicitud.medio) return solicitud.medio;
    if (user && user.email) return "email";
    if (user && user.telefono) return "telefono";
    return "";
  }

  function buildSolicitudFromUser(solicitud, user) {
    var source = user || {};
    var merged = Object.assign({}, solicitud || {});
    ["nombres", "apellidos", "pasaporte", "telefono", "email", "genero"].forEach(function (key) {
      if (source[key] != null && source[key] !== "") merged[key] = source[key];
    });
    merged.paisEmisor = source.paisEmisor || source.pais || merged.paisEmisor;
    merged.medio = inferMedio(source, merged);
    return merged;
  }

  function userLabel(user, index) {
    if (user && user.label) return user.label;
    return [user && user.nombres, user && user.apellidos].filter(Boolean).join(" ") ||
      (user && user.id) ||
      "Usuario " + (index + 1);
  }

  ns.payload = {
    EXAMPLE_DATA: EXAMPLE_DATA,
    EXAMPLE_FULL_DATA: EXAMPLE_FULL_DATA,
    normalize: normalize,
    escapeHtml: escapeHtml,
    normalizePayload: normalizePayload,
    buildSolicitudFromUser: buildSolicitudFromUser,
    userLabel: userLabel
  };
}());
