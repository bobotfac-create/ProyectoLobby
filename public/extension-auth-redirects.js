// Agregar solo las URL completas devueltas por identity.getRedirectURL("firebase")
// para las versiones autorizadas. Lista vacia bloquea el login de la extension.
window.LOBBY_EXTENSION_REDIRECTS = Object.freeze([]);

window.isAllowedLobbyExtensionRedirect = function (value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash &&
      window.LOBBY_EXTENSION_REDIRECTS.includes(url.href);
  } catch (error) {
    return false;
  }
};
