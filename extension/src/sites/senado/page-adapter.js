(function () {
  "use strict";
  var root = typeof globalThis !== "undefined" ? globalThis : window;
  var ns = root.AsistenteLobby = root.AsistenteLobby || {};
  var ext = root.browser || root.chrome;

  function send(message) {
    if (root.browser) return ext.runtime.sendMessage(message);
    return new Promise(function (resolve, reject) {
      ext.runtime.sendMessage(message, function (response) {
        if (ext.runtime.lastError) reject(new Error(ext.runtime.lastError.message));
        else resolve(response);
      });
    });
  }
  ns.senado = ns.senado || {};
  ns.senado.adapter = {
    id: "senado-audiencia",
    assistantActionLabel: "Como agregar asistentes",
    detect: function () {
      return window.top === window && location.hostname === "www.senado.cl" && location.pathname === "/transparencia/lobby/audiencia";
    },
    fillMainForm: function (data, index) {
      var normalized = ns.payload.normalizePayload(data);
      var user = normalized.usuarios[index];
      var selected = user ? { solicitud: normalized.solicitud, usuarios: [user] } : data;
      return send({ type: "senado:fill", data: selected, requesterIndex: 0 }).then(function (response) {
        if (!response || !response.ok) throw new Error(response && response.error || "El formulario del Senado no respondio.");
        return response.result;
      });
    },
    fillAssistant: function () {
      return Promise.resolve({ filled: [], missing: [], notFound: [], warnings: ["Agrega los asistentes manualmente en el formulario del Senado."] });
    }
  };
}());
