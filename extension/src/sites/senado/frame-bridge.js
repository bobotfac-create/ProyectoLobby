(function () {
  "use strict";
  var ext = typeof browser !== "undefined" ? browser : chrome;
  if (window.top === window) return;
  function connect() {
    try {
      var port = ext.runtime.connect({ name: "senado-formulario" });
      port.onDisconnect.addListener(function () { window.setTimeout(connect, 1000); });
    } catch (error) {
      // Una recarga del complemento invalida este contexto; se recupera al recargar la pagina.
    }
  }
  connect();
  ext.runtime.onMessage.addListener(function (message, sender, respond) {
    if (!message || message.type !== "senado:fillFrame" || sender.id !== ext.runtime.id) return false;
    Promise.resolve().then(function () {
      if (!AsistenteLobby.senado.adapter.detect()) throw new Error("El formulario del Senado aun no esta disponible.");
      return AsistenteLobby.senado.adapter.fillMainForm(message.data, message.requesterIndex);
    }).then(function (result) { respond({ ok: true, result: result }); })
      .catch(function (error) { respond({ ok: false, error: error.message }); });
    return true;
  });
}());
