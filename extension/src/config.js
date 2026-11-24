(function () {
  "use strict";

  var root = typeof globalThis !== "undefined" ? globalThis : window;
  var ns = root.AsistenteLobby = root.AsistenteLobby || {};

  ns.config = {
    extensionName: "Asistente Lobby",
    firebaseBaseUrl: "https://asistente-lobby.web.app",
    authConfigUrl: "https://asistente-lobby.web.app/firebase-config.js",
    apiBaseUrl: "https://asistente-lobby.web.app/api",
    contentMessageSource: "asistente-lobby-content",
    bridgeMessageSource: "asistente-lobby-page-bridge"
  };
}());
